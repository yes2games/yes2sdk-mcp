# three.js (JavaScript / TypeScript)

> Wire a three.js game to Yes2SDK with `@yes2games/js/three`: a pause flag for your render loop, an `AudioListener` that mutes around ads and platform pause events, and an AudioContext resumed after every ad.

This page follows the `threejs-ts` template in the [yes2sdk-js repo](https://github.com/yes2games/yes2sdk-js/tree/main/templates/threejs-ts) (three.js, TypeScript, Vite). For the general setup, see the [JavaScript / TypeScript Integration](/docs/javascript) guide.

## Install

```sh
npm i three @yes2games/js
```

Or start from the template: copy `templates/threejs-ts` out of the repo and change `"@yes2games/js": "file:../.."` in its `package.json` to the published version (`"^0.1.0"`).

`@yes2games/js/three` does not import three. It is typed against the parts of `THREE.AudioListener` it uses (`context`, `getMasterVolume()`, `setMasterVolume()`), so it adds no second copy of three to your bundle.

## Setup

three.js has no game loop of its own, so the helper gives you a flag to check instead of pausing anything itself.

```ts
import * as THREE from "three";
import { createLoadingProgressReporter, installInputGuards, requireSdk } from "@yes2games/js";
import { createThreeLifecycle } from "@yes2games/js/three";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;   // <canvas data-yes2-canvas>
installInputGuards(canvas);

if (import.meta.env.DEV) {
    (await import("@yes2games/js/mock")).installYes2SDKMock();   // local only
}
const sdk = requireSdk();
await sdk.initializeAsync();

// Forward THREE.LoadingManager progress; only integer changes reach the SDK.
const progress = createLoadingProgressReporter();
const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => progress.fraction(total > 0 ? loaded / total : 1);
// ...load with `manager`, then build the scene

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
const listener = new THREE.AudioListener();   // attach THREE.Audio sources to this
camera.add(listener);

const timer = new THREE.Timer();
const lifecycle = createThreeLifecycle({
    listener,
    onPauseChange: (paused) => {
        if (!paused) timer.reset();   // no time jump on the first frame after an ad
    },
}).attach();

renderer.setAnimationLoop((time) => {
    if (lifecycle.paused) return;     // ad on screen or platform pause: no simulation, no rendering
    timer.update(time);
    update(timer.getDelta());
    renderer.render(scene, camera);
});

await sdk.startGameAsync();           // once the game is interactive
```

## Gameplay and ads

```ts
function startLevel(): void {
    sdk.game.gameplayStart();
}

async function endLevel(): Promise<void> {
    sdk.game.gameplayStop();
    await lifecycle.showInterstitial("level-complete");
}

async function watchAdForCoins(): Promise<void> {
    if (lifecycle.ads.isAdShowing()) return;
    const outcome = await lifecycle.showRewarded("bonus-coins");
    if (outcome === "viewed") addCoins(10);    // grant only on "viewed"
}
```

Also check `lifecycle.paused` in your input handlers, so a click that lands while an ad is up does nothing.

## What `createThreeLifecycle({ listener, onPauseChange })` does

- `lifecycle.paused` is `true` from `beforeAd` to `afterAd` and while the platform has the game paused (the SDK's `pause` and `resume` events). Each source is tracked separately. `onPauseChange` is called every time the flag flips.
- Mutes the `AudioListener` by setting its master volume to 0 for ads, platform pause and the platform mute switch (`audioEnabledChange`, plus `session.isAudioEnabled()` at attach).
- Wraps `listener.setMasterVolume` to follow the volume your game sets, because three's volume ramps and `getMasterVolume()` lags behind writes. Keep calling `setMasterVolume` as usual. A volume you set while the game is muted applies when it unmutes.
- Resumes the listener's AudioContext after every ad, from `afterAd` and again when the show promise settles.

Both options are optional. Without `listener`, nothing is muted; without `onPauseChange`, read `lifecycle.paused`.

## Build and upload

```sh
npm run build        # tsc + vite build into dist/
```

Zip the contents of `dist/` so that `index.html` sits at the top of the zip, and upload it to the Yes2Games Dashboard. The template's `vite.config.ts` sets `base: "./"` and raises `chunkSizeWarningLimit` to 1500 kB, because three alone is about 700 kB minified. See [Vite Build Settings](/docs/javascript-vite-build).
