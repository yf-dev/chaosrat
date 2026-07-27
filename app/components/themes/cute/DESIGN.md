---
name: Cute
description: A hand-cut paper speech bubble with a wobbly marker outline, tilted on the page, sized to hug its own words — covers both cute-left and cute-right, which are the same bubble in two alignments.
colors:
  primary: "rgba(255, 255, 255, 1)" # the paper itself — .item::after's bubble fill
  ink: "rgba(0, 0, 0, 1)" # .item's own text color; the message body reads in this, at 21:1 on {colors.primary}
  nickname-text: "rgba(255, 255, 255, 1)" # kept as its OWN token, not a reuse of {colors.primary} — see Colors
  accent: "oklch(77% 0.08 200)" # one sample of a per-message generated family — see Colors
typography:
  display:
    fontFamily: "ONE-Mobile-POP, var(--chat-font-sans)" # mirrors --font-family-display in app/assets/css/main.css — shared with colorful on purpose, see Typography
spacing:
  pad: 0.8rem # mirrors --pad on .chat-container
  icon: 1.8rem # mirrors --chat-icon-size in app/assets/css/main.css — see Components
  sticker: 10rem # mirrors --chat-sticker-size in app/assets/css/main.css — see Components
components:
  bubble:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
  nickname-box:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.nickname-text}"
    padding: "{spacing.pad}"
  nickname:
    typography: "{typography.display}"
    textColor: "{colors.nickname-text}"
  message:
    typography: "{typography.display}"
    textColor: "{colors.ink}"
    padding: "{spacing.pad}"
  icon:
    size: "{spacing.icon}"
  badge:
    size: "{spacing.icon}"
  emoji:
    height: "{spacing.icon}"
  sticker:
    width: "{spacing.sticker}"
    height: "{spacing.sticker}"
---

## Overview

The reference object is a paper speech bubble cut out by hand with scissors for
a kids' school-play program — not printed, not die-cut. Its outline wobbles
instead of tracing a compass-perfect oval, because `CuteChatBaseList.vue`
builds that outline from an SVG `clipPath` (`#item-rect`) whose path is a
handful of deliberately uneven quadratic curves, not a rectangle with rounded
corners. The scrap of paper is propped onto the page at a slight tilt
(`transform: rotate(-1deg)` on `.item`) and is cut exactly to the size of the
words inside it — `.item` is `width: fit-content`, so "lol" is a small scrap
and a long sentence is a bigger one; nothing stretches to fill a frame.
Pinned above the bubble is a strip of colored construction paper carrying the
speaker's name — cut with its own wobbly outline (`#nickname-rect`), in a
different color per craft supplies on hand. Both the bubble's ink-line
`::before` and the name strip share that one construction-paper color
(`{colors.accent}`), inset `-0.3rem` behind the white paper `::after` so it
reads as a hand-drawn line peeking out from under the cutout, not a stroked
border. `cute-left` (`CuteChatLeftList.vue`) and `cute-right`
(`CuteChatRightList.vue`) are the same craft object taped to the left or right
margin of the page (`align-items: flex-start` vs `flex-end` on `.list`) — one
design system, two alignments, sharing every token and every pixel of
`CuteChatBaseList.vue`.

The typeface, `ONE-Mobile-POP` (`{typography.display}`), is a rounded, heavy,
single-weight Korean poster face — the same hand it would take to letter a
kid's craft-paper name tag in permanent marker.

This theme is one of ChaosRat's design systems living under
`app/components/themes/` — self-contained, not a skin over a shared system —
and the invariants every theme must honor regardless of its own look are
recorded in the repo-root `DESIGN.md`'s Overlay Contract & Theme Map section.

## Colors

`{colors.primary}` is the paper itself: opaque white, the `.item::after`
layer that sits on top of the colored ink-line and carries the actual message
text in `{colors.ink}` (opaque black) — a plain **21:1** contrast, as legible
as ink on printer paper gets.

