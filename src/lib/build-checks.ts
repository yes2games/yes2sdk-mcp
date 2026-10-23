import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  describeHtmlRefs,
  findRootAbsoluteJsLiterals,
  findRootAbsoluteRefs,
  listed,
  MAX_INDEX_HTML_BYTES,
  MAX_JS_REFS,
  VITE_BASE_HINT,
  type RootAbsoluteRef,
} from "./root-absolute-paths.js";

/**
 * Static validation of an already-extracted game build directory.
 *
 * The file-scanning helpers (`walkDir`, `fileContains`, brotli/gzip variants,
 * `detectSDKIntegration`, `detectBuildEngine`, the SDK marker regex and the
 * inline-script scanner) are adapted from the dashboard's
 * `api/src/services/build-analysis.ts` and reimplemented here so this package
 * is standalone. The root-absolute path rules come from the dashboard too (see
 * root-absolute-paths.ts), as do the JS-build findings (a copy of the SDK in
 * the build, the local-dev mock, the data-yes2-canvas marker): each mirrors
 * what the dashboard does with such a build, as a warning, never a new
 * rejection. The remaining checks (external scripts, entry file, responsive
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

/** A needle: a plain substring, or a regex whose longest match fits in `tail` chars. */
interface Needle {
  test(text: string): boolean;
  tail: number;
}

function needleOf(search: string | RegExp): Needle {
  if (typeof search === "string") return { test: (t) => t.includes(search), tail: search.length };
  // Longest single lexeme the marker regexes need in one piece is ~14 chars; 64 is headroom.
  return { test: (t) => search.test(t), tail: 64 };
}

/**
 * Stream-decompress `filePath` and resolve true once `search` appears. A small
 * tail buffer carries trailing bytes between chunks so a match split across a
 * chunk boundary is still found. Resolves false on stream errors.
 */
