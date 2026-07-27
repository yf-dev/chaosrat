---
name: Colorful
description: A hand-slapped gaffer-tape name label on a black flight case — one of ChaosRat's independent chat-theme design systems, not a skin over a shared one.
colors:
  primary: "rgb(58, 58, 58)"
  on-primary: "rgb(255, 255, 255)"
  tag-yellow: "rgb(218, 229, 0)"
  tag-purple: "rgb(147, 132, 254)"
  tag-orange: "rgb(255, 115, 0)"
  tag-magenta: "rgb(219, 92, 255)"
  on-tag: "rgb(0, 0, 0)"
typography:
  overlay-display:
    fontFamily: ONE-Mobile-POP
    fontSize: 1.8rem
    fontWeight: 400
rounded:
  corner: 0.4rem
spacing:
  pad: 0.8rem
  # Mirrors of the cross-theme contract in app/assets/css/main.css
  # (--chat-icon-size / --chat-sticker-size). This theme must not override
  # those custom properties; these two tokens exist only so every
  # `components.*.size` reference below resolves inside this one file, per
  # the format's no-cross-file-inheritance rule — the CSS variable stays the
  # single source of truth.
  icon: 1.8rem
  sticker: 10rem
motion:
  # Scoped to this theme's own .chat-container in ColorfulChatList.vue, like
  # every other token group in this file -- see the Motion section for why
  # this round's values match every other theme's without being a shared
  # token (root DESIGN.md contract rule 6/9).
  duration: 200ms
  ease: "cubic-bezier(0.22, 1, 0.36, 1)"
  slide: 1.2rem
components:
  message-card:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.overlay-display}"
    rounded: "{rounded.corner}"
    padding: "{spacing.pad}"
  nickname-tag:
    textColor: "{colors.on-tag}"
    typography: "{typography.overlay-display}"
    rounded: "{rounded.corner}"
    padding: "{spacing.pad}"
  nickname-tag-yellow:
    backgroundColor: "{colors.tag-yellow}"
  nickname-tag-purple:
    backgroundColor: "{colors.tag-purple}"
  nickname-tag-orange:
    backgroundColor: "{colors.tag-orange}"
  nickname-tag-magenta:
    backgroundColor: "{colors.tag-magenta}"
  icon:
    size: "{spacing.icon}"
  badge:
    size: "{spacing.icon}"
  emoji:
    size: "{spacing.icon}"
  sticker:
    size: "{spacing.sticker}"
---

## Overview

The reference object is a **black tour flight case with a strip of gaffer
tape stuck on as a name label**, applied backstage by a stagehand in a
hurry. The case itself — {components.message-card}, `{colors.primary}` —
is an opaque, characterless dark box; its only job is to sit flat and
readable in front of whatever is behind it, which is why it never gets a
tint, a gradient, or a shadow. The label is torn from a kit that only
stocks four roll colors, so it always lands on one of exactly four hues,
never a custom-mixed one, and gaffer tape is always printed in thick black
marker regardless of the tape color, which is why `{colors.on-tag}` never
varies. Both the case and the label were put down by hand, not a machine:
the case sits at a `-3deg` rotation (see Layout for why this is expressed
with the independent `rotate:` property rather than `transform:`), the
label at a _different_ `transform: rotateZ(-2deg)` and pulled up and to the
left with `translate(-0.6rem, 0.6rem)` so it overhangs the case's top-left
corner like a real sticker would. Nothing here is aligned to a grid, and that is the entire point —
a perfectly squared label would read as printed, not applied. The lettering
on the tape is `{typography.overlay-display}`, **ONE-Mobile-POP**, a
rounded, heavy, single-weight Korean poster face with no bold cut, which is
also why hierarchy in this theme is carried entirely by which of the four
tape colors landed, never by font weight — there isn't a second weight to
reach for.

This theme is one of ChaosRat's design systems living under
`app/components/themes/` — self-contained, not a skin over a shared system —
and the invariants every theme must honor regardless of its own look are
recorded in the repo-root `DESIGN.md`'s Overlay Contract & Theme Map section.

## Colors

