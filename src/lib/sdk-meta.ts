// ─────────────────────────────────────────────────────────────────────
// GENERATED FILE — DO NOT EDIT.
// Built from the engine SDK repos by scripts/sync-sdk-meta.mjs:
//   yes2sdk-unity/package.json + Runtime/Yes2SDK.Runtime.asmdef
//   yes2sdk-defold/game.project
// Re-sync with `npm run sync-sdk-meta` after an engine SDK release.
// ─────────────────────────────────────────────────────────────────────

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

export const SDK_META: Record<Engine, EngineMeta> = {
  "unity": {
    "engine": "unity",
    "displayName": "Unity",
    "packageName": "com.yes2games.yes2sdk",
    "version": "2.5.0",
    "repoUrl": "https://github.com/yes2games/yes2sdk-unity",
    "installSteps": [
      "In the Unity menu bar choose Window > Package Manager.",
      "Click the + button (top-left) and choose \"Add package from git URL…\".",
      "Enter: https://github.com/yes2games/yes2sdk-unity.git#v2.5.0  (the #v2.5.0 tag pins this release; drop the tag only to track main).",
      "Wait for Package Manager to resolve and import com.yes2games.yes2sdk."
    ],
    "postInstallSteps": [
      "In the menu bar choose Yes2SDK > Build Window.",
      "Click \"Install Template\" to copy the Yes2SDK-SuperSDK WebGL template into the project. Builds fail without it (enforced by Yes2SDKBuildGuard).",
      "Confirm the Build Window status reads \"Ready\" (not \"Setup Pending\")."
    ],
    "verify": "Add `using Yes2SDK;` to a C# file and confirm it compiles. The static API hub (e.g. Yes2SDK.Init(), Yes2SDK.Ads) becomes available.",
    "minEngineVersion": "2021.3.0f1"
  },
  "defold": {
    "engine": "defold",
    "displayName": "Defold",
    "packageName": "Yes2SDK (native extension)",
    "version": "1.5.4",
    "repoUrl": "https://github.com/yes2games/yes2sdk-defold",
    "installSteps": [
      "Open game.project (the Defold editor or a text editor).",
      "Under the [project] section add a dependency:  dependencies#0 = https://github.com/yes2games/yes2sdk-defold/archive/refs/tags/v1.5.4.zip  (use the tagged release archive, not a branch URL — GitHub serves release archives more reliably).",
      "In the Defold editor choose Project > Fetch Libraries to download the dependency."
    ],
    "postInstallSteps": [
      "Optionally copy yes2sdk/html5/engine_template.html into your project's html5/ directory for the branded loading screen.",
      "Bundle for HTML5 (Project > Bundle > HTML5 Application) — the native extension compiles in Defold's cloud build. A plain Project > Build produces no-op stubs."
    ],
    "verify": "`local yes2sdk = require \"yes2sdk.yes2sdk\"` resolves. In an HTML5 bundle the native functions run; in editor builds they no-op with a console warning.",
    "minEngineVersion": "1.6"
  },
  "js": {
    "engine": "js",
    "displayName": "TypeScript / JavaScript (HTML5)",
    "packageName": "(injected by the dashboard — no published package)",
    "version": "",
    "repoUrl": "https://github.com/yes2games/yes2dashboard",
    "installSteps": [
      "There is no separately published npm package for the web runtime.",
      "The Yes2SDK web runtime (yes2sdk.umd.js) is injected into your WebGL/HTML5 build by the Yes2Games dashboard at upload time, before your game scripts.",
      "Build your HTML5 game normally, then upload it to the dashboard."
    ],
    "postInstallSteps": [
      "After upload the SDK is available at runtime as window.Yes2SDK — no dev-time package install is required."
    ],
    "verify": "At runtime `window.Yes2SDK` is defined (after dashboard injection). Do not import a package at build time; guard calls behind feature checks.",
    "minEngineVersion": ""
  }
} as const;

/** Engine meta for `engine`, or undefined if unknown. */
export function getEngineMeta(engine: string): EngineMeta | undefined {
  return SDK_META[engine as Engine];
}
