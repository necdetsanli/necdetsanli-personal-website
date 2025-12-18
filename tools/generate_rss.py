#!/usr/bin/env python3
"""
Generate a site-wide RSS 2.0 "Site Updates" feed from git history.

WHITELIST MODE:
- Only includes these pages:
  index.html, home.html, about.html, projects.html, blog.html, links.html, guestbook.html

- pubDate = last git commit date that touched the file
- title/description extracted from HTML when possible
"""

from __future__ import annotations

import argparse
import html as html_mod
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from typing import List, Optional


ALLOWED_PAGES = {
    "index.html",
    "home.html",
    "about.html",
    "projects.html",
    "blog.html",
    "links.html",
    "guestbook.html",
}

TITLE_RE = re.compile(r"<title>(?P<v>.*?)</title>", re.IGNORECASE | re.DOTALL)
DESC_RE = re.compile(
    r'<meta\s+name\s*=\s*(?P<q>["\'])description(?P=q)\s+content\s*=\s*(?P<q2>["\'])(?P<v>.*?)(?P=q2)\s*/?>',
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class Item:
    rel: str
    link: str
    title: str
    description: str
    pub_date: datetime


def _run_git(args: List[str], cwd: Path) -> str:
    res = subprocess.run(
        ["git", *args],
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "git command failed")
    return res.stdout.strip()


def _read_text_safe(fp: Path) -> str:
    try:
        return fp.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return fp.read_text(encoding="utf-8", errors="replace")


def _extract_title_desc(html: str, fallback_title: str) -> tuple[str, str]:
    title = fallback_title
    desc = ""

    tm = TITLE_RE.search(html)
    if tm is not None:
        t_raw = re.sub(r"\s+", " ", tm.group("v")).strip()
        if len(t_raw) > 0:
            title = html_mod.unescape(t_raw)

    dm = DESC_RE.search(html)
    if dm is not None:
        d_raw = re.sub(r"\s+", " ", dm.group("v")).strip()
        if len(d_raw) > 0:
            desc = html_mod.unescape(d_raw)

    return title, desc


def _last_commit_datetime(repo_root: Path, file_path: Path) -> Optional[datetime]:
    # ISO 8601 committer date: 2025-12-18T09:10:00+03:00
    try:
        out = _run_git(
            ["log", "-1", "--format=%cI", "--", file_path.as_posix()],
            cwd=repo_root,
        )
    except Exception:
        return None

    if out.strip() == "":
        return None

    try:
        dt = datetime.fromisoformat(out.strip())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _page_link(base_url: str, rel: str) -> str:
    base = base_url.rstrip("/") + "/"
    if rel == "index.html":
        return base
    return base + rel


def _xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def _render_rss(base_url: str, items: List[Item]) -> str:
    now = datetime.now(timezone.utc)
    last_build = format_datetime(now)

    out: List[str] = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    out.append('<rss version="2.0">')
    out.append("  <channel>")
    out.append(f"    <title>{_xml_escape('Necdet Şanlı — Site Updates')}</title>")
    out.append(f"    <link>{_xml_escape(base_url.rstrip('/') + '/')}</link>")
    out.append(f"    <description>{_xml_escape('Updates across the site pages.')}</description>")
    out.append("    <language>en</language>")
    out.append(f"    <lastBuildDate>{_xml_escape(last_build)}</lastBuildDate>")

    for it in items:
        pub = format_datetime(it.pub_date)
        out.append("    <item>")
        out.append(f"      <title>{_xml_escape(it.title)}</title>")
        out.append(f"      <link>{_xml_escape(it.link)}</link>")
        out.append(f'      <guid isPermaLink="true">{_xml_escape(it.link)}</guid>')
        out.append(f"      <pubDate>{_xml_escape(pub)}</pubDate>")
        if it.description.strip() != "":
            out.append(f"      <description>{_xml_escape(it.description)}</description>")
        out.append("    </item>")

    out.append("  </channel>")
    out.append("</rss>")
    return "\n".join(out) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=str, default="", help="Project root (defaults to parent of tools/).")
    parser.add_argument("--base", type=str, required=True, help="Base URL, e.g. https://www.necdetsanli.com")
    parser.add_argument("--limit", type=int, default=50, help="Max item count.")
    parser.add_argument("--out", type=str, default="feed.xml", help="Output file path (relative to root).")
    parser.add_argument("--write", action="store_true", help="Write file. Without this, prints to stdout.")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    repo_root = (Path(args.root).resolve() if args.root.strip() else script_dir.parent)

    items: List[Item] = []

    for name in sorted(ALLOWED_PAGES):
        fp = repo_root / name
        if fp.exists() is False:
            print(f"[warn] missing page, skipping: {fp}")
            continue

        dt = _last_commit_datetime(repo_root, fp)
        if dt is None:
            dt = datetime.fromtimestamp(fp.stat().st_mtime, tz=timezone.utc)

        html = _read_text_safe(fp)
        fallback_title = f"{name} updated"
        title, desc = _extract_title_desc(html, fallback_title)

        rel = name
        items.append(
            Item(
                rel=rel,
                link=_page_link(args.base, rel),
                title=title,
                description=desc,
                pub_date=dt,
            )
        )

    items.sort(key=lambda x: x.pub_date, reverse=True)
    items = items[: max(1, int(args.limit))]

    rss = _render_rss(args.base, items)

    if args.write:
        out_path = repo_root / args.out
        out_path.write_text(rss, encoding="utf-8")
        print(f"[ok] wrote {out_path}")
    else:
        print(rss)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