`{colors.accent}` is one sample — hue `200` — of a color that is
**generated per message, not fixed per theme or per author**. The code is
`idToColor(Math.abs(hashCode(chat.id)) % 360)` producing
`oklch(77% 0.08 <hue>)`: lightness pinned at `77%` and chroma pinned at
`0.08` for every hue, only the hue itself varies. Because the hash runs over
the **message id**, not the sender's id, the same person's next message gets
a different accent — unlike `simple`/`pure`, which hash the author and so
keep one color per person. `{colors.accent}` fills two places at once: the
`.item::before` ink line (the wobbly outline peeking out from behind the
paper) and `.nickname-box`'s own background — one generated color, two
visual roles, cohering the bubble's outline with its name tag.

**The nickname strip is white text on `{colors.accent}`, and it fails WCAG AA
contrast at every hue.** Rasterizing the full 360° sweep of
`oklch(77% 0.08 <hue>)` measures a range of **2.00:1 at its best hue to
2.15:1 at its worst** against white — nowhere close to the 4.5:1 minimum.
Sampled fills across the sweep: hue `200` → `rgb(115, 196, 200)`, hue `335` →
`rgb(213, 161, 201)`, hue `88` → `rgb(201, 178, 120)`. Because lightness and
chroma never move, the ratio barely moves either — this isn't a couple of
unlucky hues, it's the whole family.

**This has been reviewed by the project owner and kept on purpose. It is not
accessibility debt.** The nickname strip is a decorative identity tag, not
the content — the actual message anyone needs to read sits below it in
`{colors.ink}` on `{colors.primary}` at a clean 21:1. The washed-out nickname
is deliberately subordinate to the message, the same way a name tag is
allowed to be harder to read at a glance than the letter it's pinned to.

The known fix is on record and explicitly declined: swapping
`nickname-box`'s `textColor` from `{colors.nickname-text}` to black measures
**≥9.77:1 at the worst hue** in the same sweep and would pass AA with margin,
at zero cost to the accent formula. It is written down here so nobody has to
re-derive it — and it is **not to be applied**. A `designmd lint` run against
this file will raise one `contrast-ratio` warning for `nickname-box`; that
warning is permanently accepted, not an outstanding item.

