#!/usr/bin/env node
// Copies the compliance engine and the inspector types it depends on into
// src/lib/, rewriting the type import to a local path and prepending a
// "generated — do not edit" header. Source of truth lives in the dashboard repo:
//   web/src/lib/compliance-rules.ts   -> src/lib/compliance.ts
//   web/src/types/inspector.ts        -> src/lib/inspector-types.ts (subset)
//
// Run with: npm run sync-compliance

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const DASH_WEB = path.resolve(PKG_ROOT, "..", "..", "yes2dashboard", "web", "src");

const COMPLIANCE_SRC = path.join(DASH_WEB, "lib", "compliance-rules.ts");
const INSPECTOR_SRC = path.join(DASH_WEB, "types", "inspector.ts");

const COMPLIANCE_DST = path.join(PKG_ROOT, "src", "lib", "compliance.ts");
const INSPECTOR_DST = path.join(PKG_ROOT, "src", "lib", "inspector-types.ts");

function header(source) {
  return [
    "// ─────────────────────────────────────────────────────────────────────",
    `// GENERATED / COPIED FILE — DO NOT EDIT.`,
    `// Copied from ${source}`,
    "// Source of truth lives in the dashboard repo.",
    "// Re-sync with `npm run sync-compliance`.",
    "// ─────────────────────────────────────────────────────────────────────",
    "",
    "",
  ].join("\n");
}

if (!fs.existsSync(COMPLIANCE_SRC) || !fs.existsSync(INSPECTOR_SRC)) {
  console.error("[sync-compliance] source files not found under " + DASH_WEB);
  process.exit(1);
}

// ── inspector-types.ts ────────────────────────────────────────────────
// We only need the types referenced by the compliance engine + the public
// API of this package: LogEntry, ErrorSource, ComplianceSeverity,
// ComplianceResult, ComplianceRule, InspectorPlatform (+ the platform const).
// Extract them by slicing the source between known anchors to avoid pulling in
// the React/UI-only types (MockSettings, DeviceProfile, etc.).
// Normalize CRLF -> LF so the hard-coded slice markers (written with "\n")
// match regardless of how the source repo checked out line endings.
const inspectorRaw = fs.readFileSync(INSPECTOR_SRC, "utf-8").replace(/\r\n/g, "\n");

function sliceBlock(src, startMarker, endMarkerExclusive) {
  const start = src.indexOf(startMarker);
  if (start === -1) throw new Error(`marker not found: ${startMarker}`);
  const end = endMarkerExclusive ? src.indexOf(endMarkerExclusive, start) : src.length;
  return src.slice(start, end === -1 ? src.length : end);
}

const errorSourceBlock = sliceBlock(
  inspectorRaw,
  "/**\n * Where a captured error originated.",
  "export interface MockSettings",
);

const complianceBlock = sliceBlock(
  inspectorRaw,
  "export type ComplianceSeverity",
  "export const PLATFORM_COLORS",
);

const inspectorOut =
  header("Experimental/Dashboard/web/src/types/inspector.ts (subset)") +
  errorSourceBlock.trimEnd() +
  "\n\n" +
  complianceBlock.trimEnd() +
  "\n";

fs.mkdirSync(path.dirname(INSPECTOR_DST), { recursive: true });
fs.writeFileSync(INSPECTOR_DST, inspectorOut, "utf-8");

// ── compliance.ts ─────────────────────────────────────────────────────
let complianceRaw = fs.readFileSync(COMPLIANCE_SRC, "utf-8").replace(/\r\n/g, "\n");
// Rewrite the `@/types/inspector` import to the local types module (.js for NodeNext ESM).
complianceRaw = complianceRaw.replace(
  /from\s+["']@\/types\/inspector["']/g,
  'from "./inspector-types.js"',
);

// Harvest the autoFix guidance authored inside each rule's check() function.
// autoFix lives only in the runtime ComplianceResult, so it is not statically
// reachable without running the check against a crafted log. We instead lift
// every `autoFix: "..."` string literal out of the rule's source block, keyed
// by rule id, so get_compliance_rule can surface the fix without executing the
// check. Re-harvested on every sync, so it can never drift from the rules.
function harvestRuleFixes(src) {
  const fixes = {};
  const decl = /:\s*ComplianceRule\s*=\s*\{/g;
  const starts = [];
  let m;
  while ((m = decl.exec(src)) !== null) starts.push(m.index);
  for (let i = 0; i < starts.length; i++) {
    const block = src.slice(starts[i], starts[i + 1] ?? src.length);
    const idMatch = block.match(/id:\s*"([^"]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const found = [...block.matchAll(/autoFix:\s*"((?:[^"\\]|\\.)*)"/g)].map((a) =>
      a[1].replace(/\\"/g, '"'),
    );
    const unique = [...new Set(found)];
    if (unique.length > 0) fixes[id] = unique;
  }
  return fixes;
}

const ruleFixes = harvestRuleFixes(complianceRaw);

// Append MCP-only accessors that expose the (otherwise module-private) rule
// arrays. The dashboard source of truth has no need for these, so we emit them
// here rather than editing the upstream file. getRulesForPlatform returns the
// same universal + platform rule set that runComplianceChecks() runs.
const rulesAccessor = [
  "",
  "// ── MCP accessors (generated by sync-compliance.mjs, not in upstream) ──",
  "",
  "/** Rules a build must satisfy for `platform` (universal + platform-specific). */",
  "export function getRulesForPlatform(platform: string): ComplianceRule[] {",
  "  return [...UNIVERSAL_RULES, ...(PLATFORM_RULES[platform] ?? [])];",
  "}",
  "",
  "/** Every rule once, deduped by id (universal first, then per-platform). */",
  "export function getAllRules(): ComplianceRule[] {",
  "  const seen = new Set<string>();",
  "  const out: ComplianceRule[] = [];",
  "  for (const rule of [...UNIVERSAL_RULES, ...Object.values(PLATFORM_RULES).flat()]) {",
  "    if (seen.has(rule.id)) continue;",
  "    seen.add(rule.id);",
  "    out.push(rule);",
  "  }",
  "  return out;",
  "}",
  "",
  "/** A single rule by id (e.g. \"P-002\"), or undefined if unknown. */",
  "export function getRuleById(id: string): ComplianceRule | undefined {",
  "  return getAllRules().find((rule) => rule.id === id);",
  "}",
  "",
  "/** autoFix guidance authored in each rule's check(), keyed by rule id. */",
  "export const RULE_FIXES: Record<string, string[]> = " + JSON.stringify(ruleFixes, null, 2) + ";",
  "",
  "/** The fix guidance for a rule id (empty when the rule authored none). */",
  "export function getRuleFixes(id: string): string[] {",
  "  return RULE_FIXES[id] ?? [];",
  "}",
  "",
].join("\n");

const complianceOut =
  header("Experimental/Dashboard/web/src/lib/compliance-rules.ts") +
  complianceRaw.trimEnd() +
  "\n" +
  rulesAccessor;

fs.writeFileSync(COMPLIANCE_DST, complianceOut, "utf-8");

console.log("[sync-compliance] wrote:");
console.log("  " + INSPECTOR_DST);
console.log("  " + COMPLIANCE_DST);
