# Yes2SDK for Yandex Games - Platform Guide

## Prerequisite

**Install Yes2SDK first.** None of the API below compiles until the SDK is installed in your project:

- **Unity:** UPM git URL `https://github.com/yes2games/yes2sdk-unity.git#<version>`, then `Yes2SDK > Build Window > Install Template`.
- **Defold:** add the release archive to `game.project` `[project]` dependencies, then Project > Fetch Libraries.

If you use the Yes2SDK MCP, call `get_install_instructions` for exact pinned steps and `detect_sdk` to confirm the SDK is installed before generating any code.

## Requirements

Yandex Games has specific SDK integration requirements for game approval.

### API Requirements

The Yes2SDK methods below cover every Yandex-platform call you need. The middle column is what Yes2SDK invokes on `YaGames` / `ysdk` under the hood — you never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)** — only the method-naming convention changes (see examples below).

| Platform Requirement | Yes2SDK API | Required |
|---|---|---|
| `YaGames.init()` → `ysdk` | `Yes2SDK.initializeAsync()` | **Required** |
| `ysdk.features.LoadingAPI.ready()` | `Yes2SDK.startGameAsync()` | **Required** (otherwise loading screen never dismisses) |
| `ysdk.features.GameplayAPI.start()` | `game.gameplayStart()` | **Required** (analytics + ad timing) |
| `ysdk.features.GameplayAPI.stop()` | `game.gameplayStop()` | **Required** (before every ad) |
| `ysdk.on('game_api_pause', ...)` / `'game_api_resume'` | `Yes2SDK.on('pause', fn)` / `on('resume', fn)` | **Required** (mute audio during ads) |
| `ysdk.adv.showFullscreenAdv({ callbacks })` | `ads.showInterstitial(placement, cbs)` | Recommended |
| `ysdk.adv.showRewardedVideo({ callbacks })` | `ads.showRewarded(placement, cbs)` | Recommended |
| `ysdk.adv.showBannerAdv()` | `ads.showBanner('bottom')` | Optional (sticky banner revenue) |
| `ysdk.environment.i18n.lang` | `session.getLocale()` | Recommended (multi-language) |
| `ysdk.getPlayer()` | `player.getPlayer()` (pre-loaded on init) | Optional |
| `player.getData()` / `setData()` (cloud) | `data.getInt/setInt`, `data.getString/setString`, ... | Optional (auto-syncs to cloud) |
| `ysdk.auth.openAuthDialog()` | `auth.signInAsync()` | Optional (cloud data without auth = device-local) |

> Yandex serves multiple countries (Russia, Turkey, Kazakhstan, etc.). Always read `session.getLocale()` and adapt your UI strings — `ru`, `en`, `tr`, `uk`, `be`, `kk` are the common values.

## Step-by-Step Integration

### Unity (C#)

```csharp
// Initialize
await Yes2SDK.Instance.InitializeAsync();
await Yes2SDK.Instance.StartGameAsync();

// Get locale for translations
string locale = Yes2SDK.Instance.Session.GetLocale(); // "ru", "en", "tr", etc.

// Show interstitial between levels
Yes2SDK.Instance.Session.GameplayStop();
Yes2SDK.Instance.Ads.ShowInterstitial("level-complete",
    beforeAd: () => PauseGame(),
    afterAd: () => {
        ResumeGame();
        Yes2SDK.Instance.Session.GameplayStart();
    },
    noFill: () => {
        ResumeGame();
        Yes2SDK.Instance.Session.GameplayStart();
    }
);

// Save data (uses Yandex cloud storage)
Yes2SDK.Instance.Data.SetInt("highscore", 1000);
Yes2SDK.Instance.Data.SetString("playerName", "Player1");

// Load data
int score = Yes2SDK.Instance.Data.GetInt("highscore", 0);
```

### Defold (Lua)

```lua
-- Initialize
yes2sdk.initialize(function(self, success, error)
    if success then
        yes2sdk.start_game(function(self, success, error)
            local locale = yes2sdk.session_get_locale() -- "ru", "en", etc.
            yes2sdk.session_gameplay_start()
        end)
    end
end)

-- Show interstitial
yes2sdk.session_gameplay_stop()
yes2sdk.ads_show_interstitial("level-complete",
    function(self) pause_game() end,          -- beforeAd
    function(self)                              -- afterAd
        resume_game()
        yes2sdk.session_gameplay_start()
    end,
    function(self)                              -- noFill
        resume_game()
        yes2sdk.session_gameplay_start()
    end
)

-- Save/load data
yes2sdk.data_set_int("highscore", 1000)
local score = yes2sdk.data_get_int("highscore", 0)
```

## Now Available on Yandex

