#!/usr/bin/env node
// Lint every DESIGN.md in the repo and check the cross-theme contract.
//
// Two jobs, because the DESIGN.md format cannot do the second one itself:
//
//   1. Run `designmd lint` over the root spec and every per-theme spec.
//   2. Verify the contract values each theme restates still agree with the
//      single source of truth in app/assets/css/main.css.
//
// Job 2 exists because {token} references resolve per file only — there is no
// cross-file inheritance — so each theme's DESIGN.md has to restate the
// contract sizes to stay self-contained and lint-clean. Those restatements are
// mirrors of one CSS custom property, not independent values, and nothing but
// this script stops them drifting apart.
//
// usage: node scripts/check-design.mjs   (from app/, or via `npm run design:check`)

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_DIR = dirname(APP_DIR);
const THEMES_DIR = join(APP_DIR, "components/themes");
const MAIN_CSS = join(APP_DIR, "assets/css/main.css");

// Contract custom property -> the token names a theme file may use to mirror it.
// A theme is free to name its mirror whatever reads best, so match on value.
const CONTRACT = ["--chat-icon-size", "--chat-sticker-size"];

let failed = false;
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  failed = true;
};
const ok = (msg) => console.log(`ok    ${msg}`);

// ---------------------------------------------------------------- discovery
const specs = [];
if (existsSync(join(REPO_DIR, "DESIGN.md")))
  specs.push(join(REPO_DIR, "DESIGN.md"));
for (const entry of readdirSync(THEMES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const p = join(THEMES_DIR, entry.name, "DESIGN.md");
  if (existsSync(p)) specs.push(p);
  else fail(`theme '${entry.name}' has no DESIGN.md`);
}
if (specs.length === 0) fail("no DESIGN.md files found at all");

// --------------------------------------------------------------------- lint
console.log("── designmd lint\n");
for (const spec of specs) {
  const rel = relative(REPO_DIR, spec);
  let out;
  try {
    out = execFileSync(
      "npx",
      ["-y", "-p", "@google/design.md", "designmd", "lint", spec],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    // designmd exits non-zero when it reports an error finding; its JSON is
    // still on stdout and is what we want to show.
    out = e.stdout || "";
  }
  let report;
  try {
    report = JSON.parse(out);
  } catch {
    fail(`${rel}: could not parse designmd output`);
    continue;
  }
  const { errors = 0, warnings = 0 } = report.summary ?? {};
  const line = `${rel}: ${errors} error(s), ${warnings} warning(s)`;
  if (errors > 0) {
    fail(line);
    for (const f of report.findings.filter((f) => f.severity === "error")) {
      console.error(`        ${f.path ?? ""} ${f.message}`);
    }
  } else {
    ok(line);
    for (const f of report.findings.filter((f) => f.severity === "warning")) {
      console.log(`        warning: ${f.path ?? ""} ${f.message}`);
    }
  }
}

// ----------------------------------------------------------------- contract
console.log("\n── cross-theme contract (single source: assets/css/main.css)\n");
const css = readFileSync(MAIN_CSS, "utf8");
const source = {};
for (const prop of CONTRACT) {
  const m = css.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`));
  if (!m) {
    fail(`${prop} is not declared in assets/css/main.css`);
    continue;
  }
  source[prop] = m[1].trim();
  ok(`${prop} = ${source[prop]}`);
}

// A theme must not redeclare a contract property inside its own scope.
for (const entry of readdirSync(THEMES_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(THEMES_DIR, entry.name);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".vue"))) {
    const vue = readFileSync(join(dir, file), "utf8");
    for (const prop of CONTRACT) {
      if (new RegExp(`${prop}\\s*:`).test(vue)) {
        fail(`${entry.name}/${file} redeclares the contract property ${prop}`);
      }
    }
  }
}

// Every theme spec that restates a contract value must restate it correctly.
for (const spec of specs.filter((s) => s !== join(REPO_DIR, "DESIGN.md"))) {
  const rel = relative(REPO_DIR, spec);
  const text = readFileSync(spec, "utf8");
  const front = text.split("---")[1] ?? "";
  for (const [prop, value] of Object.entries(source)) {
    // Only check specs that actually mention this contract dimension.
    if (!text.includes(prop) && !front.includes(value)) continue;
    if (!front.includes(value)) {
      fail(
        `${rel}: mentions ${prop} but its front matter has no ${value} token`,
      );
    }
  }
}
if (!failed) ok("every theme spec mirrors the contract values");

console.log(failed ? "\nDESIGN check FAILED" : "\nDESIGN check passed");
process.exit(failed ? 1 : 0);
