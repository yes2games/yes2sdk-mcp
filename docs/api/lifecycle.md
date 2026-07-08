# Lifecycle & Events

The top-level entry point. Every game must initialize the SDK, report loading progress, and signal when it becomes playable. These are reached directly on the root object (`Yes2SDK` / `yes2sdk`), not on a sub-module.

[← Back to overview](overview.md)

---

## Lifecycle methods

### Core (TypeScript)

| Signature | Description |
|-----------|-------------|
| `initializeAsync(options?: InitializationOptions): Promise<void>` | Initialize the SDK. Must be called before any other SDK function. Detects the platform, loads platform code, initializes the platform SDK, and wires strategies. **Idempotent** — repeat calls return the in-flight/resolved promise. |
| `startGameAsync(): Promise<void>` | Signal the game is loaded and ready to display. Waits for `initializeAsync` if still running; throws `NOT_INITIALIZED` if init never started. No-ops if already started. Emits `gameStarted`. |
| `setLoadingProgress(progress: number): void` | Report loading progress, `0`–`100`. Throws `INVALID_PARAM` if out of range. Emits `loadingProgress`. |
| `performHapticFeedback(): void` | Trigger haptic feedback where supported. No-ops (warns) before init. |
| `getPlatform(): Platform \| null` | The detected platform, or `null` before init. |
| `isInitialized` *(getter)* | `boolean` — whether init has completed. |

### Unity (C#)

| Signature | Description |
|-----------|-------------|
| `static void InitializeAsync(Action onSuccess = null, Action<Error> onError = null)` | Initialize; creates the `Bridge` GameObject. Editor simulates success. |
| `static Task InitializeAsync(CancellationToken cancellationToken)` | Task form; throws `Yes2SDKException` on failure. |
| `static void StartGameAsync(Action onSuccess = null, Action<Error> onError = null)` | Notify the platform the game is ready to play. |
| `static Task StartGameAsync(CancellationToken cancellationToken)` | Task form. |
| `static void SetLoadingProgress(int progress)` | Update loading progress (clamped 0–100). |
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
| `yes2sdk.set_loading_progress(progress)` | Report post-engine loading progress (`0`–`1`). The engine template auto-reports the initial download. |
| `yes2sdk.get_platform()` | Host platform name string; `"unknown"`/`"editor"` when unavailable. |

---

## Events

External pauses (ads, tab focus loss, platform overlays), audio-mute changes, and the Yandex account-selection dialog are delivered as events. Handle them so your game mutes audio and pauses gameplay.

### Core (TypeScript)

Subscribe with `on()`, which returns a handle — there is no separate `off()`:

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
| `static event Action<Error> OnError` | An SDK error occurred. |

### Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.on_pause(callback)` | `callback(self)`. Stop loop/audio/network. |
| `yes2sdk.on_resume(callback)` | `callback(self)`. |
| `yes2sdk.on_audio_enabled_change(callback)` | `callback(self, enabled)` (boolean). |
| `yes2sdk.on_account_dialog_open(callback)` | `callback(self)`. Yandex account switcher opened — pause. Yandex-only. |
| `yes2sdk.on_account_dialog_close(callback)` | `callback(self)`. Yandex account switcher closed — resume. Yandex-only. |

---

## `InitializationOptions` (Core)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `debug` | `boolean` | `false` | Enable debug-level logging. |
| `manualInit` | `boolean` | `false` | Skip automatic platform SDK init; also disables auto-preroll. |
| `gameId` | `string` | — | Game ID override; also namespaces the `localStorage` data fallback. |
| `skipAdPreload` | `boolean` | `false` | Skip ad preloading during init. |
| `ads` | `AdsConfig` | — | Ads config; merged over `window.__yes2sdkConfig.ads` (these win). |

**`AdsConfig`**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `preroll` | `boolean` | `false` | Auto-show an interstitial once the platform SDK is ready. Skipped where interstitials are unsupported; never blocks init. |
| `prerollPlacement` | `string` | `"preroll"` | Placement identifier for the auto-preroll ad. |

---

## `Platform`

String union (Core) / enum (Unity).

**Core:** `"yes2" | "yandex" | "poki" | "crazygames" | "gamedistribution" | "youtube" | "debug"` (also exported as `PLATFORMS` array + `isPlatform()` type guard).

**Unity enum:** `Unknown, Poki, CrazyGames, Yandex, GameDistribution, YouTube, Debug`.

> Production platforms with shipping adapters today: **Poki, CrazyGames, Yandex, GameDistribution, YouTube**. The remaining Core values are reserved for planned adapters.

---

## Integration checklist

A build is accepted when:

- [ ] `initialize` is called at startup
- [ ] `setLoadingProgress` is called as assets load
- [ ] `startGame` is called when the game becomes playable
- [ ] `pause` / `resume` are handled (mute audio, pause gameplay)
- [ ] `audioEnabledChange` (and `isAudioEnabled`) is honored — required for YouTube Playables certification
- [ ] Interstitials run at natural break points; rewarded grants reward only on the "viewed" callback
- [ ] `gameplayStop` before every ad, `gameplayStart` after; gameplay resumes in both the after-ad and error paths

The QA Inspector in the dashboard validates this automatically.
