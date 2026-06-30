import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

/**
 * Static validation of an already-extracted game build directory.
 *
 * The file-scanning helpers (`walkDir`, `fileContains`, brotli/gzip variants,
 * `detectSDKIntegration`) are adapted from the dashboard's
 * `api/src/services/build-analysis.ts` and reimplemented here so this package
 * is standalone. The new static checks (external scripts, entry file, responsive
 * canvas) are specific to the MCP `validate_integration` tool.
 */

export type BuildSeverity = "FAIL" | "WARN" | "INFO";

export interface BuildFinding {
  severity: BuildSeverity;
  check: string;
  message: string;
  fix?: string;
}

// ── File-scanning primitives ───────────────────────────────────────────

/** Recursively list all files in a directory. */
export async function walkDir(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Stream-decompress `filePath` and resolve true once `search` appears. A small
 * tail buffer carries trailing bytes between chunks so a match split across a
 * chunk boundary is still found. Resolves false on stream errors.
 */
function compressedFileContains(
  filePath: string,
  decompress: zlib.BrotliDecompress | zlib.Gunzip,
  search: string
): Promise<boolean> {
  return new Promise((resolve) => {
    const input = fs.createReadStream(filePath);
    let found = false;
    let tail = "";

    decompress.on("data", (chunk: Buffer) => {
      if (found) return;
      const text = tail + chunk.toString("utf-8");
      if (text.includes(search)) {
        found = true;
        input.destroy();
        decompress.destroy();
        resolve(true);
        return;
      }
      tail = text.length > search.length ? text.slice(-search.length) : text;
    });

    decompress.on("end", () => {
      if (!found) resolve(false);
    });
    decompress.on("error", () => resolve(false));
    input.on("error", () => resolve(false));

    input.pipe(decompress);
  });
}

/** Stream an uncompressed file and resolve true once `search` appears. */
export function fileContains(filePath: string, search: string): Promise<boolean> {
  return new Promise((resolve) => {
    const input = fs.createReadStream(filePath, { encoding: "utf-8" });
    let found = false;
    let tail = "";

    input.on("data", (chunk: string | Buffer) => {
      if (found) return;
      const text = tail + chunk.toString();
      if (text.includes(search)) {
        found = true;
        input.destroy();
        resolve(true);
        return;
      }
      tail = text.length > search.length ? text.slice(-search.length) : text;
    });

    input.on("end", () => {
      if (!found) resolve(false);
    });
    input.on("error", () => resolve(false));
  });
}

/** Check if a Brotli-compressed file contains a search string by streaming. */
export async function brotliFileContains(filePath: string, search: string): Promise<boolean> {
  return compressedFileContains(filePath, zlib.createBrotliDecompress(), search);
}

/** Gzip equivalent of `brotliFileContains`. */
export async function gzipFileContains(filePath: string, search: string): Promise<boolean> {
  return compressedFileContains(filePath, zlib.createGunzip(), search);
}

/**
 * Detect whether the game in the extracted build directory has Yes2SDK
 * integrated. Searches the game's own JS files (excluding our injected
 * yes2sdk* files) for references to `Yes2SDK`, including brotli/gzip-only files.
 */
export async function detectSDKIntegration(extractedDir: string): Promise<boolean> {
  const allFiles = await walkDir(extractedDir);
  const SEARCH = "Yes2SDK";

  const jsFiles = allFiles.filter((f) => {
    const name = path.basename(f).toLowerCase();
    return f.endsWith(".js") && !name.startsWith("yes2sdk");
  });
  for (const file of jsFiles) {
    if (await fileContains(file, SEARCH)) return true;
  }

  const brOnlyFiles = allFiles.filter((f) => {
    if (!f.endsWith(".js.br")) return false;
    const name = path.basename(f).toLowerCase();
    if (name.startsWith("yes2sdk")) return false;
    return !fs.existsSync(f.slice(0, -3));
  });
  for (const file of brOnlyFiles) {
    if (await brotliFileContains(file, SEARCH)) return true;
  }

  const gzOnlyFiles = allFiles.filter((f) => {
    if (!f.endsWith(".js.gz")) return false;
    const name = path.basename(f).toLowerCase();
    if (name.startsWith("yes2sdk")) return false;
    return !fs.existsSync(f.slice(0, -3));
  });
  for (const file of gzOnlyFiles) {
    if (await gzipFileContains(file, SEARCH)) return true;
  }

  return false;
}

// ── Static build validation ─────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  poki: "Poki",
  crazygames: "CrazyGames",
  yandex: "Yandex Games",
  gamedistribution: "Game Distribution",
  youtube: "YouTube Playables",
};

