---
name: ChaosRat
description: A broadcast chat overlay for OBS Studio, split into two honest surfaces — a near-stock settings form that builds a URL, and a transparent overlay whose chat themes are each their own design system, governed by a shared contract rather than a shared look.
colors:
  # Surface A — the builder page (chota variables, redeclared verbatim in body.index)
  bg: "#ffffff"
  bg-secondary: "#f3f3f6"
  primary: "#14854f"
  on-primary: "#ffffff"
  text: "#333333"
  ink: "#000000"
  light-grey: "#d2d6dd"
  grey: "#747681"
  dark-grey: "#3f4144"
  error: "#d43939"
  success: "#28bd14"
  # Surface B — the overlay contract only. Per-theme colors (default's plate,
  # colorful's palette, video-master's canvas, cute's fills, etc.) live in
  # each theme's own DESIGN.md under app/components/themes/*/, not here —
  # duplicating them in this file is exactly what would let the two drift.
  overlay-canvas: "transparent"
  outline: "#000000"
  alarm: "rgba(251, 255, 0, 0.5)"
typography:
  builder-body:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif"
    fontSize: 1.6rem
    fontWeight: 400
    lineHeight: 1.6
  builder-heading:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif"
    fontSize: 1.75em
    fontWeight: 500
  builder-tooltip:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif"
    fontSize: 1.1rem
    fontWeight: 700
  overlay-display:
    fontFamily: "'ONE-Mobile-POP', 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif"
    fontSize: 1.8rem
    fontWeight: 400
rounded:
  sm: 4px
  lg: 0.5rem
  pill: 0.8rem
spacing:
  lg: 1rem
  2xl: 2rem
  button-x: 2.5rem
  preview-height: 45rem
  container-max: 120rem
  icon: 1.8rem
  sticker: 10rem
  text-outline: 0.1rem
components:
  card:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "{spacing.lg} {spacing.2xl}"
  heading:
    typography: "{typography.builder-heading}"
    textColor: "{colors.text}"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.ink}"
    typography: "{typography.builder-body}"
    rounded: "{rounded.sm}"
  select:
    backgroundColor: "{colors.bg-secondary}"
    textColor: "{colors.ink}"
    typography: "{typography.builder-body}"
    rounded: "{rounded.sm}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.builder-body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.lg} {spacing.button-x}"
  button-secondary:
    backgroundColor: "{colors.grey}"
    textColor: "{colors.on-primary}"
    typography: "{typography.builder-body}"
    rounded: "{rounded.sm}"
    padding: "{spacing.lg} {spacing.button-x}"
  tooltip:
    backgroundColor: "{colors.light-grey}"
    textColor: "{colors.text}"
    typography: "{typography.builder-tooltip}"
    rounded: "{rounded.pill}"
    size: "1.6rem"
  preview-frame:
    height: "{spacing.preview-height}"
  chat-container:
    backgroundColor: "{colors.overlay-canvas}"
  chat-icon:
    width: "{spacing.icon}"
    height: "{spacing.icon}"
  chat-badge:
    width: "{spacing.icon}"
    height: "{spacing.icon}"
  chat-emoji:
    height: "{spacing.icon}"
  chat-sticker:
    width: "{spacing.sticker}"
    height: "{spacing.sticker}"
  error-item:
    backgroundColor: "{colors.alarm}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
---

## Overview

ChaosRat is two surfaces that share a codebase and little else. That was
already true; what changed is that the second surface no longer pretends to
be one design system with interchangeable skins. **Each chat theme is
its own separate design system**, documented in its own `DESIGN.md` next to
its component — one directory per design system under
`app/components/themes/` (`ls -d app/components/themes/*/` counts them; the
theme map below enumerates them by name). This file covers what's left once
that's split out: the builder page, in full, and the small contract every
theme must honor no matter how different its own look is.