function compressedFileContains(
  filePath: string,
  decompress: zlib.BrotliDecompress | zlib.Gunzip,
  search: string | RegExp
): Promise<boolean> {
  const needle = needleOf(search);
  return new Promise((resolve) => {
    const input = fs.createReadStream(filePath);
    let found = false;
    let tail = "";

    decompress.on("data", (chunk: Buffer) => {
      if (found) return;
      const text = tail + chunk.toString("utf-8");
      if (needle.test(text)) {
        found = true;
        input.destroy();
        decompress.destroy();
        resolve(true);
        return;
      }
      tail = text.length > needle.tail ? text.slice(-needle.tail) : text;
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
export function fileContains(filePath: string, search: string | RegExp): Promise<boolean> {
  const needle = needleOf(search);
  return new Promise((resolve) => {
    const input = fs.createReadStream(filePath, { encoding: "utf-8" });
    let found = false;
    let tail = "";

    input.on("data", (chunk: string | Buffer) => {
      if (found) return;
      const text = tail + chunk.toString();
      if (needle.test(text)) {
        found = true;
        input.destroy();
        resolve(true);
        return;
      }
      tail = text.length > needle.tail ? text.slice(-needle.tail) : text;
    });

    input.on("end", () => {
      if (!found) resolve(false);
    });
    input.on("error", () => resolve(false));
  });
}

/** Check if a Brotli-compressed file contains a search string by streaming. */
export async function brotliFileContains(filePath: string, search: string | RegExp): Promise<boolean> {
  return compressedFileContains(filePath, zlib.createBrotliDecompress(), search);
}

/** Gzip equivalent of `brotliFileContains`. */
export async function gzipFileContains(filePath: string, search: string | RegExp): Promise<boolean> {
  return compressedFileContains(filePath, zlib.createGunzip(), search);
}

// ── SDK integration markers (port of the dashboard's build-analysis.ts) ──

/**
 * Structural references to the SDK, as the dashboard counts them: a Unity jslib
 * extern (`Yes2SDK_Ads_Show`), a global-object reference (`window.Yes2SDK`),
 * member access or a call on `Yes2SDK`, bracketed `["Yes2SDK"]`, the Defold Lua
 * module (`yes2sdk.ads`), or game code calling the @yes2games/js classic-script
 * runtime (`Yes2Runtime.ads`). A bare `Yes2SDK` token in a comment or a string
 * matches none of these.
 */
export const SDK_MARKER_RE =
  /Yes2SDK_[A-Za-z0-9]+_[A-Za-z0-9]+|(?:window|globalThis|self)\.Yes2SDK|Yes2SDK\s*[.([]|\[\s*['"]Yes2SDK['"]\s*\]|\byes2sdk\.[a-z_]+|(?:window|globalThis|self)\.Yes2Runtime\b|\bYes2Runtime\s*[.([]/;

/**
 * The @yes2games/js runtime as a classic script (`yes2-runtime.js`). It
 * references window.Yes2SDK on every path, so it never counts as the game's
 * integration; the game's own code has to.
 */
export function isSdkRuntimeLayerFile(lowerName: string): boolean {
  return lowerName === "yes2-runtime.js" || lowerName === "yes2-runtime.min.js";
}

/** Banner at the top of yes2-runtime.js, used to recognise it in inline jsContents (which have no names). */
const RUNTIME_LAYER_BANNER = "@yes2games/js runtime (window.Yes2Runtime)";

/** index.html larger than this is not scanned for inline scripts. */
const MAX_INLINE_SCAN_HTML_BYTES = 5 * 1024 * 1024;

/**
 * Bodies of the inline (no src) JavaScript <script> blocks in `html`, skipping
 * non-JS types, tags carrying `data-yes2sdk` and bodies reading
 * `__yes2sdkConfig` (the dashboard's own injected scripts). Linear scan.
 */
export function inlineScriptBodies(html: string): string[] {
  const lower = html.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const bodies: string[] = [];
  let cursor = 0;
  while (cursor < lower.length) {
    const lt = lower.indexOf("<script", cursor);
    if (lt === -1) break;
    const after = lt + 7;
    const ch = lower[after];
    if (ch !== undefined && ch !== ">" && ch !== "/" && ch !== " " && ch !== "\t" && ch !== "\n" && ch !== "\r" && ch !== "\f") {
      cursor = after;
      continue;
    }
    const gt = lower.indexOf(">", after);
    if (gt === -1) break;
    const close = lower.indexOf("</script", gt + 1);
    if (close === -1) break;
    cursor = close + 8;

    const attrs = lower.slice(after, gt);
    if (/(?:^|[\s/])src\s*=/.test(attrs)) continue;
    if (/(?:^|[\s/])data-yes2sdk\s*=/.test(attrs)) continue;
    const type = /(?:^|[\s/])type\s*=\s*["']?([^"'\s>]*)/.exec(attrs);
    if (type && type[1] !== "" && type[1] !== "module" && !(type[1] ?? "").includes("javascript")) continue;

    const body = html.slice(gt + 1, close);
    if (body.includes("__yes2sdkConfig")) continue;
    bodies.push(body);
  }
  return bodies;
}

/**
 * Detect whether the game in the extracted build directory has Yes2SDK
 * integrated. Searches the game's own JS files (`.js`/`.mjs`, excluding the
 * dashboard's yes2sdk* files, the mock and the standalone runtime layer), the
 * inline scripts of index.html, and brotli/gzip-only `.js.br` / `.js.gz` files
 * for a structural SDK reference (SDK_MARKER_RE).
 */
export async function detectSDKIntegration(extractedDir: string): Promise<boolean> {
  const allFiles = await walkDir(extractedDir);

  const jsFiles = allFiles.filter((f) => {
    const name = path.basename(f).toLowerCase();
    return (name.endsWith(".js") || name.endsWith(".mjs")) && !name.startsWith("yes2sdk") && !isSdkRuntimeLayerFile(name);
  });
  for (const file of jsFiles) {
    if (await fileContains(file, SDK_MARKER_RE)) return true;
  }

  for (const file of allFiles.filter((f) => path.basename(f).toLowerCase() === "index.html")) {
    try {
      const { size } = await fs.promises.stat(file);
      if (size > MAX_INLINE_SCAN_HTML_BYTES) continue;
      const html = await fs.promises.readFile(file, "utf-8");
      if (inlineScriptBodies(html).some((body) => SDK_MARKER_RE.test(body))) return true;
    } catch {
      // unreadable: not a match
    }
  }

  const brOnlyFiles = allFiles.filter((f) => {
    if (!f.endsWith(".js.br")) return false;
    const name = path.basename(f).toLowerCase();
    if (name.startsWith("yes2sdk")) return false;
    return !fs.existsSync(f.slice(0, -3));
  });
  for (const file of brOnlyFiles) {
    if (await brotliFileContains(file, SDK_MARKER_RE)) return true;
  }

  const gzOnlyFiles = allFiles.filter((f) => {
    if (!f.endsWith(".js.gz")) return false;
    const name = path.basename(f).toLowerCase();
    if (name.startsWith("yes2sdk")) return false;
    return !fs.existsSync(f.slice(0, -3));
  });
  for (const file of gzOnlyFiles) {
    if (await gzipFileContains(file, SDK_MARKER_RE)) return true;
  }

  return false;
}

// ── Engine detection (port of the dashboard's detectEngine) ─────────────

export type BuildEngine = "unity" | "defold" | "playcanvas" | "cocos" | "vanilla" | "other";

/** How the dashboard labels each engine. */
export const ENGINE_LABELS: Record<BuildEngine, string> = {
  unity: "Unity",
  defold: "Defold",
  playcanvas: "PlayCanvas",
  cocos: "Cocos",
  vanilla: "HTML5 / JavaScript",
  other: "other",
};

/**
 * The engine the dashboard would record for a build with these files. First
 * match wins: Unity needs a Unity payload plus Unity loader evidence, Defold
 * its loader or project file, PlayCanvas and Cocos their signatures; otherwise
 * index.html with any .js/.mjs (or an inline script) is vanilla, the bucket
 * every bundler-built JS/TS game (Vite + Phaser, three.js, plain canvas) lands in.
 */
export function detectBuildEngine(input: {
  basenames: string[];
  hasIndexHtml: boolean;
  hasInlineScript: boolean;
  /** `engine` field of a build.json, when one exists. */
  buildJsonEngine?: string | null;
}): BuildEngine {
  const names = input.basenames.map((b) => b.toLowerCase());
  const has = (predicate: (name: string) => boolean): boolean => names.some(predicate);

  const hasWasm = has((n) => n.endsWith(".wasm") || n.endsWith(".wasm.br") || n.endsWith(".wasm.gz"));
  const hasUnityFramework = has((n) => n.includes(".framework.js") || n.includes("unityframework") || n === "unityloader.js");
  const hasModernLoader = has((n) => n.endsWith(".loader.js"));
  const hasUnityData = has(
    (n) => n.endsWith(".data") || n.endsWith(".data.br") || n.endsWith(".data.gz") || n.endsWith(".data.unityweb")
  );
  const hasUnityLoader = hasUnityFramework || (hasModernLoader && hasUnityData);
  const hasUnityweb = has((n) => n.endsWith(".unityweb"));
  if ((hasWasm || hasUnityweb) && hasUnityLoader) return "unity";

  if (has((n) => n === "dmloader.js" || n === "game.projectc" || n === "defold.wasm" || n === "defold.wasm.br")) return "defold";

  if (has((n) => n === "__start__.js") && has((n) => n.startsWith("pc.") && n.endsWith(".js"))) return "playcanvas";
  if (input.buildJsonEngine && input.buildJsonEngine.toLowerCase() === "playcanvas") return "playcanvas";

  if (has((n) => n === "cocos.js" || (n.startsWith("cocos2d-js") && n.endsWith(".js")) || n === "assetspackagedmanifest.js")) {
    return "cocos";
  }

  if (input.hasIndexHtml && has((n) => n.endsWith(".js") || n.endsWith(".mjs"))) return "vanilla";
  if (input.hasIndexHtml && input.hasInlineScript) return "vanilla";
  return "other";
}

// ── JS-build markers ──────────────────────────────────────────────────

/** File names of the @yes2games/js local-dev mock, which the dashboard strips. */
const MOCK_SDK_FILES = ["yes2sdk-mock.js", "yes2sdk-mock.min.js"];

/** A src that loads the mock: the mock file name, under any folder, with an optional query/fragment. */
export function isMockSdkSrc(value: string): boolean {
  const p = value.trim().toLowerCase().split(/[?#]/)[0] ?? "";
  return MOCK_SDK_FILES.includes(p.slice(p.lastIndexOf("/") + 1));
}

/**
 * The mock's localStorage settings key. It survives minification, so it marks a
 * mock compiled into the game's own JS (an unguarded import), which the
 * dashboard cannot strip.
 */
export const MOCK_BUNDLED_MARKER = "yes2sdk-mock-settings";

/** The options global only the classic-script mock (yes2sdk-mock.js) reads. */
const MOCK_IIFE_MARKER = "__yes2sdkMockOptions";

/** The UMD wrapper of the Core SDK (yes2sdk.umd.js): `exports.Yes2SDK=e():t.Yes2SDK=e()`. */
export const CORE_UMD_RE = /exports\.Yes2SDK\s*=\s*[\w$]+\(\)\s*:\s*[\w$]+\.Yes2SDK\s*=/;

/** The canvas marker the dashboard's capture picker looks for, as markup or set from code. */
export const CANVAS_MARKER_RE = /data-yes2-canvas|dataset\.yes2Canvas/;

/** What the JS-specific findings need, gathered from disk or inline input. */
export interface JsBuildSignals {
  /** Build files (or JS sources) that carry a copy of the Core SDK. */
  coreCopies: string[];
  /** Mock files present in the build. */
  mockFiles: string[];
  /** JS files with the mock compiled in. */
  mockBundledIn: string[];
  /** True when some JS sets or queries the canvas marker. */
  canvasMarkerInJs: boolean;
}

/** Root-absolute references, as the dashboard's upload scan reports them. */
export interface RootAbsoluteSignals {
  htmlRefs: RootAbsoluteRef[];
  jsRefs: { file: string; value: string }[];
  /** index.html size when it was too large to scan. */
  oversizedIndexHtmlBytes: number | null;
}

// ── Static build validation ─────────────────────────────────────────────

/** Display names for the platform ids, used in user-facing text. */
export const PLATFORM_LABELS: Record<string, string> = {
  poki: "Poki",
  crazygames: "CrazyGames",
  yandex: "Yandex Games",
  gamedistribution: "Game Distribution",
  youtube: "YouTube Playables",
  jest: "Jest",
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

/** Root-absolute path findings, mirroring the dashboard's upload warning and Jest bundle gate. */
function rootAbsoluteFindings(scan: RootAbsoluteSignals, platform: string): BuildFinding[] {
  const out: BuildFinding[] = [];
  const isJest = platform === "jest";
  if (scan.oversizedIndexHtmlBytes !== null) {
    out.push({
      severity: isJest ? "FAIL" : "WARN",
      check: "relative-paths",
      message: `index.html is too large to check for root-absolute paths (${scan.oversizedIndexHtmlBytes} bytes; the limit is ${MAX_INDEX_HTML_BYTES}).${isJest ? " The dashboard blocks Jest bundles it cannot check." : ""}`,
      fix: "Keep index.html small: move inline scripts and data into separate files.",
    });
  }
  if (scan.htmlRefs.length > 0) {
    out.push({
      severity: isJest ? "FAIL" : "WARN",
      check: "relative-paths",
      message: isJest
        ? `Jest serves games from a sub-path, so root-absolute paths break (the dashboard blocks the Jest bundle). index.html: ${describeHtmlRefs(scan.htmlRefs)}.`
        : `Root-absolute paths in index.html: ${describeHtmlRefs(scan.htmlRefs)}. They load from the host root, so they 404 in the Inspector and on platforms that serve games from a sub-path (Jest blocks them). The dashboard warns on upload.`,
      fix: `Use relative paths (./assets/x.js, not /assets/x.js). ${VITE_BASE_HINT}`,
    });
  }
  if (scan.jsRefs.length > 0) {
    out.push({
      severity: "WARN",
      check: "relative-paths",
      message: `Root-absolute paths in scripts: ${listed(scan.jsRefs.map((r) => `"${r.value}" in ${r.file}`))}. Each names a file in the build but loads it from the host root, so it 404s when the game is served from a sub-path. The dashboard warns on upload.`,
      fix: `Use relative paths. ${VITE_BASE_HINT}`,
    });
  }
  if (out.length === 0) {
    out.push({ severity: "INFO", check: "relative-paths", message: "No root-absolute paths found; asset references are relative." });
  }
  return out;
}

/** Script srcs in index.html that load the mock. */
function mockScriptSrcs(html: string | null): string[] {
  if (html === null) return [];
  const srcs: string[] = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1] ?? "";
    if (isMockSdkSrc(src)) srcs.push(src);
  }
  return srcs;
}

/** Findings for a vanilla (HTML5 / JavaScript) build: SDK copy, mock, canvas marker. */
function jsBuildFindings(indexHtml: string | null, js: JsBuildSignals): BuildFinding[] {
  const out: BuildFinding[] = [];

  const umdTags = indexHtml === null ? [] : [...indexHtml.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']*yes2sdk\.umd\.js[^"']*)["']/gi)].map((m) => m[1] ?? "");
  const copies = [...new Set([...js.coreCopies, ...umdTags.map((s) => `<script src="${s}">`)])];
  if (copies.length > 0) {
    out.push({
      severity: "WARN",
      check: "sdk-copy",
      message:
        `The build carries its own copy of the Yes2SDK runtime: ${listed(copies)}. The dashboard injects the SDK itself, configured per platform: it strips <script src="yes2sdk.umd.js"> tags and overwrites a root yes2sdk.umd.js, but a copy compiled into your own JS loads a second, unconfigured SDK.`,
      fix: "Remove yes2sdk.umd.js from the build and from your imports. Code against window.Yes2SDK and use @yes2games/js (runtime, types, mock) instead; never bundle the SDK.",
    });
  }

  const mockTags = mockScriptSrcs(indexHtml);
  if (js.mockFiles.length > 0 || mockTags.length > 0) {
    out.push({
      severity: "WARN",
      check: "mock-in-build",
      message: `The @yes2games/js local-dev mock is in the build (${listed([...js.mockFiles, ...mockTags.map((s) => `<script src="${s}">`)])}). The dashboard removes the mock's <script> tag and deletes the file when it bundles the game, and the mock never installs over the real SDK, so this is safe to upload.`,
      fix: "Nothing required. To keep the upload clean, drop the yes2sdk-mock.js tag and file from production builds.",
    });
  }
  if (js.mockBundledIn.length > 0) {
    out.push({
      severity: "WARN",
      check: "mock-in-build",
      message: `The @yes2games/js mock is compiled into the game's JavaScript (${listed(js.mockBundledIn)}). The dashboard can only strip the mock's own file and tag, so this copy ships. It refuses to install over the injected SDK, so it is dead code, not a broken game.`,
      fix: 'Import the mock only in development: if (import.meta.env.DEV) { (await import("@yes2games/js/mock")).installYes2SDKMock(); }  Vite then drops it from the production build.',
    });
  }

  // Markup only (script bodies removed, so an injected capture script naming the selector does not count),
  // plus the game's own inline scripts.
  const markedInHtml =
    indexHtml !== null &&
    (/data-yes2-canvas/i.test(indexHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "")) ||
      inlineScriptBodies(indexHtml).some((b) => CANVAS_MARKER_RE.test(b)));
  if (markedInHtml || js.canvasMarkerInJs) {
    out.push({ severity: "INFO", check: "canvas-marker", message: "Game canvas is marked with data-yes2-canvas." });
  } else {
    out.push({
      severity: "WARN",
      check: "canvas-marker",
      message:
        "No data-yes2-canvas marker found. The dashboard captures screenshots from [data-yes2-canvas], then #unity-canvas, then the largest visible canvas, so a game with a UI or debug overlay canvas can be captured wrong.",
      fix: "Add data-yes2-canvas to the game's <canvas> (or a wrapper around it), e.g. <canvas id=\"game\" data-yes2-canvas></canvas>.",
    });
  }
  return out;
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
    /** Engine the dashboard would detect; enables the engine line and the JS-build checks. */
    engine?: BuildEngine;
    /** Root-absolute path scan; omitted → the check is skipped. */
    rootAbsolute?: RootAbsoluteSignals;
    /** JS-build signals; only read when `engine` is "vanilla". */
    js?: JsBuildSignals;
  },
  platform: string
): BuildFinding[] {
  const findings: BuildFinding[] = [];
  const { indexHtmlContent, fileBasenames, sdkBundled, indexHtmlPath, engine, rootAbsolute, js } = input;
  const isJsBuild = engine === "vanilla";

  if (engine) {
    findings.push({
      severity: "INFO",
      check: "engine",
      message: `Detected engine: ${engine} (${ENGINE_LABELS[engine]}), as the dashboard would record it.`,
    });
  }

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
      message: isJsBuild
        ? "The game's own JavaScript calls window.Yes2SDK (or the @yes2games/js runtime) — integrated. The dashboard injects the SDK itself at upload."
        : "Yes2SDK reference found in the build's JavaScript — SDK appears bundled.",
    });
  } else if (sdkBundled === false && isJsBuild) {
    findings.push({
      severity: "FAIL",
      check: "sdk-bundled",
      message:
        "No call into window.Yes2SDK (or the @yes2games/js runtime, Yes2Runtime) found in the game's own JavaScript. yes2-runtime.js and the mock do not count: the game code itself has to drive the SDK.",
      fix: "Call window.Yes2SDK from your game code (initializeAsync, setLoadingProgress, startGameAsync, ads through the @yes2games/js runtime). See get_install_instructions(\"js\"). Do not bundle yes2sdk.umd.js: the dashboard injects the SDK.",
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

  // 5) Root-absolute paths (every engine; the dashboard warns, Jest blocks the index.html part).
  if (rootAbsolute) findings.push(...rootAbsoluteFindings(rootAbsolute, platform));

  // 6) JS-build checks: what the dashboard does with a vanilla build, as warnings.
  if (isJsBuild && js) findings.push(...jsBuildFindings(indexHtmlContent, js));

  // Annotate with platform label for clarity (INFO header).
  const label = PLATFORM_LABELS[platform] ?? platform;
  findings.unshift({
    severity: "INFO",
    check: "platform",
    message: `Static build checks for platform: ${label}.`,
  });

  return findings;
}

/** Scripts larger than this are skipped by the JS scans (as in the dashboard's root-absolute scan). */
const MAX_JS_SCAN_FILE_BYTES = 16 * 1024 * 1024;
/** The JS scans stop after reading this many bytes in total. */
const MAX_JS_SCAN_TOTAL_BYTES = 64 * 1024 * 1024;

/** Forward-slashed path of `file` relative to `root`. */
function relPosix(root: string, file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

/**
 * Scan a build on disk for the root-absolute paths and the JS-build signals.
 * `buildRoot` is the folder holding index.html. Never throws on an unreadable
 * script; it is skipped.
 */
async function scanBuildScripts(
  buildRoot: string,
  allFiles: string[],
  indexHtmlContent: string | null,
  indexHtmlBytes: number
): Promise<{ rootAbsolute: RootAbsoluteSignals; js: JsBuildSignals }> {
  const rootAbsolute: RootAbsoluteSignals = { htmlRefs: [], jsRefs: [], oversizedIndexHtmlBytes: null };
  if (indexHtmlBytes > MAX_INDEX_HTML_BYTES) rootAbsolute.oversizedIndexHtmlBytes = indexHtmlBytes;
  else if (indexHtmlContent !== null) rootAbsolute.htmlRefs = findRootAbsoluteRefs(indexHtmlContent);

  const js: JsBuildSignals = { coreCopies: [], mockFiles: [], mockBundledIn: [], canvasMarkerInJs: false };
  const inRoot = allFiles.filter((f) => !path.relative(buildRoot, f).startsWith(".."));
  const relFiles = new Set(inRoot.map((f) => relPosix(buildRoot, f)));
  let budget = MAX_JS_SCAN_TOTAL_BYTES;

  for (const file of inRoot) {
    const rel = relPosix(buildRoot, file);
    const name = path.basename(file).toLowerCase();
    if (name === "yes2sdk.umd.js") js.coreCopies.push(rel);
    if (MOCK_SDK_FILES.includes(name)) {
      js.mockFiles.push(rel);
      continue;
    }
    if (!(name.endsWith(".js") || name.endsWith(".mjs"))) continue;
    try {
      const { size } = await fs.promises.stat(file);
      if (size > MAX_JS_SCAN_FILE_BYTES || size > budget) continue;
      budget -= size;
      const source = await fs.promises.readFile(file, "utf-8");
      if (name !== "yes2sdk.umd.js" && CORE_UMD_RE.test(source)) js.coreCopies.push(rel);
      if (name.startsWith("yes2sdk")) continue; // dashboard-injected files: not the game's own code
      if (source.includes(MOCK_BUNDLED_MARKER)) js.mockBundledIn.push(rel);
      if (!js.canvasMarkerInJs && CANVAS_MARKER_RE.test(source)) js.canvasMarkerInJs = true;
      if (rootAbsolute.jsRefs.length < MAX_JS_REFS) {
        for (const value of findRootAbsoluteJsLiterals(source, relFiles, MAX_JS_REFS - rootAbsolute.jsRefs.length)) {
          rootAbsolute.jsRefs.push({ file: rel, value });
        }
      }
    } catch {
      // Unreadable script: skip it, these checks are advisory for it.
    }
  }
  return { rootAbsolute, js };
}

/**
 * Run static checks against an already-extracted build directory.
 *
 *  - Engine                 (the dashboard's engine detection; vanilla = HTML5 / JavaScript)
 *  - SDK integrated?        (structural SDK reference in the game's own .js / .mjs / inline scripts / .js.br / .js.gz)
 *  - External scripts       (<script src="http..."> in index.html -> FAIL)
 *  - Required entry file     (index.html present; Poki also needs index.json)
 *  - Responsive-canvas       (warn if no width/height:100% in index.html)
 *  - Root-absolute paths     (WARN; FAIL for Jest on index.html, as the dashboard's Jest gate)
 *  - JS builds only          (WARN: a copy of yes2sdk.umd.js, the mock, no data-yes2-canvas)
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
  let indexHtmlBytes = 0;
  if (indexHtml) {
    indexHtmlPath = path.relative(extractedDir, indexHtml);
    try {
      indexHtmlBytes = (await fs.promises.stat(indexHtml)).size;
      indexHtmlContent = await fs.promises.readFile(indexHtml, "utf-8");
    } catch {
      indexHtmlContent = "";
    }
  }

  const allFiles = await walkDir(extractedDir);
  const fileBasenames = allFiles.map((f) => path.basename(f));
  const sdkBundled = await detectSDKIntegration(extractedDir);

  let buildJsonEngine: string | null = null;
  const buildJson = allFiles.find((f) => path.basename(f).toLowerCase() === "build.json");
  if (buildJson) {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(buildJson, "utf-8")) as { engine?: unknown };
      if (typeof parsed.engine === "string") buildJsonEngine = parsed.engine;
    } catch {
      // malformed build.json: ignore, as the dashboard does
    }
  }
  const engine = detectBuildEngine({
    basenames: fileBasenames,
    hasIndexHtml: indexHtml !== null,
    hasInlineScript: indexHtmlContent !== null && inlineScriptBodies(indexHtmlContent).length > 0,
    buildJsonEngine,
  });

  const { rootAbsolute, js } = indexHtml
    ? await scanBuildScripts(path.dirname(indexHtml), allFiles, indexHtmlContent, indexHtmlBytes)
    : { rootAbsolute: undefined, js: undefined };

  return evaluateBuild(
    { indexHtmlContent, fileBasenames, sdkBundled, indexHtmlPath, engine, rootAbsolute, js },
    platform
  );
}

/**
 * Run static checks against inline build content (no filesystem access), for
 * the hosted/sandboxed MCP server. Mirrors `runBuildChecks` but takes the
 * index.html contents, a flat file list, and the build's JS contents directly.
 * jsContents carry no file names, so a script-literal root-absolute path is
 * matched against `fileList` and reported by its index.
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

  const inlineBodies = indexHtmlContent === null ? [] : inlineScriptBodies(indexHtmlContent);
  // jsContents have no names, so the files the dashboard skips by name are recognised by content:
  // the runtime layer (banner), the classic-script mock (its options global) and a Core SDK copy.
  const isMockIife = (c: string): boolean => c.includes(MOCK_IIFE_MARKER);
  const gameJs = (jsContents ?? []).filter((c) => !c.includes(RUNTIME_LAYER_BANNER) && !isMockIife(c) && !CORE_UMD_RE.test(c));
  const sdkBundled =
    jsContents && jsContents.length > 0
      ? gameJs.some((c) => SDK_MARKER_RE.test(c)) || inlineBodies.some((b) => SDK_MARKER_RE.test(b))
      : null;

  // Engine: from the file list when given, else from index.html's own script srcs.
  const engineNames = [...fileBasenames];
  if (!fileList && (jsContents ?? []).length > 0) engineNames.push("(jsContents).js"); // the build has JS files
  if (!fileList && indexHtmlContent !== null) {
    for (const m of indexHtmlContent.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      const src = (m[1] ?? "").split(/[?#]/)[0] ?? "";
      engineNames.push(src.slice(src.lastIndexOf("/") + 1));
    }
  }
  const hasIndexHtml = engineNames.some((f) => f.toLowerCase() === "index.html");
  const engine = detectBuildEngine({ basenames: engineNames, hasIndexHtml, hasInlineScript: inlineBodies.length > 0 });

  let rootAbsolute: RootAbsoluteSignals | undefined;
  if (indexHtmlContent !== null) {
    rootAbsolute = { htmlRefs: [], jsRefs: [], oversizedIndexHtmlBytes: null };
    const bytes = Buffer.byteLength(indexHtmlContent, "utf-8");
    if (bytes > MAX_INDEX_HTML_BYTES) rootAbsolute.oversizedIndexHtmlBytes = bytes;
    else rootAbsolute.htmlRefs = findRootAbsoluteRefs(indexHtmlContent);
    if (fileList) {
      const relFiles = new Set(fileList.map((f) => f.replace(/\\/g, "/").replace(/^\.?\//, "")));
      (jsContents ?? []).forEach((source, i) => {
        if (rootAbsolute!.jsRefs.length >= MAX_JS_REFS) return;
        for (const value of findRootAbsoluteJsLiterals(source, relFiles, MAX_JS_REFS - rootAbsolute!.jsRefs.length)) {
          rootAbsolute!.jsRefs.push({ file: `jsContents[${i}]`, value });
        }
      });
    }
  }

  const js: JsBuildSignals = {
    coreCopies: [
      ...(fileList ?? []).filter((f) => path.basename(f).toLowerCase() === "yes2sdk.umd.js"),
      ...(jsContents ?? []).flatMap((c, i) => (CORE_UMD_RE.test(c) ? [`jsContents[${i}]`] : [])),
    ],
    mockFiles: [
      ...(fileList ?? []).filter((f) => MOCK_SDK_FILES.includes(path.basename(f).toLowerCase())),
      ...(fileList ? [] : (jsContents ?? []).flatMap((c, i) => (isMockIife(c) ? [`jsContents[${i}] (yes2sdk-mock.js)`] : []))),
    ],
    mockBundledIn: (jsContents ?? []).flatMap((c, i) => (c.includes(MOCK_BUNDLED_MARKER) && !isMockIife(c) ? [`jsContents[${i}]`] : [])),
    canvasMarkerInJs: gameJs.some((c) => CANVAS_MARKER_RE.test(c)),
  };

  return evaluateBuild({ indexHtmlContent, fileBasenames, sdkBundled, engine, rootAbsolute, js }, platform);
}