/** Locate index.html in the build root (or one level down for nested zips). */
async function findIndexHtml(extractedDir: string): Promise<string | null> {
  const root = path.join(extractedDir, "index.html");
  if (fs.existsSync(root)) return root;
  // Some uploads nest the build one folder deep.
  const all = await walkDir(extractedDir);
  const candidates = all.filter((f) => path.basename(f).toLowerCase() === "index.html");
  // Prefer the shallowest index.html.
  candidates.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return candidates[0] ?? null;
}

/**
 * Pure core of the static build checks. Operates on already-gathered inputs so
 * it can run identically against a disk build (`runBuildChecks`) or inline
 * content (`runBuildChecksInline`).
 *
 *  - indexHtmlContent null  -> entry-file FAIL (no index.html); otherwise INFO,
 *                              plus the external-scripts and responsive-canvas checks.
 *  - fileBasenames          -> Poki index.json WARN.
 *  - sdkBundled true        -> INFO bundled; false -> FAIL not-bundled;
 *                              null -> WARN (could not verify from inline input).
 */
export function evaluateBuild(
  input: {
    indexHtmlContent: string | null;
    fileBasenames: string[];
    sdkBundled: boolean | null;
    /** Display path for the entry-file INFO message (defaults to "index.html"). */
    indexHtmlPath?: string;
  },
  platform: string
): BuildFinding[] {
  const findings: BuildFinding[] = [];
  const { indexHtmlContent, fileBasenames, sdkBundled, indexHtmlPath } = input;

  // 1) Entry file present.
  if (indexHtmlContent === null) {
    findings.push({
      severity: "FAIL",
      check: "entry-file",
      message: "No index.html found in the build. Platforms require an index.html entry point.",
      fix: "Ensure your build outputs index.html at the root of the zip.",
    });
  } else {
    findings.push({
      severity: "INFO",
      check: "entry-file",
      message: `Found entry file: ${indexHtmlPath ?? "index.html"}`,
    });
  }

  // Poki additionally requires index.json kept in sync with index.html.
  if (platform === "poki") {
    const hasIndexJson = fileBasenames.some((f) => f.toLowerCase() === "index.json");
    if (!hasIndexJson) {
      findings.push({
        severity: "WARN",
        check: "poki-index-json",
        message:
          "Poki production builds require an index.json alongside index.html, kept in sync with it.",
        fix: "Add an index.json (Poki uses it instead of index.html in production) and keep both files in sync.",
      });
    }
  }

  // 2) SDK bundled?
  if (sdkBundled === true) {
    findings.push({
      severity: "INFO",
      check: "sdk-bundled",
      message: "Yes2SDK reference found in the build's JavaScript — SDK appears bundled.",
    });
  } else if (sdkBundled === false) {
    findings.push({
      severity: "FAIL",
      check: "sdk-bundled",
      message:
        "No reference to Yes2SDK found in the build's JavaScript. The SDK must be bundled into the game (platforms block external scripts, so it cannot be loaded from a CDN).",
      fix: "Integrate and bundle the Yes2SDK into your game build. See get_quickstart for your platform.",
    });
  } else {
    findings.push({
      severity: "WARN",
      check: "sdk-bundled",
      message:
        "could not verify SDK bundling from inline input — provide jsContents or use buildPath",
      fix: "Pass `jsContents` (the build's JavaScript file contents) so bundling can be verified, or run with `buildPath` against an extracted build folder.",
    });
  }

  // 3) External scripts + 4) responsive canvas (need index.html contents).
  if (indexHtmlContent !== null) {
    const html = indexHtmlContent;

    // External <script src="http..."> tags. Platforms block these.
    const scriptSrcRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    const externalSrcs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = scriptSrcRe.exec(html)) !== null) {
      const src = (m[1] ?? "").trim();
      if (/^https?:\/\//i.test(src) || src.startsWith("//")) {
        externalSrcs.push(src);
      }
    }
    if (externalSrcs.length > 0) {
      findings.push({
        severity: "FAIL",
        check: "external-scripts",
        message:
          `index.html loads ${externalSrcs.length} external script(s): ` +
          externalSrcs.slice(0, 5).join(", ") +
          (externalSrcs.length > 5 ? ", …" : "") +
          ". Platforms block external scripts — everything must be bundled in the zip.",
        fix: "Remove external <script src=\"http...\"> tags and bundle those dependencies locally. (Platform SDKs loaded by the adapter at runtime are the only exception, and the adapter handles that — your index.html should not reference them directly.)",
      });
    } else {
      findings.push({
        severity: "INFO",
        check: "external-scripts",
        message: "No external <script src> tags found in index.html.",
      });
    }

    // Responsive-canvas heuristic.
    const htmlLc = html.toLowerCase();
    const hasFullSize =
      /width\s*:\s*100%/.test(htmlLc) ||
      /height\s*:\s*100%/.test(htmlLc) ||
      /width\s*:\s*100vw/.test(htmlLc) ||
      /height\s*:\s*100vh/.test(htmlLc);
    const hasCanvas = htmlLc.includes("<canvas");
    if (!hasFullSize) {
      findings.push({
        severity: "WARN",
        check: "responsive-canvas",
        message: hasCanvas
          ? "index.html has a <canvas> but no width:100%/height:100% (or 100vw/100vh) styling. The game may not fill the viewport on the platform."
          : "index.html has no width:100%/height:100% (or 100vw/100vh) styling. Games should scale to fill the viewport responsively.",
        fix: "Add CSS so the game canvas/body fills the viewport, e.g. html,body,canvas { width:100%; height:100%; margin:0; }.",
      });
    } else {
      findings.push({
        severity: "INFO",
        check: "responsive-canvas",
        message: "Found full-viewport sizing (100%/100vw/100vh) in index.html.",
      });
    }
  }

  // Annotate with platform label for clarity (INFO header).
  const label = PLATFORM_LABELS[platform] ?? platform;
  findings.unshift({
    severity: "INFO",
    check: "platform",
    message: `Static build checks for platform: ${label}.`,
  });

  return findings;
}

