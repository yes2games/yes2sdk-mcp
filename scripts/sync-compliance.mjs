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
const DASH_WEB = path.resolve(PKG_ROOT, "..", "Dashboard", "web", "src");

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
const inspectorRaw = fs.readFileSync(INSPECTOR_SRC, "utf-8");

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
let complianceRaw = fs.readFileSync(COMPLIANCE_SRC, "utf-8");
// Rewrite the `@/types/inspector` import to the local types module (.js for NodeNext ESM).
complianceRaw = complianceRaw.replace(
  /from\s+["']@\/types\/inspector["']/g,
  'from "./inspector-types.js"',
);

const complianceOut =
  header("Experimental/Dashboard/web/src/lib/compliance-rules.ts") + complianceRaw;

fs.writeFileSync(COMPLIANCE_DST, complianceOut, "utf-8");

console.log("[sync-compliance] wrote:");
console.log("  " + INSPECTOR_DST);
console.log("  " + COMPLIANCE_DST);
