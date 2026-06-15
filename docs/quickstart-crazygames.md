# Yes2SDK for CrazyGames - Platform Guide

## Requirements

CrazyGames requires specific SDK initialization and lifecycle management. The platform replaces your HTML on upload, so the SDK uses a special bootstrap mechanism.

### API Requirements

The Yes2SDK methods below cover every CrazyGames-platform call you need. The middle column is what Yes2SDK invokes on `window.CrazyGames.SDK` under the hood — you never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)** — only the method-naming convention changes (see Integration Example below).

| Platform Requirement | Yes2SDK API | Required |
|---|---|---|
| `SDK.init({ wrapper: { engine, sdkVersion } })` | `Yes2SDK.initializeAsync()` | **Required** |
| `sdk.game.loadingStart()` | `Yes2SDK.setLoadingProgress(n)` (first call triggers it) | **Required** |
| `sdk.game.loadingStop()` | `Yes2SDK.startGameAsync()` | **Required** |
| `sdk.game.gameplayStart()` | `game.gameplayStart()` | **Required** (CG QA checks this) |
| `sdk.game.gameplayStop()` | `game.gameplayStop()` | **Required** (before every ad) |
| `sdk.ad.requestAd('midgame', cbs)` | `ads.showInterstitial(placement, cbs)` | Recommended |
| `sdk.ad.requestAd('rewarded', cbs)` | `ads.showRewarded(placement, cbs)` | Recommended |
| Mute audio in `adStarted`, restore in `adFinished` / `adError` | `beforeAd` / `afterAd` callbacks (mute/unmute yourself) | **Required** (CG QA checks audio) |
| `sdk.game.happytime()` | `game.happyTime()` | Recommended (boosts promotion) |
| `sdk.banner.requestBanner(size)` | `banners.showBanner(id, size)` | Optional |
| `sdk.user.getUser()` / `getUserToken()` | `auth.signInAsync()` / `auth.getTokenAsync()` | Optional |
| `sdk.data.getItem/setItem` (cloud storage) | `data.getInt/setInt`, `data.getString/setString`, ... | Optional |

> CrazyGames replaces your `index.html` on upload — wrapping inline `<script>` calls is lost. The Yes2SDK Dashboard bundles the SDK into `framework.js` (Unity) or alongside your assets (Defold/HTML5) so initialization survives.

### Mandatory Call Sequence

```
1. CrazyGames SDK loaded (CDN or injected by platform)
2. Yes2SDK.initializeAsync()
   -> SDK.init({ wrapper: { engine: 'unity', sdkVersion: '2.0.0' } })
3. Yes2SDK.setLoadingProgress(...)
   -> triggers sdk.game.loadingStart() on first call
4. Yes2SDK.startGameAsync()
   -> calls sdk.game.loadingStop()
5. game.gameplayStart()
6. [player plays]
7. game.gameplayStop()
8. ads.showInterstitial(...)     <-- midgame ad
9. game.gameplayStart()
```

### Critical Rules

| Rule | Description |
|------|-------------|
| Wrapper options in init | Must pass `{ wrapper: { engine, sdkVersion } }` to `SDK.init()`. QA rejection without it. |
| Loading progress | Must call `loadingStart()` during loading and `loadingStop()` when ready |
| gameplayStart/Stop | Must bracket active gameplay. CG QA tool checks for this |
| Audio mute during ads | Mute when `adStarted` fires, restore on `adFinished`/`adError` |
| No ads during gameplay | Interstitials only when gameplay is stopped |
| 3-minute ad frequency | CG enforces 3-min minimum between interstitials server-side |
| happytime on positive moments | Recommended (not mandatory) for CG promotion algorithms |
| Settings change listener | Handle mute/unmute commands from the CG player |

## Integration Example

### TypeScript / JavaScript

```typescript
// Initialize
await Yes2SDK.initializeAsync();

// Report loading progress
Yes2SDK.setLoadingProgress(50);
Yes2SDK.setLoadingProgress(100);

// Game ready
await Yes2SDK.startGameAsync();
Yes2SDK.game.gameplayStart();

// Between levels: show interstitial
Yes2SDK.game.gameplayStop();
await Yes2SDK.ads.showInterstitial('level-complete', {
    beforeAd: () => {
        muteAudio();
        pauseGame();
    },
    afterAd: () => {
        unmuteAudio();
        resumeGame();
        Yes2SDK.game.gameplayStart();
    }
});

// Signal positive moment
Yes2SDK.game.happyTime();

// Rewarded ad
Yes2SDK.game.gameplayStop();
await Yes2SDK.ads.showRewarded('double-coins', {
    beforeAd: () => pauseGame(),
    afterAd: () => {
        resumeGame();
        Yes2SDK.game.gameplayStart();
    },
    adViewed: () => doubleCoins(),
    adDismissed: () => console.log('Ad dismissed')
});
```

### Unity C#

```csharp
Yes2SDK.Yes2SDK.InitializeAsync(onSuccess: () =>
{
    // Loading progress is reported automatically by Unity loader,
    // or call manually:
    Yes2SDK.Yes2SDK.SetLoadingProgress(100);

    Yes2SDK.Yes2SDK.StartGameAsync(onSuccess: () =>
    {
        Yes2SDK.Yes2SDK.Game.GameplayStart();
    });
});

// Interstitial between levels
void OnLevelComplete()
{
    Yes2SDK.Yes2SDK.Game.GameplayStop();
    Yes2SDK.Yes2SDK.Game.HappyTime();

    Yes2SDK.Yes2SDK.Ads.ShowInterstitial("level-complete", "Between levels",
        beforeAd: () => { AudioListener.pause = true; Time.timeScale = 0f; },
        afterAd: () => {
            AudioListener.pause = false;
            Time.timeScale = 1f;
            Yes2SDK.Yes2SDK.Game.GameplayStart();
        }
    );
}
```

