import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/lib/version.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

function packageVersion(): string {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(REPO, "package.json"), "utf8")
  ) as { version: string };
  return pkg.version;
}

describe("server version", () => {
  it("is the version package.json declares", () => {
    expect(VERSION).toBe(packageVersion());
  });

  it("is a semver triple", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  // The whole point of reading package.json is that no second copy exists to
  // drift. A hardcoded triple reintroduced into the server factory would pass
  // every other test in the suite while silently going stale on the next bump.
  it("is not restated as a literal in the server factory", () => {
    const source = fs.readFileSync(path.join(REPO, "src", "server.ts"), "utf8");
    expect(source).not.toMatch(/version:\s*["']\d+\.\d+\.\d+/);
  });
});
