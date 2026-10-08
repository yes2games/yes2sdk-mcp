# Yes2SDK API Reference

Welcome to the Yes2SDK API reference. This is the single source of truth for the SDK surface: **every public function** across the three SDK surfaces (Core in TypeScript/JavaScript, Unity in C#, and Defold in Lua), with, for each function, a clear view of **how it behaves on every platform**.

Start here for the support matrix and the status legend, then open any module page for full signatures and per-platform detail.

---

## How the SDK is accessed

| Surface | Import / access | Async style |
|---------|-----------------|-------------|
| **Core (TS/JS)** | `import Yes2SDK from '@yes2sdk/core'` → singleton. Modules via getters: `Yes2SDK.ads`, `Yes2SDK.player`, … | `Promise` / `async`; resolves with results, rejects with a structured `ErrorMessage` |
| **Unity (C#)** | `using Yes2SDK;` → static class. Modules via static props: `Yes2SDK.Ads`, `Yes2SDK.Player`, … | Callback overloads **and** `Task` + `CancellationToken` overloads (Task surfaces failures as `Yes2SDKException`) |
| **Defold (Lua)** | `local yes2sdk = require "yes2sdk.yes2sdk"` → flat module. Functions are prefixed: `yes2sdk.ads_show_interstitial(...)`, `yes2sdk.data_get_int(...)` | Last-argument callbacks `(self, success, payload)` |

All three bundle the **same Core SDK** and select the host platform automatically at runtime. Each platform adapter loads only that platform's own SDK from its CDN. Write your game once; it runs everywhere Yes2SDK ships.

---

## Status legend

Each function is rated **per platform** so you always know what to expect:

| Status | Meaning |
|--------|---------|
| **Ready** | Fully integrated with the platform's own SDK. |
| **Partial** | Works today, with a sensible fallback or platform-specific scope (e.g. local storage, a browser-derived value). |
| **None** | Not offered by this platform. The call stays safe: it returns a clear `FeatureNotSupported` result or a no-op default, so a single codebase runs cleanly everywhere. |

Optional features degrade gracefully: guard them with `isSupported()` / `IsSupported()` and your integration behaves correctly on every platform, with zero special-casing required.

> **Growing fast.** A few more modules are already built into Core and on the rollout path. See [Upcoming modules](#upcoming-modules) below.

---

## Module pages

These modules are available today via `Yes2SDK.<module>` (Core), `Yes2SDK.<Module>` (Unity), and `yes2sdk.<module>_*` (Defold).

| Module | Page | What it does |
|--------|------|--------------|
| Lifecycle & events | [lifecycle.md](lifecycle.md) | Init, loading progress, start, pause/resume, audio |
| Ads | [ads.md](ads.md) | Interstitial, rewarded, banner |
| Analytics | [analytics.md](analytics.md) | Gameplay events, level/score/tutorial/purchase logging |
| Session | [session.md](session.md) | Locale, country, device, orientation, traffic source |
| Data | [data.md](data.md) | Typed key-value storage (PlayerPrefs-style): the default for saved game state |
| Player | [player.md](player.md) | Identity, account-bound saved data, connected players |
| Auth | [auth.md](auth.md) | Sign-in, tokens, account linking |
| Game | [game.md](game.md) | Gameplay lifecycle, invite links, settings, clipboard |
| Banners | [banners.md](banners.md) | Positioned display banners (distinct from `ads` banner) |
| Friends | [friends.md](friends.md) | Paginated friends list |
| Score | [score.md](score.md) | Score submission (incl. encrypted) |
| Leaderboard | [leaderboard.md](leaderboard.md) | Named leaderboards: submit scores, read ranked entries |
| Stats | [stats.md](stats.md) | Numeric player statistics (get / set / increment) |
| IAP | [iap.md](iap.md) | In-app purchases: catalog, purchase, consume, subscriptions |
| Referrals | [referrals.md](referrals.md) | Share an invite link and list players who joined through it |
| Config | [config.md](config.md) | Remote configuration / feature flags |
| Review | [review.md](review.md) | In-game rating / feedback prompt |
| Errors | [errors.md](errors.md) | Error model, `ErrorCode`, exceptions |

---

## Platform support matrix

A module-level summary across the six live platforms. Per-method detail is on each module page.

| Module | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| Ads: interstitial & rewarded | Ready | Ready | Ready | Ready | Ready | None⁹ |
| Ads: banner | None | None | Ready | Ready | None | None |
| Analytics | Partial¹ | Partial¹ | Partial¹ | Partial¹ | Partial¹ | Partial¹⁰ |
| Session | Partial | Partial | Ready | Ready | Partial | Partial¹³ |
| Data | Partial² | Partial² | Ready | Ready | Ready | Ready¹¹ |
| Player: identity | None | None | Partial | Ready | None | Ready¹⁴ |
| Player: saved data | Partial² | Partial² | Ready | Ready | Ready | Ready¹¹ |
| Auth | None | None | Ready³ | Ready³ | None | Ready³ |
| Game: lifecycle | Ready | Partial⁴ | Ready | Ready | Partial⁴ | Partial¹⁰ |
| Game: invite links | Ready | None | Ready | None | None | None¹² |
| Banners | None | None | Ready | Ready⁵ | None | None |
| Friends | None | None | Ready | None | None | None |
| Score | None⁶ | None⁶ | Ready | None⁶ | Ready | None⁶ |
| Leaderboard | None | None | None | Ready | None | None |
| Stats | None | None | None | Ready | None | None |
| IAP | None | None | None | Ready⁷ | None | Ready⁷ |
| Referrals | None | None | None | None | None | Ready¹² |
| Notifications | None | None | None | None | None | Ready¹⁵ |
| Context: image sharing | None | None | None¹⁶ | None | None | Partial¹⁶ |
| Config: feature flags | Partial⁸ | Partial⁸ | Partial⁸ | Ready | Partial⁸ | Partial⁸ |
| Review: rating prompt | None | None | None | Ready | None | None |

¹ Custom analytics events are recorded locally; the gameplay-lifecycle calls (`logLevelStart`/`logLevelEnd`) drive each platform's real `gameplayStart`/`gameplayStop`. On YouTube, error/warning reporting also flows to the platform's `health` channel.
² Poki & GameDistribution don't expose a storage API, so Data and Player saved-data persist via namespaced `localStorage` (device-local). Player identity stays anonymous on these platforms.
³ Auth is available; platform sign-out isn't offered, and account-linking is CrazyGames-only. Jest also offers `showRegistrationPrompt`, for guests only: Jest draws a minimal overlay with the required legal text and a close button, and your game supplies the rest, its own copy and buttons wired to the returned `login` and `close` actions. The `message` option is the text pre-filled in the player's messaging app.
⁴ GameDistribution and YouTube track gameplay via internal state. YouTube drives the real lifecycle through `firstFrameReady`/`gameReady`.
⁵ Yandex presents a single sticky banner; placement and size are managed for you, and refresh re-displays it.
⁶ Score submission isn't offered by these platforms; calls are recorded locally and are safe to keep in your code.
⁷ Yandex IAP covers products and purchases. Jest covers products, purchases, recovery of incomplete purchases at startup, and subscriptions. Subscriptions are offered on Jest only: `isSubscriptionSupported()` is `true` on Jest and `false` on the other five platforms.
⁸ Config has no remote-config service on these platforms, so `getFlagsAsync` returns your provided `defaults` unchanged. Always safe to call. Only Yandex serves remote overrides (`isSupported()` is `true` there only).
⁹ Jest has no ads. The calls stay safe and never show an ad. Core: `noFill` then `afterAd`. Defold: `no_fill` then `after_ad`. Unity: `onError` with `NoFill` (check `error.Code`), and no `afterAd` follows, so Unity games resume in `onError` on a no-fill, and in `afterAd` only when an ad actually ran, which never happens on Jest.
¹⁰ Jest has no gameplay start or stop signal. `gameplayStart`/`gameplayStop` and `logLevelStart`/`logLevelEnd` are logged only, and custom analytics events are recorded locally. `startGameAsync()` (Unity `StartGameAsync`, Defold `start_game`) tells Jest the game has loaded. Jest also fires `exitRequested` when the player starts to leave: save synchronously in the handler, and Yes2SDK flushes player data right after.
¹¹ On Jest, Data and Player saved data share one Jest player store that persists across sessions and devices, limited to 1 MB per game per player. Writes past the limit fail.
¹² Jest invites go through Referrals (`referrals.shareAsync`), not invite links. Jest counts an invited player once they complete registration.
¹³ On Jest, `session.getEntryPointData()` returns Jest's entry payload, the `data` attached to the referral, notification, registration prompt or image share the player arrived through. The page URL is never read. `getCountry()` returns `""` and `isAudioEnabled()` is always `true`.
¹⁴ Jest gives every player, guest or registered, a stable id. Jest also generates avatars for bots (`player.getBotAvatarAsync`; check `isBotAvatarSupported()` first). The signed player (`player.getSignedPlayerInfoAsync`) returns `{ playerId, signature }`: verify the signature on a server before you trust it (see [Server Verification](/docs/jest#server-verification)).
¹⁵ Notifications are offered on Jest only, for registered players: a guest gets `PLAYER_NOT_AUTHENTICATED`. Jest asks for a D1 to D7 sequence, at least one notification per day for the next seven days. There is no method to list scheduled notifications, and `cancelAllAsync()` cancels only the notifications scheduled in the current page session.
¹⁶ Jest supports image sharing only (`context.shareAsync`, Unity `Context.ShareImageAsync`, Defold `context_share`). `isSupported()` is `false` on Jest, but sharing an image works, so do not gate it on `isSupported()`. The context is always solo: `getContext()`, `getType()` and `isSizeBetween()` answer for a solo context, and `getPlayersAsync`, `switchAsync`, `chooseAsync`, `createAsync` and `updateAsync` report `FEATURE_NOT_SUPPORTED`. On CrazyGames, `context.shareAsync` shows CrazyGames' invite button and ignores `image` and `data`, so skip the call there. On Poki, GameDistribution, Yandex and YouTube it reports `FEATURE_NOT_SUPPORTED`.

---

## Upcoming modules

Two more modules are implemented in Core and not offered on any current platform yet. You can design against their API surface today and adopt them as platform support lands. Notifications and Context image sharing already work on Jest and are in the [support matrix](#platform-support-matrix) above.

**Achievements · Tournament**

| Module | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| Achievements | None | None | None | None | None | None |
| Tournament | None | None | None | None | None | None |

Full signatures and the rollout picture are in [upcoming.md](upcoming.md). These map directly to Facebook Instant Games capabilities on the platform roadmap, so they're a natural next step.

### Module availability by surface

| Module | Core | Unity | Defold |
|--------|:----:|:-----:|:------:|
| Ads · Analytics · Session · Data · Player · Auth · Game · Banners · Friends · Score · Leaderboard · Stats · IAP · Config · Review | Available | Available | Available |
| Referrals · Notifications | Available | Available | Available |
| Context | Available | Image sharing only | Image sharing only |
| Achievements · Tournament | Available | Accessor only | Not exposed |

- **Core 2.10.0** wires every module to the `Yes2SDK.<module>` API, including `referrals`, `notifications`, `context`, `achievements` and `tournament`. On every current platform, Achievements and Tournament calls report `FEATURE_NOT_SUPPORTED`, except `tournament.getCurrentAsync()`, which resolves `null` (no current tournament) instead of rejecting.
- **Unity 2.10.0** exposes every module, including `Referrals`, `Notifications` and IAP subscriptions. `Context.ShareImageAsync` (and the older `Context.ShareAsync`) shares an image. `SwitchAsync`, `ChooseAsync` and `CreateAsync` return `FeatureNotSupported`, and `Context.IsSupported()` is always `false`, so do not gate image sharing on it. The Achievements and Tournament accessors return `FeatureNotSupported`.
- **Defold 1.8.0** exposes every module except Achievements and Tournament, including `referrals_*`, `notifications_*` and IAP subscriptions. Context is `context_share` plus the `context_is_supported()` hint. The newer calls need Yes2SDK runtime 2.10.0; older runtimes report `FEATURE_NOT_SUPPORTED` for them.
- **Core 2.11.0, Unity 2.12.0 and Defold 1.9.0** add bot avatars to Player (`getBotAvatarAsync` and `isBotAvatarSupported`, Jest only), the Jest-only `onboardingSlug` and `notificationTemplates` options to `referrals.shareAsync`, and allow an empty notification title.

---

## Versions

| SDK | Version | Notes |
|-----|---------|-------|
| Core (TS) | `2.11.0` | UMD bundle, injected by the dashboard build pipeline |
| Unity | `2.12.0` | Unity 2021.3+; WebGL build target |
| Defold | `1.9.0` | Defold 1.10.2+; HTML5 build target |

Live platforms across all surfaces: **Poki, CrazyGames, Yandex Games, GameDistribution, YouTube Playables, [Jest](/docs/jest)**.

On Jest, Core reports the platform id `"jest"`. In Unity, `GetPlatform()` returns `Platform.Jest` from 2.11.0 (2.10.0 returns `Platform.Unknown` there).
