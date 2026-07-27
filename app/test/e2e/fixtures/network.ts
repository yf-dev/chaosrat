import zlib from "node:zlib";
import type { Page, Route } from "@playwright/test";

/**
 * Makes a test hermetic: every HTTP(S) request is either served by the real
 * Nuxt dev server (same-origin), fulfilled with a deterministic fixture, or
 * aborted. WebSocket traffic (the Twitch IRC connection) is untouched here
 * -- that's `twitchIrc.ts`'s job, via the separate `page.routeWebSocket`
 * mechanism, which this file's `page.route` catch-all cannot see or affect.
 *
 * There is no external-network exception anymore: the `ONE-Mobile-POP.woff`
 * font (`app/assets/css/main.css`'s `@font-face`) used to be loaded from
 * jsDelivr and allowed through as a deliberate exception, but it is now
 * fetched into `public/fonts/` at install time (`scripts/fetch-fonts.mjs`)
 * and served same-origin by the Nuxt dev server, so it needs no special
 * handling here -- it passes through the ordinary same-origin branch below.
 * `overlay.ts`'s `openOverlay` still asserts
 * `document.fonts.check('16px "ONE-Mobile-POP"')` so a silent
 * fallback-to-system-font never passes as "loaded".
 */

// ---------------------------------------------------------------------------
// Deterministic fixture images
// ---------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/** Encodes a tiny solid-color RGBA PNG from scratch (no external tool, no
 * canvas dependency) so fixture images are generated inline and stay
 * legible (a distinct solid color at a sensible intrinsic size) rather than
 * being 1x1 transparent pixels. */
function solidColorPng(
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number],
): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowBytes = width * 4;
  const raw = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (rowBytes + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }

  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngDataUri(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): string {
  return `data:image/png;base64,${solidColorPng(width, height, rgba).toString("base64")}`;
}

// Badge/emote size matches `--chat-icon-size` (1.8rem, see main.css) closely
// enough to be legible; sticker size matches `--chat-sticker-size`'s
// intent. Colors are chosen to be visually distinct from each other.
export const TWITCH_BADGE_BROADCASTER_PNG = pngDataUri(
  28,
  28,
  [220, 38, 38, 255],
); // red
export const TWITCH_BADGE_SUBSCRIBER_PNG = pngDataUri(
  28,
  28,
  [147, 51, 234, 255],
); // purple
export const TWITCH_BADGE_MODERATOR_PNG = pngDataUri(
  28,
  28,
  [16, 185, 129, 255],
); // teal
export const TWITCH_BADGE_VIP_PNG = pngDataUri(28, 28, [236, 72, 153, 255]); // pink
export const TWITCH_EMOTE_PNG = pngDataUri(28, 28, [59, 130, 246, 255]); // blue
export const STICKER_PNG = pngDataUri(112, 112, [249, 115, 22, 255]); // orange

/** `${badge}/${version}` -> image URL, matching the shape
 * `/api/twitch/badges` returns for real (see
 * `app/server/api/twitch/badges.ts`) and what `useTwitch.ts`'s
 * `handleTwitchBadges` looks values up by. Extend this map (via the
 * `badgeData` option below) rather than replacing it if a test needs a
 * badge/version pair not listed here. */
export const TWITCH_BADGE_DATA: Record<string, string> = {
  "broadcaster/1": TWITCH_BADGE_BROADCASTER_PNG,
  "subscriber/0": TWITCH_BADGE_SUBSCRIBER_PNG,
  "subscriber/12": TWITCH_BADGE_SUBSCRIBER_PNG,
  "moderator/1": TWITCH_BADGE_MODERATOR_PNG,
  "vip/1": TWITCH_BADGE_VIP_PNG,
};

// ---------------------------------------------------------------------------
// Sticker (open-dccon-selector) fixture
// ---------------------------------------------------------------------------

