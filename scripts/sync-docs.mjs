#!/usr/bin/env node
// Copies every `.md` under ../Dashboard/docs/ (recursively) into ./docs,
// preserving the `api/` subdir, so this package is self-contained for npx users
// who don't have the dashboard repo checked out. Mirrors the repo's existing
// sync-sdk.sh convention.
//
// EXCLUDED docs are skipped: the MCP server serves every doc it ships with no
// allowlist (src/lib/docs.ts scans the whole docs dir), so an internal-only doc
// that lives in the dashboard's docs/ would otherwise become searchable by npx
// users. Keep internal/infra/planning docs out of the package here.
//
// Run with: npm run sync-docs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const SOURCE = path.resolve(PKG_ROOT, "..", "..", "yes2dashboard", "docs");
const DEST = path.resolve(PKG_ROOT, "docs");

// Docs that live in the dashboard's docs/ but must NOT ship in the public MCP
// package (internal infra / planning, not SDK integration guidance). Matched on
// the path relative to the docs dir (posix separators).
const EXCLUDE = new Set([
  "R2_MIGRATION_PLAN.md",
]);

/** @param {string} dir @param {string} base @returns {string[]} */
function collectMarkdown(dir, base) {
  /** @type {string[]} */
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const rel = base ? path.join(base, ent.name) : ent.name;
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...collectMarkdown(abs, rel));
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push(rel);
    }
  }
  return out;
}

if (!fs.existsSync(SOURCE)) {
  console.error(`[sync-docs] source docs dir not found: ${SOURCE}`);
  process.exit(1);
}

const relPaths = collectMarkdown(SOURCE, "");
let copied = 0;
let skipped = 0;
for (const rel of relPaths) {
  if (EXCLUDE.has(rel.split(path.sep).join("/"))) {
    skipped += 1;
    continue;
  }
  const src = path.join(SOURCE, rel);
  const dst = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  copied += 1;
}

console.log(
  `[sync-docs] copied ${copied} markdown file(s)` +
    (skipped ? `, skipped ${skipped} excluded` : "") +
    ` from ${SOURCE} -> ${DEST}`
);
