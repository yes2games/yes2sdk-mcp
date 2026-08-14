import { describe, it, expect } from "vitest";
import { SUPPORTED_PLATFORMS, isSupportedPlatform } from "../src/lib/platforms.js";
import { INSPECTOR_PLATFORMS } from "../src/lib/inspector-types.js";
import { readDocBySlug } from "../src/lib/docs.js";

/**
 * The supported platform set is enumerated in three independent places: this
 * package's `SUPPORTED_PLATFORMS`, the support matrix in the `api/overview` doc
 * (owned by the site that publishes the corpus), and `INSPECTOR_PLATFORMS`
 * (generated from the dashboard by `npm run sync-compliance`).
 *
 * The other two are NOT derived from the constant on purpose. Deriving them
 * would make them agree by construction and erase the signal these tests exist
 * to raise: that an upstream added or removed a platform and this package did
 * not follow. Each assertion below fails in both directions and names the
 * offending id, because "the lists differ" is not enough to act on.
 */

function sorted(ids: readonly string[]): string[] {
  return [...ids].sort();
}

/**
 * The matrix's platform columns, read straight out of the markdown.
 *
 * Deliberately does NOT go through `parseCapabilityMatrix`. That function maps
 * each header through `platformKey`, which filters on `SUPPORTED_PLATFORMS`, so
 * a column for an id the constant lacks is silently dropped and the comparison
 * becomes the constant against itself. Reading the header row here is the only
 * way the assertion can see a platform the code does not know about.
 */
function matrixColumnsFromMarkdown(md: string): string[] {
  const lines = md.split(/\r?\n/);
  const heading = lines.findIndex((l) => /^##\s+Platform support matrix/i.test(l));
  if (heading === -1) return [];

  const headerRow = lines.slice(heading + 1).find((l) => l.trim().startsWith("|"));
  if (!headerRow) return [];

  return headerRow
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .slice(1) // column 0 is the "Module" label, not a platform
    .map((cell) => cell.trim().toLowerCase().replace(/[^a-z]/g, ""))
    .filter((cell) => cell.length > 0);
}

describe("SUPPORTED_PLATFORMS", () => {
  it("has no duplicate ids", () => {
    expect(sorted(SUPPORTED_PLATFORMS)).toEqual(sorted([...new Set(SUPPORTED_PLATFORMS)]));
  });

  it("recognizes exactly its own ids and nothing else", () => {
    for (const id of SUPPORTED_PLATFORMS) {
      expect(isSupportedPlatform(id)).toBe(true);
    }
    expect(isSupportedPlatform("itch")).toBe(false);
    expect(isSupportedPlatform("")).toBe(false);
    // The inspector's extra entry is not a target platform.
    expect(isSupportedPlatform("debug")).toBe(false);
  });
});

describe("SUPPORTED_PLATFORMS agrees with the api/overview support matrix", () => {
  it("matches the matrix's platform columns in both directions", () => {
    const md = readDocBySlug("api/overview");
    expect(md, "api/overview doc must be present for this check to mean anything").not.toBeNull();

    const columns = matrixColumnsFromMarkdown(md as string);
    expect(columns.length, "the matrix parsed to zero columns, so the check is vacuous").toBeGreaterThan(0);

    const known: readonly string[] = SUPPORTED_PLATFORMS;
    const missingFromCode = columns.filter((p) => !known.includes(p));
    const missingFromDocs = known.filter((p) => !columns.includes(p));

    expect(
      missingFromCode,
      "api/overview lists platform columns that SUPPORTED_PLATFORMS does not: add them, or the tools will reject a platform the docs advertise"
    ).toEqual([]);
    expect(
      missingFromDocs,
      "SUPPORTED_PLATFORMS lists platforms the api/overview matrix has no column for: the docs corpus needs a re-sync, or the id is wrong"
    ).toEqual([]);
  });
});

describe("SUPPORTED_PLATFORMS agrees with the generated inspector platform list", () => {
  it("matches INSPECTOR_PLATFORMS once its 'debug' entry is set aside", () => {
    // inspector-types.ts is generated from the dashboard and must not be edited
    // here, so it is asserted against rather than rewritten to import the
    // constant. 'debug' is the inspector's own pseudo-platform, not a target.
    const inspectorTargets = INSPECTOR_PLATFORMS.filter((p) => p !== "debug");

    expect(
      sorted(inspectorTargets),
      "the dashboard's platform list and this package's have diverged: re-run `npm run sync-compliance`, and if they still differ, one of the two repos added a platform the other has not"
    ).toEqual(sorted(SUPPORTED_PLATFORMS));

    expect(
      INSPECTOR_PLATFORMS,
      "the inspector list lost its 'debug' entry, which this assertion depends on"
    ).toContain("debug");
  });
});