**The overlay (`/chat`) is a burned-in caption layer on a live broadcast.**
Think of the timestamp/lower-third text a TV station burns into a camera feed
it doesn't control: every glyph carries its own legibility guarantee because
the footage behind it can be anything, it is anchored to the bottom of frame
and stacks upward as new lines arrive, and when there is nothing to say it
renders literally nothing — {colors.overlay-canvas} is `transparent`, not an
empty panel with a background color. That reference describes what the
**contract** below guarantees for every theme: the transparent canvas, the
bottom-anchored list, the shared icon/badge/sticker sizing, and the
plate-or-outline rule. It does not describe how any given theme looks —
`default`'s plate, `colorful`'s sticky-note palette, `video-master`'s opaque
dashboard, and `cute`'s hand-drawn bubble each bring their own reference
object, argued for on their own terms in their own file.

**The builder page (`/`) is a broadcast utility's property sheet** — the same
register as OBS Studio's own source-properties dialog: a dense label-left /
control-right form a broadcaster fills in once, copies a URL out of, and
rarely opens again. It is deliberately plain, and that plainness is not a
design achievement to preserve reverently — `app/pages/index.vue` only
redeclares chota's own CSS custom properties with a Korean-capable font
stack, and every visual choice below (`{rounded.sm}` cards, chota's default
shadow, chota's default palette) is chota 0.9.2 stock, untouched. The one
moment of visual investment on this page is functional, not decorative: a
live `<iframe>` preview of the actual overlay, so the tool proves its own
output instead of describing it.

## Colors

**Builder palette** — a straight, un-retouched chota theme. {colors.bg}
(`#ffffff`) is the page canvas; {colors.bg-secondary} (`#f3f3f6`) is chota's
own `select { background: #f3f3f6 }`, the fill behind the two dropdowns
(theme and platform pickers) on the builder page — bound to the `select`
component, not a general "secondary surface" role. {colors.text} (`#333333`)
is body copy — but not form-control copy: chota never sets an explicit
`color` on `input`/`select`, so both render the browser/OS default text
color, which computes to pure {colors.ink} (`#000000`), not {colors.text}.
That's a real, if minor, inconsistency between body copy and form-field
copy worth knowing rather than silently equalizing next time either is
touched. {colors.primary} (`#14854f`, chota's default green) marks the
one interactive accent — links and the primary "URL 복사" button — paired
with {colors.on-primary} for text on a solid fill. {colors.light-grey} fills
the help tooltip. {colors.grey} (`#747681`) does double duty in stock chota:
it's the color `.card`'s `box-shadow: 0 1px 3px {colors.grey}` renders in
(the only elevation cue on this surface, and one the `components` schema
can't literally express — there is no shadow-color property, only
`backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`,
`height`, `width` — so that specific usage stays prose-only), and it's also
the literal `background-color` of `.button.secondary` ("열기"), which **is**
expressible and is what `button-secondary` binds to below. {colors.error}
marks `.warning` text (validation/error copy).

{colors.dark-grey} (`#3f4144`) is chota's base `.button` text color — real
CSS, genuinely applied in chota's own stylesheet — but every button variant
this app actually uses (`.primary`, `.secondary`) overrides it with
{colors.on-primary}, so no rendered button in this app shows it.
{colors.success} is a chota default this app redeclares but never applies to
any element at all. Both are deliberately **kept, not bound and not
deleted**: they are real values in the CSS custom properties this page
inherits from chota, and documenting "this exists in the theme but paints
nothing" is more honest than either inventing a use for them or pretending
they aren't part of the palette. `designmd lint` reports an accepted
`orphaned-tokens` warning on each for exactly that reason — see Do's and
Don'ts.

**Overlay contract colors** — because the backdrop is arbitrary, uncontrolled
live video, **no static contrast ratio can be guaranteed for the overlay**
the way it can for the builder page, which is why the contract never relies
on color contrast alone. {colors.overlay-canvas} (`transparent`) is the
default canvas every theme starts from. {colors.outline} is the hard 8-way
text shadow color `TextWithShadow` draws behind a glyph — the one rendering
mechanism shared by every theme's text, regardless of whether that theme
also adds its own opaque or translucent plate behind it (a per-theme choice,
documented in that theme's own file). {colors.alarm} is a loud, alarm-yellow
plate reserved for a single meaning: the error surface that replaces the
whole overlay when a platform connection fails, so a broadcaster notices it
on-stream even against arbitrary footage.

**Measured contrast, so this stays a fact rather than an opinion:**

- {colors.text} on {colors.bg} ≈ 12.6:1 — passes AA/AAA with enormous margin.
- {colors.on-primary} on {colors.primary} ≈ 4.67:1 — passes AA, but with
  almost no margin. {colors.primary} may be **darkened** further without
  risk; it must not be **lightened**, or this pair drops below 4.5:1.
- {colors.on-primary} on {colors.grey} (`button-secondary`, "열기") ≈
  4.52:1 — also passes AA, also with almost no margin, for the same reason:
  {colors.grey} must not be lightened either.

Per-theme surface colors and their measured contrast — `colorful`'s nickname
palette, `video-master`'s canvas/text pair, `cute`'s deliberately
low-contrast nickname strip — are documented in each theme's own file, not
here; see the theme map below.

## Typography

Both surfaces share the same base unit: chota's `html { font-size: 62.5% }`
makes **1rem = 10px**, so every `rem` value in this file is on that basis
(`{spacing.button-x}` is a 25px padding, `{spacing.2xl}` is a 20px gutter,
and so on) — this is load-bearing, not a rounding convenience, and any new
value should be chosen in that basis rather than assuming the browser
default `1rem = 16px`.

{typography.builder-body} carries the Pretendard-led sans stack
(`"Pretendard Variable", Pretendard, -apple-system, …, "Noto Sans KR", …`) at
`1.6rem` (16px) — the UI/chrome voice for the builder page.
{typography.builder-heading} is chota's own `h2`-scale weight (500 at
`1.75em`) used as-is. {typography.builder-tooltip} is the bold `1.1rem` used
inside the tooltip's small pill.

**Where the builder stack lives in code:** `app/assets/css/main.css`'s
`:root` declares `--chat-font-sans` once, holding the exact
{typography.builder-body} font list verbatim; before this, that stack was
copy-pasted as a literal across several files, now it is declared once and
consumed everywhere, including by the overlay's own per-theme typography.
`--chat-font-sans` is a deliberately _new_ name, not chota's own
`--font-family-sans` — chota declares that variable at the same `:root`
specificity, so reusing the name would collide with chota's default rather
than extend it. `body.index` (`pages/index.vue`) assigns
`--font-family-sans: var(--chat-font-sans)` to override chota per page
instead of fighting it at the same cascade layer.

Everything about how a given theme sets its own overlay text — size,
weight, and whether it uses {typography.overlay-display} — is that theme's
own decision, recorded in its own file. The one exception, `--font-family-display`,
is covered in Overlay Contract & Theme Map below, since it is a genuinely
shared token, not a per-theme one.

## Layout

The builder page follows chota's own grid: `.container` capped at
{spacing.container-max} (120rem / 1200px) wide, `.row` / `.col-2` (label) +
`.col` (control) for every form field, wrapped in `{rounded.sm}` `.card`
blocks. chota's own `.card` padding is asymmetric — {spacing.lg} (1rem) top
and bottom, {spacing.2xl} (2rem) left and right. This app's scoped CSS then
sets `padding-top: {spacing.2xl}` on `.input-card` and `.result-card`
specifically — a longhand declaration that **replaces** chota's
{spacing.lg} top value rather than stacking on top of it. Real computed
values confirm this: `.input-card`/`.result-card` render `padding: 20px 20px
10px` (top {spacing.2xl}, sides {spacing.2xl}, bottom {spacing.lg}), while
the untouched `.preview-card` keeps stock chota's `padding: 10px 20px` (top
and bottom {spacing.lg}, sides {spacing.2xl}). The asymmetry is real — those
two cards have a more generous top edge than bottom — but it is one edge
swapped from {spacing.lg} to {spacing.2xl}, not an additive 3rem; don't
read it as stacked padding. chota's `--grid-gutter` is also {spacing.2xl}
(2rem), but chota applies it **halved**: `.container`'s `padding` and
`.row`'s matching negative `margin` both compute to {spacing.lg} (1rem,
`calc(gutter / 2)`) per side, not the full {spacing.2xl}. The card's
horizontal padding, by contrast, really is the full {spacing.2xl} — the two
aren't the same applied value, just derived from the same source variable
at different halvings. The live preview iframe (`preview-frame`) is fixed
at {spacing.preview-height} (45rem / 450px) tall, tall enough to judge a
theme at a glance without scrolling the page.

