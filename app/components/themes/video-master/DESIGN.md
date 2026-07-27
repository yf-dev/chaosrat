---
name: Video Master
description: The one opaque, tonal-hierarchy chat theme — a file manager's Details/List view rendered as a live chat table.
colors:
  # The canvas. This is the single sanctioned exception to the cross-theme
  # contract that every other theme keeps a transparent background so it can
  # composite over live video (see the root DESIGN.md's contract section).
  # video-master opts out on purpose: painting an opaque plate is what lets
  # it compute real contrast ratios and use flat tonal steps for hierarchy
  # instead of outlines or translucent plates the way every other theme
  # must. The cost is symmetric with the benefit — the video underneath is
  # completely hidden, so this theme needs its own dedicated region of the
  # OBS canvas (e.g. a sidebar or letterboxed strip), never a full-bleed
  # overlay on top of gameplay.
  primary: "#1D1D1D"
  # One tonal step up from {colors.primary}. Used for exactly one surface —
  # the fixed header row — so the header reads as a distinct application
  # chrome plate sitting above the scrolling list, the same way a file
  # manager's column-header bar sits above its rows.
  header-surface: "#262626"
  # Body/label text color for everything in the table: row nicknames,
  # messages, and header cell labels. See the Colors section for the
  # measured contrast ratio against both surfaces above — it is the reason
  # this value cannot get any darker.
  muted-text: "#888888"
  # The sort chevron in the header (IconChevronUp) and the collapse chevron
  # on every row (IconChevronDown) are both painted with this exact literal
  # — passed as the Tabler icon's `color` prop in the template, not drawn
  # from the `--muted-text` CSS custom property. It is one digit lighter
  # than {colors.muted-text} (#999999 vs #888888): a real, deliberate second
  # gray, not a typo, and not interchangeable with muted-text.
  chevron: "#999999"
  # The 1px rule used for all four dividers in this layout: under each row's
  # nickname line, above each row (top border), under the header row, and
  # between the header's icon cell and label cell. There is no `border` /
  # `borderColor` property in the components schema, so this token cannot be
  # bound to any `components.*` entry — unlike the `--rule` sibling color in
  # the cute-* themes' outline strokes (which likewise has no home), this
  # one is declared anyway rather than dropped, because it is the single
  # most load-bearing color in a design whose entire hierarchy is "flat
  # fields plus hairlines." Expect `designmd lint` to report one
  # `orphaned-tokens` warning for it — that is accepted, not a bug to chase
  # by deleting the token or inventing a fake component for it.
  rule: "#333333"
typography:
  # Bold label role: row nicknames and the header's "Name" column heading.
  # Both are the same weight and size on purpose — the header cell is a
  # column label for the exact text directly below it in every row, so they
  # read as one continuous column, not two different type styles.
  row-label:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif"
    fontSize: 1.8rem
    fontWeight: 700
  # Regular body role: the chat message line. Same family and size as
  # row-label, only the weight changes — this theme carries exactly one
  # typeface and one size, and lets weight alone separate "column value"
  # from "row detail."
  row-body:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, 'Helvetica Neue', 'Segoe UI', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', sans-serif"
    fontSize: 1.8rem
    fontWeight: 400
spacing:
  # Mirrors the `--cell-pad-v` custom property scoped to `.chat-container`
  # in VideoMasterChatList.vue. Vertical padding shared by every cell in the
  # table: nickname, message, and both header cells.
  cell-pad-v: 0.4rem
  # Mirrors `--cell-pad-h`. Horizontal padding on the trailing edge of the
  # nickname/message cells and both edges of the header label cell. Note
  # `.nickname-box`'s own `gap: 1rem` (the flex gap between the icon box,
  # chevron, badge box, and nickname) is a *different* number that happens
  # to equal `--cell-pad-h`'s neighbor scale — it is deliberately kept as a
  # plain literal in the component and never folded into this token, because
  # one is an inter-section flex gap and the other is cell edge padding; a
  # future edit to one must not silently move the other.
  cell-pad-h: 1rem
  # Mirrors `--icon-col-width`. Fixed width shared by the row icon column
  # and the header's first cell, so the icon and the sort chevron in the
  # header both line up with every row's icon below them.
  icon-col-width: 4rem
  # Left padding on the message cell only. Not a scale step reused anywhere
  # else — it exists purely so the message text's left edge lands under the
  # header's "Name" label rather than under the row's icon/chevron/badge
  # cluster, i.e. the detail line indents to the *column*, not the *row*.
  message-indent: 9rem
  # Mirror of the cross-theme contract's `--chat-icon-size` (defined once in
  # app/assets/css/main.css, consumed — never overridden — by every theme).
  # Restated here, with this comment, only because DESIGN.md token
  # references resolve within a single file and cannot reach across files;
  # the real source of truth stays main.css. Covers the platform icon, the
  # per-platform badge images, and inline emoji.
  icon: 1.8rem
  # Mirror of the cross-theme contract's `--chat-sticker-size`, same
  # single-file-resolution caveat as icon above.
  sticker: 10rem
