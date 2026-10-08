# Editor Simulation (Unity)

> The Unity Editor runs Yes2SDK in **Platform.Debug** mode. Each module returns a local mock so you can wire and test your integration without a WebGL build or Dashboard upload.

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

This means you can call the full SDK API from Play Mode in the Editor, subscribe to callbacks, and verify your wiring, all without leaving Unity.

## Per-module Editor behavior

The table below is derived directly from the `#else` branch of each `Runtime/<Module>/Yes2SDK<Module>.cs` file. "Instant" means the callback fires synchronously in the same call frame.

| Module | Editor (Platform.Debug) behavior |
|---|---|
| **Core** (`Yes2SDK`) | `InitializeAsync` resolves instantly with success; `StartGameAsync` resolves instantly with success; `GetPlatform()` returns `Platform.Debug`; `SetLoadingProgress` logs and no-ops; `PerformHapticFeedback` logs and no-ops; `OnExitRequested` fires only when you press **Simulate exit request**, which then saves `PlayerPrefs` like the platform flush |
| **Ads** | With **Mock ad popup** on (the default), `ShowInterstitial` and `ShowRewarded` open a mock ad overlay with a countdown and Close / Claim Reward / Skip buttons; Claim Reward fires `adViewed`, Skip fires `adDismissed`, then `afterAd`. With it off, they fire `beforeAd` then `afterAd` instantly, and `ShowRewarded` fires `adViewed` unless `description == "dismiss"` (fires `adDismissed` instead). **Ad result** set to No fill, Ad blocked or Error fires `onError` at once with code `NoFill`, `ADS_BLOCKED` or `PlatformError`, with no popup. `Ads.ShowBanner(BannerPosition,...)` / `HideBanner`: logs, fires `onShown` / `onHidden` instantly (single-banner API); `IsInterstitialSupported()` and `IsRewardedSupported()` return `true`; `IsAdBlocked()` returns `true` only while Ad result is Ad blocked; `IsRewardedAdAvailable()` returns `true` while the popup is on |
| **Analytics** | All methods (`LogEvent`, `LogLevelStart`, `LogLevelEnd`, `LogScore`, `LogTutorialStart`, `LogTutorialEnd`, `LogPurchase`) log to console and no-op. No data is sent |
| **Auth** | `IsSupported()` returns `false`; `GetCurrentUserAsync` resolves instantly with `null` (anonymous); `SignInAsync`, `GetTokenAsync`, `ShowAccountLinkPromptAsync` all resolve instantly with `FeatureNotSupported`. `IsAuthenticated()` follows the **Player is registered** toggle. `ShowRegistrationPrompt` draws no UI: it returns a prompt whose `Login()` registers the player for the rest of the Play Mode session and whose `Close()` closes it, applies the platform message rules (`INVALID_PARAM`), and returns `null` with `INVALID_OPERATION` when the player is registered |
| **Banners** | `IsSupported()` returns `false`; `Banners.ShowBanner(string id, BannerSize,...)` logs and fires `onSuccess` instantly (multi-banner API); `HideBanner` / `HideAllBanners` / `RefreshBanners` log and no-op |
| **Data** | All reads and writes delegate directly to `UnityEngine.PlayerPrefs`. Data persists between Editor Play Mode sessions and survives domain reloads |
| **Friends** | `IsSupported()` returns `false`; `ListFriendsAsync` resolves instantly with `FeatureNotSupported` |
| **Game** | `GameplayStart()` and `GameplayStop()` log and no-op; `HappyTime()` logs and no-ops; `InviteLinkAsync` resolves instantly with `FeatureNotSupported`; `GetInviteParam` returns `""`; `ShowInviteButton` / `HideInviteButton` log and no-op; `GetSettings()` returns `default(GameSettings)`; `CopyToClipboard` copies to `GUIUtility.systemCopyBuffer` |
| **Player** | `GetPlayerAsync` resolves instantly with `{id:"anonymous", name:null, photo:null}`; `GetDataAsync` / `SetDataAsync` / `FlushDataAsync` use a `PlayerPrefs`-backed JSON store (key `Yes2SDK.Player.MockData`); `IsDataSupported()` returns `true`; `GetConnectedPlayersAsync` resolves with `FeatureNotSupported`; `IsConnectedPlayersSupported()` returns `false`; `GetSignedPlayerInfoAsync` returns `{"playerId":"mock-player","signature":"mock-signature"}` while **Mock referrals, notifications and signed player** is on, and `FeatureNotSupported` when it is off; with the same toggle on, `IsBotAvatarSupported()` returns `true` and `GetBotAvatarAsync` returns a placeholder URL that does not load, so your fallback art runs, and with it off they report `false` and `FeatureNotSupported` |
| **Score** | `IsSupported()` returns `false`; `AddScore` and `SubmitScore` log and no-op |
| **Session** | `GetLocale()` returns `"en"`; `GetCountry()` returns `""`; `GetDevice()` returns `"desktop"`; `GetOrientation()` returns `"landscape"`; `GetTrafficSource()` returns `{"referrer":"","params":{}}`; `GetEntryPointData()` returns the **Entry point data (JSON)** field (default `{}`); `GetEntryPointAsync` resolves instantly with `"direct"`; `IsAudioEnabled()` returns `true`; `SetSessionData` logs and no-ops |
| **Achievements** | Stub module: `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |
| **Context** | `IsSupported()` returns `false` (it reports context switching only); `GetContext()` returns `null`; `SwitchAsync`, `ChooseAsync` and `CreateAsync` resolve with `FeatureNotSupported` everywhere. `ShareImageAsync` (and `ShareAsync`) succeeds while **Mock referrals, notifications and signed player** is on, with no cancel signal, and resolves with `FeatureNotSupported` when it is off |
| **IAP** | With **Mock in-app purchases** on (the default), `IsSupported()` and `IsSubscriptionSupported()` return `true`, `GetCatalogAsync` returns a sample catalog, `PurchaseAsync` opens a Buy / Cancel dialog (Cancel gives `UserCancelled`), `SubscribeAsync` opens a Subscribe / Close dialog (Close resolves with status `"cancelled"`), purchases last for the Play Mode session, and `ConsumePurchaseAsync` removes one. Guests (**Player is registered** off) see no subscriptions and get `PLAYER_NOT_AUTHENTICATED` when subscribing. **Fail purchases** makes purchases and subscribes fail with `PlatformError`. With the mock off, IAP reports unsupported |
| **Leaderboard** | `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` in the Editor |
| **Notifications** | While **Mock referrals, notifications and signed player** is on, `IsSupported()` returns `true` and `ScheduleAsync` applies the same checks as the platform, in the same order: invalid options get `InvalidParams` and a guest (**Player is registered** off) gets `PLAYER_NOT_AUTHENTICATED`. `CancelAsync` and `CancelAllAsync` remove mock notifications. When it is off, `IsSupported()` returns `false` and the calls resolve with `FeatureNotSupported` |
| **Referrals** | While **Mock referrals, notifications and signed player** is on, `IsSupported()` returns `true`, `ShareAsync` resolves as set by **Referral share result** (Shared, Cancelled or Error), and `ListAsync` reports **Referral conversions** (0 to 20) for each shared reference. When it is off, `IsSupported()` returns `false` and the calls resolve with `FeatureNotSupported` |
| **Stats** | `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` in the Editor |
| **Tournament** | Stub module: `IsSupported()` returns `false`; all calls resolve with `FeatureNotSupported` on every platform including Editor |

Stub modules (Achievements, Tournament, and Context apart from image sharing) extend `Yes2SDKStubModule`. Their `IsSupported()` is hardcoded to `false` and returns the same result on all platforms. The stub means the feature is not yet implemented by the SDK, not that the current portal lacks it.

### Play Mode Testing settings

The mocks above are set under **Yes2SDK > Build Window > Play Mode Testing**: **Mock ad popup**, **Ad result**, **Mock in-app purchases**, **Fail purchases**, **Player is registered**, **Entry point data (JSON)**, **Mock referrals, notifications and signed player**, **Referral share result**, **Referral conversions** and the **Simulate exit request** button. They apply to Editor Play Mode only. In batch mode (CI test runs) no popups open: ads complete at once, Ad result is ignored, and IAP, notifications, referrals and image sharing report unsupported. WebGL builds always use the real platform SDK and report the real platform's support, Jest included.

## What you can trust in the Editor

**Safe to test in Play Mode:**

- Callback wiring: `InitializeAsync → StartGameAsync → GameplayStart` fires in the expected order
- Save/load logic: `Data.*` and `Player.GetDataAsync/SetDataAsync` use real `PlayerPrefs` persistence
- Ad flow sequencing: pause and resume around the mock ad popup, both reward outcomes, and the `onError` paths through **Ad result**
- Jest flows: subscriptions, notifications for guests and registered players, the registration prompt, referrals, image sharing, entry point data and the exit request, through the Play Mode Testing settings
- `FeatureNotSupported` handling: Auth, Friends, and stub modules return this in the Editor, so your guard code is exercised
- Platform guards: `IsSupported()` returning `false` for Banners, Auth, Friends, and Score reflects what many real portals return (e.g. Poki)

**Not valid in the Editor (requires a WebGL build):**

- Real ad fill, ad display, and rewarded ad completion by the user
- Actual platform identity: `GetPlatform()` is always `Debug`, never `Poki` / `CrazyGames` / etc.
- Player identity: `GetPlayerAsync` is always anonymous; signed player info is a mock value that no server can verify
- `IsSupported()` truthfulness for Auth, Banners, Friends, and Score: these return `false` in the Editor even on portals that support them
- Portal rejection compliance: the Dashboard Inspector is the authoritative test; upload a WebGL build and run it through the Inspector before requesting publish

In short: the Editor is for wiring and flow. The Dashboard Inspector is for compliance.