Buttons (`button-primary`, `button-secondary`) use chota's own
`padding: {spacing.lg} {spacing.button-x}` (1rem 2.5rem) — deliberately wide
horizontal padding that sits off the rest of the spacing ladder, which is
why {spacing.button-x} is its own named token rather than reusing a value
from elsewhere on the ladder. Don't round it down; it's chota's intentional
button proportion, not an oversight.

The overlay's own layout — the bottom-anchored list, and every per-theme
spacing decision inside a chat item — is covered in Overlay Contract &
Theme Map below and in each theme's own file, not here.

## Elevation & Depth

The builder page has exactly one elevation cue, chota's own: `.card`'s
`box-shadow: 0 1px 3px {colors.grey}`, a soft 3px-blur shadow that lifts the
form off the page background. Nothing else on this page casts a shadow —
buttons, inputs, and the tooltip are flat.

The overlay has **no shadows at all**, and cannot meaningfully have any: it
composites over unpredictable live video, so a drop shadow calibrated
against one backdrop reads as noise against the next. Every theme
substitutes one of two backdrop-agnostic mechanisms instead — see Overlay
Contract & Theme Map below for the full reasoning, the outline's offset
math, and why `video-master` is the one sanctioned exception that gets to
use ordinary flat contrast instead.

## Shapes