components:
  canvas:
    backgroundColor: "{colors.primary}"
  header-bar:
    backgroundColor: "{colors.header-surface}"
  header-icon-cell:
    backgroundColor: "{colors.header-surface}"
    width: "{spacing.icon-col-width}"
    padding: "{spacing.cell-pad-v} {spacing.cell-pad-h}"
  header-label-cell:
    backgroundColor: "{colors.header-surface}"
    textColor: "{colors.muted-text}"
    typography: "{typography.row-label}"
    padding: "{spacing.cell-pad-v} {spacing.cell-pad-h}"
  sort-chevron:
    textColor: "{colors.chevron}"
    size: 20px
  icon-column:
    width: "{spacing.icon-col-width}"
  platform-icon:
    size: "{spacing.icon}"
  platform-badge:
    size: "{spacing.icon}"
  inline-emoji:
    height: "{spacing.icon}"
  sticker:
    width: "{spacing.sticker}"
    height: "{spacing.sticker}"
  nickname-cell:
    textColor: "{colors.muted-text}"
    typography: "{typography.row-label}"
    padding: "{spacing.cell-pad-v} {spacing.cell-pad-h} {spacing.cell-pad-v} 0"
  message-cell:
    textColor: "{colors.muted-text}"
    typography: "{typography.row-body}"
    padding: "{spacing.cell-pad-v} {spacing.cell-pad-h} {spacing.cell-pad-v} {spacing.message-indent}"
---

## Overview

video-master is a desktop file manager's Details/List view — Windows
Explorer's "Details" mode, or Finder's "List View" — repurposed to render a
live chat log instead of a directory. That reference is exact, not
approximate: a fixed header row carries a sort-direction chevron
(`IconChevronUp`) over a literal **"Name"** column heading; every row below
it pairs an icon-and-chevron cluster with a bold column value (the
nickname) and an indented secondary line (the message), the same way a file
row pairs an icon with a bold filename and, in some file managers, a
lighter metadata line underneath; and rows are separated by hairline
1px rules rather than cards, gaps, or shadows.

Naming that reference gives away this theme's whole rule set for free. File
managers are opaque application chrome, never a see-through pane floating
over whatever is behind the window — which is exactly why video-master is
the one theme in this project allowed to paint a fully opaque canvas
({colors.primary}) instead of compositing over OBS's video feed. File
managers use flat tonal steps to separate chrome from content (a
column-header bar one shade lighter than the content area) instead of
outlines, translucency, or drop shadows — which is exactly how
{colors.header-surface} relates to {colors.primary} here. And a file
manager's column headings and cell values line up on strict vertical
gridlines — which is why the message line indents to `{spacing.message-indent}`
(9rem, under "Name"), not to the icon column.

This theme is one of ChaosRat's design systems living under
`app/components/themes/` — self-contained, not a skin over a shared system —
and the invariants every theme must honor regardless of its own look are
recorded in the repo-root `DESIGN.md`'s Overlay Contract & Theme Map section.

## Colors

- **{colors.primary} (`#1D1D1D`)** is the opaque canvas — this theme's one
  sanctioned exception to the cross-theme rule that every theme stays
  transparent to composite over live video. Opting out buys computable,
  stable contrast and real tonal hierarchy instead of outlines/translucent
  plates; it costs total occlusion of whatever is behind it in OBS, so
  video-master must be given its own region of the scene layout (a sidebar,
  a letterboxed strip) rather than dropped full-bleed over gameplay.
- **{colors.header-surface} (`#262626`)** is one flat step lighter than the
  canvas, used only for the fixed header bar. It is the sole device this
  theme uses to separate "chrome" (the column-header row) from "content"
  (the scrolling list) — there is no shadow, no border around the header,
  just a lighter fill.
