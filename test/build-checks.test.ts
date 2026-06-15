import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBuildChecks, type BuildFinding } from "../src/lib/build-checks.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BADBUILD = path.join(HERE, "fixtures", "badbuild");
const GOODBUILD = path.join(HERE, "fixtures", "goodbuild");

const byCheck = (findings: BuildFinding[], check: string): BuildFinding[] =>
  findings.filter((f) => f.check === check);

const fails = (findings: BuildFinding[]): BuildFinding[] =>
  findings.filter((f) => f.severity === "FAIL");

describe("runBuildChecks — badbuild (poki)", () => {
  it("flags external scripts and missing SDK as FAILs, plus index.json + canvas WARNs", async () => {
    const findings = await runBuildChecks(BADBUILD, "poki");

    const externalScripts = byCheck(findings, "external-scripts");
    expect(externalScripts.some((f) => f.severity === "FAIL")).toBe(true);

    const sdk = byCheck(findings, "sdk-bundled");
    expect(sdk.some((f) => f.severity === "FAIL")).toBe(true);

    const indexJson = byCheck(findings, "poki-index-json");
    expect(indexJson.some((f) => f.severity === "WARN")).toBe(true);

    const canvas = byCheck(findings, "responsive-canvas");
    expect(canvas.some((f) => f.severity === "WARN")).toBe(true);
  });
});

describe("runBuildChecks — goodbuild (poki)", () => {
  it("returns zero FAILs", async () => {
    const findings = await runBuildChecks(GOODBUILD, "poki");
    expect(fails(findings)).toEqual([]);

    // SDK detected, no external scripts, index.json present.
    expect(byCheck(findings, "sdk-bundled").some((f) => f.severity === "INFO")).toBe(true);
    expect(byCheck(findings, "external-scripts").some((f) => f.severity === "INFO")).toBe(true);
    expect(byCheck(findings, "poki-index-json").length).toBe(0);
  });
});

describe("runBuildChecks — missing path", () => {
  it("returns a single build-path FAIL", async () => {
    const findings = await runBuildChecks(path.join(HERE, "fixtures", "nope"), "poki");
    expect(findings.length).toBe(1);
    expect(findings[0]!.check).toBe("build-path");
    expect(findings[0]!.severity).toBe("FAIL");
  });
});
