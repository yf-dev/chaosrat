#!/usr/bin/env node
// Fetch the ONE-Mobile-POP webfont into public/fonts/ at install time, rather
// than committing the file or loading it from the CDN at runtime.
//
// Why fetched, not committed: the font (원스토어 모바일POP체) is owned by
// (주)원스토어. Its license permission table explicitly allows 임베딩 --
// "웹사이트 및 프로그램 서버 내 폰트 탑재" (installing the font on a website/
// program server) -- which is exactly what this does: our own server embeds
// and serves the font. What the license explicitly prohibits is 재배포
// (redistribution), 수정 (modification), 복제, and 판매. This repo is public
// and MIT-licensed, so committing the file would let anyone `git clone` it
// out as a standalone asset under an MIT declaration that doesn't actually
// cover it -- that's redistribution, not embedding. Fetching it into a
// gitignored directory at install/build time keeps us on the embedding side
// of that line.
//
// Why the hash check matters beyond integrity: it also enforces the
// modification prohibition. Do NOT "optimize" this by converting the result
// to woff2, subsetting it, or recompressing it -- any of that is 수정, which
// the license does not permit. Ship the exact bytes the CDN serves today.
//
// Idempotent and offline-friendly: if the file already exists and matches
// the pinned hash, this is a no-op, so a repeat `npm install` with no
// network doesn't fail. Escape hatch: SKIP_FONT_FETCH=1 (mirrors SKIP_E2E=1
// in .husky/pre-commit) skips entirely, with a warning, for environments
// with no outbound network at all.
//
// usage: node scripts/fetch-fonts.mjs   (from app/, or via `postinstall`)

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const FONT_URL =
  "https://cdn.jsdelivr.net/gh/projectnoonnu/noonfonts_2105_2@1.0/ONE-Mobile-POP.woff";
const DEST_DIR = join(APP_DIR, "public/fonts");
const DEST_FILE = join(DEST_DIR, "ONE-Mobile-POP.woff");

// Pinned sha256 of the exact bytes verified at the URL above. A mismatch
// means the CDN started serving something different -- that would silently
// change every colorful/cute-* visual snapshot, so this must fail loudly
// rather than accept whatever comes back.
const EXPECTED_SHA256 =
  "f4bee0ae05bb506744f7eda3d0ce1305f701a8dcd350f25088351fef2d1bfd48";

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  if (process.env.SKIP_FONT_FETCH === "1") {
    console.warn(
      "fetch-fonts: SKIP_FONT_FETCH=1 set, skipping ONE-Mobile-POP fetch. " +
        "The colorful/cute-* themes will fall back to the system font until " +
        "public/fonts/ONE-Mobile-POP.woff exists.",
    );
    return;
  }

  if (existsSync(DEST_FILE)) {
    const existing = readFileSync(DEST_FILE);
    if (sha256(existing) === EXPECTED_SHA256) {
      console.log(
        `fetch-fonts: ${DEST_FILE} already present and matches the pinned hash, skipping.`,
      );
      return;
    }
    console.warn(
      `fetch-fonts: ${DEST_FILE} exists but its hash doesn't match the pin -- re-fetching.`,
    );
  }

  console.log(`fetch-fonts: downloading ${FONT_URL} ...`);
  let response;
  try {
    response = await fetch(FONT_URL);
  } catch (err) {
    console.error(`fetch-fonts: request failed: ${err.message}`);
    process.exit(1);
  }
  if (!response.ok) {
    console.error(
      `fetch-fonts: download failed: HTTP ${response.status} ${response.statusText}`,
    );
    process.exit(1);
  }

  const buf = Buffer.from(await response.arrayBuffer());
  const actual = sha256(buf);
  if (actual !== EXPECTED_SHA256) {
    console.error(
      "fetch-fonts: sha256 mismatch -- refusing to write the file.\n" +
        `  expected: ${EXPECTED_SHA256}\n` +
        `  actual:   ${actual}\n` +
        "This means the CDN is now serving different bytes than what this " +
        "script was pinned against. Do not just update the pin -- find out " +
        "why the font changed first (a build that silently ships the wrong " +
        "typeface is worse than one that stops).",
    );
    process.exit(1);
  }

  mkdirSync(DEST_DIR, { recursive: true });
  writeFileSync(DEST_FILE, buf);
  console.log(
    `fetch-fonts: wrote ${DEST_FILE} (${buf.length} bytes, hash verified).`,
  );
}

main();
