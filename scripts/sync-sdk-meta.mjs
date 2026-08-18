#!/usr/bin/env node
// Reads the engine SDK repos that sit alongside this package and emits a
// generated `src/lib/sdk-meta.ts` describing how a fresh project installs the
// Yes2SDK for each engine (package name, pinned version, install + post-install
// steps, and how to verify the SDK symbol is available). The install tool reads
// this so the version-pinned URLs never drift from the actual releases.
//
//   yes2sdk-unity/package.json + Runtime/Yes2SDK.Runtime.asmdef -> unity meta
//   yes2sdk-defold/game.project                                 -> defold meta
//   (js has no published package — runtime is injected by the dashboard)
//
// Run with: npm run sync-sdk-meta
//
// The generated file is committed, so runtime never needs the sibling repos —
// only this regen step does (same contract as sync-compliance.mjs).
//
// generate() is pure (returns the file text, writes nothing) so
// check-sdk-meta-sync.mjs can diff it against the committed file. The write
// only runs under the direct-invocation guard at the bottom.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..");
const SDK_ROOT = path.resolve(PKG_ROOT, "..", ".."); // workspace SDK dir

const UNITY_ROOT = path.join(SDK_ROOT, "yes2sdk-unity");
const DEFOLD_ROOT = path.join(SDK_ROOT, "yes2sdk-defold");

const UNITY_PKG = path.join(UNITY_ROOT, "package.json");
const UNITY_ASMDEF = path.join(UNITY_ROOT, "Runtime", "Yes2SDK.Runtime.asmdef");
const DEFOLD_PROJECT = path.join(DEFOLD_ROOT, "game.project");

const DST = path.join(PKG_ROOT, "src", "lib", "sdk-meta.ts");

export const SOURCES = [UNITY_PKG, UNITY_ASMDEF, DEFOLD_PROJECT];
export const SDK_WORKSPACE = SDK_ROOT;
export const DESTINATION = DST;

/** True when every engine SDK source file this generator reads is present. */
export function sourcesExist() {
  return SOURCES.every((f) => fs.existsSync(f));
}

function fail(msg) {
  console.error(`[sync-sdk-meta] ${msg}`);
  process.exit(1);
}

/**
 * Build the generated sdk-meta.ts text from the sibling engine SDK repos.
 * Pure: reads the sources, writes nothing.
 */