- **Primary** `{colors.primary}`, `rgb(58, 58, 58)`, is the flight case
  itself — the one opaque surface in this theme, and the reason the
  overlay reads clearly regardless of what's playing behind it in OBS.
  Message text sits on it in **on-primary** `{colors.on-primary}` (pure
  white), measured at **11.37:1** against the card — comfortably past WCAG
  AA's 4.5:1 for body text. In code this pair is `--plate` (the card
  background) and `.item`'s `color: rgba(255, 255, 255, 1)`, both scoped to
  `.chat-container` in `ColorfulChatList.vue`.
- **The tape palette** — `{colors.tag-yellow}`, `{colors.tag-purple}`,
  `{colors.tag-orange}`, `{colors.tag-magenta}` — is a **fixed set of
  four**, not a hue wheel. `ColorfulChatList.vue` picks one per author via
  `Math.abs(hashCode(chat.nickname)) % 4` indexing into `nicknameColorMap`,
  in that order (yellow, purple, orange, magenta). This is the opposite bet
  from `simple`/`pure`/`cute`, which hash a nickname into one of 360 hues:
  here a regular viewer can actually learn and recognize all four colors,
  trading infinite variety for a small, memorable set. Every one of the
  four carries **on-tag** `{colors.on-tag}` (black) text, and every pairing
  clears **6.9:1 or better**, measured as: yellow 15.19:1, orange 7.70:1,
  magenta 6.99:1, purple 6.97:1 (the tightest of the four, still well past
  AA). That is a deliberate contrast floor much higher than the `cute`
  themes' intentionally low-contrast nickname strip — this theme's label
  has to survive being read at a glance over live video, not sit inside a
  calmer boxed layout.

## Typography

Only one type level exists — `{typography.overlay-display}` — because
every piece of text in this theme (nickname and message alike) is set in
the same face at the same size; there is no second level to define. Its
`fontFamily`, **ONE-Mobile-POP**, resolves through
`--font-family-display` in `app/assets/css/main.css`'s `:root`, which is
**not** a theme-local decision: that custom property is shared verbatim
with the `cute-left`/`cute-right` themes as the playful group's common
display voice, and this file only restates its name — the webfont and its
fallback stack (`--chat-font-sans`) stay owned by `main.css`. Its
`fontWeight: 400` is not a choice either: the `@font-face` in `main.css`
registers ONE-Mobile-POP at `font-weight: normal` and ships no bold cut, so
`400` is the only weight that exists, full stop — never request `700` on
this face, the browser would only fake it. `fontSize: 1.8rem` is inherited,
not set by this component's stylesheet: it comes from `body.chat`'s chota
`--font-size: 1.8rem` in `pages/chat.vue`. That number happens to match
`{spacing.icon}` below, but the two are unrelated variables that
coincide in value — do not merge them.

## Layout

Misalignment is the layout system: the case rotates `-3deg` around its
top-left corner, the label rotates a further, _different_ `-2deg` and is
pulled up-left by `translate(-0.6rem, 0.6rem)` so it visibly overhangs the
case rather than sitting flush inside it. Those two `0.6rem` offsets are
one transform's x and y component, not a repeated spacing decision, which
is why they are **not** tokenized here — folding them into
`{spacing.pad}` or a new token would imply they mean the same thing `pad`
means elsewhere, and they don't; leave that translate exactly as two raw
numbers in `ColorfulChatList.vue`.

The case's own `-3deg` tilt is `.item`'s rotation. `.item` is no longer the
direct `TransitionGroup` child — `.motion-slot` (see Motion) is, and it is
`.motion-slot` that receives FLIP's inline `transform` today — but `.item`
still expresses its tilt with the independent `rotate: -3deg;` property
rather than `transform: rotateZ(-3deg);`, both to render identically to the
old declaration and as a hedge: `rotate:` composes with any inline
`transform` a future refactor might reintroduce on `.item` itself, where a
class-based `transform:` would silently be clobbered. The label
(`.nickname-box`) is not a `TransitionGroup` child either way and keeps its
`transform: rotateZ(-2deg) translate(-0.6rem, 0.6rem)` exactly as before.