- **{colors.muted-text} (`#888888`)** is the only text/label color in the
  theme: row nicknames, messages, and the header's "Name" label all use it.
  Measured against {colors.primary} (`#1D1D1D`) the ratio is **4.76:1** —
  passes WCAG AA (4.5:1) for normal text, with only a thin margin. The safe
  direction for {colors.muted-text} is **lighter** (any lighter value only
  increases contrast further); **darkening** it is the unsafe direction, and
  the floor is `#848484`/dec 132 — one step below that (dec 131) drops
  below 4.5:1. Symmetrically, {colors.primary} may safely go **darker**
  without limit, but **lightening** it is unsafe: its ceiling is
  `#212121`/dec 33 — one step above that (dec 34) drops the pairing below
  4.5:1. Both floors are close to the current values (4 steps of headroom
  each), so any future retuning of either color must re-measure, not
  assume.
  Measured against {colors.header-surface} (`#262626`) the same text color
  only reaches **4.27:1** — this **fails** WCAG AA (4.5:1). That is the
  measured, unrounded number, not a rounded-up "passes": the header cell's
  label sits 0.23 short of the minimum.

  **This has been reviewed by the project owner and kept on purpose. It is
  not accessibility debt.** {colors.header-surface} exists to be one tonal
  step lighter than {colors.primary} so the header bar reads as a distinct
  application-chrome band above the scrolling rows (see Overview and
  Elevation & Depth). The same {colors.muted-text} that clears AA at
  4.76:1 against the darker canvas falls slightly short against that
  deliberately lighter band — the shortfall is the direct, unavoidable
  cost of the tonal separation this theme is built on, priced in
  header-label contrast specifically.

  The known fixes are on record and explicitly declined: darkening
  {colors.header-surface} to `#212121`/dec 33 or below, or lightening
  {colors.muted-text} to `#8c8c8c`/dec 140 or above, would each restore
  4.5:1+ on this pairing. Both are written down here so nobody has to
  re-derive them — and **neither is to be applied**, because either move
  would flatten the header/row tonal step this theme depends on to read
  as chrome over content. A `designmd lint` run against this file raises
  one `contrast-ratio` warning for `components.header-label-cell`
  (4.27:1); that warning is permanently accepted, not an outstanding
  item, the same way {colors.rule}'s `orphaned-tokens` warning below is
  accepted.

  WCAG AA is not a cross-theme requirement in this project: each theme's
  design system settles its own contrast
  trade-offs, and what every theme owes is a measured, recorded number —
  not a guarantee of clearing 4.5:1.

- **{colors.chevron} (`#999999`)** is a second, separate gray reserved
  strictly for the two Tabler chevron icons (header sort chevron, per-row
  collapse chevron). It is one step lighter than {colors.muted-text} and is
  never used for text — keep the two grays distinct rather than
  consolidating them, since they are set through different code paths (an
  icon `color` prop vs. the CSS `--muted-text` custom property) and a
  future edit to one must not silently retarget the other.
- **{colors.rule} (`#333333`)** is the 1px divider color used in all four
  hairlines in this layout (row top border, nickname-box bottom border,
  header bottom border, header icon/label cell border). It is declared here
  and referenced nowhere under `components` — there is no `border`/
  `borderColor` property in the components schema to bind it to — so
  `designmd lint` reports one `orphaned-tokens` warning for this token.
  That warning is accepted, not fixed, because the rule is real, load
  bearing, and needs a name a future reader can find; leaving it out of the
  front matter to silence the linter would just move the same information
  into an unindexed CSS comment.
- A per-user avatar dot appears **only** when `isHidePlatformIcon` is on
  (see Components/Do's and Don'ts below) and is computed at render time via
  `hashToColor(hashCode(nickname), 100, 70)` — a fully-saturated HSL color
  keyed to the nickname's hash. This is intentionally not a token: it is
  per-user and unbounded (360 possible hues), not a fixed brand value, so it
  has no `{colors.*}` entry and none should be added for it.

## Typography

video-master carries exactly one typeface (the shared Pretendard stack,
mirrored here from `--chat-font-sans` in `app/assets/css/main.css`) at
exactly one size (`1.8rem`, inherited from chota's `--font-size` set on
`body.chat` in `pages/chat.vue` — this theme does not set its own base
font-size). The only typographic lever this theme pulls is font-weight:

- **{typography.row-label}** (700) is used for the row nickname and for the
  header's "Name" cell. They share a weight and size on purpose: the header
  label is a heading _for_ the column of nicknames beneath it, so making
  them typographically identical is what makes the pairing read as one
  column rather than two coincidentally-aligned pieces of text.