export function generate() {
// ── Unity ────────────────────────────────────────────────────────────
const unityPkg = JSON.parse(fs.readFileSync(UNITY_PKG, "utf-8"));
const unityAsmdef = JSON.parse(fs.readFileSync(UNITY_ASMDEF, "utf-8"));
const unityVersion = unityPkg.version;
const unityPackageName = unityPkg.name; // com.yes2games.yes2sdk
const unityNamespace = unityAsmdef.rootNamespace; // Yes2SDK
const unityGitUrl = "https://github.com/yes2games/yes2sdk-unity.git";

// ── Defold ───────────────────────────────────────────────────────────
const defoldRaw = fs.readFileSync(DEFOLD_PROJECT, "utf-8").replace(/\r\n/g, "\n");
const defoldVersionMatch = defoldRaw.match(/^\s*version\s*=\s*(.+)\s*$/m);
if (!defoldVersionMatch) fail("could not parse version from game.project");
const defoldVersion = defoldVersionMatch[1].trim();
const defoldArchiveUrl = `https://github.com/yes2games/yes2sdk-defold/archive/refs/tags/v${defoldVersion}.zip`;

// ── Meta model ───────────────────────────────────────────────────────
const meta = {
  unity: {
    engine: "unity",
    displayName: "Unity",
    packageName: unityPackageName,
    version: unityVersion,
    repoUrl: "https://github.com/yes2games/yes2sdk-unity",
    installSteps: [
      "In the Unity menu bar choose Window > Package Manager.",
      "Click the + button (top-left) and choose \"Add package from git URL…\".",
      `Enter: ${unityGitUrl}#v${unityVersion}  (the #v${unityVersion} tag pins this release; drop the tag only to track main).`,
      `Wait for Package Manager to resolve and import ${unityPackageName}.`,
    ],
    postInstallSteps: [
      "In the menu bar choose Yes2SDK > Build Window.",
      "Click \"Install Template\" to copy the Yes2SDK-SuperSDK WebGL template into the project. Builds fail without it (enforced by Yes2SDKBuildGuard).",
      "Confirm the Build Window status reads \"Ready\" (not \"Setup Pending\").",
    ],
    verify: `Add \`using ${unityNamespace};\` to a C# file and confirm it compiles. The static API hub (e.g. ${unityNamespace}.Init(), ${unityNamespace}.Ads) becomes available.`,
    minEngineVersion: `${unityPkg.unity}${unityPkg.unityRelease ? "." + unityPkg.unityRelease : ""}`,
  },
  defold: {
    engine: "defold",
    displayName: "Defold",
    packageName: "Yes2SDK (native extension)",
    version: defoldVersion,
    repoUrl: "https://github.com/yes2games/yes2sdk-defold",
    installSteps: [
      "Open game.project (the Defold editor or a text editor).",
      `Under the [project] section add a dependency:  dependencies#0 = ${defoldArchiveUrl}  (use the tagged release archive, not a branch URL — GitHub serves release archives more reliably).`,
      "In the Defold editor choose Project > Fetch Libraries to download the dependency.",
    ],
    postInstallSteps: [
      "Optionally copy yes2sdk/html5/engine_template.html into your project's html5/ directory for the branded loading screen.",
      "Bundle for HTML5 (Project > Bundle > HTML5 Application) — the native extension compiles in Defold's cloud build. A plain Project > Build produces no-op stubs.",
    ],
    verify: `\`local yes2sdk = require "yes2sdk.yes2sdk"\` resolves. In an HTML5 bundle the native functions run; in editor builds they no-op with a console warning.`,
    minEngineVersion: "1.6",
  },
  js: {
    engine: "js",
    displayName: "TypeScript / JavaScript (HTML5)",
    packageName: "(injected by the dashboard — no published package)",
    version: "",
    repoUrl: "https://github.com/yes2games/yes2dashboard",
    installSteps: [
      "There is no separately published npm package for the web runtime.",
      "The Yes2SDK web runtime (yes2sdk.umd.js) is injected into your WebGL/HTML5 build by the Yes2Games dashboard at upload time, before your game scripts.",
      "Build your HTML5 game normally, then upload it to the dashboard.",
    ],
    postInstallSteps: [
      "After upload the SDK is available at runtime as window.Yes2SDK — no dev-time package install is required.",
    ],
    verify: "At runtime `window.Yes2SDK` is defined (after dashboard injection). Do not import a package at build time; guard calls behind feature checks.",
    minEngineVersion: "",
  },
};

// ── Emit ─────────────────────────────────────────────────────────────
const header = [
  "// ─────────────────────────────────────────────────────────────────────",
  "// GENERATED FILE — DO NOT EDIT.",
  "// Built from the engine SDK repos by scripts/sync-sdk-meta.mjs:",
  "//   yes2sdk-unity/package.json + Runtime/Yes2SDK.Runtime.asmdef",
  "//   yes2sdk-defold/game.project",
  "// Re-sync with `npm run sync-sdk-meta` after an engine SDK release.",
  "// ─────────────────────────────────────────────────────────────────────",
  "",
].join("\n");

const body = `
/** Supported integration engines. */
export type Engine = "unity" | "defold" | "js";

/** How a fresh project installs the Yes2SDK for one engine. */
export interface EngineMeta {
  engine: Engine;
  displayName: string;
  /** Package / extension identifier (or a note when there is no package). */
  packageName: string;
  /** Pinned SDK version for this engine (empty when not versioned as a package). */
  version: string;
  repoUrl: string;
  /** Ordered steps to add the SDK to a project. */
  installSteps: string[];
  /** Steps required after install before the SDK works (e.g. Unity template). */
  postInstallSteps: string[];
  /** How to confirm the SDK symbol/namespace is available. */
  verify: string;
  /** Minimum engine version required (empty when not applicable). */
  minEngineVersion: string;
}

export const SDK_META: Record<Engine, EngineMeta> = ${JSON.stringify(meta, null, 2)} as const;

/** Engine meta for \`engine\`, or undefined if unknown. */
export function getEngineMeta(engine: string): EngineMeta | undefined {
  return SDK_META[engine as Engine];
}
`;

  return { out: header + body, unityVersion, defoldVersion };
}

// Direct invocation only: `npm run sync-sdk-meta` writes the file. Importers
// (check-sdk-meta-sync.mjs) get generate() without the side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (!sourcesExist()) {
    fail(`source file not found under ${SDK_ROOT} — check out the engine SDK repos as siblings.`);
  }
  const { out, unityVersion, defoldVersion } = generate();
  fs.mkdirSync(path.dirname(DST), { recursive: true });
  fs.writeFileSync(DST, out, "utf-8");

  console.log("[sync-sdk-meta] wrote:");
  console.log("  " + DST);
  console.log(`  unity v${unityVersion}, defold v${defoldVersion}`);
}
