# Ads: `Yes2SDK.ads`

[← Back to overview](overview.md)

Unified interface for interstitial, rewarded, and banner ads. Interstitials run at natural break points; rewarded ads run only when the player opts in.

**Always** call `gameplayStop()` before an ad and `gameplayStart()` after, pause your game in the before-ad callback, and resume in **both** the after-ad and error/no-fill paths. Grant rewards **only** in the "viewed" callback.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `showInterstitial(placement: string, callbacks?: AdCallbacks): Promise<void>` | Show a full-screen interstitial. `placement` must be non-empty. Resolves when the ad finishes. |
| `showRewarded(placement: string, callbacks?: AdCallbacks): Promise<void>` | Show a rewarded video. `placement` must be non-empty. Resolves when the ad finishes. |
| `showBanner(position?: BannerPosition): Promise<void>` | Show a banner. `position` is `"top"` or `"bottom"` (default `"bottom"`). |
| `hideBanner(): void` | Hide the current banner. |
| `isInterstitialSupported(): boolean` | Whether interstitials are supported. |
| `isRewardedSupported(): boolean` | Whether rewarded ads are supported. |
| `isBannerSupported(): boolean` | Whether banner ads are supported. |
| `isRewardedAdAvailable(): boolean` | Best-effort readiness hint. A coarse "SDK loaded" check on most platforms; `showRewarded` can still no-fill. |
| `isAdBlocked(): boolean` | Whether an ad blocker is detected. `false` if unsupported. |

### `AdCallbacks` (all optional)

| Field | Type | Description |
|-------|------|-------------|
| `beforeAd` | `() => void` | Before the ad shows. Pause the game. |
| `afterAd` | `() => void` | After the ad finishes. Resume the game. |
| `adDismissed` | `() => void` | User dismissed early (rewarded). |
| `adViewed` | `() => void` | User watched the full ad (rewarded). **Grant the reward here**. |
| `noFill` | `() => void` | No ad was available to show. |

`BannerPosition = "top" | "bottom"`

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `showInterstitial` | Ready | Ready | Ready | Ready | Ready |
| `showRewarded` | Ready | Ready | Ready | Ready | Ready |
| `showBanner` | None | None | Ready | Ready | None |
| `hideBanner` | None | None | Ready | Ready | None |
| `isInterstitialSupported` | Ready | Ready | Ready | Ready | Ready |
| `isRewardedSupported` | Ready | Ready | Ready | Ready | Ready |
| `isBannerSupported` | None | None | Ready | Ready | None |
| `isRewardedAdAvailable` | Partial | Partial | Partial | Partial | Partial |
| `isAdBlocked` | Ready¹ | None | None² | None | None |

**Platform mapping:**
- **Poki:** `PokiSDK.commercialBreak` / `rewardedBreak`. No banner. ¹ `isAdBlocked` calls `PokiSDK.isAdBlocked()` if present.
- **GameDistribution:** `gdsdk.showAd("interstitial" | "rewarded")`, resolved on `SDK_GAME_START` with a 30s timeout safety net; rewarded grants on `SDK_REWARDED_WATCH_COMPLETE`. No banner.
- **CrazyGames:** `sdk.ad.requestAd("midgame" | "rewarded")`; banners via `sdk.banner.*`; `hasAdblock()` is real.
- **Yandex:** `ysdk.adv.showFullscreenAdv` / `showRewardedVideo` / `showBannerAdv`. `!wasShown` maps to `noFill`.
- **YouTube:** `ytgame.ads.requestInterstitialAd()` / `requestRewardedAd(placement)`. No banner.

`isRewardedAdAvailable` is **Partial** everywhere: it only checks that the platform ad object exists; there is no true readiness signal, so a `true` result can still no-fill.

² CrazyGames detects ad blocking through an **async `hasAdblock()`** on its strategy, not a synchronous `isAdBlocked`. The unified `ads.isAdBlocked()` only delegates to a strategy method literally named `isAdBlocked`, so it returns `false` for CrazyGames. Use the platform's own adblock handling instead.

---

## Unity (C#)

`Yes2SDK.Ads` (`Yes2SDKAds`). Banner uses a `BannerPosition` enum (`Top`, `Bottom`).

| Signature | Description |
|-----------|-------------|
| `void ShowInterstitial(string placement, string description, Action beforeAd = null, Action afterAd = null, Action<Error> onError = null)` | Rejects with `InvalidParams` if another ad is in flight. |
| `void ShowRewarded(string placement, string description, Action beforeAd = null, Action afterAd = null, Action adDismissed = null, Action adViewed = null, Action<Error> onError = null)` | `adViewed` = grant reward; `adDismissed` = no reward. |
| `void ShowBanner(BannerPosition position = BannerPosition.Bottom, Action onShown = null, Action<Error> onError = null)` | |
| `void HideBanner(Action onHidden = null, Action<Error> onError = null)` | |
| `bool IsAdBlocked()` | |
| `bool IsAdShowing()` | True while an interstitial/rewarded call is in flight. |
| `bool IsRewardedAdAvailable()` | Best-effort readiness hint. |

---

## Defold (Lua)

A Lua-side `_ad_in_flight` flag rejects a second concurrent ad call (logs a warning and fires that call's `no_fill`).

| Signature | Description |
|-----------|-------------|
| `yes2sdk.ads_show_interstitial(placement, before_ad, after_ad, no_fill)` | `no_fill` fires on no ad / concurrent rejection. |
| `yes2sdk.ads_show_rewarded(placement, before_ad, after_ad, ad_dismissed, ad_viewed, no_fill)` | Grant rewards in `ad_viewed`, **not** `after_ad`. |
| `yes2sdk.ads_is_ad_showing()` | True while a call is in flight (Lua-side flag). |
| `yes2sdk.ads_is_rewarded_ad_available()` | Best-effort readiness hint. |

> Defold has no banner functions in the `ads_*` namespace (banners are a separate module; see [banners.md](banners.md)).
