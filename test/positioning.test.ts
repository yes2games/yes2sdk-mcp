import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESCRIPTION } from "../src/lib/positioning.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

describe("canonical positioning line", () => {
  it("stays within the 160-character snippet budget once composed", () => {
    expect(DESCRIPTION.length).toBeLessThanOrEqual(160);
  });

  it("package.json description matches the constant", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO, "package.json"), "utf8")
    ) as { description: string };
    expect(pkg.description).toBe(DESCRIPTION);
  });

  it("README opening paragraph leads with the constant", () => {
    const readme = fs.readFileSync(path.join(REPO, "README.md"), "utf8");
    const firstParagraph = readme
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0 && !block.startsWith("#"))[0];

    // The paragraph is hard-wrapped across several lines; normalise whitespace
    // so a reflow does not fail the check.
    const normalised = (firstParagraph ?? "").replace(/\s+/g, " ");
    expect(normalised.slice(0, DESCRIPTION.length)).toBe(DESCRIPTION);
  });
});
