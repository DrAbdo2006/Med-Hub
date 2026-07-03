# Med Hub — Design System

The single source of truth for color and typography across the app. Enforced
globally in `Flashcards.jsx` via three injected stylesheets: `BRAND_CSS`
(tokens + utilities), `PALETTE_CSS` (strict remap of any stray Tailwind colors),
and `DARK_CSS` (dark mode). Standalone equivalents live in `index.css` and
`tailwind.config.js`.

## Color palette (strict — 5 colors)

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | `--med-bg` / `bg-med-bg` | `#F7F9FA` | App background (~60%). Cards stay white `#FFFFFF` for contrast. |
| Primary | `--med-primary` / `text-med-primary` `bg-med-primary` | `#1B98E0` | Headings, folder/project titles, icons, active progress bars, primary buttons (~30%). |
| Accent | `--med-accent` / `text-med-accent` `bg-med-accent` | `#E83151` | Important keywords, destructive actions, critical warnings (~10%). Apply **bold**. |
| Body text | `--med-text` / `text-med-text` `bg-med-text` | `#61636b` | Paragraphs, subtitles, secondary text, and the neutral "Hard" rating. |
| Lines | `--med-lines` / `border-med-lines` | `#C9A86A` | Card borders, dividers, input outlines. |

Supporting tints (derived, not new brand colors): primary tint `#E8F4FC`
(`bg-med-primary-soft`), accent tint `#FCE9ED` (`bg-med-accent-soft`), muted body
`#7c7f87` (`text-med-muted`), subtle/placeholder `#9aa0a8` (`text-med-subtle`).

No other hues are permitted. Any orange/green/indigo/violet/sky/etc. utility is
remapped to the table above by `PALETTE_CSS`, including hover/focus/disabled states.

## Typography

**Font:** 'Public Sans' (Google Fonts, weights 300 / 400 / 600).

Weights are intentionally heavier than the original draft for readability and
accessibility:

| Use | Weight | Class |
|-----|--------|-------|
| Body, subtitles, placeholders, secondary text | **400 Normal** (default) | — / `font-normal` |
| Emphasis, button labels, secondary actions | **500 Medium** | `font-medium` |
| Headings, folder/project names, important details | **600 SemiBold** | `font-semibold` |
| Strong headlines / numbers | **700 Bold** | `font-bold` |

Notes:
- Default `body` weight is **400** (previously 300 Light).
- `font-light` and `font-thin` are retired — both render as **400** via a global
  override, so no hairline text appears anywhere.
- Headings and titles are always `font-semibold`+ in **Primary Blue** (`#1B98E0`).

## Review stats — Again / Hard / Good / Easy (4 SM-2 ratings)

The four SM-2 ratings each map to one in-system token. Defined in **one place**
— `src/ratingStyles.js` (`RATING_META` + `RATING_ORDER`) — and consumed
everywhere via its helpers (`textClass` / `bgClass` / `borderClass` /
`softBgClass` / `fillHex`). No rating color is hardcoded anywhere else.

| State | Label | Color | Token | Hex |
|-------|-------|-------|-------|-----|
| Again | `…A` | Accent Red | `med-accent` | `#E83151` |
| Hard | `…H` | Neutral Grey | `med-text` | `#61636b` |
| Good | `…G` | Primary Blue | `med-primary` | `#1B98E0` |
| Easy | `…E` | Gold | `med-lines` | `#C9A86A` |

Gold is **only** `med-lines` (never standard Tailwind yellow). This swaps the
earlier scheme (Easy was previously blue).

Applies to: the in-study grade buttons, the stat labels (e.g. `1A 0H 7G 2E`),
the stacked progress-bar segments (`MixRow`, four segments via `RATING_ORDER` +
`fillHex`), and the Study-Complete summary cards (`CompleteView`, four boxes).
Bucketing rule (shared by `MixRow` and `CompleteView`): the **count of times
each rating was pressed** — so the per-project bar and the Complete screen agree.