// `useOpenDcconSelector.ts` fetches this real endpoint by design; intercept
// it rather than the (fake, invalid-TLD) URLs it returns, which are only
// ever reachable through this same mock.
export const DCCON_API_URL_PREFIX =
  "https://open-dccon-selector.update.sh/api/dccon-url";
export const DCCON_DOCUMENT_URL =
  "https://e2e-fixture.invalid/dccon/document.json";
export const STICKER_IMAGE_URL =
  "https://e2e-fixture.invalid/dccon/sticker.png";
/** The `~<keyword>` a fixture message must contain for the sticker to
 * splice in -- see `chatFixtures.ts`'s `STICKER` fixture, which uses this
 * exact constant so the two files can never drift apart. */
export const STICKER_KEYWORD = "pepe";

export interface AbortedRequest {
  url: string;
  method: string;
}

export interface NetworkStubHandle {
  /** Every request that matched none of the allow/mock rules and was
   * therefore aborted. A test asserting hermeticity should check this is
   * empty (aside from anything it deliberately expects to be blocked). */
  abortedRequests: AbortedRequest[];
}

export interface StubExternalNetworkOptions {
  /** Overrides/extends `TWITCH_BADGE_DATA` for the `/api/twitch/badges`
   * response. */
  badgeData?: Record<string, string>;
  /** Overrides `STICKER_KEYWORD` for the dccon document fixture. */
  dcconKeyword?: string;
  /** Overrides `STICKER_PNG` for the sticker image fixture. */
  stickerImageDataUri?: string;
}

function fulfillPng(route: Route, dataUri: string): Promise<void> {
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from(base64, "base64"),
  });
}

function fulfillJson(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/**
 * Installs a single catch-all `page.route('**\/*', ...)` handler that
 * branches internally by URL, rather than registering several
 * `page.route()` calls for different patterns. Playwright matches multiple
 * registered routes last-registered-first; a single handler sidesteps that
 * ordering question entirely and keeps the allow/mock/abort precedence
 * legible in one place.
 *
 * Must be called before navigation (same requirement as
 * `installTwitchIrcMock`).
 */
export async function stubExternalNetwork(
  page: Page,
  opts: StubExternalNetworkOptions = {},
): Promise<NetworkStubHandle> {
  const badgeData = { ...TWITCH_BADGE_DATA, ...(opts.badgeData ?? {}) };
  const dcconKeyword = opts.dcconKeyword ?? STICKER_KEYWORD;
  const stickerImage = opts.stickerImageDataUri ?? STICKER_PNG;

  const handle: NetworkStubHandle = { abortedRequests: [] };

  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    const parsed = new URL(url);

    // Same-origin: the Nuxt dev server itself (pages, HMR, assets, and any
    // /api route we don't explicitly mock below). Let it through for real.
    if (parsed.hostname === "localhost" && parsed.port === "3000") {
      if (parsed.pathname === "/api/twitch/badges") {
        await fulfillJson(route, { status: "OK", badge: badgeData });
        return;
      }
      await route.continue();
      return;
    }

    if (url.includes("static-cdn.jtvnw.net/emoticons/")) {
      await fulfillPng(route, TWITCH_EMOTE_PNG);
      return;
    }

    if (url.startsWith(DCCON_API_URL_PREFIX)) {
      await fulfillJson(route, {
        user_id: "e2e-fixture",
        dccon_url: DCCON_DOCUMENT_URL,
      });
      return;
    }

    if (url === DCCON_DOCUMENT_URL) {
      await fulfillJson(route, {
        dccons: [
          {
            keywords: [dcconKeyword],
            tags: ["e2e"],
            path: STICKER_IMAGE_URL,
          },
        ],
      });
      return;
    }

    if (url === STICKER_IMAGE_URL) {
      await fulfillPng(route, stickerImage);
      return;
    }

    handle.abortedRequests.push({ url, method: request.method() });
    await route.abort("blockedbyclient");
  });

  return handle;
}
