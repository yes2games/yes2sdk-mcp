# Editor Simulation (Unity)

> The Unity Editor runs Yes2SDK in **Platform.Debug** mode — each module returns a local mock so you can wire and test your integration without a WebGL build or Dashboard upload.

## How it works

Every module in the SDK guards its real JS bridge calls with a compile-time directive:

```csharp
#if UNITY_WEBGL && !UNITY_EDITOR
    // real DllImport → jslib → platform SDK
#else
    // mock: logs to console, returns safe defaults, resolves callbacks instantly
#endif
```

In a WebGL build, the `#if` branch compiles and the JS bridge is live. In the Unity Editor, the `#else` branch runs instead. `Yes2SDK.GetPlatform()` returns `Platform.Debug` in the Editor; the `Platform` enum value `Debug` exists precisely for this case.

This means you can call the full SDK API from Play Mode in the Editor, subscribe to callbacks, and verify your wiring — all without leaving Unity.

## Per-module Editor behavior

The table below is derived directly from the `#else` branch of each `Runtime/<Module>/Yes2SDK<Module>.cs` file. "Instant" means the callback fires synchronously in the same call frame.

| Module | Editor (Platform.Debug) behavior |
|---|---|
| **Core** (`Yes2SDK`) | `InitializeAsync` resolves instantly with success; `StartGameAsync` resolves instantly with success; `GetPlatform()` returns `Platform.Debug`; `SetLoadingProgress` logs and no-ops; `PerformHapticFeedback` logs and no-ops |
| **Ads** | `ShowInterstitial` — logs, fires `beforeAd` then `afterAd` instantly, no ad is shown; `ShowRewarded` — logs, fires `beforeAd` then `afterAd` instantly, fires `adViewed` unless `description == "dismiss"` (fires `adDismissed` instead); `ShowBanner` / `HideBanner` — logs, fires `onShown` / `onHidden` instantly; `IsAdBlocked()` returns `false`; `IsRewardedAdAvailable()` returns `false` |
| **Analytics** | All methods (`LogEvent`, `LogLevelStart`, `LogLevelEnd`, `LogScore`, `LogTutorialStart`, `LogTutorialEnd`, `LogPurchase`) log to console and no-op — no data is sent |
| **Auth** | `IsSupported()` returns `false`; `GetCurrentUserAsync` resolves instantly with `null` (anonymous); `SignInAsync`, `GetTokenAsync`, `ShowAccountLinkPromptAsync` all resolve instantly with `FeatureNotSupported` |
| **Banners** | `IsSupported()` returns `false`; `ShowBanner` logs and fires `onSuccess` instantly; `HideBanner` / `HideAllBanners` / `RefreshBanners` log and no-op |
| **Data** | All reads and writes delegate directly to `UnityEngine.PlayerPrefs` — data persists between Editor Play Mode sessions and survives domain reloads |
| **Friends** | `IsSupported()` returns `false`; `ListFriendsAsync` resolves instantly with `FeatureNotSupported` |
| **Game** | `GameplayStart()` and `GameplayStop()` log and no-op; `HappyTime()` logs and no-ops; `InviteLinkAsync` resolves instantly with `FeatureNotSupported`; `GetInviteParam` returns `""`; `ShowInviteButton` / `HideInviteButton` log and no-op; `GetSettings()` returns `default(GameSettings)`; `CopyToClipboard` copies to `GUIUtility.systemCopyBuffer` |
| **Player** | `GetPlayerAsync` resolves instantly with `{id:"anonymous", name:null, photo:null}`; `GetDataAsync` / `SetDataAsync` / `FlushDataAsync` use a `PlayerPrefs`-backed JSON store (key `Yes2SDK.Player.MockData`); `IsDataSupported()` returns `true`; `GetConnectedPlayersAsync` resolves with `FeatureNotSupported`; `GetSignedPlayerInfoAsync` resolves with `FeatureNotSupported`; `IsConnectedPlayersSupported()` returns `false` |
| **Score** | `IsSupported()` returns `false`; `AddScore` and `SubmitScore` log and no-op |
| **Session** | `GetLocale()` returns `"en"`; `GetCountry()` returns `""`; `GetDevice()` returns `"desktop"`; `GetOrientation()` returns `"landscape"`; `GetTrafficSource()` returns `{"referrer":"","params":{}}`; `GetEntryPointData()` returns `{}`; `GetEntryPointAsync` resolves instantly with `"direct"`; `IsAudioEnabled()` returns `true`; `SetSessionData` logs and no-ops |
| **Achievements** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **Context** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **IAP** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **Leaderboard** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **Notifications** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **Stats** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **Tournament** | Stub module — `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |

Stub modules extend `Yes2SDKStubModule`. Their `IsSupported()` is hardcoded to `false` and returns the same result on all platforms — the stub means the feature is not yet implemented by the SDK, not that the current portal lacks it.

## What you can trust in the Editor

**Safe to test in Play Mode:**

- Callback wiring — `InitializeAsync → StartGameAsync → GameplayStart` fires in the expected order
- Save/load logic — `Data.*` and `Player.GetDataAsync/SetDataAsync` use real `PlayerPrefs` persistence
- Ad flow sequencing — `ShowInterstitial` fires `beforeAd` then `afterAd`; `ShowRewarded` fires `adViewed` or `adDismissed` based on the `description` argument
- `FeatureNotSupported` handling — Auth, Friends, and stub modules return this in the Editor, so your guard code is exercised
- Platform guards — `IsSupported()` returning `false` for Banners, Auth, Friends, and Score reflects what many real portals return (e.g. Poki)

**Not valid in the Editor — requires a WebGL build:**

- Real ad fill, ad display, and rewarded ad completion by the user
- Actual platform identity: `GetPlatform()` is always `Debug`, never `Poki` / `CrazyGames` / etc.
- Player identity: `GetPlayerAsync` is always anonymous; signed player info is always `FeatureNotSupported`
- `IsSupported()` truthfulness for Auth, Banners, Friends, and Score — these return `false` in the Editor even on portals that support them
- Portal rejection compliance — the Dashboard Inspector is the authoritative test; upload a WebGL build and run it through the Inspector before requesting publish

In short: the Editor is for wiring and flow. The Dashboard Inspector is for compliance.
