import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runBuildChecks,
  runBuildChecksInline,
  type BuildFinding,
} from "../src/lib/build-checks.js";

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

describe("runBuildChecksInline", () => {
  it("FAILs on an external <script src=http> in inline index.html", () => {
    const findings = runBuildChecksInline(
      {
        indexHtml:
          '<html><head><script src="https://cdn.example.com/lib.js"></script></head><body></body></html>',
      },
      "crazygames"
    );
    const external = byCheck(findings, "external-scripts");
    expect(external.some((f) => f.severity === "FAIL")).toBe(true);
  });

  it("WARNs sdk-bundled when jsContents is omitted (cannot verify inline)", () => {
    const findings = runBuildChecksInline({ indexHtml: "<html></html>" }, "crazygames");
    const sdk = byCheck(findings, "sdk-bundled");
    expect(sdk.length).toBe(1);
    expect(sdk[0]!.severity).toBe("WARN");
    expect(sdk[0]!.message).toContain("could not verify SDK bundling from inline input");
  });

  it("INFO sdk-bundled when jsContents contains Yes2SDK", () => {
    const findings = runBuildChecksInline(
      { jsContents: ["window.Yes2SDK.init();"] },
      "crazygames"
    );
    const sdk = byCheck(findings, "sdk-bundled");
    expect(sdk.some((f) => f.severity === "INFO")).toBe(true);
  });

  it("FAILs sdk-bundled when jsContents lacks Yes2SDK", () => {
    const findings = runBuildChecksInline({ jsContents: ["console.log('hi');"] }, "crazygames");
    const sdk = byCheck(findings, "sdk-bundled");
    expect(sdk.some((f) => f.severity === "FAIL")).toBe(true);
  });

  it("Poki index.json WARN driven by fileList (and no WARN when present)", () => {
    const missing = runBuildChecksInline({ fileList: ["index.html", "game.js"] }, "poki");
    expect(byCheck(missing, "poki-index-json").some((f) => f.severity === "WARN")).toBe(true);

    const present = runBuildChecksInline(
      { fileList: ["index.html", "index.json", "game.js"] },
      "poki"
    );
    expect(byCheck(present, "poki-index-json").length).toBe(0);
  });

  it("FAILs entry-file when no index.html content is provided", () => {
    const findings = runBuildChecksInline({ jsContents: ["window.Yes2SDK"] }, "crazygames");
    const entry = byCheck(findings, "entry-file");
    expect(entry.some((f) => f.severity === "FAIL")).toBe(true);
  });
});
