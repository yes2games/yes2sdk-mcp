# Testing with the Mock (JavaScript / TypeScript)

> `@yes2games/js/mock` is a local-development stand-in for `window.Yes2SDK`: fake ads with an on-screen overlay, a mock IAP catalog, `localStorage` saves and controls to simulate platform events. It never replaces the real SDK in a dashboard-bundled build.

The mock is the JavaScript counterpart of the Unity [Editor Simulation](/docs/unity-editor-simulation). It reports its platform as `"debug"`, logs every call with a `[Yes2SDK] Mock:` prefix, and sets `window.Yes2SDK.isMock` to `true`.

## Install it

| Context | How |
| --- | --- |
| Bundler (Vite etc.) | `if (import.meta.env.DEV) { (await import("@yes2games/js/mock")).installYes2SDKMock(options) }` |
| Plain `<script>` | `<script src="yes2sdk-mock.js"></script>` before your game scripts. Set options in `window.__yes2sdkMockOptions = {...}` before the tag. |
| Unit tests | `createYes2SDKMock(options)` returns a mock instance without touching `window`. |

For a no-build game, copy the classic-script file from the npm package: `node_modules/@yes2games/js/mock/dist/yes2sdk-mock.js`.

Once installed, the controls are on `window.Yes2SDKMock`.

## Why it never ships

`installYes2SDKMock()` returns `null` and does nothing when `window.__yes2sdkConfig` or a non-mock `window.Yes2SDK` already exists. When the dashboard bundles your game, it inserts the real SDK before your first `<script>` tag, and both of those globals are set before your code runs.

- **Bundled games:** import the mock only under `import.meta.env.DEV`. Vite sets that to `false` in `vite build`, so the mock is not in `dist/` at all.
- **No-build games:** the `<script src="yes2sdk-mock.js">` tag may stay in your upload. The dashboard removes the tag and deletes the file when it bundles your game. If it ever survived, it would run after the injected SDK, see it and do nothing.

Your own copy of `@yes2games/js` (bundled, or as `yes2-runtime.js`) is part of your game and stays in the zip. Only the mock is removed.

## What it does

| Module | Mock behaviour |
| --- | --- |
| core | `initializeAsync` and `startGameAsync` resolve on the next frame. `startGameAsync` rejects with `NOT_INITIALIZED` before init. |
| session | Locale `"en"`, device `"desktop"`, orientation `"landscape"`, audio enabled, entry point `"direct"`, entry data `{}` (configurable). |
| ads | **normal**: `beforeAd`, then 3 s (interstitial) or 5 s (rewarded), then the outcome (rewarded), then `afterAd`. **nofill / adblocked / error**: no `beforeAd`, then `noFill` and `afterAd`. *adblocked* and *error* then reject with `ADS_BLOCKED` / `PLATFORM_ERROR`, and *adblocked* makes `isAdBlocked()` true. |
| ad overlay | On by default. A full-screen overlay that blocks input, with a countdown. Interstitials have **Close**; rewarded ads have **Claim Reward** (`adViewed`) and **Skip** (`adDismissed`). When the countdown ends, the configured outcome is used. |
| iap | Catalog: `yes2.mock.coins.small` $0.99, `yes2.mock.coins.large` $4.99, `yes2.mock.noads` $2.99. Purchases last for the session. With the overlay on, a Buy / Cancel dialog appears. A second purchase while one is open rejects with `INVALID_OPERATION`. Subscriptions are unsupported. |
| data | `localStorage` with the SDK's `yes2sdk_` prefix. |
| player | Anonymous player. `getDataAsync` / `setDataAsync` use a JSON store. |
| leaderboard, stats, friends, auth sign-in, achievements, tournament, context, notifications, referrals, config, review | `isSupported()` is `false`; async calls reject with `FEATURE_NOT_SUPPORTED`. |
| banners, score | Log only; `isSupported()` is `false`. |
| game, analytics | Log. `game.gameplayStart/Stop` and `analytics.logLevelStart/End` share one gameplay flag. |

Because the optional modules report unsupported, the mock also exercises your `isSupported()` guards. Test the supported path of those modules on the platform itself, through the dashboard's Inspector.

## Settings

Settings come from the options object and the `?yes2mock=` query parameter, and are saved in `localStorage` (`yes2sdk-mock-settings`) so they survive reloads. Precedence: defaults, then saved, then options in code, then the query.

| Setting | Values | Default |
| --- | --- | --- |
| `adResult` | `normal`, `nofill`, `adblocked`, `error` | `normal` |
| `rewardedOutcome` | `viewed`, `dismissed` | `viewed` |
| `interstitialSeconds` / `rewardedSeconds` | number | 3 / 5 |
| `overlay` | boolean | `true` in a browser |
| `iapResult` | `normal`, `fail`, `cancel` | `normal` |
| `audioEnabled` | boolean | `true` |
| `entryPointData` | object | `{}` |
| `silent` | boolean | `false` |

Query examples:

- `?yes2mock=nofill`: every ad no-fills. Check that your game resumes.
- `?yes2mock=adblocked,dismissed`
- `?yes2mock=iap:cancel,overlay:off,interstitial:1`
- `?yes2mock=reset`: forget saved settings.

## Controls

Run these from the browser console:

```js
Yes2SDKMock.simulate("pause");                 // also "resume", "exitRequested"
Yes2SDKMock.simulate("audioEnabledChange");    // toggles; or pass true / false
Yes2SDKMock.configure({ adResult: "nofill" }); // saved, like query settings
Yes2SDKMock.settings;                          // current settings
Yes2SDKMock.reset();                           // back to defaults
Yes2SDKMock.clearStorage();                    // remove saved game data
```

## A test pass before you upload

1. Play a level with `normal` ads. The game pauses and goes quiet while the overlay is up, and resumes after **Close**.
2. Claim a rewarded ad, then reload with `?yes2mock=dismissed` and skip one. The reward is granted only for the claim.
3. Reload with `?yes2mock=nofill`. Every ad call resumes the game straight away and no reward is granted.
4. Run `Yes2SDKMock.simulate("pause")` and `simulate("resume")` mid-level, then toggle `audioEnabledChange`. The game pauses, resumes and mutes with them.
5. Reload the page. Saved data (`Yes2SDK.data`) is still there.
6. Reload with `?yes2mock=reset`. Query settings are saved, so this puts ads back to `normal`.

Then build, upload and run the build in the dashboard's Inspector, which checks the real SDK's behaviour (see the [Dashboard Guide](/docs/dashboard-guide)).
