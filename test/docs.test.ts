import { describe, it, expect } from "vitest";
import {
  getDocSlugs,
  readDocBySlug,
  searchDocs,
} from "../src/lib/docs.js";

describe("docs slug allowlist", () => {
  it("includes known slugs", () => {
    const slugs = getDocSlugs();
    expect(slugs.has("quickstart-poki")).toBe(true);
    expect(slugs.has("api/ads")).toBe(true);
    expect(slugs.has("AGENTS")).toBe(true);
  });

  it("excludes traversal / junk slugs", () => {
    const slugs = getDocSlugs();
    expect(slugs.has("../package")).toBe(false);
    expect(slugs.has("..")).toBe(false);
    expect(slugs.has("../../etc/passwd")).toBe(false);
    expect(slugs.has("does-not-exist")).toBe(false);
  });
});

describe("readDocBySlug", () => {
  it("returns content for a valid slug", () => {
    const content = readDocBySlug("quickstart-poki");
    expect(content).not.toBeNull();
    expect(typeof content).toBe("string");
    expect((content ?? "").length).toBeGreaterThan(0);
  });

  it("returns null for an invalid slug", () => {
    expect(readDocBySlug("nope-not-real")).toBeNull();
    expect(readDocBySlug("../package")).toBeNull();
  });
});

describe("searchDocs", () => {
  it("returns ranked matches for a real query", () => {
    const hits = searchDocs("rewarded ad", 5);
    expect(hits.length).toBeGreaterThan(0);
    // Scores must be in non-increasing order (ranked).
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
    // Each hit carries a slug and a positive score.
    for (const hit of hits) {
      expect(typeof hit.slug).toBe("string");
      expect(hit.score).toBeGreaterThan(0);
    }
  });

  it("returns an empty result for gibberish", () => {
    const hits = searchDocs("zzqqxxnonsenseterm", 5);
    expect(hits).toEqual([]);
  });

  it("returns an empty result for a query with no usable terms", () => {
    expect(searchDocs("a !", 5)).toEqual([]);
  });
});
