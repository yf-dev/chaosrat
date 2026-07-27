---
name: Simple
description: A no-plate, outline-only overlay theme — every chat line is one inline run of icon, badges, hashed nickname, and message, kept legible purely by a hard black text outline over arbitrary video.
colors:
  # The one color this theme actually has a stake in: the hue that carries
  # legibility for a given author. hashToColor() generates one of 360 of
  # these per stream (see the Colors section) — this is a single sample,
  # not a fixed swatch.
  primary: "hsl(200, 100%, 70%)"
  # Plain body/message white. The only other color in the theme.
  text: "rgba(255, 255, 255, 1)"
typography:
  nickname:
    fontFamily: inherit # deliberately not restated — see Typography section
    fontWeight: 700
    lineHeight: 2.5rem
  message:
    fontFamily: inherit # deliberately not restated — see Typography section
    fontWeight: 400
    lineHeight: 2.5rem
spacing:
  # These two are NOT a spacing scale for this theme (Simple has none — see
  # Layout). They exist only so the cross-theme icon/sticker contract has a
  # Dimension token this file's own components can reference, since
  # {group.name} references never resolve across files. The single source
  # of truth is app/assets/css/main.css's --chat-icon-size /
  # --chat-sticker-size; every theme mirrors these two numbers and none may
  # override them locally.
  icon: 1.8rem
  sticker: 10rem
components:
  message:
    textColor: "{colors.text}"
    typography: "{typography.message}"
  nickname:
    textColor: "{colors.primary}"
    typography: "{typography.nickname}"
  icon:
    width: "{spacing.icon}"
    height: "{spacing.icon}"
  badge:
    width: "{spacing.icon}"
    height: "{spacing.icon}"
  emoji:
    height: "{spacing.icon}"
  sticker:
    width: "{spacing.sticker}"
    height: "{spacing.sticker}"
---

## Overview

The reference object is **open-captioning**: the hand-typed, hard-subbed
caption convention used on fansubbed video and early auto-captioning tools,
where a line of plain white text with a hard black outline is keyed directly
over whatever picture is already playing — no box, no matte, no plate
underneath it. That single object carries this theme's whole rule set for
free: there is nothing to skin, tint, or round, because there is no surface
at all. Legibility is not a background-vs-foreground contrast problem here;
it is a per-pixel one, solved entirely by the outline, which is why this
theme has no `backgroundColor` token anywhere in this file.

