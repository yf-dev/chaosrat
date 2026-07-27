import type { Page } from "@playwright/test";

/**
 * Computed-style + geometry fingerprint of a rendered theme subtree,
 * asserted via `toMatchSnapshot()` in `visual.spec.ts`.
 *
 * This is the second of two verification layers for the per-theme visual
 * suite. A failing pixel snapshot only says "N pixels differ somewhere in a
 * 1280x720 frame"; this fingerprint names the exact selector and CSS
 * property that changed, which is what commit eba5b68's large token
 * refactor actually used to verify itself (66 properties across every
 * selector in every theme, plus cute's pseudo-elements) before pixel
 * snapshots were viable at all -- see that commit's body for why pixel
 * diffing was rejected at the time (the overlay drew live chat, so no two
 * captures shared content) and why a computed-style fingerprint was the
 * only option. The e2e fixtures (fixed message ids/nicknames, no emoji)
 * remove that objection, so this file's job is narrower than eba5b68's
 * one-off script: pin what already renders, as a snapshot, not re-derive a
 * verification methodology.
 *
 * Every property below is either named explicitly in this suite's spec
 * (display/position/flex, gap, font-*, color, background-color, border +
 * border-radius, padding, margin, transform[-origin], opacity, box-shadow,
 * text-shadow, -webkit-text-stroke, clip-path, overflow-wrap, word-break, the
 * --chat-icon-size/--chat-sticker-size contract vars) or was found by
 * grepping every theme's `<style scoped>` block for declared property
 * names (`grep -hoE '^\s*[a-zA-Z-]+:' app/components/themes/*\/*.vue`):
 * position offsets (top/right/bottom/left -- meaningless to omit given how
 * many themes use `position: absolute`/`relative`), flex-grow/flex-shrink/
 * align-items/justify-content/flex-direction, width/max-height, vertical-
 * align, white-space/text-overflow/overflow (video-master's ellipsised
 * nickname cell), and z-index (cute's ::before/::after paper-stack
 * layering). box-shadow and -webkit-text-stroke are currently unused by any
 * theme (DESIGN.md: "the overlay has no shadows at all") but are kept
 * because they're part of this suite's explicit brief and pin a legitimate
 * "still none" fact -- a future theme silently adding one would be exactly
 * the kind of change this suite exists to catch. `rotate`/`translate`/`scale`
 * were added alongside `transform`/`transformOrigin` when `colorful` and
 * `cute` switched their `.item` tilt from `transform: rotateZ(...)` to the
 * independent `rotate:` property (root DESIGN.md contract rule 9 --
 * TransitionGroup's FLIP move writes an inline `transform`, which would
 * clobber a class-based `transform:` but composes fine with `rotate:`).
 * Without these three, that tilt -- and any future theme's independent-
 * property motion offset -- would silently stop being pinned by this
 * fingerprint even though `transform` itself is still captured.
 */
const PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "flexGrow",
  "flexShrink",
  "gap",
  "width",
  "maxWidth",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "color",
  "backgroundColor",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomRightRadius",
  "borderBottomLeftRadius",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "transform",
  "transformOrigin",
  "rotate",
  "translate",
  "scale",
  "opacity",
  "boxShadow",
  "textShadow",
  "webkitTextStrokeWidth",
  "webkitTextStrokeColor",
  "clipPath",
  "overflowWrap",
  "wordBreak",
  "overflow",
  "textOverflow",
  "whiteSpace",
  "verticalAlign",
  "zIndex",
] as const satisfies readonly (keyof CSSStyleDeclaration)[];

/**
 * Layout-only subset of `PROPERTIES`, for `captureStyleFingerprint(page, root,
 * "layout")`. The responsive viewport matrix in `visual.spec.ts` runs the
 * Korean-wrapping fixture across five viewports per theme; multiplying the
 * full 60-ish-property fingerprint across that matrix would add a large
 * amount of snapshot text for little added signal, since a viewport change
 * only ever affects geometry and the properties that govern wrapping/
 * overflow -- not color, shadows, borders, or transforms, which don't vary
 * with container size. This list is geometry-adjacent CSS only: box model
 * (width/height/padding and margin longhands), text wrapping (overflowWrap/wordBreak/
 * whiteSpace/textOverflow/fontSize/lineHeight -- `wordBreak` pins every
 * theme's `word-break: keep-all` decision, which keeps 어절 units intact
 * while still allowing `overflow-wrap: break-word` to break a run that
 * cannot fit), and flex layout (display/
 * flexDirection/alignItems/justifyContent/flexGrow/flexShrink/gap), plus
 * position/inset since several themes position icons/badges with
 * `position: absolute`. Every name here is either already load-bearing for
 * wrapping/overflow by CSS semantics or was found declared in a theme's
 * `<style scoped>` block by grepping for it directly (`grep -hoE '^\s*[a-zA-Z-]+:'
 * app/components/themes/*\/*.vue`) -- `height` and `verticalAlign` in
 * particular are both declared (icon/sticker sizing, inline alignment) and
 * were added on that basis, not guessed.
 */