/**
 * Run static checks against an already-extracted build directory.
 *
 *  - SDK bundled?           (scan .js / .js.br / .js.gz for "Yes2SDK")
 *  - External scripts       (<script src="http..."> in index.html -> FAIL)
 *  - Required entry file     (index.html present; Poki also needs index.json)
 *  - Responsive-canvas       (warn if no width/height:100% in index.html)
 */
export async function runBuildChecks(
  extractedDir: string,
  platform: string
): Promise<BuildFinding[]> {
  // Directory must exist and be readable.
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(extractedDir);
  } catch {
    return [
      {
        severity: "FAIL",
        check: "build-path",
        message: `Build path does not exist or is not readable: ${extractedDir}`,
        fix: "Pass an absolute path to an already-extracted (unzipped) build folder.",
      },
    ];
  }
  if (!stat.isDirectory()) {
    return [
      {
        severity: "FAIL",
        check: "build-path",
        message: `Build path is not a directory: ${extractedDir}`,
        fix: "Extract the build zip first, then point buildPath at the extracted folder.",
      },
    ];
  }

  // Gather inputs from disk, then evaluate with the shared core.
  const indexHtml = await findIndexHtml(extractedDir);
  let indexHtmlContent: string | null = null;
  let indexHtmlPath: string | undefined;
  if (indexHtml) {
    indexHtmlPath = path.relative(extractedDir, indexHtml);
    try {
      indexHtmlContent = await fs.promises.readFile(indexHtml, "utf-8");
    } catch {
      indexHtmlContent = "";
    }
  }

  const allFiles = await walkDir(extractedDir);
  const fileBasenames = allFiles.map((f) => path.basename(f));
  const sdkBundled = await detectSDKIntegration(extractedDir);

  return evaluateBuild({ indexHtmlContent, fileBasenames, sdkBundled, indexHtmlPath }, platform);
}

/**
 * Run static checks against inline build content (no filesystem access), for
 * the hosted/sandboxed MCP server. Mirrors `runBuildChecks` but takes the
 * index.html contents, a flat file list, and the build's JS contents directly.
 */
export function runBuildChecksInline(
  input: { indexHtml?: string; fileList?: string[]; jsContents?: string[] },
  platform: string
): BuildFinding[] {
  const { indexHtml, fileList, jsContents } = input;
  const indexHtmlContent = indexHtml ?? null;

  const fileBasenames = (fileList ?? []).map((f) => path.basename(f));
  // Confirm an index.html entry is reflected in the file list when contents are given.
  if (indexHtmlContent !== null && !fileBasenames.some((f) => f.toLowerCase() === "index.html")) {
    fileBasenames.push("index.html");
  }

  const sdkBundled =
    jsContents && jsContents.length > 0 ? jsContents.some((c) => c.includes("Yes2SDK")) : null;

  return evaluateBuild({ indexHtmlContent, fileBasenames, sdkBundled }, platform);
}