{rounded.sm} (4px) is chota's own corner radius, applied uniformly to cards,
buttons, and inputs on the builder page — small and consistent, engineered
rather than decorative. {rounded.pill} (0.8rem on a 1.6rem square) is a true
circle, used by the builder's help tooltip. {rounded.lg} (0.5rem) rounds the
overlay's error banner just enough to read as a system toast rather than a
hard alert box — this is the one radius the overlay contract itself
specifies; every other corner treatment on the overlay (square, softened,
or otherwise) is a per-theme decision recorded in that theme's own file.

## Components

`card`, `input`, `select`, `button-primary`, `button-secondary`, `tooltip`,
and `heading` are the builder page's vocabulary — all near-stock chota, all
using {typography.builder-body} except the tooltip ({typography.builder-tooltip})
and section headings ({typography.builder-heading}). `select` is distinct
from `input`: it's the two dropdowns (theme/platform pickers), filled with
{colors.bg-secondary} rather than {colors.bg}. `button-primary` /
`button-secondary` appear side by side ("URL 복사" / "열기") and are visually
equal in weight — both are {colors.on-primary} text on a solid fill
({colors.primary} vs. {colors.grey} respectively), at chota's wide
`{spacing.lg} {spacing.button-x}` padding — neither should be promoted over
the other since both are routine actions on this page, not a
primary/secondary call-to-action pair in the marketing sense. `preview-frame`
is the live iframe embed.