const LAYOUT_PROPERTIES = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "flexDirection",
  "alignItems",
  "justifyContent",
  "flexGrow",
  "flexShrink",
  "gap",
  "width",
  "maxWidth",
  "height",
  "fontSize",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "overflow",
  "overflowWrap",
  "wordBreak",
  "whiteSpace",
  "textOverflow",
  "verticalAlign",
] as const satisfies readonly (keyof CSSStyleDeclaration)[];

/**
 * Every custom property any theme scopes to its own `.chat-container`
 * (`grep -hoE -- '--[a-zA-Z-]+' app/components/themes/*\/*.vue`), plus the
 * two cross-theme contract variables declared once in `main.css`'s `:root`.
 * Read (not written) per element below -- CSS custom properties inherit, so
 * a value only shows up in the fingerprint where it's either declared on
 * `.chat-container` (the contract vars + that theme's own tokens) or set
 * inline per-element (cute's `--nickname-color`, bound per `.item`).
 */
const CUSTOM_PROPERTIES = [
  "--chat-icon-size",
  "--chat-sticker-size",
  "--gap",
  "--plate",
  "--pad",
  "--nudge",
  "--dot-size",
  "--corner",
  "--rule",
  "--muted-text",
  "--icon-col-width",
  "--cell-pad-v",
  "--cell-pad-h",
  "--nickname-color",
] as const;

/** Structural/non-visual elements this suite has no opinion on: the SVG
 * clip-path plumbing `cute` renders for its hand-drawn item shape. They are
 * 0x0, take no visible computed style, and would only add noise. */
const SKIPPED_TAGS = new Set(["SVG", "DEFS", "CLIPPATH", "PATH"]);

/**
 * Runs entirely inside the page (via `page.evaluate`) so the DOM walk and
 * `getComputedStyle` calls happen in-browser, then returns one deterministic
 * multi-line string.
 *
 * Ordering: lines follow DOM document order (a plain pre-order walk of
 * `rootSelector, rootSelector *`), not an alphabetical sort of the path
 * strings. Document order is already fully deterministic for a fixed
 * fixture (same markup in, same order out, every run) and -- unlike an
 * alphabetical sort of arbitrary tag/class paths -- it mirrors the actual
 * parent/child nesting, which is what makes a diff readable when one
 * selector's properties change.
 */