- **{typography.row-body}** (400) is the chat message line — the only
  regular-weight text in the theme, which is what visually demotes it to
  "detail" relative to the bold nickname/header row above it.

## Layout

The table geometry is driven entirely by the CSS custom properties scoped
to `.chat-container` in `VideoMasterChatList.vue`, each mirrored here as a
token so this file and the component never drift apart silently:

- `--icon-col-width` → **{spacing.icon-col-width}** (4rem): a fixed-width
  first column, shared verbatim by the header's icon cell and every row's
  icon box, so the header chevron and every row's icon/avatar sit on the
  same vertical gridline.
- `--cell-pad-v` → **{spacing.cell-pad-v}** (0.4rem) and `--cell-pad-h` →
  **{spacing.cell-pad-h}** (1rem): the shared vertical/horizontal padding
  rhythm for every cell — nickname, message, and both header cells.
- **{spacing.message-indent}** (9rem, the message cell's literal left
  padding): not a reused scale step, just the one value that lands the
  message's left edge under "Name" instead of under the icon column. It is
  the load-bearing detail that makes this a _table_ layout rather than a
  simple icon-plus-two-lines chat bubble.
- `--gap` (badge-box's internal flex gap, `0.6rem`) is deliberately **not**
  declared as a token in this file: like `{colors.rule}`, it has no home in
  the components schema (there is no `gap` property, only `padding`/`size`/
  `height`/`width`), and unlike `{colors.rule}` it is a minor internal
  spacing detail rather than the theme's primary hierarchy device — so it
  is documented here in prose only, not minted as an orphaned token. The
  component's own code comment carries the same value.
- `.nickname-box`'s plain `gap: 1rem` is a separate, un-tokenized literal
  that happens to share a number with `{spacing.cell-pad-h}`. It is kept
  that way on purpose (see the `cell-pad-h` token comment above): it is an
  inter-element flex gap inside one cell, not the cell's own edge padding,
  and folding the two together would make a future change to one
  accidentally move the other.

There is no responsive breakpoint logic — the table fills `100vw`/`100vh`
of whatever OBS Browser Source region it is given, per the Colors section's
note that this theme needs a dedicated region rather than a full-bleed
overlay.

`.chat-container` also sets `word-break: keep-all` alongside its
`overflow-wrap: anywhere`, inherited into `.message-cell` — the one
element in this table that actually wraps across lines (`.nickname-cell`
truncates with `white-space: nowrap; text-overflow: ellipsis; overflow:
hidden`, so neither property affects it). Korean is the overlay's primary
language and a 어절 (word) is the unit a reader actually parses, so
`keep-all` keeps one intact whenever the message cell has room;
`overflow-wrap: anywhere` still breaks a single run too long to fit
inside `{spacing.message-indent}`'s column (an unbroken Hangul run, an
unbroken ASCII/URL token) rather than letting it overflow the table. It
has to be `anywhere`, not `break-word`: `break-word` does not reduce a
box's min-content size in a shrink-to-fit sizing context, so an
unbreakable run (no internal spaces, so `keep-all` leaves it whole) would
inflate `.message-cell`'s min-content width and overflow the table instead
of wrapping; `anywhere` shrinks min-content too.

## Elevation & Depth

Flat, with zero shadows anywhere in the stylesheet. Hierarchy comes from
exactly two devices, both already named above: a one-step tonal lift
({colors.header-surface} over {colors.primary}) that separates chrome from
content, and 1px {colors.rule} hairlines that separate row from row and
cell from cell. This is the file-manager reference paying for itself again:
a Details view never elevates a row with a shadow, it just draws a line
under it.

## Shapes

Everything is a hard rectangle — there is no `rounded` token group in this
file because no radius is used anywhere in `VideoMasterChatList.vue`.
Square corners read as application chrome/data-table geometry, consistent
with the file-manager reference; introducing any radius here would be the
first move toward looking like a floating card, which is precisely the
translucent-overlay look this theme's opaque canvas exists to opt out of.

## Components

- **{components.canvas}** is `.chat-container`: the opaque
  {colors.primary} plate that fills the OBS Browser Source region.
- **{components.header-bar}** is the fixed `.header` row: {colors.header-surface}
  fill, `position: fixed` so it stays pinned while `.list` scrolls
  underneath it (the list is `position: absolute` and grows from the
  bottom, per `useChatItems`' newest-last ordering).
- **{components.header-icon-cell}** / **{components.header-label-cell}**
  are the header's two `.cell` children: a fixed-width icon cell (holding
  only the `IconChevronUp` sort indicator) and a flexible label cell
  (the literal text "Name"). Both take the same
  `{spacing.cell-pad-v} {spacing.cell-pad-h}` padding.
