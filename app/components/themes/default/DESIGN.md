---
name: Default
description: The no-decision theme — one translucent plate, doubled on itself to make a header strip, square corners, bold outlined text.
colors:
  primary: "rgba(0, 0, 0, 0.3)"
  text: "rgba(255, 255, 255, 1)"
typography:
  nickname:
    fontWeight: 700
rounded:
  none: 0rem
spacing:
  pad: 0.8rem
  icon: 1.8rem
  sticker: 10rem
components:
  item:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
  nickname-box:
    backgroundColor: "{colors.primary}"
    padding: "{spacing.pad}"
  nickname:
    typography: "{typography.nickname}"
    textColor: "{colors.text}"
  message:
    padding: "{spacing.pad}"
    textColor: "{colors.text}"
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

The reference object is the stock lower-third caption plate bundled with generic
broadcast/OSD software — the one nobody replaces because it already does the
job: a rectangle of smoked glass laid over the picture, with a name tab in the
corner cut from the same sheet of glass, doubled over, so the tab reads
visibly denser than the caption body beneath it without the software vendor
ever having shipped a second tint. Square-cut, no bevel, no drop shadow. The
caption text itself carries a thin hard outline so it stays legible whether
the footage behind it is a dark stage or a bright screen share.

This theme is one of ChaosRat's design systems living under
`app/components/themes/` — self-contained, not a skin over a shared system —
and the invariants every theme must honor regardless of its own look are
recorded in the repo-root `DESIGN.md`'s Overlay Contract & Theme Map section.

That is exactly what `DefaultChatList.vue` is: the theme a broadcaster gets by
not choosing a theme. `{colors.primary}` is applied once to `.item` and again
to `.nickname-box` sitting inside it — the same token, stacked, is the entire
mechanism that makes the name strip read darker than the message below it.
Corners are square (`{rounded.none}`), the nickname is bold
(`{typography.nickname}`), and both nickname and message run through
`TextWithShadow`'s 8-direction hard outline, because a plate this thin over
unpredictable video is the one case in this project where an outline isn't
decorative — it's the legibility floor.

## Colors

`{colors.primary}` — `rgba(0, 0, 0, 0.3)` — is the plate, and the only color
this theme declares. It is applied to `.item` and, a second time, to
`.nickname-box`, which sits inside `.item`'s padding. Two layers of the same
30%-alpha black composite to something visibly darker than one layer, so the
name strip separates from the message body without a second hex value ever
entering the file. This doubling is the theme's defining move — don't
"fix" it by giving `nickname-box` its own darker token; that would be a
different, more deliberate design than "default" is supposed to be.

`{colors.text}` — opaque white — is used for both the nickname and the
message body. Because `{colors.primary}` is translucent and composites
against arbitrary, unknown video underneath (not against a fixed page
background), a WCAG contrast ratio for `{colors.text}` on `{colors.primary}`
cannot be computed meaningfully — the real backdrop is whatever OBS is
compositing under the browser source at that instant, from pitch black to a
bright game scene. That is precisely why the hard text outline described
under Typography exists: it is this theme's actual answer to contrast, since
a static ratio assertion would be a number this theme cannot back up.

## Typography

`{typography.nickname}` (`fontWeight: 700`, CSS `font-weight: bold`) is the only typographic
distinction this theme makes — it marks the nickname as the header of the
`nickname-box` strip, paired with the darker doubled plate around it.

Both `.nickname` and `.message` are rendered through `TextWithShadow` with
`shadow-size="0.1"` (rem) and the component's default black shadow color,
producing eight 0.1rem offset copies of the text (four straight, four
diagonal at `0.1/√2`rem) that read as a thin, hard, uniform outline rather
than a soft drop shadow. There is no `components.*` property for a text
outline in this schema, so it is recorded here in prose instead of being
forced into a fake token: it is a property of `TextWithShadow`, not of this
theme's palette, and it applies identically to both text elements in this
file.

## Layout

`.chat-container` scopes three CSS custom properties that back the tokens
above and one that has no token at all:

- `--pad: 0.8rem` is `{spacing.pad}`, the padding on both `.nickname-box` and
  `.message`.
- `--gap: 0.6rem` is the flex `gap` inside `.nickname-box` (between icon,
  badge box, and nickname) and inside `.badge-box`. `gap` has no home in the
  `components.*` schema (only `backgroundColor`, `textColor`, `typography`,
  `rounded`, `padding`, `size`, `height`, `width` are valid), so it is
  documented here rather than declared as an orphaned front-matter token.
- `--plate: rgba(0, 0, 0, 0.3)` is `{colors.primary}`, described above.

`.item` also carries `margin: 0.8rem`, which separates stacked chat items
from one another. Like `gap`, there is no `margin` property in the components
schema, so this value is recorded here only: it is the vertical/horizontal
breathing room between messages, not a token this file can index.