export async function captureStyleFingerprint(
  page: Page,
  rootSelector = ".chat-container",
  mode: "full" | "layout" = "full",
): Promise<string> {
  const properties = mode === "layout" ? LAYOUT_PROPERTIES : PROPERTIES;
  return page.evaluate(
    ({ rootSelector, properties, customProperties, skippedTags }) => {
      const root = document.querySelector(rootSelector);
      if (!root) {
        throw new Error(
          `captureStyleFingerprint: no element matched "${rootSelector}"`,
        );
      }

      function cssPath(el: Element): string {
        const parts: string[] = [];
        let node: Element | null = el;
        while (node) {
          let part = node.tagName.toLowerCase();
          if (node.classList.length > 0) {
            part += "." + Array.from(node.classList).sort().join(".");
          }
          const parent: Element | null = node.parentElement;
          if (parent) {
            const sameTagSiblings = Array.from(parent.children).filter(
              (sibling) => sibling.tagName === node!.tagName,
            );
            if (sameTagSiblings.length > 1) {
              part += `:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`;
            }
          }
          parts.unshift(part);
          if (node === root) break;
          node = parent;
        }
        return parts.join(" > ");
      }

      // Sub-pixel px values inside a *computed style* string (as opposed to
      // the bounding-rect geometry rounded separately below) are the same
      // flakiness source rects are -- e.g. a pseudo-element's `width`
      // resolves from fractional text-layout metrics, not a whole-rem
      // literal. Rounding every `<number>px` token inside a value (not just
      // top-level rect numbers) covers those too: `transformOrigin`
      // ("640.4px 360.2px"), a `width`/`height` sized to fit text content,
      // etc. Non-px numbers (e.g. `rotate(-3deg)`, `oklch(0.77 0.08 271)`)
      // are untouched since they come from source literals or an integer
      // hash, not layout.
      function roundPxTokens(value: string): string {
        return value.replace(
          /-?\d+(\.\d+)?px/g,
          (token) => `${Math.round(parseFloat(token))}px`,
        );
      }

      function formatProperties(style: CSSStyleDeclaration): string {
        return properties
          .map((prop) => {
            const value = style[prop as keyof CSSStyleDeclaration];
            return `${prop}=${roundPxTokens(String(value))}`;
          })
          .join("; ");
      }

      function formatCustomProperties(
        style: CSSStyleDeclaration,
        names: readonly string[],
      ): string {
        return names
          .map((name) => [name, style.getPropertyValue(name).trim()])
          .filter(([, value]) => value !== "")
          .map(([name, value]) => `${name}=${value}`)
          .join("; ");
      }

      const lines: string[] = [];

      const elements = [root, ...Array.from(root.querySelectorAll("*"))].filter(
        // SVG element `tagName` preserves source casing ("svg", "defs",
        // "clipPath", "path") rather than the all-uppercase casing HTML
        // elements report -- normalize before comparing, or this filter
        // silently never matches and cute's clip-path plumbing leaks into
        // every fingerprint as a wall of identical rect=(0,0,0,0) lines.
        (el) => !skippedTags.includes(el.tagName.toUpperCase()),
      );

      for (const el of elements) {
        const path = cssPath(el);
        const rect = el.getBoundingClientRect();
        const geometry = `rect=(${Math.round(rect.x)},${Math.round(rect.y)},${Math.round(rect.width)},${Math.round(rect.height)})`;
        const computed = getComputedStyle(el);
        const propsLine = formatProperties(computed);

        // Only the root (contract + this theme's own tokens) and any
        // element that sets a custom property inline (cute's per-item
        // `--nickname-color`) get a custom-properties segment -- every
        // other descendant would just repeat the inherited root value via
        // CSS custom-property inheritance, which is redundant noise rather
        // than new information.
        const setsCustomPropInline =
          el === root ||
          customProperties.some(
            (name) => (el as HTMLElement).style.getPropertyValue(name) !== "",
          );
        const customLine = setsCustomPropInline
          ? formatCustomProperties(computed, customProperties)
          : "";

        let line = `${path} ${geometry} | ${propsLine}`;
        if (customLine) {
          line += ` | custom: ${customLine}`;
        }
        lines.push(line);

        // Pseudo-elements: only emitted when `content` actually resolves to
        // something other than "none" (i.e. the browser is really painting
        // one), which in this codebase today is only `cute`'s `.item`
        // `::before`/`::after` paper-stack layers. No bounding-rect is
        // captured for pseudo-elements -- `getBoundingClientRect()` isn't
        // available for them via the DOM API -- so `top`/`right`/`bottom`/
        // `left` (cute uses `inset`, which resolves to those four
        // longhands) stand in as the positional pin instead.
        for (const pseudo of ["::before", "::after"] as const) {
          const pseudoStyle = getComputedStyle(el, pseudo);
          if (pseudoStyle.content === "none") continue;
          const pseudoProps = `content=${pseudoStyle.content}; ${formatProperties(pseudoStyle)}`;
          lines.push(`${path}${pseudo} | ${pseudoProps}`);
        }
      }

      return lines.join("\n");
    },
    {
      rootSelector,
      properties,
      customProperties: CUSTOM_PROPERTIES,
      skippedTags: Array.from(SKIPPED_TAGS),
    },
  );
}

// Re-exported purely so a test file can assert on the exact property list
// this module pins (e.g. to keep a "what does the fingerprint cover"
// assertion honest) without duplicating the array.
export const FINGERPRINT_PROPERTIES = PROPERTIES;
export const FINGERPRINT_LAYOUT_PROPERTIES = LAYOUT_PROPERTIES;
export const FINGERPRINT_CUSTOM_PROPERTIES = CUSTOM_PROPERTIES;