Internal spacing runs on two real tokens plus one value that is
deliberately not a token. `{spacing.pad}` (`0.8rem`, CSS `--pad`) is
`{components.message-card.padding}` and reused for the label's own
padding, and for the message text's horizontal/bottom padding — one
number, three call sites. The flex gap between a nickname-tag's icon,
badges and text (CSS `--gap`, `0.4rem`) has no home in this format's
`components` schema (there is no `gap` property), so it stays a plain CSS
value rather than a fabricated token; the same is true of the case's own
outer margin (`1.4rem` vertical, `{spacing.pad}` horizontal) and the
message text's one-off `1.2rem` top padding, both of which are margin/
one-off values with nowhere to attach in the schema and are recorded here
in prose instead of invented as tokens.

`.chat-container` also sets `word-break: keep-all` alongside its
`overflow-wrap: anywhere`, inherited into both the label and the message
card. Korean is the overlay's primary language and a 어절 (word) is the
unit a reader actually parses, so `keep-all` keeps one intact whenever the
card has room; `overflow-wrap: anywhere` still breaks a single run too
long to fit by itself (an unbroken Hangul run, an unbroken ASCII/URL
token) rather than letting it overflow the card, and by extension the OBS
source. It has to be `anywhere`, not `break-word`: the message card is a
shrink-to-fit box, and `break-word` does not reduce a box's min-content
size, so an unbreakable run (no internal spaces, so `keep-all` leaves it
whole) would inflate the card's min-content width and overflow instead of
wrapping; `anywhere` shrinks min-content too.

## Elevation & Depth

There is no shadow system in this theme — no `box-shadow` appears anywhere
in `ColorfulChatList.vue`. Depth is faked entirely by opacity and overlap:
the case is a flat, fully opaque `{colors.primary}` plane that blocks
whatever video is behind it, and the label reads as "on top of" the case
purely because it overhangs the corner and carries a different rotation,
not because of any cast shadow or z-axis styling.

## Shapes

Both the case and the label share one corner radius,
`{rounded.corner}` (`0.4rem`, CSS `--corner`) — `{components.message-card.rounded}`
and `{components.nickname-tag.rounded}` are the same reference on purpose.
The two shapes are meant to read as cut from the same stock (case and
tape use the same corner tooling); only their independent rotation tells
them apart, never their radius.

## Components

`{components.message-card}` is the case: `{colors.primary}` fill,
`{colors.on-primary}` text, `{typography.overlay-display}`, and
`{rounded.corner}` corners. It is the theme's defining surface — the one
thing every author's messages have in common — which is why `primary` is
named for it rather than for any of the four label colors.

`{components.nickname-tag}` carries the shape and text color shared by
all four labels (`{colors.on-tag}`, `{typography.overlay-display}`,
`{rounded.corner}`, `{spacing.pad}`); `nickname-tag-yellow`,
`-purple`, `-orange` and `-magenta` are its four sibling variants,
overriding only `backgroundColor`. Exactly one of the four renders per
message, chosen by the hash rule in Colors above — never blend or
gradient between them, and never add a fifth.

`{components.icon}`, `{components.badge}` and `{components.emoji}` all
share `{spacing.icon}` (`1.8rem`). That token is a mirror, not an
independent value: the real source of truth is `--chat-icon-size` in
`app/assets/css/main.css`'s `:root`, a cross-theme contract every one of
ChaosRat's themes consumes as-is so OBS layouts stay predictable —
this theme must never override it locally. `{components.sticker}` mirrors
`--chat-sticker-size` (`{spacing.sticker}`, `10rem`) the same way, for
the same reason.

## Motion

A gaffer-tape label doesn't fade in — it gets slapped onto the case by a
stagehand in a hurry, the way a hand-applied sticker lands with a bit of
momentum rather than materializing in place. `ColorfulChatList.vue` renders
through `useChatListMotion()`'s `listTag`/`listProps`, so a new case rises
`{motion.slide}` (`1.2rem`) from below while fading in over
`{motion.duration}` (`200ms`, `{motion.ease}`), and a removed one continues
that same upward motion while fading out — as if peeled off and tossed,
rather than deleted. The offset is expressed with the independent
`translate:` property rather than `transform:`, for the same reason
`.item`'s tilt is (see Layout): `TransitionGroup`'s FLIP move writes its
own inline `transform`, which would clobber a class-based `transform:`
instead of composing with it.

