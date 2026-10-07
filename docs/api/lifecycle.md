# Lifecycle & Events

The top-level entry point. Every game must initialize the SDK, report loading progress, and signal when it becomes playable. These are reached directly on the root object (`Yes2SDK` / `yes2sdk`), not on a sub-module.

[← Back to overview](overview.md)

---

## Lifecycle methods

### Core (TypeScript)

| Signature | Description |
|-----------|-------------|
| `initializeAsync(options?: InitializationOptions): Promise<void>` | Initialize the SDK. Must be called before any other SDK function. Detects the platform, loads platform code, initializes the platform SDK, and connects the platform. **Idempotent**: repeat calls return the in-flight/resolved promise. |
| `startGameAsync(): Promise<void>` | Signal the game is loaded and ready to display. Waits for `initializeAsync` if still running; throws `NOT_INITIALIZED` if init never started. No-ops if already started. Emits `gameStarted`. |
| `setLoadingProgress(progress: number): void` | Report loading progress, `0` to `100`. Throws `INVALID_PARAM` if out of range. Emits `loadingProgress`. Progress reported before `initializeAsync` completes is not lost: the latest value is applied once the platform initializes, where the platform has a loading-progress API. |
| `performHapticFeedback(): void` | Trigger haptic feedback where supported. No-ops (warns) before init. |
| `getPlatform(): Platform \| null` | The detected platform, or `null` before init. |
| `isInitialized` *(getter)* | `boolean`: whether init has completed. |

### Unity (C#)

| Signature | Description |
|-----------|-------------|
| `static void InitializeAsync(Action onSuccess = null, Action<Error> onError = null)` | Initialize; creates the `Bridge` GameObject. Editor simulates success. |
| `static Task InitializeAsync(CancellationToken cancellationToken)` | Task form; throws `Yes2SDKException` on failure. |
| `static void StartGameAsync(Action onSuccess = null, Action<Error> onError = null)` | Notify the platform the game is ready to play. |
| `static Task StartGameAsync(CancellationToken cancellationToken)` | Task form. |
| `static void SetLoadingProgress(int progress)` | Update loading progress (clamped 0-100). |
| `static void PerformHapticFeedback()` | Haptic feedback where supported. |
| `static Platform GetPlatform()` | Detected platform; `Platform.Debug` in Editor. |
| `static bool IsInitialized { get; }` | Whether init completed. |
| `static Platform CurrentPlatform { get; }` | Detected platform (default `Unknown`). |
| `static string Version { get; }` | SDK version string. |

### Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.initialize(callback)` | Initialize. `callback(self, success, err)` fires when init resolves. Register lifecycle subscriptions inside the success path. |
| `yes2sdk.start_game(callback)` | Signal the game is playable (drives the platform loading bar). Call inside the `initialize` success callback. |
| `yes2sdk.set_loading_progress(progress)` | Report post-engine loading progress (`0` to `100`). The engine template auto-reports the initial download. |
| `yes2sdk.get_platform()` | Host platform name string; `"unknown"`/`"editor"` when unavailable. |

### Loading on Jest

Jest draws its own loading screen. You choose its mode in Jest's Developer Console. It is not a Yes2Games dashboard setting. Jest has three modes: Auto, Manual and Off. Two of them matter here:

- **Auto (recommended).** Jest runs the loading screen itself. It is the simple default.
- **Manual.** Jest's overlay follows your loading progress and sends the player back to the Jest home screen if it gets no progress update for 15 seconds. Each `setLoadingProgress` call resets that timer. Once Yes2SDK has initialized, it re-sends your last progress every 10 seconds (capped at 99), so a slow load after init is safe. Manual is supported for bundles built by the dashboard, because they load the Jest SDK before the engine download, so progress reaches Jest from the start. A bundle built some other way should use Auto.

`startGameAsync()` (Unity `StartGameAsync`, Defold `start_game`) calls Jest's `markGameLoaded`. Jest accepts it in either mode, and in Manual mode it dismisses the loading overlay. Yes2SDK has no separate `markGameLoaded` method. Jest only uses `setLoadingProgress` in Manual mode. Keep calling it in both modes: it does no harm in Auto, and the same code then works on the other platforms. See the [Jest guide](/docs/jest) for the full setup.

---

## Events

External pauses (ads, tab focus loss, platform overlays), audio-mute changes, and the Yandex account-selection dialog are delivered as events. Handle them so your game mutes audio and pauses gameplay.

### Core (TypeScript)

Subscribe with `on()`, which returns a handle. There is no separate `off()`:

```ts
const sub = Yes2SDK.on("pause", () => pauseGame());
// later:
sub.unsubscribe();
```

`on<K extends keyof SDKEvents>(event, listener): { unsubscribe: () => void }`

| Event | Payload | Description |
|-------|---------|-------------|
| `initialized` | `{ platform: Platform }` | Init completed. |
| `gameStarted` | `void` | `startGameAsync()` completed. |
| `error` | `{ context: string; error: unknown }` | Init/start error. |
| `loadingProgress` | `{ progress: number }` | Each `setLoadingProgress` call. |
| `pause` | `void` | Platform requested pause (backgrounded, overlay, ad). Falls back to `document.visibilitychange` where no native signal exists. |
| `resume` | `void` | Platform allows resume. **Not** guaranteed to follow every `pause`. |
| `audioEnabledChange` | `{ enabled: boolean }` | Platform mute/unmute (via platform UI). Game **MUST** update its audio state. Emitted only where a native signal exists. |
| `accountDialogOpen` | `void` | Yandex account-selection dialog opened. **Yandex-only**; pause gameplay/audio while it is open. |
| `accountDialogClose` | `void` | Yandex account-selection dialog closed. **Yandex-only**; resume gameplay/audio. |
| `exitRequested` | `void` | The platform started its exit flow (back navigation or a platform close control). The player has not confirmed yet, so do not tear the game down. Save recent progress **synchronously** inside the handler; Yes2SDK flushes player data right after the handler returns. Async work started in the handler is not awaited. **Jest only**: never emitted on Poki, GameDistribution, CrazyGames, Yandex or YouTube. |

