# Ad Runtime & Engine Parity (JavaScript / TypeScript)

> The `ads` wrapper in `@yes2games/js` adds what the Unity and Defold wrappers add on top of `Yes2SDK.ads`: one ad at a time, a watchdog, dropped stale callbacks, and callbacks that cannot break each other. Use it instead of calling `Yes2SDK.ads` directly.

The wrapper has no platform logic. Callback ordering, gameplay bracketing around ads, preroll and placement validation stay in the SDK the dashboard injects. The full module reference is [Ads](/docs/api/ads).

## Showing an ad

```ts
import { ads } from "@yes2games/js";

await ads.showInterstitial("level-complete", {
    beforeAd: () => game.pause(),
    afterAd: () => game.resume(),          // always called exactly once, even on no-fill
});

const outcome = await ads.showRewarded("extra-life", {
    beforeAd: () => game.pause(),
    adViewed: () => player.addLife(),      // the only place to grant the reward
    adDismissed: () => showToast("No reward"),
    noFill: () => showToast("No ad right now"),
    afterAd: () => game.resume(),
});
```

The promise never rejects. It resolves to an `AdOutcome`:

| Outcome | Meaning |
| --- | --- |
| `"shown"` | An interstitial was shown. |
| `"viewed"` | A rewarded ad was watched. Grant the reward (or do it in `adViewed`). |
| `"dismissed"` | A rewarded ad was closed early. No reward. |
| `"noFill"` | No ad was shown. |

Rather than pausing by hand, you can let a lifecycle helper do it: `createGameLifecycle()` from `@yes2games/js`, `createPhaserLifecycle()` from `/phaser` or `createThreeLifecycle()` from `/three`. Their `showInterstitial` / `showRewarded` use this same wrapper, add pause, mute and AudioContext resume, and still run your own callbacks.

```ts
import { createGameLifecycle } from "@yes2games/js";

const lifecycle = createGameLifecycle({
    onPause: () => loop.stop(),
    onResume: () => loop.start(),
    onMuteChange: (muted) => audio.setMuted(muted),
    audioContext: () => audio.context,     // resumed after every ad
}).attach();                               // after initializeAsync()

const outcome = await lifecycle.showRewarded("extra-life");
if (outcome === "viewed") player.addLife();
```

## What the wrapper guarantees

| Guarantee | Behaviour |
| --- | --- |
| One ad at a time | From a `show*` call until its ad is released, `ads.isAdShowing()` is `true`. A second `show*` call in that window gets **`noFill` only**, with no `afterAd`, because `afterAd` would resume your game while the first ad is still on screen. The first ad is not affected. |
| Watchdog | The ad gets **30 s** to reach `beforeAd`, then **180 s** from `beforeAd` to `afterAd`. Time is counted in animation-frame time, and each frame adds at most 0.5 s, so a hidden tab cannot trip it. When it fires, the latch is released and you get `noFill` then `afterAd` (the ad never started) or just `afterAd` (it had started). A rewarded ad with no outcome gets `adDismissed` first. `adViewed` is never invented. |
| Stale callbacks dropped | Each call is its own request. Callbacks that arrive after their request was released (for example, a platform answering after the watchdog fired) are dropped and never reach a newer ad. |
| Retry from `noFill` | The latch is free inside `noFill`, so you can retry from there. The first ad's `afterAd` is delivered before the retry starts, exactly once. |
| Isolated callbacks | Each callback runs in its own try/catch. A throw is logged as `[Yes2SDK] <name> callback threw:` with the stack, and the next callback still runs. |
| No fill | `noFill`, then `afterAd`. |
| SDK call failed | If the SDK rejects without calling back (for example, before `initializeAsync`), you get `noFill` then `afterAd` on the following frames. |
| Ad that never showed | `afterAd` with no `beforeAd` and no outcome means the ad never appeared. You get `noFill` then `afterAd`, and the promise resolves `"noFill"`, not `"shown"`. |

On Jest, which has no in-game ads, every call takes the no-fill path: `noFill`, then `afterAd`, and the promise resolves `"noFill"`.

## Support checks that never throw

`ads.isInterstitialSupported()`, `isRewardedSupported()`, `isBannerSupported()`, `isRewardedAdAvailable()` and `isAdBlocked()` return `false` instead of throwing when the injected SDK is missing or older than the method. The same goes for two general checks:

```ts
import { hasMethod, isModuleSupported } from "@yes2games/js";

if (isModuleSupported("leaderboard")) {
    await Yes2SDK.leaderboard.setScoreAsync("main", score);
}
if (hasMethod("player", "getBotAvatarAsync")) {
    // safe to call on this runtime
}
```

Use `ads.isRewardedSupported()` to hide reward buttons where rewarded ads can never run, for example on Jest.

## Parity with Unity and Defold

All three wrappers keep one ad on screen at a time, expose an "ad showing" check and run a watchdog so a platform that never answers cannot lock ads for the session. They differ in how they report a no-fill and a rejected second call:

| | JavaScript (`@yes2games/js`) | Unity | Defold |
| --- | --- | --- | --- |
| No fill | `noFill`, then `afterAd` | `onError` with `error.Code == "NoFill"`; no `afterAd` | `no_fill`, then `after_ad` |
| Where to resume | `afterAd` | `onError` on a no-fill, `afterAd` when an ad ran | `after_ad` |
| Second call while an ad is showing | `noFill` only | `onError` (`InvalidParams`) | `no_fill` only |
| Ad showing check | `ads.isAdShowing()` | `Ads.IsAdShowing()` | `yes2sdk.ads_is_ad_showing()` |
| Reward | `adViewed`, or `outcome === "viewed"` | `adViewed` | `ad_viewed` |

The JavaScript no-fill order is the one Core and Defold use, so the same rule holds in both: resume in `afterAd` only. Unity is the exception (see [Ads: Unity](/docs/api/ads#unity-c)).

## Without a bundler

Load `yes2-runtime.js` (from `node_modules/@yes2games/js/dist/`) with a classic `<script>` tag and use `window.Yes2Runtime.ads`. Use either the classic script or the ES module on a page, not both: each has its own ad latch.

```html
<script src="yes2-runtime.js"></script>
<script>
  Yes2Runtime.ads.showInterstitial("level-complete", { beforeAd: pause, afterAd: resume });
</script>
```