`{colors.nickname-text}` and `{colors.primary}` happen to be the same raw
value (opaque white) but are kept as two separate tokens on purpose, mirroring
the component's own source comment: one is the paper fill behind the message
(`.item::after`), the other is the contrast-losing label text
(`.nickname-box`'s `color`). Collapsing them into one token would erase the
fact that touching one must never silently touch the other.

## Typography

`{typography.display}` (`ONE-Mobile-POP, var(--chat-font-sans)`) is set once,
on `.chat-container`, and inherited by both the nickname and the message —
there is no separate weight or size for either. It mirrors
`--font-family-display` in `app/assets/css/main.css`'s `:root`, which is also
what `colorful` uses. That sharing is deliberate, not incidental: the two
playful themes are meant to speak in the same display voice, so this is the
one value in this file that is intentionally not theme-local — track the
source variable, don't fork it.

## Layout

The theme's own sizing lives as two CSS custom properties scoped to
`.chat-container` in `CuteChatBaseList.vue`:

- `--pad: 0.8rem` is `{spacing.pad}` — the padding on both `.nickname-box`
  and `.message`.
- `--gap: 0.6rem` is the flex gap inside `.nickname-box` (between the
  platform icon, badge box, and nickname) and inside `.badge-box`. `gap` has
  no property in the `components.*` schema (only `backgroundColor`,
  `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, `width`
  are valid), so it is recorded here in prose only, not forced into an
  orphaned front-matter token.

`.item` separately carries its own `margin: 0.4rem 0.8rem`. The component's
own source comment calls this out explicitly: the `0.8rem` here and `--pad`'s
`0.8rem` are the same number by coincidence, not the same decision — one is
the outer gap between stacked bubbles, the other is a bubble's own inner
padding — so they stay two plain literals rather than one shared token.

`.chat-container` is a full-viewport (`100vw`/`100vh`) positioning context;
`.list` is pinned to its bottom edge and stacks new items upward, with
`align-items: flex-start` for `cute-left` or `flex-end` for `cute-right` —
the only structural difference between the two components, both of which
render nothing but `<CuteChatBaseList align="...">`.

## Elevation & Depth

There is no shadow or blur anywhere in this theme. Depth is faked entirely by
two stacked, clipped layers on `.item`: `::before` (the accent-colored ink
line, inset `-0.3rem`, `z-index: 1`) sits behind `::after` (the white paper,
inset `0`, `z-index: 2`), so the colored layer peeks out around the white
one's wobbly edge like a hand-drawn outline rather than a `border` or a drop
shadow. `.nickname-box` and `.message` both sit above both at `z-index: 3`.

## Shapes

Neither the bubble nor the nickname strip uses `border-radius` — there is no
`rounded` token in this file because the shape mechanism isn't rounding at
all. Both are cut by SVG `clipPath`s (`#item-rect` for the bubble,
`#nickname-rect` for the nickname strip) built from a handful of uneven
quadratic Bézier curves in `objectBoundingBox` units, which is what produces
the hand-cut wobble instead of a geometric rounded rectangle. The whole
bubble is additionally rotated `-1deg` (`.item`'s `transform`), reinforcing
the "propped on the page, not machine-aligned" read. Neither the clip-path
data nor the rotation has a home in the `components.*` schema, so both are
documented here rather than invented as fake tokens.

## Components

- `bubble` (`.item`) — the paper itself: `{colors.primary}` fill via
  `::after`, `{colors.ink}` text color inherited by `.message`. Also carries
  the margin, rotation, and clip-path shape described under Layout and
  Shapes, none of which has a `components.*` home.
- `nickname-box` (`.nickname-box`) — the name tag: `{colors.accent}`
  background, `{colors.nickname-text}` text, `{spacing.pad}` padding, its own
  `#nickname-rect` clip-path shape. This is the pairing the accepted
  `contrast-ratio` warning belongs to.
- `nickname` (`.nickname`) — `{typography.display}` text in
  `{colors.nickname-text}`, laid out inside `nickname-box`.
- `message` (`.message`) — `{typography.display}` text in `{colors.ink}`,
  padded by `{spacing.pad}`.
- `icon` / `badge` — mirror the project-wide `--chat-icon-size: 1.8rem`
  custom property defined once in `app/assets/css/main.css` and consumed by
  every theme. `{spacing.icon}` is a copy of that single source of truth
  for this file's own self-containment (token references only resolve within
  the same file) — it must track `--chat-icon-size`, never diverge from it
  locally.
- `emoji` — same mirror, applied to inline emoji height (`{spacing.icon}`).
- `sticker` — mirrors `--chat-sticker-size: 10rem` from the same shared
  stylesheet, likewise a read-only copy rather than an independent value.

## Do's and Don'ts

- **Don't "fix" the nickname contrast.** Don't raise
  `nickname-box`'s text contrast, don't add a dark backing plate or scrim
  behind the nickname, and don't swap `{colors.nickname-text}` to black. The
  2.00:1–2.15:1 range across the full hue sweep is known, measured, and has
  been explicitly reviewed and accepted by the project owner. The `≥9.77:1`
  black-text alternative is on record for exactly this reason — so it doesn't
  get silently applied by a future contrast-lint cleanup. If this is ever
  revisited, it's the owner's deliberate design call to make, not a
  lint-driven patch.
- Do keep `{colors.primary}` (paper fill) and `{colors.nickname-text}` (label
  text) as two separate tokens even though both currently resolve to opaque
  white. Don't merge them — one is the contrast-safe message backdrop, the
  other is the contrast-losing label color the previous bullet protects.
- Do keep the per-message accent hashed from `chat.id`. Don't switch it to
  hash the author id to "fix" the flicker of a person's color changing
  message to message — that flicker is this theme's actual behavior, and
  is different from `simple`/`pure` on purpose.
- Do keep `{typography.display}` pointed at the shared
  `--font-family-display` custom property. Don't fork a local copy of
  `ONE-Mobile-POP` here — `colorful` deliberately speaks in the same display
  voice, and forking would desync the two silently.
- Don't replace the `#item-rect`/`#nickname-rect` clip-paths with
`border-radius` to "simplify" the markup. The wobble is the entire hand-cut
read this theme is built on; a rounded rectangle is a different, blander
design.
</content>
