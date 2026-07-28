#!/usr/bin/env node
// Rasterize public/favicon.svg (the single source of truth for the brand
// mark -- see the comment header in that file) into the two formats browsers
// and iOS actually need: a multi-size favicon.ico and a 180x180
// apple-touch-icon.png.
//
// Dev-only, NOT wired into `postinstall` or `build` -- it shells out to the
// already-installed Playwright chromium (a devDependency), and a production
// build must not need a browser to complete. Run it by hand after editing
// favicon.svg:
//
//   npm run favicons   (from app/)
//
// Why PNG-in-ICO rather than the classic BMP-payload .ico: every browser
// this project targets (the settings page and the overlay both only need to
// run in the browsers a streamer or OBS's own Chromium/CEF actually use) has
// supported PNG-compressed ICO frames for well over a decade -- there is no
// reason to hand-roll an uncompressed BMP DIB when the OS/browser icon
// loaders already accept a plain PNG per frame. This overwrites the
// repo's previous favicon.ico, which was leftover Nuxt-template art from the
// "Init project" commit, not anything derived from this brand mark.
//
// Why apple-touch-icon.png is opaque, not transparent: iOS composites a
// transparent touch icon onto plain black instead of preserving alpha, so a
// transparent render of this mark would show as a red rat floating on a
// black square on a Home Screen / bookmark. Compositing it onto
// {colors.bg} (`#ffffff`, the builder page's own canvas -- see the root
// DESIGN.md) ahead of time keeps the icon looking the same everywhere.

import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC_DIR = join(APP_DIR, "public");
const SVG_PATH = join(PUBLIC_DIR, "favicon.svg");
const ICO_PATH = join(PUBLIC_DIR, "favicon.ico");
const APPLE_ICON_PATH = join(PUBLIC_DIR, "apple-touch-icon.png");

const ICO_SIZES = [16, 32, 48];
const APPLE_ICON_SIZE = 180;
// The builder page's own canvas color ({colors.bg} in the root DESIGN.md).
const APPLE_ICON_BACKGROUND = "#ffffff";
// Inset the mark ~12% on each side inside the apple-touch-icon canvas.
const APPLE_ICON_INSET_RATIO = 0.12;

function html(svgMarkup, { size, background, insetRatio = 0 }) {
  const inset = Math.round(size * insetRatio);
  return `<!doctype html>
<html><head><meta charset="utf-8" /><style>
  html, body { margin: 0; padding: 0; }
  body {
    width: ${size}px;
    height: ${size}px;
    background: ${background};
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: ${inset}px;
  }
  svg { width: 100%; height: 100%; display: block; }
</style></head>
<body>${svgMarkup}</body></html>`;
}

async function renderPng(page, svgMarkup, size, options = {}) {
  const { background = "transparent", insetRatio = 0 } = options;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(svgMarkup, { size, background, insetRatio }), {
    waitUntil: "load",
  });
  return page.screenshot({ omitBackground: background === "transparent" });
}

// ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) per image, followed by the
// raw PNG bytes for each image, in the same order as the entries.
function buildIco(images) {
  const headerSize = 6 + 16 * images.length;
  let offset = headerSize;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4); // image count

  images.forEach((img, i) => {
    const entryOffset = 6 + i * 16;
    // Width/height byte fields: 0 means 256; every size here is < 256.
    header.writeUInt8(img.size, entryOffset + 0);
    header.writeUInt8(img.size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2); // color palette count (0 = no palette)
    header.writeUInt8(0, entryOffset + 3); // reserved
    header.writeUInt16LE(1, entryOffset + 4); // color planes
    header.writeUInt16LE(32, entryOffset + 6); // bits per pixel (RGBA)
    header.writeUInt32LE(img.png.length, entryOffset + 8); // size of PNG data
    header.writeUInt32LE(offset, entryOffset + 12); // offset of PNG data
    offset += img.png.length;
  });

  return Buffer.concat([header, ...images.map((img) => img.png)]);
}

async function main() {
  if (!existsSync(SVG_PATH)) {
    console.error(`generate-favicons: ${SVG_PATH} not found.`);
    process.exit(1);
  }

  const rawSvg = readFileSync(SVG_PATH, "utf8");
  // Strip the file's leading XML comment (source-of-truth header) before
  // embedding it in an HTML page -- only the <svg>...</svg> markup itself is
  // needed here.
  const svgStart = rawSvg.indexOf("<svg");
  if (svgStart === -1) {
    console.error(`generate-favicons: no <svg> element found in ${SVG_PATH}`);
    process.exit(1);
  }
  const svgMarkup = rawSvg.slice(svgStart);

  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();

    console.log("generate-favicons: rendering favicon.ico frames...");
    const icoImages = [];
    for (const size of ICO_SIZES) {
      const png = await renderPng(page, svgMarkup, size);
      icoImages.push({ size, png });
      console.log(`  rendered ${size}x${size} (${png.length} bytes)`);
    }
    writeFileSync(ICO_PATH, buildIco(icoImages));
    console.log(
      `generate-favicons: wrote ${ICO_PATH} (${ICO_SIZES.join("/")} px, ${icoImages.length} frames).`,
    );

    console.log("generate-favicons: rendering apple-touch-icon.png...");
    const applePng = await renderPng(page, svgMarkup, APPLE_ICON_SIZE, {
      background: APPLE_ICON_BACKGROUND,
      insetRatio: APPLE_ICON_INSET_RATIO,
    });
    writeFileSync(APPLE_ICON_PATH, applePng);
    console.log(
      `generate-favicons: wrote ${APPLE_ICON_PATH} (${APPLE_ICON_SIZE}x${APPLE_ICON_SIZE}, opaque ${APPLE_ICON_BACKGROUND} background, ${applePng.length} bytes).`,
    );
  } catch (err) {
    console.error(`generate-favicons: failed: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