It follows that a caption line is exactly as tall as its own words and
nothing more (this theme's `.item` never reserves a fixed box), that only
one accent color exists per speaker (the caption convention of "one text
color, occasionally recolored per speaker" maps directly onto the hashed
nickname hue below), and that everything — platform icon, badges, the bold
nickname, the message — is one continuous inline run, the way a caption line
mixes an occasional inline glyph into running text rather than laying icons
out as separate blocks. This is the theme for a streamer who wants chat
legible but wants it to claim as little of the frame as an open caption
does: it must survive being read over any footage, and it must give back
every pixel it isn't using.

This theme is one of ChaosRat's design systems living under
`app/components/themes/` — self-contained, not a skin over a shared system —
and the invariants every theme must honor regardless of its own look are
recorded in the repo-root `DESIGN.md`'s Overlay Contract & Theme Map section.

## Colors

There is no surface color in this theme — no `backgroundColor` token is
declared anywhere in the front matter, because there is no background to
declare one against. Legibility instead comes from a **solid black
8-direction outline** drawn by `TextWithShadow` (`shadow-size: 0.1`, i.e. a
`0.1rem` straight offset and a `√(0.1²/2)rem` diagonal offset, in `black`,
in all four straight and four diagonal directions) around every glyph — the
icon, badges, nickname, and message text alike. That outline is a
`text-shadow`, and the components schema has no `textShadow` property, so it
is documented here in prose rather than invented a home in the front matter.
Because there is no background, no static WCAG contrast ratio can be
computed for this theme — the ratio depends on whatever video frame is
behind the text at that instant, and the outline's job is specifically to
make that ratio look after itself regardless of frame content.

The two colors that do exist:

- **{colors.primary}** (`hsl(200, 100%, 70%)`) is a **single representative
  sample**, not a fixed swatch. Every author's nickname is colored by
  `hashToColor(hashCode(chat.nickname), 100, 70)`, which resolves to
  `hsl(<hue>, 100%, 70%)` where `<hue>` is `hashCode(nickname) % 360` — one
  of 360 possible hues, deterministic per nickname so a regular chatter
  keeps the same color for the whole stream, but not enumerable as a
  palette. Saturation (100%) and lightness (70%) are pinned regardless of
  hue specifically so that every generated color sits at the same
  perceptual brightness against the black outline — no hue is allowed to be
  harder to read than another.
- **{colors.text}** (`rgba(255, 255, 255, 1)`) is the plain white used for
  the message body and is the only color in the theme that is not
  hash-generated.

## Typography

- **{typography.nickname}** is `fontWeight: 700` at the same
  `lineHeight: 2.5rem` as the message, giving the nickname just enough
  weight to separate it from the message in a theme with no box, chip, or
  color-block to do that job instead.
- **{typography.message}** is the plain `fontWeight: 400` counterpart at the
  same `lineHeight: 2.5rem`, so nickname and message sit on one shared line
  grid inside a single inline run.

Both tokens set `fontFamily: inherit` deliberately, not as a placeholder:
this theme makes no font-family or base-font-size decision of its own. The
actual typeface (the Pretendard stack) and the actual overlay base size
(`1.8rem`) are set once, globally, on `body.chat` in `pages/chat.vue` and
`app/assets/css/main.css` — a cross-theme decision documented in the
repo-root `DESIGN.md`, not a per-theme one. Since token references cannot
cross files, restating that font stack here as a literal would create a
second, driftable copy of a value this theme never actually chose;
`inherit` says plainly that Simple takes what the page gives it.

## Layout

Simple has no spacing scale — there is no grid, no card padding, no gutter
system, because there are no containers, only one continuous run of inline
content per chat line. The two numbers this theme does control are declared
as plain CSS custom properties scoped to `.chat-container` in
`SimpleChatList.vue`, not as front-matter tokens, because neither has a home
in the `components` schema (no `gap` or `margin` property exists there):

- `--gap: 0.4rem` — the `margin-right` on `.icon`/`.badge` before whatever
  inline content follows them (another icon, a badge, or the nickname).
- `--nudge: 0.2rem` — the matching `margin-bottom` on `.icon`/`.badge`, a
  small baseline nudge so a square glyph optically sits on the text
  baseline instead of hanging above it.

`.item`'s own `margin: 0.4rem 0.8rem` and `.nickname`'s own
`margin-right: 0.8rem` are **not** built from `--gap`/`--nudge` even though
`0.4rem` and `0.8rem` (`--gap` doubled) reappear in them. The component's own
source comment is explicit that this is coincidence, not shared intent:
`--gap`/`--nudge` exist because the icon and badge are the same visual
element repeated, while the item margin and the nickname's trailing margin
are two independent layout calls that happen to land on the same numbers.
Do not "simplify" these into one shared variable — that would weld together
two decisions that are free to diverge later.

`{spacing.icon}` (`1.8rem`) and `{spacing.sticker}` (`10rem`) are
not this theme's own spacing scale either — they are mirrors of
`--chat-icon-size` / `--chat-sticker-size`, declared once in
`app/assets/css/main.css` as the cross-theme contract every theme's
platform icon, badge, inline emoji, and sticker must render at. This file
duplicates those two numbers only because a `{group.name}` reference cannot
reach across files; `main.css`'s custom properties remain the single source
of truth, and this theme's copies must never diverge from them or override
them locally.

## Elevation & Depth

There is no elevation system — no shadow, blur, or tonal layer conveys
hierarchy, because there is nothing stacked to convey hierarchy between.
The only depth cue in the theme is the black outline described under
Colors, which exists purely to separate glyph from video, not to separate
one UI layer from another.

## Shapes

There is no shape system. Nothing in this theme is a box: no `rounded`
corners, no card, no chip, no input. The `icon`/`badge`/`emoji`/`sticker`
components below only ever describe a `width`/`height` pixel footprint for
an `<img>`, never a container shape around it.

## Components

- **{components.message}** carries `{colors.text}` and
  `{typography.message}` and is `display: inline` — a message never reserves
  its own block; it continues directly on the line the nickname started.
- **{components.nickname}** carries the hash-generated `{colors.primary}`
  sample and `{typography.nickname}`, and is the one place bold weight
  appears in the theme.
- **{components.icon}** and **{components.badge}** are both fixed
  `{spacing.icon}` squares (`width` and `height` both set) —
  the platform icon and any chat badges render as identical square glyphs
  ahead of the nickname.
- **{components.emoji}**, rendered inline inside the message body, sets only
  `height: {spacing.icon}` and deliberately leaves `width` unset —
  unlike the icon/badge squares, an inline emoji keeps its own aspect ratio
  rather than being forced square.
- **{components.sticker}** is a fixed `{spacing.sticker}` square, the
  one element in the theme large enough to be seen as an image rather than
  a glyph riding the text line.

## Do's and Don'ts

- Do let the outline (see Colors) carry all legibility — never add a
  background, chip, or box behind any element to "help" contrast; that
  would contradict the open-caption reference this theme is built on.
- Do keep the nickname color hash-generated; never hardcode a fixed
  nickname palette or override a specific author's hue.
- Don't override `--chat-icon-size`/`--chat-sticker-size` locally, and don't
  let `{spacing.icon}`/`{spacing.sticker}` drift from the values
  in `app/assets/css/main.css` — they must stay mirrors, not independent
  values.
- Don't consolidate `.item`'s margin or `.nickname`'s `margin-right` into
  `--gap`/`--nudge` just because the numbers match — see Layout.
- Don't give the emoji component a fixed `width` — its unset width (aspect
  ratio preserved) is intentional, unlike the square `icon`/`badge`.