- **{components.sort-chevron}** covers both `IconChevronUp` (header) and
  `IconChevronDown` (every row, next to the nickname) — same
  {colors.chevron} color and 20px size, `stroke-width: 1` for a light,
  non-bold line weight distinct from the bold text around it.
- **{components.icon-column}** is `.icon-box`: fixed
  {spacing.icon-col-width}, center-aligned, holding either the platform
  icon image or (see Do's and Don'ts) the hashed avatar fallback.
- **{components.platform-icon}** / **{components.platform-badge}** /
  **{components.inline-emoji}** all share {spacing.icon} — the
  cross-theme icon contract restated in this file's own `spacing`
  group (see Layout). Badges render as a horizontally-scrolling row inside
  `.badge-box` when a chat item carries any.
- **{components.sticker}** is any `.sticker`-classed element spliced into
  the sanitized message HTML by `messageHtml()`; sized at
  {spacing.sticker}, the other half of the same restated contract.
- **{components.nickname-cell}** / **{components.message-cell}** are the
  bold column value and its indented detail line, per the Overview's
  file-manager framing — see Typography and Layout for why they share a
  typeface/size but differ in weight and left indent.

**`isHidePlatformIcon` — read the template, not just the option name.**
Turning this option on does not remove the icon column or leave it empty;
the template swaps the `<img>` for a plain `<div class="icon">` painted
with an inline `backgroundColor` from `hashToColor(hashCode(chat.nickname),
100, 70)` — a solid-color dot keyed to the nickname's hash, still sized and
positioned exactly like the platform icon it replaces (same `.icon` class,
same `{spacing.icon}`, same {components.icon-column} slot). This is
deliberate, not incidental: because this theme is built as a table with a
fixed-width leading column that every row's chevron/badge/nickname line up
against, silently collapsing that column when the option is on would shift
every other column and break the grid the entire Overview reference is
built on. The per-user color is a bonus (it gives each participant a
consistent, distinguishing mark even with icons hidden), but the reason the
slot stays filled is structural, not decorative.

## Do's and Don'ts

- **Do** keep {colors.primary} fully opaque. **Don't** add any transparency
  to the canvas — that reopens the video-must-show-through contract this
  theme is explicitly exempted from, and defeats the whole point of using
  flat tonal contrast for hierarchy.
- **Do** treat {colors.muted-text} as at its safe floor against
  {colors.primary} (4.76:1). **Don't** darken it further, and don't
  lighten {colors.primary}, without re-measuring — either move alone can
  drop body text below 4.5:1.
- **Don't "fix" the header-label contrast.** Don't darken
  {colors.header-surface}, don't lighten {colors.muted-text}, and don't
  round the measured 4.27:1 up in prose to make it read as passing. The
  shortfall against AA (4.5:1) is known, measured, and has been explicitly
  reviewed and accepted by the project owner as the cost of the
  header/row tonal separation this theme is built on. The two colors that
  would restore 4.5:1+ are on record in Colors for exactly this reason —
  so they don't get silently applied by a future contrast-lint cleanup.
  If this is ever revisited, it's the owner's deliberate design call to
  make, not a lint-driven patch.
- **Do** keep the icon column filled with _something_ — real icon or hashed
  fallback dot — whenever `isHidePlatformIcon` is toggled. **Don't** let
  that option collapse or omit the column; every row and the header depend
  on a shared {spacing.icon-col-width}.
- **Do** keep {colors.chevron} and {colors.muted-text} as two separate
  grays. **Don't** merge them into one token just because they're both
  "gray text/icon color" — they are set through different code paths and
  read at different code sites.
- **Do** keep every corner square (see Shapes). **Don't** introduce
  `rounded` values, drop shadows, or translucent fills — any of the three
  would nudge this theme toward the floating-card look every other theme
  already owns, and away from the opaque-application-chrome look
  that is this theme's one reason to exist.
- Do keep `word-break: keep-all` paired with `overflow-wrap: anywhere` on `.chat-container`. Don't drop `keep-all` — that reopens mid-어절 breaks in Korean text in `.message-cell`; don't drop `overflow-wrap: anywhere` either — that lets an unbroken run overflow the table instead of wrapping; and don't swap it back to `break-word` — it doesn't shrink `.message-cell`'s min-content size, so an unbreakable run overflows instead of wrapping.
