#!/usr/bin/env node
// Copies SDK-integration docs from ../../yes2sdk-www/content/docs into ./docs so
// this package is self-contained for npx users who don't have the site repo
// checked out. That corpus is the published one, so what ships here is what a
// reader sees at the documentation site.
//
// This is an ALLOW-list, not a deny-list, and that is load-bearing: the MCP
// server serves every doc it ships (src/lib/docs.ts scans the whole docs dir
// with no serve-time filter), and docs/ is shipped through two channels --
// the npm tarball (package.json "files") and the hosted container
// (Containerfile COPY docs ./docs). A doc nobody listed here is never copied,
// so a new internal doc appearing upstream cannot leak by default.
//
// Run with: npm run sync-docs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = path.resolve(PKG_ROOT, "..", "..", "yes2sdk-www", "content", "docs");
const DEFAULT_DEST = path.resolve(PKG_ROOT, "docs");

// Docs cleared to ship, matched against the path relative to the source docs
// dir in posix form. Adding a doc here makes it public -- read it first.
//
// AGENTS.md is pinned by test/docs.test.ts (it asserts the "AGENTS" slug). It is
// not published as a page on the site, but it is carried in the corpus for this
// server, which is the surface it addresses.
const ALLOW_EXACT = new Set([
  "AGENTS.md",
  "claude-code-plugin.md",
  "dashboard-guide.md",
  "mcp-server.md",
  "platform-keys.md",
]);

// Path prefixes cleared to ship. `api/` and `generated/` are whole directories
// of public SDK reference; `quickstart-` and `unity-` are root-level filename
// prefixes. A prefix admits future upstream additions under it by design --
// keep prefixes narrow enough that that stays true.
const ALLOW_PREFIXES = ["api/", "generated/", "quickstart-", "unity-"];

/** @param {string} rel posix-form path relative to the docs dir */
export function isAllowed(rel) {
  if (ALLOW_EXACT.has(rel)) return true;
  return ALLOW_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

/**
 * Lists files under `dir` as posix-form paths relative to it. Missing dir = [].
 *
 * @param {string} dir
 * @param {(rel: string) => boolean} [keep] file filter; every file by default
 * @param {string} [base] internal recursion prefix
 * @returns {string[]}
 */
export function collectFiles(dir, keep = () => true, base = "") {
  /** @type {string[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      out.push(...collectFiles(path.join(dir, ent.name), keep, rel));
    } else if (ent.isFile() && keep(rel)) {
      out.push(rel);
    }
  }
  return out;
}

/** Removes now-empty directories under `root`, deepest first. @param {string} root */
function pruneEmptyDirs(root) {
  if (!fs.existsSync(root)) return;
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const abs = path.join(root, ent.name);
    pruneEmptyDirs(abs);
    if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
  }
}

/**
 * Copies every allow-listed markdown doc from `source` into `dest`, then
 * deletes anything in `dest` this run did not produce.
 *
 * @param {{ source: string, dest: string }} opts
 * @returns {{ copied: string[], skipped: string[], pruned: string[] }}
 */
export function syncDocs({ source, dest }) {
  const relPaths = collectFiles(source, (rel) => rel.endsWith(".md"));
  /** @type {string[]} */
  const copied = [];
  /** @type {string[]} */
  const skipped = [];

  for (const rel of relPaths) {
    if (!isAllowed(rel)) {
      skipped.push(rel);
      continue;
    }
    const dst = path.join(dest, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(source, rel), dst);
    copied.push(rel);
  }

  // Prune: anything in dest that this run did not write is stale -- a doc
  // deleted or renamed upstream, or reclassified as internal. Without this an
  // allow-list can only stop new leaks, never undo one.
  const written = new Set(copied);
  const pruned = collectFiles(dest).filter((rel) => !written.has(rel));
  for (const rel of pruned) fs.rmSync(path.join(dest, rel));
  if (pruned.length) pruneEmptyDirs(dest);

  return { copied, skipped, pruned };
}

function main() {
  const source = DEFAULT_SOURCE;
  const dest = DEFAULT_DEST;

  if (!fs.existsSync(source)) {
    console.error(`[sync-docs] source docs dir not found: ${source}`);
    process.exit(1);
  }

  const { copied, skipped, pruned } = syncDocs({ source, dest });

  console.log(`[sync-docs] copied ${copied.length} markdown file(s) from ${source} -> ${dest}`);
  // Name every skip and prune: a silent count hides both a new internal doc
  // upstream and a public doc accidentally dropped from the allow-list.
  if (skipped.length) {
    console.log(`[sync-docs] skipped ${skipped.length} file(s) not on the allow-list:`);
    for (const rel of skipped.sort()) console.log(`  - ${rel}`);
  }
  if (pruned.length) {
    console.log(`[sync-docs] pruned ${pruned.length} stale file(s) from ${dest}:`);
    for (const rel of pruned.sort()) console.log(`  - ${rel}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
