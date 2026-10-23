# Phaser (JavaScript / TypeScript)

> Wire a Phaser 3 game to Yes2SDK with `@yes2games/js/phaser`: one lifecycle object pauses and mutes the game around ads and platform pause events, and resumes WebAudio after every ad.

This page follows the `phaser-ts` template in the [yes2sdk-js repo](https://github.com/yes2games/yes2sdk-js/tree/main/templates/phaser-ts) (Phaser 3, TypeScript, Vite). For the general setup, see the [JavaScript / TypeScript Integration](/docs/javascript) guide.

## Install

```sh
npm i phaser @yes2games/js
```

Or start from the template: copy `templates/phaser-ts` out of the repo and change `"@yes2games/js": "file:../.."` in its `package.json` to the published version (`"^0.1.0"`).

`@yes2games/js/phaser` does not import Phaser. It is typed against the parts of `Phaser.Game` it uses (`pause()`, `resume()`, `sound.mute`, `sound.context` and the sound manager's `"mute"` event), so it adds no second copy of Phaser to your bundle.

## Boot order

1. Get the SDK. In `npm run dev` there is no SDK on the page, so install the mock. In a dashboard-bundled build the real SDK is already there.
2. `await sdk.initializeAsync()` before the game boots.
3. Create the lifecycle in Phaser's `preBoot` callback, so it is attached before any scene runs.
4. Report loader progress from the boot scene's `preload`.
5. Call `startGameAsync()` once the first interactive scene is up.

```ts
// src/sdk.ts
import { requireSdk, type Yes2SDK } from "@yes2games/js";

export async function loadSdk(): Promise<Yes2SDK> {
    if (import.meta.env.DEV) {
        const { installYes2SDKMock } = await import("@yes2games/js/mock");
        installYes2SDKMock();   // dropped from `vite build`
    }
    return requireSdk();        // throws a clear error if no SDK is on the page
}
```

```ts
// src/main.ts
import Phaser from "phaser";
import { createLoadingProgressReporter, installInputGuards } from "@yes2games/js";
import { createPhaserLifecycle } from "@yes2games/js/phaser";
import { loadSdk } from "./sdk";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
installInputGuards(canvas);     // arrow and space keys no longer scroll the host page

const sdk = await loadSdk();
await sdk.initializeAsync();

new Phaser.Game({
    type: Phaser.WEBGL,         // a provided canvas needs an explicit renderer type
    canvas,
    scene: [BootScene, GameScene],
    callbacks: {
        preBoot: (game) => {
            const lifecycle = createPhaserLifecycle(game).attach();
            // keep `lifecycle` and a progress reporter where your scenes can reach them
        },
    },
});
```

```html
<!-- index.html: mark the game canvas, add no SDK <script> tags -->
<canvas id="game-canvas" data-yes2-canvas></canvas>
<script type="module" src="./src/main.ts"></script>
```

`data-yes2-canvas` tells the dashboard which canvas to capture for screenshots. Without it the dashboard falls back to `#unity-canvas`, then the largest visible canvas.

## Loading progress

Phaser's loader reports a 0 to 1 fraction. `createLoadingProgressReporter()` forwards it to `Yes2SDK.setLoadingProgress` only when the integer percentage changes:

```ts
export class BootScene extends Phaser.Scene {
    preload(): void {
        this.load.on("progress", (value: number) => progress.fraction(value));
        // this.load.image(...), this.load.audio(...)
    }

    create(): void {
        progress.percent(100);
        this.scene.start("Game");
    }
}
```

Keep progress moving during a long load. On Jest in Manual loading mode, the player is sent back to the Jest home screen after 15 seconds without a progress update (see [Lifecycle & Events](/docs/api/lifecycle#loading-on-jest)).

## Ready, gameplay and ads

```ts
export class GameScene extends Phaser.Scene {
    async create(): Promise<void> {
        // build the menu...
        await sdk.startGameAsync();          // the menu is up and interactive
    }

    startLevel(): void {
        sdk.game.gameplayStart();            // real gameplay only, not menus
    }

    async endLevel(): Promise<void> {
        sdk.game.gameplayStop();
        await lifecycle.showInterstitial("level-complete");
    }

    async watchAdForCoins(): Promise<void> {
        if (lifecycle.ads.isAdShowing()) return;
        const outcome = await lifecycle.showRewarded("bonus-coins");
        if (outcome === "viewed") this.addCoins(10);   // grant only on "viewed"
    }
}
```

`lifecycle.showInterstitial()` and `showRewarded()` go through the runtime's one-ad-at-a-time latch and watchdog, and never reject. They resolve `"shown"`, `"viewed"`, `"dismissed"` or `"noFill"`. You can still pass your own callbacks as the second argument (`adViewed`, `noFill` and so on); they run alongside the lifecycle's pause and resume. See [Ad Runtime & Engine Parity](/docs/javascript-ads-runtime).

## What `createPhaserLifecycle(game)` does

- On `beforeAd` and the SDK's `pause` event: `game.pause()` and `game.sound.mute = true`.
- On `afterAd` and `resume`: `game.resume()`, and the game's own mute choice comes back. Each source is tracked separately, so an ad that ends during a platform pause does not resume the game early.
- Follows the platform mute switch (`audioEnabledChange`, plus `session.isAudioEnabled()` at attach).
- Follows your own mute choice through the sound manager's `"mute"` event. A `sound.mute = false` you write while the helper holds the game muted applies when the helper unmutes. It never reads `sound.mute` back, because that getter lags behind writes while the AudioContext is suspended.
- Resumes `game.sound.context` after every ad, from `afterAd` and again when the show promise settles, if the WebAudio context was left suspended.

Call `attach()` after `initializeAsync()`. `detach()` removes the SDK event listeners.

## Build and upload

```sh
npm run build        # tsc + vite build into dist/
```

Zip the contents of `dist/` so that `index.html` sits at the top of the zip, and upload it to the Yes2Games Dashboard. The template's `vite.config.ts` sets `base: "./"` and raises `chunkSizeWarningLimit` to 2000 kB, because Phaser alone is about 1.2 MB minified. See [Vite Build Settings](/docs/javascript-vite-build).