Enter, leave, **and** the reflow-follow (`.chat-move`) all animate now.
`TransitionGroup`'s FLIP move writes a purely vertical inline
`transform: translate(0, dy)` on its direct child to reposition a shifted
item; if `.item` — which carries the `-3deg` tilt — were that direct child,
the vertical delta would apply _inside_ the rotated frame and pick up a
horizontal component of `dy * tan(3deg)`. With a tall message stack `dy`
reaches several hundred px, which previously swung the case tens of px
sideways and off a narrow OBS source. This was measured against a real
failure, not assumed: a moving item's inline style was
`transform: matrix(1, 0, 0, 1, 3.56, 203.95)`, and `3.56 / 203.95 = tan(1deg)`
exactly, for the smaller `-1deg` tilt in `cute` — this theme's `-3deg` has
roughly three times the swing for the same `dy`.

The fix, not a re-tuned number: a wrapper element, `.motion-slot`, now sits
between `.list` and `.item` in `ColorfulChatList.vue`'s template and carries
**no styling of its own**. `TransitionGroup`'s `:key` moved from `.item` to
`.motion-slot`, making the wrapper — not the rotated case — the element FLIP
writes its inline `transform` onto; `.item`'s own `rotate: -3deg` sits one
level deeper and never receives that inline style, so `.chat-move`'s
`transition: transform ...` now animates a plain, un-rotated box with no
`tan(theta)` term to introduce drift. The layout is unchanged without the
wrapper carrying any styling of its own: `.list` is a block formatting
context (it's absolutely positioned), so `.item`'s
`margin: 1.4rem var(--pad)` collapses _through_ the styleless
`.motion-slot` exactly as if `.item` sat directly in `.list` — adjacent
slots still collapse to the same 1.4rem gap, and the slot's own border box
coincides with `.item`'s. Block width is likewise unchanged: the slot is
`auto`-width (matching `.list`) and `.item` resolves to the same width
inside it as it did as a direct child. Do not give `.motion-slot` any
margin, padding, border, or other BFC-establishing property — any of those
would break the parent/child margin collapsing this relies on.

`isDisableAnimation` removes the `<TransitionGroup>` entirely (the
composable swaps in a plain `<div>`), not just its transition durations —
a broadcaster who wants a static wall of cases gets exactly that, not a
faster version of the slap-on motion. `prefers-reduced-motion: reduce`
takes the middle path: the transition still runs, but collapses to a
near-instant (`1ms`) cut with no slide, so the case list still updates for
a viewer whose OS setting asks for stillness without a second, separate
"no transition" mechanism.

## Do's and Don'ts

- Do keep the tape palette at exactly four entries — the fixed set, not a
  hash-to-hue wheel, is the point of this theme's nickname system.
- Do rotate the case and its label at two _different_ angles; matching
  angles would make the label look glued flush instead of stuck on by
  hand. Do keep the case's own tilt on the independent `rotate:` property
  (not `transform:`) — see Layout for why a class-based `transform:` would
  be clobbered by `TransitionGroup`'s FLIP move.
- Don't give ONE-Mobile-POP a bold weight anywhere — no bold cut exists,
  and hierarchy must keep coming from tape color, not weight.
- Don't tokenize the label's `translate(-0.6rem, 0.6rem)` offsets — they
  are one transform's x/y pair, not a spacing decision to reuse elsewhere.
- Don't align any card or label to a shared grid, and don't add a
  `box-shadow` for depth — flat opacity and overlap are the whole
  elevation model here.
- Don't override `--chat-icon-size` or `--chat-sticker-size` locally; both
  are the cross-theme contract from `app/assets/css/main.css` and every
  theme, including this one, consumes them unmodified.
- Do keep `word-break: keep-all` paired with `overflow-wrap: anywhere` on `.chat-container`. Don't drop `keep-all` — that reopens mid-어절 breaks in Korean text; don't drop `overflow-wrap: anywhere` either — that lets an unbroken run overflow the card instead of wrapping; and don't swap it back to `break-word` — it doesn't shrink the card's min-content size, so an unbreakable run overflows instead of wrapping.
