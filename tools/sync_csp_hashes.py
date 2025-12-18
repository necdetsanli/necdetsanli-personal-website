#!/usr/bin/env python3
"""
Sync CSP script hashes for inline <script> blocks.

- Finds inline <script>...</script> blocks (no src=) in *.html files
- Computes sha256-base64 hashes of the *exact* inline content (including whitespace/newlines)
- Updates the page's CSP meta tag:
  - Removes existing hash tokens (sha256/sha384/sha512) from script-src (+ script-src-elem if present)
  - Appends the newly computed sha256 hashes (quoted)
  - Rewrites CSP content as a single line
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
    r"<script\b(?P<attrs>[^>]*)>(?P<body>.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)

META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.IGNORECASE | re.DOTALL)
CSP_HTTP_EQUIV_RE = re.compile(
    r"http-equiv\s*=\s*([\"'])Content-Security-Policy\1", re.IGNORECASE
)
CONTENT_ATTR_RE = re.compile(
    r"\bcontent\s*=\s*(?P<q>[\"'])(?P<v>.*?)(?P=q)", re.IGNORECASE | re.DOTALL
)
SRC_ATTR_RE = re.compile(r"\bsrc\s*=", re.IGNORECASE)
TYPE_ATTR_RE = re.compile(r"\btype\s*=\s*([\"'])(?P<t>.*?)\1", re.IGNORECASE | re.DOTALL)


@dataclass(frozen=True)
class CspDirective:
    name: str
    values: List[str]


def _sha256_b64(s: str) -> str:
    digest = hashlib.sha256(s.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def _is_hash_token(token: str) -> bool:
    t = token.strip()
    if len(t) >= 2 and t[0] == "'" and t[-1] == "'":
        t = t[1:-1]
    return t.startswith("sha256-") or t.startswith("sha384-") or t.startswith("sha512-")


def _parse_csp(csp: str) -> List[CspDirective]:
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


def _update_hashes_for_directives(
    directives: List[CspDirective],
    directive_names: List[str],
    hashes: List[str],
) -> Tuple[List[CspDirective], bool]:
    wanted_hash_tokens = [f"'sha256-{h}'" for h in hashes]
    changed = False

    out: List[CspDirective] = []
    found_any = False

    for d in directives:
        if d.name not in directive_names:
            out.append(d)
            continue

        found_any = True
        kept: List[str] = []
        for v in d.values:
            if _is_hash_token(v):
                changed = True
                continue
            kept.append(v)

        for ht in wanted_hash_tokens:
            if ht not in kept:
                kept.append(ht)
                changed = True

        out.append(CspDirective(name=d.name, values=kept))

    if found_any is False:
        return directives, False

    return out, changed


def _find_csp_meta_tag(html: str) -> Optional[Tuple[re.Match[str], str, str]]:
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
    cm = CONTENT_ATTR_RE.search(tag)
    if cm is None:
        return tag
    q = cm.group("q")
    return CONTENT_ATTR_RE.sub(
        lambda _m: f"content={q}{new_content}{q}",
        tag,
        count=1,
    )


def _collect_html_files(root: Path) -> List[Path]:
    skip_dirs = {".git", "node_modules", "dist", "build", ".next", ".venv", "venv", "__pycache__"}
    results: List[Path] = []

    for p in root.rglob("*.html"):
        if any(part in skip_dirs for part in p.parts):
            continue
        results.append(p)

    return sorted(results)


def _extract_inline_script_bodies(html: str) -> List[str]:
    bodies: List[str] = []
    for m in SCRIPT_TAG_RE.finditer(html):
        attrs = m.group("attrs") or ""
        body = m.group("body") or ""

        if SRC_ATTR_RE.search(attrs) is not None:
            continue

        # Skip empty scripts (whitespace-only) to avoid adding pointless hashes.
        if body.strip() == "":
            continue

        # Keep exact body (including indentation/newlines) because CSP hashes are exact.
        bodies.append(body)

    return bodies


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
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    default_root = script_dir.parent
    root = Path(args.root).resolve() if args.root.strip() != "" else default_root

    if root.exists() is False or root.is_dir() is False:
        print(f"[error] root not found or not a directory: {root}", file=sys.stderr)
        return 2

    html_files = _collect_html_files(root)
    if len(html_files) == 0:
        print(f"[warn] no .html files found under: {root}")
        return 0

    touched = 0
    skipped_no_csp = 0

    for fp in html_files:
        original = fp.read_text(encoding="utf-8")

        bodies = _extract_inline_script_bodies(original)
        if len(bodies) == 0:
            continue

        # Dedup while preserving order.
        seen = set()
        hashes: List[str] = []
        for b in bodies:
            h = _sha256_b64(b)
            if h in seen:
                continue
            seen.add(h)
            hashes.append(h)

        csp_meta = _find_csp_meta_tag(original)
        if csp_meta is None:
            skipped_no_csp += 1
            print(f"[warn] {fp}: has inline <script> but no CSP meta (http-equiv). Skipping.")
            continue

        meta_match, old_tag, old_csp = csp_meta
        directives = _parse_csp(old_csp)

        updated, changed_a = _update_hashes_for_directives(directives, ["script-src"], hashes)
        updated, changed_b = _update_hashes_for_directives(updated, ["script-src-elem"], hashes)
        changed = (changed_a is True) or (changed_b is True)

        if changed is False:
            continue

        new_csp = _render_csp(updated)
        new_tag = _replace_meta_content(old_tag, new_csp)
        updated_html = original[: meta_match.start()] + new_tag + original[meta_match.end() :]

        if updated_html == original:
            print(f"[skip] {fp}: hashes already up to date.")
            continue

        touched += 1
        print(f"[ok] {fp}: updated script hashes ({len(hashes)} inline block(s))")

        if args.write:
            fp.write_text(updated_html, encoding="utf-8")

    if touched == 0:
        print("[done] no changes needed.")
    else:
        if args.write:
            print(f"[done] wrote changes to {touched} file(s).")
        else:
            print(f"[done] dry-run: {touched} file(s) would change. Re-run with --write.")

    if skipped_no_csp > 0:
        print(f"[note] {skipped_no_csp} file(s) had inline <script> but no CSP meta. Add CSP or handle separately.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
