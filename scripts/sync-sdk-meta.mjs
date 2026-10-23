#!/usr/bin/env node
// Reads the engine SDK repos that sit alongside this package and emits a
// generated `src/lib/sdk-meta.ts` describing how a fresh project installs the
// Yes2SDK for each engine (package name, pinned version, install + post-install
// steps, and how to verify the SDK symbol is available). The install tool reads
// this so the version-pinned URLs never drift from the actual releases.
//
//   yes2sdk-unity/package.json + Runtime/Yes2SDK.Runtime.asmdef -> unity meta
//   yes2sdk-defold/game.project                                 -> defold meta
//   yes2sdk-js/package.json                                     -> js meta
//     (@yes2games/js on npm: runtime helpers, engine helpers and the mock.
//      The SDK itself is still injected by the dashboard at upload.)
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
const JS_ROOT = path.join(SDK_ROOT, "yes2sdk-js");

const UNITY_PKG = path.join(UNITY_ROOT, "package.json");
const UNITY_ASMDEF = path.join(UNITY_ROOT, "Runtime", "Yes2SDK.Runtime.asmdef");
const DEFOLD_PROJECT = path.join(DEFOLD_ROOT, "game.project");
const JS_PKG = path.join(JS_ROOT, "package.json");

/**
 * Subpath exports the js install steps name. If the package stops exporting one
 * of these, the generated steps would point developers at an import that no
 * longer resolves, so generation fails instead.
 */
const JS_REQUIRED_EXPORTS = [".", "./phaser", "./three", "./mock", "./mock/iife", "./global"];

const DST = path.join(PKG_ROOT, "src", "lib", "sdk-meta.ts");

export const SOURCES = [UNITY_PKG, UNITY_ASMDEF, DEFOLD_PROJECT, JS_PKG];
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