`chat-container`, `chat-icon`, `chat-badge`, `chat-emoji`, and `chat-sticker`
are overlay invariants shared by **every** theme: the canvas is always
{colors.overlay-canvas} (transparent) by default, and the platform icon, the
badge, and the inline emoji all render at {spacing.icon} (1.8rem) because
they must sit on one visual baseline with the surrounding text;
stickers are always {spacing.sticker} (10rem), large enough to read as their
own visual event rather than inline decoration. These are backed by real CSS
custom properties declared once in `app/assets/css/main.css`'s `:root`, not
copy-pasted as literals per theme — see Overlay Contract & Theme Map below
for the full mechanism and why it matters. `error-item` is the
{colors.alarm} banner that replaces the entire overlay on a connection
failure — the one item-level component that is not a per-theme decision,
since every theme shows the same error surface.

Every other item-level component — the nickname/message pairing each theme
actually renders, its plate or lack of one, its own corner radius and
spacing — belongs to exactly one theme and is documented in that theme's
own `DESIGN.md`, not here.

## Overlay Contract & Theme Map

This is the part every theme must honor, regardless of how different its
own design system is. Nothing here is a suggestion; a new or modified theme
that violates one of these breaks the "burned-in caption layer" premise the
whole overlay depends on.

1. **Transparent by default.** {colors.overlay-canvas} is `transparent` so
   the overlay composites over live video instead of owning the pixels
   behind it. `video-master` is the single sanctioned exception, and its
   opt-out to a fully opaque canvas must be a deliberate, whole-canvas
   choice documented in its own file — not a default any new theme inherits
   casually.
2. **The list is bottom-anchored.** `.list { position: absolute; left: 0;
right: 0; bottom: 0 }`. Newest message renders at the bottom; older
   messages are pushed upward and clipped once they scroll past the top of
   frame. This is absolute positioning, not document flow the browser lays
   out — there is no scrollbar and no "load more."
3. **Icon, badge, and inline emoji render at {spacing.icon} (1.8rem);
   stickers at {spacing.sticker} (10rem).** The single source of truth is
   `--chat-icon-size` / `--chat-sticker-size`, declared once in
   `app/assets/css/main.css`'s `:root`. A theme must not override these
   locally or restate a literal that could drift from them. Each theme's own
   `DESIGN.md` restates these same two values — that is expected, not
   duplication to eliminate: the DESIGN.md format resolves `{token}`
   references per file only, with no cross-file inheritance, so those
   restatements are mirrors of this one pair of CSS custom properties, not
   independent values a theme is free to change.
4. **`isHidePlatformIcon` is honored wherever a platform icon is rendered.**
   Every theme that shows a platform icon at all must respect this option;
   none may hardcode the icon as always-visible.
5. **Every glyph sits behind either a plate or an outline, never neither.**
   Contrast against arbitrary live video is uncomputable in advance — see
   Colors above — so the overlay never relies on bare text over transparent
   background as its only legibility mechanism. `TextWithShadow` is the
   shared component behind the "outline" half of that rule: it draws
   {colors.outline} in all 8 directions around a glyph, each offset by
   {spacing.text-outline} (0.1rem), with the four diagonal offsets scaled by
   `sqrt(size²/2)` so the result reads as a round halo rather than a square
   frame. A theme may additionally add its own plate on top of this (opaque
   or translucent, its own color, defined in its own file) — that is a
   theme-level enhancement, not a substitute for the outline, and a theme
   that ships bare text with no outline and no plate breaks this rule
   regardless of how good its own palette is.
6. **The rule this split itself creates: don't hoist a per-theme value into
   shared scope just because two themes happen to agree on a number.**
   That is a documented mistake, not a hypothetical one: `--chat-gap` was
   previously a global CSS custom property shared by three themes purely by
   numeric coincidence, and `--chat-gap-sm` was a global token with exactly
   one consumer. Both were removed; each theme's own spacing (including its
   own gap value) now lives as CSS custom properties scoped to that theme's
   own `.chat-container`, not in `app/assets/css/main.css`'s `:root`.
   Anything not covered by rules 1–5 above is a given theme's own decision,
   full stop — promoting it to a shared token because it happens to match
   another theme's number recreates exactly the bug that was just fixed.
