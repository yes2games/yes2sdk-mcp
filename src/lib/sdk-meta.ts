// ─────────────────────────────────────────────────────────────────────
// GENERATED FILE — DO NOT EDIT.
// Built from the engine SDK repos by scripts/sync-sdk-meta.mjs:
//   yes2sdk-unity/package.json + Runtime/Yes2SDK.Runtime.asmdef
//   yes2sdk-defold/game.project
//   yes2sdk-js/package.json
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
  /** Developer docs page for this engine (empty when none). */
  docsUrl: string;
  /** Engine-specific variants (e.g. Phaser, three.js, no-build), each a titled list of steps. */
  extraSections: { title: string; steps: string[] }[];
}

export const SDK_META: Record<Engine, EngineMeta> = {
  "unity": {
    "engine": "unity",
    "displayName": "Unity",
    "packageName": "com.yes2games.yes2sdk",
    "version": "2.13.0",
    "repoUrl": "https://github.com/yes2games/yes2sdk-unity",
    "installSteps": [
      "In the Unity menu bar choose Window > Package Manager.",
      "Click the + button (top-left) and choose \"Add package from git URL…\".",
      "Enter: https://github.com/yes2games/yes2sdk-unity.git#v2.13.0  (the #v2.13.0 tag pins this release; drop the tag only to track main).",
      "Wait for Package Manager to resolve and import com.yes2games.yes2sdk."
    ],
    "postInstallSteps": [
      "In the menu bar choose Yes2SDK > Build Window.",
      "Click \"Install Template\" to copy the Yes2SDK-SuperSDK WebGL template into the project. Builds fail without it (enforced by Yes2SDKBuildGuard).",
      "Confirm the Build Window status reads \"Ready\" (not \"Setup Pending\")."
    ],
    "verify": "Add `using Yes2SDK;` to a C# file and confirm it compiles. The static API hub (e.g. Yes2SDK.Init(), Yes2SDK.Ads) becomes available.",
    "minEngineVersion": "2021.3.0f1",
    "docsUrl": "",
    "extraSections": []
  },
  "defold": {
    "engine": "defold",
    "displayName": "Defold",
    "packageName": "Yes2SDK (native extension)",
    "version": "1.9.0",
    "repoUrl": "https://github.com/yes2games/yes2sdk-defold",
    "installSteps": [
      "Open game.project (the Defold editor or a text editor).",
      "Under the [project] section add a dependency:  dependencies#0 = https://github.com/yes2games/yes2sdk-defold/archive/refs/tags/v1.9.0.zip  (use the tagged release archive, not a branch URL — GitHub serves release archives more reliably).",
      "In the Defold editor choose Project > Fetch Libraries to download the dependency."
    ],
    "postInstallSteps": [
      "Optionally copy yes2sdk/html5/engine_template.html into your project's html5/ directory for the branded loading screen.",
      "Bundle for HTML5 (Project > Bundle > HTML5 Application) — the native extension compiles in Defold's cloud build. A plain Project > Build produces no-op stubs."
    ],
    "verify": "`local yes2sdk = require \"yes2sdk.yes2sdk\"` resolves. In an HTML5 bundle the native functions run; in editor builds they no-op with a console warning.",
    "minEngineVersion": "1.6",
    "docsUrl": "",
    "extraSections": []
  },
  "js": {
    "engine": "js",
    "displayName": "TypeScript / JavaScript (HTML5)",
    "packageName": "@yes2games/js",
    "version": "0.1.1",
    "repoUrl": "https://github.com/yes2games/yes2sdk-js",
    "docsUrl": "https://developer.yes2games.com/docs/javascript",
    "installSteps": [
      "Install the wrapper package:  npm i @yes2games/js@0.1.1  (installs this release; add --save-exact to keep package.json on exactly this version). It holds the runtime helpers, the engine helpers, the TypeScript types and the local-dev mock — it does NOT contain the SDK.",
      "Code against window.Yes2SDK. The Yes2Games dashboard injects the real SDK into your build at upload, before your first <script> tag. Never bundle or add a <script> for yes2sdk.umd.js yourself.",
      "Install the mock for local development only, so window.Yes2SDK exists under your dev server:  if (import.meta.env.DEV) { (await import(\"@yes2games/js/mock\")).installYes2SDKMock(); }  then get the SDK with requireSdk() from \"@yes2games/js\". Vite drops the DEV branch from production builds, so the mock never ships.",
      "TypeScript: importing \"@yes2games/js\" brings the window.Yes2SDK / Yes2SDK global types; or add \"types\": [\"@yes2games/js\"] to tsconfig.json."
    ],
    "postInstallSteps": [
      "Lifecycle: await Yes2SDK.initializeAsync() first; report loading with Yes2SDK.setLoadingProgress (createLoadingProgressReporter() forwards only integer changes); call await Yes2SDK.startGameAsync() once the game is playable; bracket real play with Yes2SDK.game.gameplayStart() / gameplayStop().",
      "Show ads through the runtime (ads.showInterstitial / ads.showRewarded from \"@yes2games/js\", or a lifecycle helper), not Yes2SDK.ads directly: it adds the one-ad-at-a-time latch, the watchdog and ads.isAdShowing(). Grant rewards only in adViewed.",
      "Mark the game canvas (or a wrapper around it) with the data-yes2-canvas attribute, e.g. <canvas data-yes2-canvas>, so the dashboard captures the right canvas. Without it the dashboard falls back to #unity-canvas, then the largest visible canvas.",
      "Vite: set base: './' in vite.config so every emitted path is relative. Platforms serve games from a sub-path, so root-absolute paths (/assets/x.js) 404 and the dashboard warns on them (Jest blocks them).",
      "Build (npm run build), zip the CONTENTS of the build folder so index.html sits at the top of the zip, and upload it to the Yes2Games dashboard. It detects the build as vanilla (\"HTML5 / JavaScript\") and injects the SDK per platform."
    ],
    "extraSections": [
      {
        "title": "Phaser",
        "steps": [
          "import { createPhaserLifecycle } from \"@yes2games/js/phaser\";",
          "In the Phaser.Game config: callbacks: { preBoot: (game) => { lifecycle = createPhaserLifecycle(game).attach(); } }  (preBoot runs before any scene). It pauses and mutes the game around ads and the SDK's pause/resume events (game.pause()/resume(), game.sound.mute), follows the platform mute switch and resumes the AudioContext after every ad.",
          "Show ads through it: await lifecycle.showInterstitial(\"level-complete\"); const outcome = await lifecycle.showRewarded(\"extra-life\"); if (outcome === \"viewed\") grantReward();",
          "Give Phaser the marked canvas: <canvas id=\"game-canvas\" data-yes2-canvas> in index.html, then new Phaser.Game({ type: Phaser.WEBGL, canvas, ... }) (a provided canvas needs an explicit renderer type). Or mark the parent element Phaser renders into."
        ]
      },
      {
        "title": "three.js",
        "steps": [
          "import { createThreeLifecycle } from \"@yes2games/js/three\";",
          "const lifecycle = createThreeLifecycle({ listener, onPauseChange: (paused) => { running = !paused; } }).attach();  where listener is your THREE.AudioListener. It mutes the listener and resumes its AudioContext after every ad, and pauses on the SDK's pause/resume events.",
          "Render into the marked canvas: new THREE.WebGLRenderer({ canvas: document.querySelector(\"[data-yes2-canvas]\") })."
        ]
      },
      {
        "title": "No build step (plain <script> tags)",
        "steps": [
          "Copy two files from the package next to index.html: node_modules/@yes2games/js/dist/yes2-runtime.js (the runtime as a classic script, window.Yes2Runtime) and node_modules/@yes2games/js/mock/dist/yes2sdk-mock.js (the mock). Both ship in your zip; neither is the SDK.",
          "In index.html, before your game script: <script src=\"yes2sdk-mock.js\"></script> then <script src=\"yes2-runtime.js\"></script> then <script src=\"main.js\"></script>. Relative src values only.",
          "The mock tag can stay in the upload: the dashboard removes the yes2sdk-mock.js tag and deletes the file when it bundles your game, and the mock never installs over a real SDK anyway.",
          "Use window.Yes2Runtime (ads, createGameLifecycle, createLoadingProgressReporter) and window.Yes2SDK from main.js."
        ]
      },
      {
        "title": "Starter templates",
        "steps": [
          "vanilla-js (no build step), vanilla-ts, phaser-ts and threejs-ts in https://github.com/yes2games/yes2sdk-js/tree/main/templates — each already marks its canvas, sets Vite base: './' and imports the mock only in dev."
        ]
      }
    ],
    "verify": "In the dev server the browser console shows \"[Yes2SDK] Mock:\" lines and window.Yes2SDK.isMock === true. After npm run build, dist/index.html references only relative paths (./assets/…), dist/ contains no yes2sdk.umd.js and no mock, and the canvas carries data-yes2-canvas. Then run validate_integration on the build folder, and after upload test the game in the dashboard's Inspector, which runs it against the real SDK.",
    "minEngineVersion": ""
  }
} as const;

/** Engine meta for `engine`, or undefined if unknown. */
export function getEngineMeta(engine: string): EngineMeta | undefined {
  return SDK_META[engine as Engine];
}