The container itself (`.chat-container`) is a full-viewport
(`100vw`/`100vh`) positioning context; `.list` is pinned to its bottom-left
corner, so new items push older ones upward — the standard chat-overlay
stacking behavior shared by every theme, not something specific to
`default`.

`.chat-container` also sets `word-break: keep-all` alongside its
`overflow-wrap: anywhere`, and both are inherited down into `.nickname`
and `.message`. Korean is this overlay's primary language, and a 어절
(word) is the unit a reader actually parses — breaking mid-어절 (`메시지`/`가`)
is what a broken line looks like in Korean, not just an aesthetic wobble.
`keep-all` keeps a 어절 intact whenever there's room; `overflow-wrap:
anywhere` is still what breaks a single run too long for the container to
hold (a long unbroken Hangul run, an unbroken ASCII/URL token), so nothing
is ever allowed to overflow the OBS source just to preserve a word. It has
to be `anywhere` rather than the more familiar `break-word`: `.nickname-box`
is a flex item, a shrink-to-fit sizing context, and `break-word` does not
reduce a box's _min-content_ size — only `anywhere` does. With
`break-word`, a nickname with no internal spaces (so `keep-all` treats it
as one unbreakable run) inflates `.nickname-box`'s min-content width and
the box overflows the OBS source instead of wrapping; `anywhere` shrinks
min-content too, so the box wraps the run instead.

## Elevation & Depth

This theme has no shadows, blur, or borders standing in for depth. Its one
depth cue is the plate doubling described under Colors: `{colors.primary}`
applied twice (once via `.item`, once via `.nickname-box`) reads as a denser,
"raised" header strip purely from alpha compositing. There is no separate
elevated surface color anywhere else in the file.

## Shapes

`{rounded.none}` (`0`) applies to `.item`; no element in
`DefaultChatList.vue` sets `border-radius` at all. Square corners are as much
a statement as the doubled plate: this is the un-styled baseline theme, and
rounding anything here would be a design decision this theme is specifically
not supposed to make.

## Components

- `item` — the per-message plate (`{colors.primary}`, `{rounded.none}`);
  also carries the `margin` and `color` values noted in prose above.
- `nickname-box` — the header strip stacking a second `{colors.primary}` over
  `item`'s own, padded by `{spacing.pad}`; also carries the `--gap`
  flex gap noted in prose above.
- `nickname` — bold (`{typography.nickname}`) text in `{colors.text}`,
  rendered through `TextWithShadow`'s hard outline.
- `message` — body text in `{colors.text}`, padded by `{spacing.pad}`,
  also rendered through `TextWithShadow`'s hard outline.
- `icon` / `badge` / `emoji` — mirror the project-wide
  `--chat-icon-size: 1.8rem` custom property defined once in
  `app/assets/css/main.css` and consumed by every theme. `{spacing.icon}`
  is a copy of that single source of truth for this file's own
  self-containment (token references only resolve within the same file) —
  it must track `--chat-icon-size`, never diverge from it locally.
- `sticker` — mirrors the same file's `--chat-sticker-size: 10rem`.
  `{spacing.sticker}` is likewise a mirror, not an independent value.

## Do's and Don'ts

- Do keep `nickname-box` on the same `{colors.primary}` as `item` — the
  doubling _is_ the design. Don't give it a separate, independently-tuned
  darker color; that solves the same problem a different, more deliberate
  way and stops being "default."
- Do keep corners at `{rounded.none}`. Don't add `border-radius` anywhere in
  this theme — rounding is a choice this theme deliberately defers to
  every other theme.
- Do treat `{spacing.icon}` and `{spacing.sticker}` as read-only
  mirrors of `--chat-icon-size` / `--chat-sticker-size` in
  `app/assets/css/main.css`. Don't hardcode a different icon or sticker size
  here — that would silently desync this theme from every other theme.
- Don't drop the `TextWithShadow` hard outline on `nickname` or `message` to
  "simplify" the markup. It is the only legibility guarantee this theme has
  against unpredictable live video showing through the translucent plate —
  removing it is a legibility regression, not a cleanup.
- Don't assert a fixed contrast ratio for `{colors.text}` on
  `{colors.primary}` in review comments or future edits. The plate composites
  against whatever OBS is showing underneath, which is unknown at design
  time; the outline, not a contrast number, is this theme's real answer.
- Do keep `word-break: keep-all` paired with `overflow-wrap: anywhere` on `.chat-container`. Don't drop `keep-all` to "simplify" — that reopens mid-어절 breaks in Korean text; don't drop `overflow-wrap: anywhere` either — that lets an unbroken run overflow the OBS source instead of wrapping; and don't swap it back to `break-word` — `break-word` doesn't shrink `.nickname-box`'s min-content size, so a spaceless nickname overflows instead of wrapping.
</content>
