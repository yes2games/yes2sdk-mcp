import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Docs access for the MCP server. Reads from the package's own bundled `docs/`
 * directory (populated by `npm run sync-docs`), resolved relative to the
 * compiled file location so it works both from `dist/` (npx/global install)
 * and from `src/` under tsx.
 *
 * Logic adapted from the dashboard's `web/src/lib/docs.ts` (scan + allowlist +
 * describe), reimplemented here so this package is standalone.
 */

// Compiled layout: <pkg>/dist/lib/docs.js  -> docs at <pkg>/docs
// Dev (tsx)  layout: <pkg>/src/lib/docs.ts -> docs at <pkg>/docs
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, "..", "..");
export const DOCS_DIR = path.join(PKG_ROOT, "docs");

export interface DocEntry {
  /** Slug used for lookups, e.g. "quickstart-poki" or "api/ads" (no extension). */
  slug: string;
  /** Path relative to the docs dir, e.g. "api/ads.md". */
  relPath: string;
  /** Absolute path on disk. */
  absPath: string;
}

/** Recursively collect every `.md` file under the docs dir. */
function collectMarkdown(dir: string, base: string): DocEntry[] {
  const out: DocEntry[] = [];
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of dirents) {
    const abs = path.join(dir, ent.name);
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      out.push(...collectMarkdown(abs, rel));
    } else if (ent.isFile() && ent.name.endsWith(".md")) {
      out.push({
        slug: rel.replace(/\.md$/, ""),
        relPath: rel,
        absPath: abs,
      });
    }
  }
  return out;
}

/**
 * Ordering: dashboard-guide first, then quickstart-* (alphabetical), then
 * api/* (overview first, then alphabetical), then everything else.
 */
function rank(relPath: string): [number, string] {
  if (relPath === "dashboard-guide.md") return [0, relPath];
  if (relPath.startsWith("quickstart-")) return [1, relPath];
  if (relPath === "api/overview.md") return [2, ""];
  if (relPath.startsWith("api/")) return [2, relPath];
  return [3, relPath];
}

let cachedEntries: DocEntry[] | null = null;

/** All markdown docs, sorted for stable presentation. Cached per process. */
export function getDocEntries(): DocEntry[] {
  if (cachedEntries) return cachedEntries;
  const entries = collectMarkdown(DOCS_DIR, "");
  entries.sort((a, b) => {
    const [ra, sa] = rank(a.relPath);
    const [rb, sb] = rank(b.relPath);
    if (ra !== rb) return ra - rb;
    return sa.localeCompare(sb);
  });
  cachedEntries = entries;
  return entries;
}

/** Set of valid slugs, for allowlist lookups. */
let cachedSlugs: Set<string> | null = null;
export function getDocSlugs(): Set<string> {
  if (cachedSlugs) return cachedSlugs;
  cachedSlugs = new Set(getDocEntries().map((e) => e.slug));
  return cachedSlugs;
}

/** Read a single doc by slug; null if not an allow-listed slug. */
export function readDocBySlug(slug: string): string | null {
  if (!getDocSlugs().has(slug)) return null;
  const entry = getDocEntries().find((e) => e.slug === slug);
  if (!entry) return null;
  try {
    return fs.readFileSync(entry.absPath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Derive a one-line description from a doc's contents: prefer the first
 * blockquote (`> ...`) or first non-heading sentence after the H1; fall back
 * to the H1 text.
 */
export function describeDoc(content: string, fallback: string): string {
  const lines = content.split(/\r?\n/);
  let h1: string | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ") && h1 === null) {
      h1 = line.replace(/^#\s+/, "").trim();
      continue;
    }
    if (line.startsWith(">")) {
      const blurb = line.replace(/^>\s?/, "").trim();
      if (blurb) return blurb;
    }
    const isStandaloneLink = /^\[[^\]]*\]\([^)]*\)$/.test(line);
    const isNavLink = /(?:←|‹|back to)/i.test(line) && /\]\(/.test(line);
    if (
      !line.startsWith("#") &&
      !line.startsWith("|") &&
      !line.startsWith("```") &&
      !isStandaloneLink &&
      !isNavLink
    ) {
      const sentence = line.split(/(?<=[.!?])\s/)[0]?.trim() ?? "";
      if (sentence.length > 0) return sentence;
    }
  }
  return h1 ?? fallback;
}

// ── Search ─────────────────────────────────────────────────────────────

export interface DocSearchHit {
  slug: string;
  relPath: string;
  /** Heading of the matched section, or the doc H1 if matched in the preamble. */
  heading: string;
  /** Excerpt of the matched section body. */
  excerpt: string;
  score: number;
}

interface DocSection {
  heading: string;
  body: string;
}

/** Split a markdown doc into sections keyed by their nearest heading. */
function splitSections(content: string): DocSection[] {
  const lines = content.split(/\r?\n/);
  const sections: DocSection[] = [];
  let heading = "(intro)";
  let buf: string[] = [];
  const flush = (): void => {
    const body = buf.join("\n").trim();
    if (body.length > 0 || heading !== "(intro)") {
      sections.push({ heading, body });
    }
    buf = [];
  };
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = (m[2] ?? "").trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

/** Tokenize a query into lowercased terms (length >= 2). */
function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

/**
 * Keyword search across all bundled docs. Scores each heading/body section by
 * term frequency (heading matches weighted higher) and returns the top hits.
 */
export function searchDocs(query: string, limit = 5): DocSearchHit[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const hits: DocSearchHit[] = [];
  for (const entry of getDocEntries()) {
    let content: string;
    try {
      content = fs.readFileSync(entry.absPath, "utf-8");
    } catch {
      continue;
    }
    for (const section of splitSections(content)) {
      const headingLc = section.heading.toLowerCase();
      const bodyLc = section.body.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const headingCount = headingLc.split(term).length - 1;
        const bodyCount = bodyLc.split(term).length - 1;
        score += headingCount * 5 + bodyCount;
        // Bonus: slug matches the term (e.g. "poki" -> quickstart-poki).
        if (entry.slug.toLowerCase().includes(term)) score += 3;
      }
      if (score > 0) {
        const excerptSource = section.body || section.heading;
        const excerpt =
          excerptSource.length > 400
            ? excerptSource.slice(0, 400).trimEnd() + "…"
            : excerptSource;
        hits.push({
          slug: entry.slug,
          relPath: entry.relPath,
          heading: section.heading,
          excerpt,
          score,
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
