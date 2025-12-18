#!/usr/bin/env python3
"""
Sync CSP script-src hashes for inline <script> blocks (recommended: ALL inline scripts).

Why:
- If you only hash JSON-LD and prune all existing hashes, you can accidentally break other inline JS
  (e.g., audio player init).
- This script hashes inline <script> bodies exactly as they appear in the HTML source (whitespace included),
  then updates the CSP meta tag accordingly.

What it does:
- Finds HTML files under a root directory (recursively).
- Extracts inline <script> blocks (no src=).
- Computes sha256-base64 hashes of exact bodies.
- Updates CSP meta tag (http-equiv="Content-Security-Policy"):
  - For script-src and/or script-src-elem:
    - Removes existing sha256/sha384/sha512 hash tokens (optional prune; default ON)
    - Appends computed sha256 hashes (quoted)
  - Rewrites CSP to a single line.

Usage:
  Dry-run:
    python3 tools/sync_csp_hashes.py

  Write changes:
    python3 tools/sync_csp_hashes.py --write

  Only JSON-LD (NOT recommended if you have other inline JS):
    python3 tools/sync_csp_hashes.py --jsonld-only --write

  Include tools/ in scan:
    python3 tools/sync_csp_hashes.py --include-tools --write

  CI check (exit 1 if changes would be made):
    python3 tools/sync_csp_hashes.py --check
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple


SCRIPT_TAG_RE = re.compile(
    r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script\s*>",
    re.IGNORECASE | re.DOTALL,
)
META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE | re.DOTALL)

CSP_HTTP_EQUIV_RE = re.compile(
    r"http-equiv\s*=\s*(?P<q>[\"'])Content-Security-Policy(?P=q)",
    re.IGNORECASE,
)
CONTENT_ATTR_RE = re.compile(
    r"\bcontent\s*=\s*(?P<q>[\"'])(?P<v>.*?)(?P=q)",
    re.IGNORECASE | re.DOTALL,
)

SRC_ATTR_RE = re.compile(r"\bsrc\s*=", re.IGNORECASE)
TYPE_JSONLD_RE = re.compile(
    r"\btype\s*=\s*(?P<q>[\"'])application/ld\+json(?P=q)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CspDirective:
    name: str
    values: List[str]


@dataclass(frozen=True)
class InlineScript:
    body: str
    is_jsonld: bool


def _sha256_b64(s: str) -> str:
    digest = hashlib.sha256(s.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _is_hash_token(token: str) -> bool:
    t = token.strip()
    if len(t) >= 2 and t[0] == "'" and t[-1] == "'":
        t = t[1:-1]
    return t.startswith("sha256-") or t.startswith("sha384-") or t.startswith("sha512-")


def _parse_csp(csp: str) -> List[CspDirective]:
    # Normalize whitespace/newlines but do NOT change semantics besides spacing
    normalized = " ".join(csp.replace("\r", "\n").split())
    parts = [p.strip() for p in normalized.split(";")]
    directives: List[CspDirective] = []

    for p in parts:
        if p == "":
            continue
        tokens = p.split()
        name = tokens[0].strip().lower()
        values = tokens[1:] if len(tokens) > 1 else []
        directives.append(CspDirective(name=name, values=values))

    return directives


def _render_csp(directives: List[CspDirective]) -> str:
    rendered: List[str] = []
    for d in directives:
        if len(d.values) == 0:
            rendered.append(d.name)
        else:
            rendered.append(f"{d.name} {' '.join(d.values)}")
    return "; ".join(rendered)


def _collect_html_files(root: Path, include_tools: bool) -> List[Path]:
    skip_dirs = {
        ".git",
        "node_modules",
        "dist",
        "build",
        ".next",
        ".venv",
        "venv",
        "__pycache__",
    }
    if include_tools is False:
        skip_dirs.add("tools")

    results: List[Path] = []
    for p in root.rglob("*.html"):
        if any(part in skip_dirs for part in p.parts):
            continue
        results.append(p)

    return sorted(results)


def _extract_inline_scripts(html: str) -> List[InlineScript]:
    scripts: List[InlineScript] = []
    for m in SCRIPT_TAG_RE.finditer(html):
        attrs = m.group("attrs") or ""
        if SRC_ATTR_RE.search(attrs) is not None:
            continue
        body = m.group("body")
        is_jsonld = TYPE_JSONLD_RE.search(attrs) is not None
        scripts.append(InlineScript(body=body, is_jsonld=is_jsonld))
    return scripts


def _find_csp_meta_tag(html: str) -> Optional[Tuple[re.Match[str], str, str]]:
    """
    Returns (meta_match, full_meta_tag, content_value) for the first CSP meta tag.
    """
    for m in META_TAG_RE.finditer(html):
        tag = m.group(0)
        if CSP_HTTP_EQUIV_RE.search(tag) is None:
            continue
        cm = CONTENT_ATTR_RE.search(tag)
        if cm is None:
            continue
        return m, tag, cm.group("v")
    return None


def _replace_meta_content(tag: str, new_content: str) -> str:
    """
    Replace content=... attribute value. Always writes with double-quotes to avoid
    breaking on CSP tokens that contain single quotes (e.g., 'self', 'sha256-...').
    """
    cm = CONTENT_ATTR_RE.search(tag)
    if cm is None:
        return tag

    # Escape any literal double-quotes defensively (rare in CSP, but safe).
    safe_content = new_content.replace('"', "&quot;")

    # Replace the first content=... occurrence with content="...".
    return CONTENT_ATTR_RE.sub(
        lambda _m: f'content="{safe_content}"',
        tag,
        count=1,
    )


def _update_directive_values(
    values: List[str],
    wanted_hash_tokens: List[str],
    prune_existing_hashes: bool,
) -> Tuple[List[str], bool]:
    changed = False
    kept: List[str] = []

    for v in values:
        if prune_existing_hashes is True and _is_hash_token(v):
            changed = True
            continue
        kept.append(v)

    for ht in wanted_hash_tokens:
        if ht not in kept:
            kept.append(ht)
            changed = True

    return kept, changed


def _update_csp(
    directives: List[CspDirective],
    hashes_b64: List[str],
    prune_existing_hashes: bool,
) -> Tuple[List[CspDirective], bool]:
    wanted_hash_tokens = [f"'sha256-{h}'" for h in hashes_b64]

    changed_any = False
    out: List[CspDirective] = []

    has_script_src = any(d.name == "script-src" for d in directives)
    has_script_src_elem = any(d.name == "script-src-elem" for d in directives)

    if has_script_src is False and has_script_src_elem is False:
        # Don't invent a policy automatically.
        return directives, False

    for d in directives:
        if d.name not in {"script-src", "script-src-elem"}:
            out.append(d)
            continue

        updated_values, changed = _update_directive_values(
            d.values,
            wanted_hash_tokens=wanted_hash_tokens,
            prune_existing_hashes=prune_existing_hashes,
        )
        if changed is True:
            changed_any = True
        out.append(CspDirective(name=d.name, values=updated_values))

    return out, changed_any


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=str,
        default="",
        help="Project root directory (defaults to parent of tools/).",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write changes to files. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Exit with code 1 if any file would change (CI-friendly). Implies dry-run.",
    )
    parser.add_argument(
        "--jsonld-only",
        action="store_true",
        help="Only hash <script type='application/ld+json'> blocks. Not recommended if you have other inline JS.",
    )
    parser.add_argument(
        "--include-tools",
        action="store_true",
        help="Include tools/ directory when scanning for HTML files.",
    )
    parser.add_argument(
        "--no-prune",
        action="store_true",
        help="Do not remove existing sha* hash tokens; only append missing ones.",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    default_root = script_dir.parent
    root = Path(args.root).resolve() if args.root.strip() != "" else default_root

    if root.exists() is False or root.is_dir() is False:
        print(f"[error] root not found or not a directory: {root}", file=sys.stderr)
        return 2

    html_files = _collect_html_files(root, include_tools=args.include_tools)
    if len(html_files) == 0:
        print(f"[warn] no .html files found under: {root}")
        return 0

    prune_existing_hashes = (args.no_prune is False)

    touched = 0
    skipped_no_csp = 0
    skipped_no_scriptsrc = 0

    for fp in html_files:
        original = fp.read_text(encoding="utf-8")

        inline_scripts = _extract_inline_scripts(original)
        if len(inline_scripts) == 0:
            continue

        selected = (
            [s for s in inline_scripts if s.is_jsonld]
            if args.jsonld_only is True
            else inline_scripts
        )
        if len(selected) == 0:
            continue

        hashes = [_sha256_b64(s.body) for s in selected]

        csp_meta = _find_csp_meta_tag(original)
        if csp_meta is None:
            skipped_no_csp += 1
            print(f"[warn] {fp}: has inline scripts but no CSP meta (http-equiv). Skipping.")
            continue

        meta_match, old_tag, old_csp = csp_meta
        directives = _parse_csp(old_csp)

        updated_directives, changed = _update_csp(
            directives,
            hashes_b64=hashes,
            prune_existing_hashes=prune_existing_hashes,
        )
        if changed is False:
            # Might be because script-src/script-src-elem doesn't exist.
            has_script_src = any(d.name == "script-src" for d in directives)
            has_script_src_elem = any(d.name == "script-src-elem" for d in directives)
            if has_script_src is False and has_script_src_elem is False:
                skipped_no_scriptsrc += 1
                print(f"[warn] {fp}: CSP has no script-src / script-src-elem. Skipping.")
            continue

        new_csp = _render_csp(updated_directives)
        new_tag = _replace_meta_content(old_tag, new_csp)

        updated_html = original[: meta_match.start()] + new_tag + original[meta_match.end() :]

        touched += 1
        mode = "jsonld-only" if args.jsonld_only is True else "all-inline"
        print(f"[ok] {fp}: updated CSP hashes ({len(hashes)} scripts, mode={mode}, prune={prune_existing_hashes})")

        if args.write and (args.check is False):
            fp.write_text(updated_html, encoding="utf-8")

    if touched == 0:
        print("[done] no changes needed.")
        return 0

    if args.check is True:
        print(f"[done] check failed: {touched} file(s) would change.")
        return 1

    if args.write is True:
        print(f"[done] wrote changes to {touched} file(s).")
    else:
        print(f"[done] dry-run: {touched} file(s) would change. Re-run with --write.")

    if skipped_no_csp > 0:
        print(f"[note] {skipped_no_csp} file(s) had inline scripts but no CSP meta. Add CSP or handle separately.")
    if skipped_no_scriptsrc > 0:
        print(f"[note] {skipped_no_scriptsrc} file(s) had CSP meta but no script-src/script-src-elem.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
