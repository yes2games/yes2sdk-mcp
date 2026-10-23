# Vite Build Settings for Upload (JavaScript / TypeScript)

> The Vite settings that make a JavaScript or TypeScript game upload cleanly to the Yes2Games Dashboard: relative asset paths, assets kept as files, no SDK script tags, and a zip with `index.html` at the top.

Every Vite template in the [yes2sdk-js repo](https://github.com/yes2games/yes2sdk-js/tree/main/templates) uses this config. Other bundlers work too, as long as the output follows the same rules.

## `vite.config.ts`

```ts
import { defineConfig } from "vite";

export default defineConfig({
    base: "./",                  // every emitted asset URL is relative
    build: {
        outDir: "dist",
        emptyOutDir: true,
        assetsInlineLimit: 0,    // keep assets as files next to index.html
        // chunkSizeWarningLimit: 2000,   // Phaser alone is ~1.2 MB minified; three ~700 kB
    },
});
```

| Setting | Why |
| --- | --- |
| `base: "./"` | **Required.** Vite's default `base` is `/`, which emits root-absolute URLs (`/assets/index-abc.js`). Platforms serve games from a sub-path, so those URLs load from the host root and 404. With `base: "./"`, `index.html` loads `./assets/index-abc.js`. |
| `outDir: "dist"`, `emptyOutDir: true` | `dist/` holds only the current build, ready to zip. |
| `assetsInlineLimit: 0` | Keeps every asset a file instead of inlining small ones as data URLs. |
| `chunkSizeWarningLimit` | Optional. Raises Vite's 500 kB warning for engines that are bigger than that on their own. It changes no output. |

## Root-absolute paths

The dashboard checks every upload for root-absolute paths: `src`/`href` values in `index.html`, and `"/assets/..."` string literals in your scripts that name a real file in the build. When it finds any, the upload still succeeds, and the build shows a warning that points at `base: "./"`.

- On every platform except Jest, the same finding is a warning on the bundle.
- On **Jest**, a root-absolute path in `index.html` **blocks** the bundle, because Jest serves games from a CDN sub-path. Root-absolute literals in scripts stay a warning there too.

`base: "./"` fixes the paths Vite writes. Paths you write yourself need the same care: for a file in Vite's `public/` folder, use `"./sounds/hit.mp3"`, not `"/sounds/hit.mp3"`.

## What not to add

- **No SDK `<script>` tags or SDK files.** The dashboard injects the real SDK for each platform when it bundles your game, before your first `<script>` tag. Your code reads it as `window.Yes2SDK`.
- **No mock in the build.** Import `@yes2games/js/mock` only under `import.meta.env.DEV`, which is `false` in `vite build`, so the mock is left out of `dist/`. (A no-build game may leave its `yes2sdk-mock.js` tag in: the dashboard removes the tag and deletes the file. See [Testing with the Mock](/docs/javascript-mock).)
- **No external scripts.** Platforms block `<script src="https://...">`. Bundle everything, including `@yes2games/js`, which is part of your game.

## Mark the game canvas

```html
<canvas id="game-canvas" data-yes2-canvas></canvas>
```

The dashboard's screenshot capture picks `[data-yes2-canvas]` first (the canvas itself, or the first canvas inside a marked wrapper), then `#unity-canvas`, then the largest visible canvas. Mark yours when the page has more than one canvas, for example a UI or debug overlay.

## Build and zip

```sh
npm run build            # e.g. "tsc && vite build"
cd dist && zip -r ../game.zip . && cd ..
```

Zip the **contents** of `dist/`, not the folder, so `index.html` sits at the top level of the zip. Then upload the zip on your game page in the dashboard, or from CI with the [Build Upload API](/docs/build-upload-api).

## What the dashboard does with the upload

- **SDK check.** The upload is rejected with `SDK_NOT_INTEGRATED` unless your own scripts reference the SDK: `window.Yes2SDK`, `Yes2SDK.` member access, or the `Yes2Runtime` global of the classic-script runtime. A game that calls `requireSdk()` or `getSdk()` from `@yes2games/js`, or `Yes2SDK.initializeAsync()` directly, passes. The check also reads inline `<script>` blocks in `index.html`.
- **Engine.** A build with `index.html` and JavaScript but no Unity, Defold, PlayCanvas or Cocos signature is detected as `vanilla` and labelled **HTML5 / JavaScript**. Phaser and three.js builds land here too.
- **Warnings.** Root-absolute path findings are stored with the build and shown on its row.
- **Bundling.** For each platform, the dashboard injects the SDK and its platform config, and strips any `yes2sdk-mock.js` tag and file.

Next, run the build in the Inspector and request publishing (see the [Dashboard Guide](/docs/dashboard-guide)).