Saving on `exitRequested`:

```ts
Yes2SDK.on("exitRequested", () => {
  // Synchronous writes only; the flush happens after this handler returns.
  Yes2SDK.data.setString("checkpoint", JSON.stringify(game.snapshot()));
});
```

### Unity (C#)

Static events on `Yes2SDK`. Subscribe **after** `InitializeAsync` succeeds.

| Event | Description |
|-------|-------------|
| `static event Action OnInitialized` | After successful init. |
| `static event Action OnGameStarted` | After StartGame acknowledged. |
| `static event Action OnPause` | Platform requests pause. |
| `static event Action OnResume` | Platform allows resume. |
| `static event Action<bool> OnAudioEnabledChange` | Mute/unmute changed. |
| `static event Action OnAccountDialogOpen` | Yandex account-selection dialog opened (pause). Yandex-only. |
| `static event Action OnAccountDialogClose` | Yandex account-selection dialog closed (resume). Yandex-only. |
| `static event Action OnExitRequested` | The platform started its exit flow and the player has not confirmed yet. Save synchronously in the handler with `Data.SetString`, `SetInt` or `SetFloat`; the SDK flushes player data right after the handler returns. Async work is not awaited. Jest only; not raised on platforms that do not report an exit. |
| `static event Action<Error> OnError` | An SDK error occurred. |

```csharp
Yes2SDK.Yes2SDK.OnExitRequested += () =>
{
    // Synchronous writes only; the flush happens after this handler returns.
    Yes2SDK.Yes2SDK.Data.SetString("checkpoint", game.SnapshotJson());
};
```

In the Editor, the **Simulate exit request** button (Yes2SDK > Build Window > Play Mode Testing) raises `OnExitRequested` in Play Mode.

### Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.on_pause(callback)` | `callback(self)`. Stop loop/audio/network. |
| `yes2sdk.on_resume(callback)` | `callback(self)`. |
| `yes2sdk.on_audio_enabled_change(callback)` | `callback(self, enabled)` (boolean). |
| `yes2sdk.on_account_dialog_open(callback)` | `callback(self)`. Yandex account switcher opened. Pause. Yandex-only. |
| `yes2sdk.on_account_dialog_close(callback)` | `callback(self)`. Yandex account switcher closed. Resume. Yandex-only. |
| `yes2sdk.on_exit_requested(callback)` | `callback(self)`. The platform started its exit flow and the player has not confirmed yet. Save synchronously inside the handler (for example with `data_set_string`); the SDK flushes player data right after it returns, and async work started there is not awaited. Register after `initialize` has called back. Jest only. |

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

yes2sdk.on_exit_requested(function(self)
    -- Synchronous writes only; the flush happens after this handler returns.
    yes2sdk.data_set_string("checkpoint", json.encode(snapshot()))
end)
```

---

## `InitializationOptions` (Core)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `debug` | `boolean` | `false` | Enable debug-level logging. |
| `manualInit` | `boolean` | `false` | Skip automatic platform SDK init; also disables auto-preroll. |
| `gameId` | `string` | None | Game ID override; also namespaces the `localStorage` data fallback. |
| `skipAdPreload` | `boolean` | `false` | Skip ad preloading during init. |
| `ads` | `AdsConfig` | None | Ads config; merged over `window.__yes2sdkConfig.ads` (these win). |

**`AdsConfig`**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `preroll` | `boolean` | `false` | Auto-show an interstitial once the platform SDK is ready. Skipped where interstitials are unsupported; never blocks init. |
| `prerollPlacement` | `string` | `"preroll"` | Placement identifier for the auto-preroll ad. |

---

## `Platform`

String union (Core) / enum (Unity).

**Core:** `"facebook" | "yandex" | "poki" | "crazygames" | "gamedistribution" | "youtube" | "jest" | "debug" | "portal"` (also exported as `PLATFORMS` array + `isPlatform()` type guard). On Jest the id is `"jest"`.

**Unity enum:** `Unknown, Poki, CrazyGames, Yandex, GameDistribution, YouTube, Debug`. There is no Jest member, so `GetPlatform()` returns `Platform.Unknown` on Jest.

**Defold:** `yes2sdk.get_platform()` returns the Core id string, so `"jest"` on Jest.

> Production platforms with shipping adapters today: **Poki, CrazyGames, Yandex, GameDistribution, YouTube, Jest**. `debug` is the local fallback; the other Core values are reserved for planned adapters. See the [Jest guide](/docs/jest).

---

## Integration checklist

A build is accepted when:

- [ ] `initialize` is called at startup
- [ ] `setLoadingProgress` is called as assets load
- [ ] `startGame` is called when the game becomes playable
- [ ] `pause` / `resume` are handled (mute audio, pause gameplay)
- [ ] `audioEnabledChange` (and `isAudioEnabled`) is honored: required for YouTube Playables certification
- [ ] Interstitials run at natural break points; rewarded grants reward only on the "viewed" callback
- [ ] `gameplayStop` before every ad, `gameplayStart` after; gameplay resumes in both the after-ad and error paths

The QA Inspector in the dashboard validates this automatically.
