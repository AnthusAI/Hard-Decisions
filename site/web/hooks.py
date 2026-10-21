"""Hard-Decisions on the standard Papyrus front end.

Everything generic (head, header, footer, sitemap, robots.txt, 404 page, Markdown twins, islands, URLs) comes from
``projection.json`` and Papyrus core. This module holds what is the results site's own: the body of each page.

Astro renders those bodies from ``data/results.json`` (``src/pages``, ``src/components``); ``scripts/build-site.mjs``
stages each one as ``fragments/<id>.html`` and lists the pages in ``projection.json``. ``main`` places a fragment inside
the standard ``<main>``. ``head_extra`` adds the few head tags the site has beyond the standard ones.
"""

from __future__ import annotations

import html
from pathlib import Path

FRAGMENTS = Path(__file__).resolve().parent / "fragments"
DEPENDS_ON: list[str] = []
DATA_FILE = "/data/results.json"
EXTRA_ICONS = (
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">',
)


def _fragment_id(page) -> str | None:
    if page.kind == "home":
        return "home"
    if page.kind == "not_found":
        return "not-found"
    return page.custom_id if page.kind == "custom" else None


def main(page) -> str | None:
    name = _fragment_id(page)
    return (FRAGMENTS / f"{name}.html").read_text(encoding="utf-8") if name else None


def head_extra(page) -> str:
    lines = [
        '<meta name="color-scheme" content="light dark">',
        *EXTRA_ICONS,
        f'<link rel="alternate" type="application/json" href="{DATA_FILE}" title="Every result in one data file">',
    ]
    if not page.head.noindex:
        lines.append('<meta property="og:image:type" content="image/png">')
    return "\n".join(lines)