// ── JS (@yes2games/js) ───────────────────────────────────────────────
const jsPkg = JSON.parse(fs.readFileSync(JS_PKG, "utf-8"));
const jsPackageName = jsPkg.name; // @yes2games/js
const jsVersion = jsPkg.version;
const jsExports = Object.keys(jsPkg.exports ?? {});
const jsMissing = JS_REQUIRED_EXPORTS.filter((e) => !jsExports.includes(e));
if (jsMissing.length > 0) fail(`yes2sdk-js/package.json no longer exports: ${jsMissing.join(", ")}`);

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
    docsUrl: "",
    extraSections: [],
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
    docsUrl: "",
    extraSections: [],
  },
  js: {
    engine: "js",
    displayName: "TypeScript / JavaScript (HTML5)",
    packageName: jsPackageName,
    version: jsVersion,
    repoUrl: "https://github.com/yes2games/yes2sdk-js",
    docsUrl: "https://developer.yes2games.com/docs/javascript",
    installSteps: [
      `Install the wrapper package:  npm i ${jsPackageName}@${jsVersion}  (installs this release; add --save-exact to keep package.json on exactly this version). It holds the runtime helpers, the engine helpers, the TypeScript types and the local-dev mock — it does NOT contain the SDK.`,
      "Code against window.Yes2SDK. The Yes2Games dashboard injects the real SDK into your build at upload, before your first <script> tag. Never bundle or add a <script> for yes2sdk.umd.js yourself.",
      `Install the mock for local development only, so window.Yes2SDK exists under your dev server:  if (import.meta.env.DEV) { (await import("${jsPackageName}/mock")).installYes2SDKMock(); }  then get the SDK with requireSdk() from "${jsPackageName}". Vite drops the DEV branch from production builds, so the mock never ships.`,
      `TypeScript: importing "${jsPackageName}" brings the window.Yes2SDK / Yes2SDK global types; or add "types": ["${jsPackageName}"] to tsconfig.json.`,
    ],
    postInstallSteps: [
      "Lifecycle: await Yes2SDK.initializeAsync() first; report loading with Yes2SDK.setLoadingProgress (createLoadingProgressReporter() forwards only integer changes); call await Yes2SDK.startGameAsync() once the game is playable; bracket real play with Yes2SDK.game.gameplayStart() / gameplayStop().",
      `Show ads through the runtime (ads.showInterstitial / ads.showRewarded from "${jsPackageName}", or a lifecycle helper), not Yes2SDK.ads directly: it adds the one-ad-at-a-time latch, the watchdog and ads.isAdShowing(). Grant rewards only in adViewed.`,
      "Mark the game canvas (or a wrapper around it) with the data-yes2-canvas attribute, e.g. <canvas data-yes2-canvas>, so the dashboard captures the right canvas. Without it the dashboard falls back to #unity-canvas, then the largest visible canvas.",
      "Vite: set base: './' in vite.config so every emitted path is relative. Platforms serve games from a sub-path, so root-absolute paths (/assets/x.js) 404 and the dashboard warns on them (Jest blocks them).",
      "Build (npm run build), zip the CONTENTS of the build folder so index.html sits at the top of the zip, and upload it to the Yes2Games dashboard. It detects the build as vanilla (\"HTML5 / JavaScript\") and injects the SDK per platform.",
    ],
    extraSections: [
      {
        title: "Phaser",
        steps: [
          `import { createPhaserLifecycle } from "${jsPackageName}/phaser";`,
          "In the Phaser.Game config: callbacks: { preBoot: (game) => { lifecycle = createPhaserLifecycle(game).attach(); } }  (preBoot runs before any scene). It pauses and mutes the game around ads and the SDK's pause/resume events (game.pause()/resume(), game.sound.mute), follows the platform mute switch and resumes the AudioContext after every ad.",
          "Show ads through it: await lifecycle.showInterstitial(\"level-complete\"); const outcome = await lifecycle.showRewarded(\"extra-life\"); if (outcome === \"viewed\") grantReward();",
          "Give Phaser the marked canvas: <canvas id=\"game-canvas\" data-yes2-canvas> in index.html, then new Phaser.Game({ type: Phaser.WEBGL, canvas, ... }) (a provided canvas needs an explicit renderer type). Or mark the parent element Phaser renders into.",
        ],
      },
      {
        title: "three.js",
        steps: [
          `import { createThreeLifecycle } from "${jsPackageName}/three";`,
          "const lifecycle = createThreeLifecycle({ listener, onPauseChange: (paused) => { running = !paused; } }).attach();  where listener is your THREE.AudioListener. It mutes the listener and resumes its AudioContext after every ad, and pauses on the SDK's pause/resume events.",
          "Render into the marked canvas: new THREE.WebGLRenderer({ canvas: document.querySelector(\"[data-yes2-canvas]\") }).",
        ],
      },
      {
        title: "No build step (plain <script> tags)",
        steps: [
          `Copy two files from the package next to index.html: node_modules/${jsPackageName}/dist/yes2-runtime.js (the runtime as a classic script, window.Yes2Runtime) and node_modules/${jsPackageName}/mock/dist/yes2sdk-mock.js (the mock). Both ship in your zip; neither is the SDK.`,
          "In index.html, before your game script: <script src=\"yes2sdk-mock.js\"></script> then <script src=\"yes2-runtime.js\"></script> then <script src=\"main.js\"></script>. Relative src values only.",
          "The mock tag can stay in the upload: the dashboard removes the yes2sdk-mock.js tag and deletes the file when it bundles your game, and the mock never installs over a real SDK anyway.",
          "Use window.Yes2Runtime (ads, createGameLifecycle, createLoadingProgressReporter) and window.Yes2SDK from main.js.",
        ],
      },
      {
        title: "Starter templates",
        steps: [
          "vanilla-js (no build step), vanilla-ts, phaser-ts and threejs-ts in https://github.com/yes2games/yes2sdk-js/tree/main/templates — each already marks its canvas, sets Vite base: './' and imports the mock only in dev.",
        ],
      },
    ],
    verify: `In the dev server the browser console shows "[Yes2SDK] Mock:" lines and window.Yes2SDK.isMock === true. After npm run build, dist/index.html references only relative paths (./assets/…), dist/ contains no yes2sdk.umd.js and no mock, and the canvas carries data-yes2-canvas. Then run validate_integration on the build folder, and after upload test the game in the dashboard's Inspector, which runs it against the real SDK.`,
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
  "//   yes2sdk-js/package.json",
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
  /** Developer docs page for this engine (empty when none). */
  docsUrl: string;
  /** Engine-specific variants (e.g. Phaser, three.js, no-build), each a titled list of steps. */
  extraSections: { title: string; steps: string[] }[];
}

export const SDK_META: Record<Engine, EngineMeta> = ${JSON.stringify(meta, null, 2)} as const;

/** Engine meta for \`engine\`, or undefined if unknown. */
export function getEngineMeta(engine: string): EngineMeta | undefined {
  return SDK_META[engine as Engine];
}
`;

  return { out: header + body, unityVersion, defoldVersion, jsVersion };
}

// Direct invocation only: `npm run sync-sdk-meta` writes the file. Importers
// (check-sdk-meta-sync.mjs) get generate() without the side effect.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (!sourcesExist()) {
    fail(`source file not found under ${SDK_ROOT} — check out the engine SDK repos as siblings.`);
  }
  const { out, unityVersion, defoldVersion, jsVersion } = generate();
  fs.mkdirSync(path.dirname(DST), { recursive: true });
  fs.writeFileSync(DST, out, "utf-8");

  console.log("[sync-sdk-meta] wrote:");
  console.log("  " + DST);
  console.log(`  unity v${unityVersion}, defold v${defoldVersion}, js v${jsVersion}`);
}