7. **The one deliberate exception to rule 6: `--font-family-display`**
   ({typography.overlay-display}, `"ONE-Mobile-POP"`, used by `colorful` and
   `cute`). This is not a coincidental shared number — it is a shared
   _role_: the playful themes' display voice, as opposed to the plainer
   themes' body sans. The `@font-face` declaration is global regardless of
   which themes use it, so there is no per-theme cost to keeping the
   variable shared either. This exception is intentional and should not be
   "corrected" into two theme-local copies later.
8. **WCAG AA is deliberately _not_ part of this contract.** Every theme's
   design system spans registers from a plain caption layer to a hand-drawn speech bubble
   to a file-manager panel, and a single 4.5:1 floor cannot be imposed on
   all of them without flattening the differences that make them separate
   design systems in the first place. What every theme owes is that its
   contrast figures are **measured and recorded in its own file** — not that
   they clear 4.5:1. Two pairings are currently below AA, both measured,
   both reviewed by the project owner, and both kept on purpose:
   `cute`'s nickname strip (2.00–2.15:1 across the hue rotation) and
   `video-master`'s header label (4.27:1). Each is documented in its own
   theme file along with the cheaper alternative that was considered and
   declined. `designmd lint` emits a `contrast-ratio` warning for each; those
   warnings are permanently accepted, not an outstanding queue. **Do not
   "fix" a sub-AA pairing you find in a theme file** — if the number is
   recorded there, it is a decision, and changing it is the owner's call,
   not a lint-driven cleanup.

**Where each theme's own design system lives:**

| Theme          | DESIGN.md                                      |
| -------------- | ---------------------------------------------- |
| `default`      | `app/components/themes/default/DESIGN.md`      |
| `simple`       | `app/components/themes/simple/DESIGN.md`       |
| `pure`         | `app/components/themes/pure/DESIGN.md`         |
| `colorful`     | `app/components/themes/colorful/DESIGN.md`     |
| `video-master` | `app/components/themes/video-master/DESIGN.md` |
| `cute`         | `app/components/themes/cute/DESIGN.md`         |

`cute` covers both the `cute-left` and `cute-right` query values — they are
one design system, not two; the only difference between them is flex
alignment (left- vs. right-aligned bubbles), not color, type, shape, or any
other token in that file.

## Do's and Don'ts

- **Do** treat the builder page's plainness as intentional restraint, not an
  unfinished state. **Don't** add chota-style flourishes there beyond what
  `{rounded.sm}` and {colors.grey}'s card shadow already provide — it is a
  property sheet, not a marketing surface.
- **Do** leave {colors.dark-grey} and {colors.success} declared and unbound,
  and accept the resulting `orphaned-tokens` warnings on both. **Don't**
  invent a use for either just to silence the linter — they are real,
  currently-unpainted values inherited from chota, and a fabricated binding
  would be less honest than the warning.
- **Do** keep {colors.overlay-canvas} transparent by default for any new
  theme. **Don't** default to an opaque canvas the way `video-master` does
  without a specific, documented reason — that theme is the deliberate
  exception, not the template.
- **Do** back every glyph on the overlay with either a plate or
  {colors.outline}. **Don't** ship a new theme that renders bare text on a
  transparent canvas with neither.
- **Do** pull every icon/badge/emoji/sticker dimension from
  `var(--chat-icon-size)` / `var(--chat-sticker-size)` in
  `app/assets/css/main.css`'s `:root`. **Don't** introduce a fifth one-off
  size for a new theme, or restate either literal directly where the
  variable already applies.
- **Do** keep a theme's own spacing, radius, and palette decisions scoped to
  that theme's own file and its own `.chat-container` custom properties.
  **Don't** promote a value into this file's shared tokens just because
  another theme happens to use the same number — that is precisely the
  `--chat-gap` / `--chat-gap-sm` mistake this split exists to prevent from
  recurring.
- **Do** treat `--font-family-display` as the one intentionally shared
  exception to the rule above. **Don't** split it into per-theme copies —
  it is a shared role (the playful themes' display voice), not a
  coincidence.