Yandex has the richest feature set of any platform, and these modules are now **live** through Yes2SDK (fully supported on Yandex, safe no-ops elsewhere — guard with `isSupported()`):

- **Leaderboards** — submit scores and read ranked/friend entries. See [api/leaderboard.md](api/leaderboard.md).
- **Stats** — read, set, and atomically increment numeric player counters. See [api/stats.md](api/stats.md).
- **IAP** — product catalog, purchases, and consume flow (no subscriptions yet). See [api/iap.md](api/iap.md).
- **Remote config flags** — `config.getFlagsAsync({ defaults })` returns remote feature flags, falling back to your defaults. See [api/config.md](api/config.md).
- **Rating prompt** — `review.requestReviewAsync()` shows Yandex's native rating dialog (eligibility checked internally). See [api/review.md](api/review.md).

Player identity extras (`player.getUniqueId()`, `getPayingStatus()`, `getMode()`, `getPhoto(size)`, `getIDsPerGame()`), `game.getServerTimeAsync()` (tamper-proof server clock), and `banners.getBannerStatusAsync()` are also fully wired on Yandex.

## How to Submit

You don't upload to Yandex Games yourself — the Yes2Games team handles platform submission.

1. Build your game (Unity WebGL or Defold HTML5) and zip the output
2. Upload the zip on your game page (**Onboarding → Stage 1**)
3. Fill in title, description, icon, and screenshots on the **Game Profile** stage (**Onboarding → Stage 2**) — Yandex requires all of these
4. Test the build in the Inspector (**Onboarding → Stage 3**)
5. Click **Request Publish** in **Onboarding → Stage 4** and select Yandex
6. The Yes2Games team validates the build, registers the game in the Yandex Games Console, uploads it with your metadata, and submits it for Yandex review on your behalf
7. You'll see status updates and feedback messages on the game page

If reviewers send back changes, upload a new build and request publish again on that build.

## Yandex-Specific Notes

### Cloud Data
- Yandex uses `player.getData()` / `player.setData()` for cloud saves
- Data is per-player (requires auth for persistent saves)
- Anonymous players can still use data, but it's device-local
- Yes2SDK's Data module handles this transparently

### Authentication
- Yandex supports anonymous play — auth is optional
- Prompting auth gives access to persistent cloud data
- Call `Yes2SDK.auth.signInAsync()` to show the Yandex login dialog

### Locale
- Yandex serves games in multiple countries (Russia, Turkey, etc.)
- Always use `session.getLocale()` to detect language
- Common locales: `ru`, `en`, `tr`, `uk`, `be`, `kk`

### Sticky Banners
- Yandex supports sticky banners at the bottom of the screen
- Call `Yes2SDK.ads.showBanner("bottom")` to enable
- Revenue is additional to interstitial/rewarded ads

### Analytics (Yandex Metrica)
Yandex Metrica is a separate analytics service — it is **not** part of the YaGames SDK. To enable it for your game:
1. Create a counter at [metrica.yandex.com](https://metrica.yandex.com) and copy its numeric **counter ID**.
2. Set it in your game's settings → **"Yandex Metrica counter ID"** (leave empty to disable).
3. On Yandex builds, the dashboard injects the Metrica tag automatically — page views and sessions are tracked with no code.

To send **custom goals**, use the unified analytics API. On Yandex, when a counter is configured, these route to Metrica `reachGoal`:
```js
Yes2SDK.analytics.logEvent("level_complete", undefined, { level: 3 });
Yes2SDK.analytics.logPurchase("coins_100", 0.99, "USD"); // goal: "purchase"
```
Goal names are your `logEvent` name, or `score` / `tutorial` / `purchase` / `level_start` / `level_end` for the typed methods. (The same `analytics` module works from Unity and Defold.) You can also call the injected global directly: `ym(counterId, "reachGoal", "my_goal")`.

Notes:
- Metrica runs only on WebGL/Yandex builds, and is injected only in **published/bundled** builds — **not** the QA Inspector, so test traffic doesn't pollute your stats.
- Metrica loads from `mc.yandex.ru`; if a target platform whitelists external hosts, allow that host for the counter to work.

## Common Issues

### "YaGames is not defined"
The SDK isn't loaded. Yes2SDK automatically loads it from the relative `/sdk.js` path (required for games uploaded to the Yandex console). Make sure your build doesn't block script loading.

### Game loads slowly on Yandex
Yandex wraps your game in an iframe with additional SDK overhead. Keep your build size under 15MB for best experience.

### Data not persisting
Anonymous players get device-local storage only. Prompt auth for cloud saves: `Yes2SDK.auth.signInAsync()`.

### Ads not showing in testing
Yandex ad fill depends on region and testing environment. Ads may not fill in the developer console preview — test with a real published game URL.
