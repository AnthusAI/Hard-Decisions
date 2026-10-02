# Wide-screen layout

How the Hard-Decisions site uses wide windows (2,000 to 5,000+ css px) without changing phones,
tablets or laptops. Written so the same design can be ported to Biased-Decisions' site, which shares
this design system.

## Goals

- Phones (375 px), tablets (768 px) and laptops (1,280–1,440 px) look exactly as before.
- From about 2,000 px the content fills about 88% of the window instead of a fixed column.
- From about 2,400 px each section uses the width: its header on the left, its figures and tables
  on the right.
- Text lines stay at or under about 80 characters, and nothing scrolls sideways.

## Breakpoints

Media queries read the real viewport. Widths inside a zoomed page are css px of the zoomed page
(viewport ÷ zoom), so a percentage container is the way to grow with the window.

| Viewport  | Zoom | Container (`--max`) | Sections  | Why |
|-----------|------|---------------------|-----------|-----|
| < 1,500   | 1    | 1,160 px            | one column | unchanged |
| ≥ 1,500   | 1    | 1,320 px            | one column | a little more room; text capped at 38em |
| ≥ 2,000   | 1.25 | 88% of the window   | one column | type grows; the column grows with the window |
| ≥ 2,400   | 1.25 | 88%                 | two columns | the zoomed column is ≥ ~1,700 px, wide enough to split |
| ≥ 2,800   | 1.4  | 88%                 | two columns | type keeps pace on 3,440–3,840 px screens |
| ≥ 4,000   | 1.6  | 88%                 | two columns | 5K screens |

The zoom steps are kept moderate (1.25–1.6), so most of the extra width goes to layout, not to
bigger type.

## Markup

Every content section is one of two kinds:

```html
<!-- A section with figures, tables or card grids -->
<section class="wrap section sec-split" aria-labelledby="x-h">
  <div class="sec-head">
    <h2 class="display" id="x-h">…</h2>
    <p class="lede">…</p>          <!-- and any .note / .footnote / .fnote / .claim / nav.reg-links -->
  </div>
  <div class="sec-body">
    …figures, tables, grids, H3 sub-sections, notes under tables…
  </div>
</section>

<!-- A section that is prose only -->
<section class="wrap section sec-prose" aria-labelledby="y-h">
  <h2 class="display" id="y-h">…</h2>
  <p>…</p>
</section>
```

- **The head** is the H2 plus the single-line lede and note paragraphs that directly follow it.
  The first element that isn't one of those (an H3, a table, a figure, a multi-line paragraph)
  starts the body.
- **A section is prose** when nothing after its head is a figure, table, `<dl>`, `<details>`,
  `<pre>`, card grid or chart component. Prose sections keep their natural order: on wide screens
  the H2 sits in the left column and the text in the right, at the same line measure as everywhere
  else.
- **Heroes** (`.wrap.hero`) are not sections and are not split, except the home hero (below).
- `scripts/split-sections.py [src-dir]` does the conversion on Astro source. It is line-based: the
  children of a section are the lines at the section's indent + 2. It is idempotent, so it can be
  re-run safely. Review its output, then mark any section it can't parse by hand.
- `test/layout.test.mjs` checks every built page: each `section.wrap.section` is `sec-split`, with
  a head that opens with the H2 and then a body, and no figure or table in the head, or it is
  `sec-prose`.

## CSS

At the end of `src/styles/site.css`:

```css
@media (min-width: 1500px) {
  :root { --max: 1320px; }
  /* 38em is about 75 characters of Montserrat at any font size. */
  .section p, .section li, .section dd, .hero .deck, .hero .footnote, .hero .note, .finding-txt, .colo p { max-width: 38em; }
}
@media (min-width: 2000px) {
  html { zoom: 1.25; }
  :root { --max: 88%; }              /* .wrap { max-width: var(--max) } resolves against the page width */
}
@media (min-width: 2800px) { html { zoom: 1.4; } }
@media (min-width: 4000px) { html { zoom: 1.6; } }
@media (min-width: 2400px) {
  .sec-split, .sec-prose { display: grid; grid-template-columns: minmax(0, 30%) minmax(0, 1fr); column-gap: 56px; align-items: start; }
  .sec-split > .sec-head { position: sticky; top: 120px; }     /* below the sticky masthead */
  .sec-split > .sec-head > :last-child { margin-bottom: 0; }
  .sec-split > .sec-body > :first-child, .sec-prose > :nth-child(2) { margin-top: 0; }
  .sec-prose > * { grid-column: 2; }
  .sec-prose > h2 { grid-column: 1; grid-row: 1 / span 60; position: sticky; top: 120px; align-self: start; }
  /* Home hero: title, deck and finding on the left; the depth charts on the right, one row. */
  .hero:has(.hero-top) { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.5fr); column-gap: 56px; align-items: start; }
  .hero:has(.hero-top) .hero-top, .hero:has(.hero-top) .hero-top > div { display: block; }
  .hero:has(.hero-top) .hero-top h1.display.xl { font-size: 64px; max-width: 18ch; }
  .hero:has(.hero-top) .finding { flex-direction: row; flex-wrap: wrap; margin: 18px 0 0; }
  .hero:has(.hero-top) .finding-txt { flex: 1 1 18em; min-width: 0; }
  /* Grids take more columns as the body column grows. */
  .cm-grid, .cm-grid.three { grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); }
  .honesty ol[data-count="6"] { grid-template-columns: repeat(6, 1fr); }
  .compact-cards, .dim-grid { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
}
```

Notes:

- **Why `--max: 88%`:** `.wrap` already uses `max-width: var(--max)`, so a percentage makes every
  top-level block (masthead, sections, honesty panel, footer) 88% of the zoomed page, which is 88%
  of the window. Avoid `vw` here: how viewport units interact with `zoom` differs between engines.
- **Why a `.sec-prose` grid with a 60-row span for the H2:** the H2 sits beside the prose without
  a wrapper. The extra implicit rows are empty and collapse to zero height.
- **Why `:has()`:** it limits the hero rule to the home page's `.hero-top` hero. Every current
  browser supports it.
- **What stays the same:** example card grids keep 4 per row, the user's design. They simply get
  wider.
- **Measuring:** `getBoundingClientRect()` returns zoom-scaled sizes in Chrome. Use `offsetWidth`
  for line-length checks, or divide by the zoom.

## Porting to Biased-Decisions

1. Copy the CSS block above. The tokens and `.wrap` / `.section` / `.hero` / `.lede` classes are the
   same in both sites.
2. Run `scripts/split-sections.py site/src` (adjust its figure list to Biased-Decisions' component
   names: `Board`, `Matrix`, `FacetTable`, `Chart`, `RiskPanel`, `Shortlist` and so on) and review
   the diff.
3. Biased-Decisions' home hero has `.hero-top` with the `hero-fig` chart: the same hero rule applies.
   Its `.cov` coverage grid and `.spider-row` should get the auto-fill treatment.
4. Port `test/layout.test.mjs`, then check 1,440, 1,920, 2,560, 3,440, 3,840 and 5,120 px for the
   container's share, grid columns, longest line and horizontal overflow.
