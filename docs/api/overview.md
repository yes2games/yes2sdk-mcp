# Yes2SDK API Reference

Welcome to the Yes2SDK API reference. This is the single source of truth for the SDK surface: **every public function** across the three SDK surfaces — Core (TypeScript/JavaScript), Unity (C#), and Defold (Lua) — with, for each function, a clear view of **how it behaves on every platform**.

Start here for the support matrix and the status legend, then open any module page for full signatures and per-platform detail.

---

## How the SDK is accessed

| Surface | Import / access | Async style |
|---------|-----------------|-------------|
| **Core (TS/JS)** | `import Yes2SDK from '@yes2sdk/core'` → singleton. Modules via getters: `Yes2SDK.ads`, `Yes2SDK.player`, … | `Promise` / `async`; resolves with results, rejects with a structured `ErrorMessage` |
| **Unity (C#)** | `using Yes2SDK;` → static class. Modules via static props: `Yes2SDK.Ads`, `Yes2SDK.Player`, … | Callback overloads **and** `Task` + `CancellationToken` overloads (Task surfaces failures as `Yes2SDKException`) |
| **Defold (Lua)** | `local yes2sdk = require "yes2sdk.yes2sdk"` → flat module. Functions are prefixed: `yes2sdk.ads_show_interstitial(...)`, `yes2sdk.data_get_int(...)` | Last-argument callbacks `(self, success, payload)` |

All three bundle the **same Core SDK** and select the host platform automatically at runtime — each platform adapter loads only that platform's own SDK from its CDN. Write your game once; it runs everywhere Yes2SDK ships.

---

## Status legend

Each function is rated **per platform** so you always know what to expect:

| Status | Meaning |
|--------|---------|
| **Ready** | Fully integrated with the platform's own SDK. |
| **Partial** | Works today, with a sensible fallback or platform-specific scope (e.g. local storage, a browser-derived value). |
| **—** | Not offered by this platform. The call stays safe — it returns a clear `FeatureNotSupported` result or a no-op default — so a single codebase runs cleanly everywhere. |

Optional features degrade gracefully: guard them with `isSupported()` / `IsSupported()` and your integration behaves correctly on every platform, with zero special-casing required.

> **Growing fast.** A few more modules are already built into Core and on the rollout path — see [Upcoming modules](#upcoming-modules) below.

---

## Module pages

These modules are available today via `Yes2SDK.<module>` (Core), `Yes2SDK.<Module>` (Unity), and `yes2sdk.<module>_*` (Defold).

| Module | Page | What it does |
|--------|------|--------------|
| Lifecycle & events | [lifecycle.md](lifecycle.md) | Init, loading progress, start, pause/resume, audio |
| Ads | [ads.md](ads.md) | Interstitial, rewarded, banner |
| Analytics | [analytics.md](analytics.md) | Gameplay events, level/score/tutorial/purchase logging |
| Session | [session.md](session.md) | Locale, country, device, orientation, traffic source |
| Data | [data.md](data.md) | Typed key-value storage (PlayerPrefs-style) — the default for saved game state |
| Player | [player.md](player.md) | Identity, account-bound saved data, connected players |
| Auth | [auth.md](auth.md) | Sign-in, tokens, account linking |
| Game | [game.md](game.md) | Gameplay lifecycle, invite links, settings, clipboard |
| Banners | [banners.md](banners.md) | Positioned display banners (distinct from `ads` banner) |
| Friends | [friends.md](friends.md) | Paginated friends list |
| Score | [score.md](score.md) | Score submission (incl. encrypted) |
| Leaderboard | [leaderboard.md](leaderboard.md) | Named leaderboards: submit scores, read ranked entries |
| Stats | [stats.md](stats.md) | Numeric player statistics (get / set / increment) |
| IAP | [iap.md](iap.md) | In-app purchases: catalog, purchase, consume, subscriptions |
| Config | [config.md](config.md) | Remote configuration / feature flags |
| Review | [review.md](review.md) | In-game rating / feedback prompt |
| Errors | [errors.md](errors.md) | Error model, `ErrorCode`, exceptions |

---

## Platform support matrix

A module-level summary across the five live platforms. Per-method detail is on each module page.

| Module | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| Ads — interstitial & rewarded | Ready | Ready | Ready | Ready | Ready |
| Ads — banner | — | — | Ready | Ready | — |
| Analytics | Partial¹ | Partial¹ | Partial¹ | Partial¹ | Partial¹ |
| Session | Partial | Partial | Ready | Ready | Partial |
| Data | Partial² | Partial² | Ready | Ready | Ready |
| Player — identity | — | — | Partial | Ready | — |
| Player — saved data | Partial² | Partial² | Ready | Ready | Ready |
| Auth | — | — | Ready³ | Ready³ | — |
| Game — lifecycle | Ready | Partial⁴ | Ready | Ready | Partial⁴ |
| Game — invite links | Ready | — | Ready | — | — |
| Banners | — | — | Ready | Ready⁵ | — |
| Friends | — | — | Ready | — | — |
| Score | —⁶ | —⁶ | Ready | —⁶ | Ready |
| Leaderboard | — | — | — | Ready | — |
| Stats | — | — | — | Ready | — |
| IAP | — | — | — | Ready⁷ | — |
| Config — feature flags | Partial⁸ | Partial⁸ | Partial⁸ | Ready | Partial⁸ |
| Review — rating prompt | — | — | — | Ready | — |

¹ Custom analytics events are recorded locally; the gameplay-lifecycle calls (`logLevelStart`/`logLevelEnd`) drive each platform's real `gameplayStart`/`gameplayStop`. On YouTube, error/warning reporting also flows to the platform's `health` channel.
² Poki & GameDistribution don't expose a storage API, so Data and Player saved-data persist via namespaced `localStorage` (device-local). Player identity stays anonymous on these platforms.
³ Auth is available; platform sign-out isn't offered, and account-linking is CrazyGames-only.
⁴ GameDistribution and YouTube track gameplay via internal state — YouTube drives the real lifecycle through `firstFrameReady`/`gameReady`.
⁵ Yandex presents a single sticky banner; placement and size are managed for you, and refresh re-displays it.
⁶ Score submission isn't offered by these platforms; calls are recorded locally and are safe to keep in your code.
⁷ Yandex IAP covers products and purchases; subscriptions are not offered yet (`isSubscriptionSupported()` is `false` on every platform).
⁸ Config has no remote-config service on these platforms, so `getFlagsAsync` returns your provided `defaults` unchanged — always safe to call. Only Yandex serves remote overrides (`isSupported()` is `true` there only).

---

## Upcoming modules

A few more modules are already implemented in Core and on the rollout path. You can design against their API surface today and adopt them as platform support lands:

**Achievements · Context · Notifications · Tournament**

Full signatures and the rollout picture are in [upcoming.md](upcoming.md). These map directly to Facebook Instant Games capabilities on the platform roadmap (context, tournaments, notifications), so they're a natural next step.

### Module availability by surface

| Module | Core | Unity | Defold |
|--------|:----:|:-----:|:------:|
| Ads · Analytics · Session · Data · Player · Auth · Game · Banners · Friends · Score · Leaderboard · Stats · IAP · Config · Review | Available | Available | Coming soon¹⁰ |
| Achievements · Context · Notifications · Tournament | Built in (Core) | Coming soon | Coming soon |

- **Core** ships all module implementations; the live set above is wired to the `Yes2SDK.<module>` API today (including `iap`, `leaderboard`, `stats`, `config`, `review`, plus `achievements`, `tournament`, `context`, `notifications` on the surface), with full platform coverage landing as adapters do.
- **Unity** exposes all accessors; the upcoming modules return a clean `FeatureNotSupported` until their bridges ship.
- **Defold** ships the original 10 available modules today, with the newer ones on the roadmap.

¹⁰ Leaderboard / Stats / IAP / Config / Review are live in Core (and on Yandex) today; the Unity and Defold surface bindings are arriving with the platform rollout.

---

## Versions

| SDK | Version | Notes |
|-----|---------|-------|
| Core (TS) | see `Experimental/Core/package.json` | UMD bundle, injected by the dashboard build pipeline |
| Unity | `2.5.0` | Unity 2021.3+; WebGL build target |
| Defold | `1.5.1` | Defold 1.6+; HTML5 build target |

Live platforms across all surfaces: **Poki, CrazyGames, Yandex Games, GameDistribution, YouTube Playables**.
