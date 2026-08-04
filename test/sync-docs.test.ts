import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-expect-error -- plain .mjs script, no type declarations
import { syncDocs, isAllowed, collectFiles } from "../scripts/sync-docs.mjs";

let tmp: string;
let source: string;
let dest: string;

function write(root: string, rel: string, body: string) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sync-docs-"));
  source = path.join(tmp, "source");
  dest = path.join(tmp, "dest");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("isAllowed", () => {
  it("admits the exact-match docs", () => {
    expect(isAllowed("AGENTS.md")).toBe(true);
    expect(isAllowed("platform-keys.md")).toBe(true);
  });

  it("admits the allow-listed prefixes", () => {
    expect(isAllowed("api/ads.md")).toBe(true);
    expect(isAllowed("generated/upload-requirements-poki.md")).toBe(true);
    expect(isAllowed("quickstart-poki.md")).toBe(true);
    expect(isAllowed("unity-webgl-build-settings.md")).toBe(true);
  });

  it("rejects internal doc trees", () => {
    expect(isAllowed("specs/2026-07-14-174-verify-9router-streaming.md")).toBe(false);
    expect(isAllowed("plans/2026-07-15-178-chat-drawer-ui.md")).toBe(false);
    expect(isAllowed("bugs/some-bug.md")).toBe(false);
    expect(isAllowed("R2_MIGRATION_PLAN.md")).toBe(false);
  });

  it("does not let a prefix match below the docs root", () => {
    // `unity-` clears root-level filenames only, not a nested internal doc
    // that happens to start with the same token.
    expect(isAllowed("internal/unity-secret.md")).toBe(false);
  });
});

describe("the vendored docs/ tree", () => {
  const docsDir = path.resolve(__dirname, "..", "docs");

  // The gate: docs/ ships through both the npm tarball and the hosted
  // container, and src/lib/docs.ts serves all of it with no runtime filter. A
  // file here that no allow-list entry admits is a leak, however it arrived.
  it("contains only allow-listed paths", () => {
    const offenders = collectFiles(docsDir).filter((rel: string) => !isAllowed(rel));
    expect(offenders).toEqual([]);
  });

  it("is not empty, so the gate above cannot pass vacuously", () => {
    expect(collectFiles(docsDir).length).toBeGreaterThan(30);
  });
});

describe("syncDocs", () => {
  it("copies allow-listed docs and names every skip", () => {
    write(source, "quickstart-poki.md", "public");
    write(source, "api/ads.md", "public api");
    write(source, "specs/internal-spec.md", "INTERNAL");
    write(source, "plans/internal-plan.md", "INTERNAL");

    const { copied, skipped, pruned } = syncDocs({ source, dest });

    expect(copied.sort()).toEqual(["api/ads.md", "quickstart-poki.md"]);
    expect(skipped.sort()).toEqual(["plans/internal-plan.md", "specs/internal-spec.md"]);
    expect(pruned).toEqual([]);
    expect(fs.existsSync(path.join(dest, "quickstart-poki.md"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "specs/internal-spec.md"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "plans"))).toBe(false);
  });

  it("prunes a destination file this run did not write", () => {
    write(source, "quickstart-poki.md", "public");
    write(dest, "quickstart-poki.md", "stale copy");
    write(dest, "specs/already-leaked.md", "INTERNAL, vendored by an earlier run");

    const { copied, pruned } = syncDocs({ source, dest });

    expect(copied).toEqual(["quickstart-poki.md"]);
    expect(pruned).toEqual(["specs/already-leaked.md"]);
    expect(fs.existsSync(path.join(dest, "specs/already-leaked.md"))).toBe(false);
    expect(fs.existsSync(path.join(dest, "specs"))).toBe(false);
    expect(fs.readFileSync(path.join(dest, "quickstart-poki.md"), "utf8")).toBe("public");
  });

  it("prunes a doc removed upstream", () => {
    write(dest, "api/retired.md", "was public, now deleted upstream");
    write(source, "api/ads.md", "public api");

    const { pruned } = syncDocs({ source, dest });

    expect(pruned).toEqual(["api/retired.md"]);
    expect(fs.existsSync(path.join(dest, "api/ads.md"))).toBe(true);
  });

  it("prunes non-markdown files the allow-list never admits", () => {
    // Upstream carries images (e.g. docs/bugs/*.png); the .md filter alone is
    // not a policy, so a non-markdown file already in dest must still go.
    write(dest, "bugs/screenshot.png", "binary-ish");
    write(source, "api/ads.md", "public api");

    const { pruned } = syncDocs({ source, dest });

    expect(pruned).toEqual(["bugs/screenshot.png"]);
  });

  it("is idempotent", () => {
    write(source, "api/ads.md", "public api");
    write(source, "specs/internal-spec.md", "INTERNAL");

    const first = syncDocs({ source, dest });
    const second = syncDocs({ source, dest });

    expect(second.copied).toEqual(first.copied);
    expect(second.skipped).toEqual(first.skipped);
    expect(second.pruned).toEqual([]);
  });
});