### Defold Lua

```lua
yes2sdk.initialize(function(self, success, error)
    yes2sdk.set_loading_progress(100)
    yes2sdk.start_game(function(self, success, error)
        yes2sdk.session_gameplay_start()
    end)
end)

-- Between levels
yes2sdk.session_gameplay_stop()
yes2sdk.game_happy_time()
yes2sdk.ads_show_interstitial("level-complete",
    function(self) end,
    function(self) yes2sdk.session_gameplay_start() end,
    function(self) yes2sdk.session_gameplay_start() end
)
```

## How CrazyGames Works Under the Hood

### SDK Loading

CrazyGames SDK is loaded from `https://sdk.crazygames.com/crazygames-sdk-v3.js`. The SDK sets `window.CrazyGames.SDK` asynchronously, so the adapter polls for it (100ms intervals, 15 second timeout, then CDN fallback).

### HTML Replacement

CrazyGames **replaces your HTML** when you upload a game. This means inline `<script>` wrappers in `index.html` are lost. The Unity SDK handles this with `Yes2SDKPlatformInit.jslib`, which uses Emscripten's `$__postset` to inject the wrapper into `framework.js` (which IS preserved).

For non-Unity engines, the Yes2SDK Dashboard bundles the SDK into your game files so it loads independently of the HTML.

### Ad Callback Flow

```
requestAd('midgame', callbacks):
  adStarted -> [ad plays] -> adFinished
  adStarted -> [error]     -> adError

requestAd('rewarded', callbacks):
  adStarted -> [watched fully]  -> adFinished (= grant reward)
  adStarted -> [error 'unfilled' or 'adblock'] -> adError (= noFill)
  adStarted -> [other error]    -> adError (= adDismissed)
```

The `adError` callback receives an error object with a `.code` property. The SDK maps:
- `'unfilled'` or `'adblock'` -> `noFill` callback
- Other error codes -> `adDismissed` callback

### Banner Sizes

CrazyGames supports 5 banner sizes:

| Name | Size |
|------|------|
| Leaderboard | 728x90 |
| Medium | 300x250 |
| Mobile | 320x50 |
| Main | 468x60 |
| Large Mobile | 320x100 |

## How to Submit

You don't upload to CrazyGames yourself — the Yes2Games team handles platform submission.

1. Upload a build on your game page (**Onboarding → Stage 1**)
2. Test it in the Inspector (**Onboarding → Stage 3**)
3. Click **Request Publish** in **Onboarding → Stage 4** and select CrazyGames
4. The Yes2Games team validates the build against CG's QA tool, registers the game in the CrazyGames developer portal, and uploads it on your behalf
5. You'll see status updates (`pending_review` → `reviewing` → `approved` / `needs_changes`) and feedback messages on the game page

If reviewers send back changes, upload a new build and request publish again on that build.

### What Yes2Games reviewers check before submitting to CrazyGames

- [ ] SDK init with wrapper options
- [ ] `gameplayStart` / `gameplayStop` called around active gameplay
- [ ] Audio muted during ads
- [ ] `loadingStart` / `loadingStop` sequence completes
- [ ] No ads during active gameplay
- [ ] Ad error codes mapped correctly (unfilled / adblock → noFill)

## Common Rejection Reasons

| Issue | Fix |
|-------|-----|
| Missing wrapper options in init | Pass `{ wrapper: { engine: 'unity', sdkVersion: '2.0.0' } }` to `SDK.init()` |
| Audio plays during ads | Mute in `beforeAd`/`adStarted`, restore in `afterAd`/`adFinished` |
| No gameplay lifecycle | Add `gameplayStart()`/`gameplayStop()` around active gameplay |
| Ads during active gameplay | Call `gameplayStop()` before requesting any ad |
| Missing loading progress | Call `loadingStart()` during loading, `loadingStop()` when ready |
| Wrong reward on ad error | Check `adError.code` -- `'unfilled'`/`'adblock'` = no fill, not dismissal |

## Platform-Specific Features

### Auth

CrazyGames supports user authentication:

```typescript
if (Yes2SDK.auth.isSupported()) {
    const user = await Yes2SDK.auth.signInAsync();
    console.log(`Welcome, ${user.name}`);
}
```

### Friends

```typescript
const result = await Yes2SDK.friends.listFriendsAsync(0, 20);
result.friends.forEach(f => console.log(f.name));
```

### Cloud Data

CrazyGames provides `sdk.data.getItem`/`setItem` for cloud storage. The SDK Data module (`data.getInt`, `data.setString`, etc.) uses this automatically.

### Banners

```typescript
await Yes2SDK.banners.showBanner('main-menu', '300x250');
Yes2SDK.banners.hideBanner('main-menu');
```

### Settings Change Listener

CrazyGames can send settings changes (e.g., mute audio from the CG player). The SDK handles this automatically, but you can also listen for platform events:

```typescript
// The SDK dispatches OnPause/OnResume events when CG requests it
Yes2SDK.OnPause += () => MuteAudio();
Yes2SDK.OnResume += () => UnmuteAudio();
```
