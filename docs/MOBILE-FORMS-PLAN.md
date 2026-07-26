# Plan: Fix long/overflowing forms on mobile

Status: ready to execute. Scope is `web/` only — no server changes, no new dependencies.

## Context

Commit `2c0abfa` made the app shell responsive (sidebar drawer, stacked grids, scrollable
registry table). What it did **not** touch are the form control rows. On a real phone
(~390px wide) several forms still render too wide or trigger iOS auto-zoom, which is the
"forms are coming long" complaint. All issues below were verified by reading the code;
there are currently no `flex-wrap` rules on the rows listed.

Relevant background: `.flex-row` (`web/src/styles/index.css:841`) is `display: flex` with
**no wrap**, and flex children with intrinsic min-content width (selects, sliders, buttons)
refuse to shrink, so unwrapped rows overflow the viewport.

## Verified issues

| # | File:line | Problem at phone width |
|---|-----------|------------------------|
| 1 | `web/src/pages/SearchPage.tsx:131` | Inner `.flex-row` holding the "Certified only" checkbox, "Min trust" range slider, and Sort select has no wrap. Combined min width ≫ 390px → the whole page scrolls horizontally. The `<input type="range">` also has a fixed UA default width (~129px) and never shrinks. |
| 2 | `web/src/pages/CreatePage.tsx:114` | Type + Security scope `<select>`s sit side by side in an unwrapped `.flex-row`. Selects can't shrink below their longest option, so the row overflows / gets crushed. Should stack to one column on phones. |
| 3 | `web/src/pages/CreatePage.tsx:228` | `DuplicateIntercept` card: text column + "Use existing" button in an unwrapped space-between row. Button gets squeezed off the card edge. |
| 4 | `web/src/pages/ArtifactDetailPage.tsx:104` | "Inputs & outputs" section: two `flex: 1` columns with a `--space-6` gap, unwrapped. Cramped/overflowing at 390px; should stack. |
| 5 | `web/src/pages/GovernancePage.tsx:120` | Merge / Archive / Dismiss button row has no wrap; overflows at ≤360px. |
| 6 | Global (`web/src/styles/index.css`) | Every input inherits the 14px body font. iOS Safari **auto-zooms the page when focusing any input with font-size < 16px** and leaves it zoomed — this is almost certainly the literal "form comes long" symptom on the phone. Fix: 16px form-control font size at phone widths. |

## Implementation steps

### 1. Add a reusable stacking row class (CSS)

In `web/src/styles/index.css`, near the existing `.flex-row` helpers, add:

```css
.form-row {
  display: flex;
  gap: var(--space-5);
  align-items: flex-start;
}
```

and inside the existing `@media (max-width: 560px)` block (already present at the bottom
of the file) add:

```css
.form-row {
  flex-direction: column;
  gap: var(--space-4);
}

.form-row > * {
  width: 100%;
}
```

Do **not** add `flex-wrap` to `.flex-row` globally — it's used for tightly-paired
label/value rows (e.g. the Trust/Cost/Details cards) that must stay on one line.

### 2. iOS zoom fix (CSS)

In the same `@media (max-width: 560px)` block:

```css
.input,
select.input,
textarea.input {
  font-size: 16px;
}
```

16px is the documented iOS threshold; below it Safari zooms on focus.

### 3. SearchPage filter row (`web/src/pages/SearchPage.tsx:131`)

- Change `<div className="flex-row">` (line 131) to
  `<div className="flex-row" style={{ flexWrap: "wrap" }}>` so the three controls wrap
  instead of forcing overflow.
- Give the range slider a shrinkable width: on the `<input type="range">` (line ~143) add
  `style={{ width: 90, minWidth: 60, flexShrink: 1 }}` (or a `.trust-slider` class in CSS
  with `width: 90px; min-width: 0;`). Prefer the CSS class.

### 4. CreatePage type/scope row (`web/src/pages/CreatePage.tsx:114`)

Replace `<div className="flex-row" style={{ gap: "var(--space-5)" }}>` with
`<div className="form-row">`. The two child `.field` divs keep `style={{ flex: 1 }}`;
that's harmless once the row stacks (they become full-width).

### 5. DuplicateIntercept card row (`web/src/pages/CreatePage.tsx:228`)

Add wrap + gap so the "Use existing" button drops below the text on narrow screens:

```tsx
<div className="flex-row" style={{ justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
```

(Same pattern already used in `GovernancePage.tsx:90`.)

### 6. ArtifactDetail inputs/outputs (`web/src/pages/ArtifactDetailPage.tsx:104`)

Replace the row with `<div className="form-row">` (drop the inline
`alignItems`/`gap` styles — `.form-row` supplies both). Children keep `flex: 1`.

### 7. Governance action buttons (`web/src/pages/GovernancePage.tsx:120`)

Change `<div className="flex-row">` to
`<div className="flex-row" style={{ flexWrap: "wrap" }}>`.

## Verification

1. `cd web && npm run build` — must pass clean (tsc + vite).
2. Manual check in browser devtools at **390×844** and **320×568**, with the API running
   (`cd server && npm run dev`, web via `npm run dev`):
   - `/` (Search): filter row wraps; **no horizontal page scroll**; slider usable.
   - `/registry/new` (Create): Type/Scope stacked full-width; submit a duplicate-ish
     draft (e.g. name/description copied from an existing artifact) to render the
     DuplicateIntercept and confirm the "Use existing" button isn't clipped.
   - `/artifacts/<any-id>`: Inputs & outputs stacked.
   - `/governance` as a lead/admin user (user switcher, top right): button row wraps.
   - Confirm `document.documentElement.scrollWidth === window.innerWidth` on each page.
3. Sanity check at desktop width (≥1200px): the edited rows must look unchanged
   (side-by-side selects, inline filter row, buttons on one line).

Note for browser automation: in the previous session the Chrome MCP extension could not
load the dev server (Vite binds to `::1` only; Chrome showed an error page even though
curl returned 200). If that recurs, start Vite with `npm run dev -- --host` so it binds
`0.0.0.0`, and browse via the machine's LAN IP — or just verify with devtools manually.

## Acceptance criteria

- No horizontal page scroll on any page at 320–430px viewport widths.
- No input focus zoom on iOS (all form controls ≥16px font at phone widths).
- Desktop layout visually unchanged.
- `npm run build` passes.

## Out of scope

- Registry table redesign (already horizontally scrollable by design, `2c0abfa`).
- Dark mode, touch targets, or any server work.
