# Yes2SDK — AGENTS rules

Rules for integrating Yes2SDK with an AI coding assistant. Works as Cursor rules,
Windsurf rules, GitHub Copilot instructions, or a Claude `CLAUDE.md`. Follow these
to call the SDK correctly the first time and avoid the platform rejections below.

Only use the methods documented here and in the linked docs. Do not invent SDK
methods. When unsure, fetch the full corpus.

- Per-platform guides: `/docs/raw/quickstart-<platform>` (poki, crazygames, yandex,
  gamedistribution, youtube)
- API reference: `/docs/raw/api/<module>` (overview, lifecycle, ads, game, session,
  data, score, player, auth, banners, friends, analytics, errors)

## The unified API

Yes2SDK exposes one API surface that works across all five platforms. The same
calls map to each platform's native SDK under the hood — you never call the
platform SDK directly. Only the method-naming convention differs per engine:

- TypeScript / JavaScript: `Yes2SDK.*` (e.g. `Yes2SDK.ads.showInterstitial(...)`,
  `Yes2SDK.game.gameplayStart()`)
- Unity (C#): `Yes2SDK.Yes2SDK.*` (e.g. `Yes2SDK.Yes2SDK.Ads.ShowInterstitial(...)`)
- Defold (Lua): `yes2sdk.*` (e.g. `yes2sdk.ads_show_interstitial(...)`,
  `yes2sdk.session_gameplay_start()`)

## Universal rules

1. **Initialize before any other call.** `initializeAsync()` must resolve before
   any SDK call. Then call `startGameAsync()` once the game is actually loaded and
   interactable — never during a loading screen.
2. **Gate unsupported features.** Not every platform supports every module. Guard
   optional features with `isSupported()` (e.g. `auth.isSupported()`,
   `banners.isSupported()`) when you share code across platforms. Unsupported calls
   return `FeatureNotSupported`.
3. **Follow the gameplay/ad loop:**
   ```
   initializeAsync()
   startGameAsync()
   game.gameplayStart()
   [player plays]
   game.gameplayStop()          // BEFORE showing any ad
   ads.showInterstitial(...)
   game.gameplayStart()         // resume after the ad
   ```
4. **Pause during ads, resume after.** Mute audio and pause the game loop in the
   `beforeAd` callback; restore audio and resume in `afterAd`. `afterAd` fires
   whether or not an ad actually played.
5. **Reward only on full view.** For rewarded ads, grant the reward in the
   `adViewed` callback only — never in `afterAd` (which runs even on dismissal).
6. **No external scripts.** All platforms sandbox/strip external
   `<script src="http...">`. All third-party code must be inlined or bundled; the
   Yes2SDK Dashboard bundles the SDK into your build.

## Per-platform gotchas

### Poki (`/docs/raw/quickstart-poki`)
- Call `game.gameplayStop()` before **every** interstitial.
- Call `game.gameplayStart()` at least once before showing any ad.
- No ads in the first 30 seconds of gameplay.
- Max one interstitial per 60 seconds (frequency cap).
- No ads during loading (before `startGameAsync()` resolves).
- Grant rewards only in `adViewed`, never `afterAd`.
- Handle the `noFill` callback (not `onError`) to resume when no ad is available.
- No `auth`, `banners`, or cloud player data — data uses `localStorage`.
- Canvas must be responsive (100% width/height, no scrollbars).

### CrazyGames (`/docs/raw/quickstart-crazygames`)
- Init must pass wrapper options `{ wrapper: { engine, sdkVersion } }` (handled by
  `initializeAsync()`); missing this is an instant QA rejection.
- Report loading: `setLoadingProgress(n)` triggers `loadingStart()`;
  `startGameAsync()` triggers `loadingStop()`.
- Bracket active gameplay with `gameplayStart()` / `gameplayStop()` — CG's QA tool
  checks for this. No ads during active gameplay.
- Mute audio during ads (CG QA checks audio).
- CG enforces a 3-minute minimum between interstitials server-side.
- On ad error, check `adError.code`: `'unfilled'` / `'adblock'` mean no-fill, not a
  dismissal.
- Supports `auth`, `friends`, `banners`, and cloud `data`.

### Yandex Games (`/docs/raw/quickstart-yandex`)
- `startGameAsync()` is required or the loading screen never dismisses.
- Required: handle pause/resume — `Yes2SDK.on('pause', ...)` / `on('resume', ...)`
  to mute audio during ads.
- Call `game.gameplayStop()` before every ad.
- Read `session.getLocale()` and localize (common: `ru`, `en`, `tr`, `uk`, `be`,
  `kk`).
- Cloud data via `data.*` (per-player; persistent saves need auth, otherwise
  device-local). Auth is optional — Yandex supports anonymous play.
- Optional sticky bottom banner via `ads.showBanner('bottom')`.

### GameDistribution (`/docs/raw/quickstart-gamedistribution`)
- `gameId` must be set before the SDK loads — the Dashboard injects it; set it in
  Platform Keys.
- Event-driven under the hood; Yes2SDK wraps it so `await ads.show*` still works.
- Mute/pause on `beforeAd` (fires from `SDK_GAME_PAUSE`); resume on `afterAd`
  (fires from `SDK_GAME_START`).
- Grant rewards only in `adViewed` (from `SDK_REWARDED_WATCH_COMPLETE`) — `afterAd`
  runs even on dismissal.
- No external scripts beyond GD's own SDK.
- No `auth`, `banners`, `friends`, or cloud player data — data uses `localStorage`.
- Revenue is reported in EUR (Dashboard normalizes to USD).

### YouTube Playables (`/docs/raw/quickstart-youtube`)
- Strictest certification. Several APIs are cert-mandatory:
  - `initializeAsync()` fires `firstFrameReady()` after first paint — don't block
    the first paint with synchronous work.
  - `startGameAsync()` fires `gameReady()` — call it only when the game is fully
    loaded and interactable, never during loading.
  - Required: `Yes2SDK.on('pause', ...)` must stop the game loop, audio, and
    network. Never assume `onResume` will fire.
  - Required: honor audio — read `session.isAudioEnabled()` at startup and
    subscribe to `Yes2SDK.on('audioEnabledChange', ...)`; mute when YouTube mutes.
- No external scripts (CSP sandbox).
- Cloud saves via `data.*` are capped at 3 MiB serialized.
- Submit every score with `score.addScore(n)` — YouTube displays the highest.
- No `banners`, `auth`, `friends`, or IAP.

## Before you ship

- Test the build in the **Inspector** (Onboarding → Stage 3). It runs the SDK
  basics and pause/resume/audio checks — pay extra attention for YouTube.
- Click **Request Publish** (Onboarding → Stage 4) and select your platforms. You
  don't upload to platforms yourself; the Yes2Games team validates and submits on
  your behalf, and you'll see status (`pending_review` → `reviewing` → `approved` /
  `needs_changes`) and feedback on the game page.
