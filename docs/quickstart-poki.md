# Yes2SDK for Poki - Platform Guide

## Prerequisite

**Install Yes2SDK first.** None of the API below compiles until the SDK is installed in your project:

- **Unity:** UPM git URL `https://github.com/yes2games/yes2sdk-unity.git#<version>`, then `Yes2SDK > Build Window > Install Template`.
- **Defold:** add the release archive to `game.project` `[project]` dependencies, then Project > Fetch Libraries.

If you use the Yes2SDK MCP, call `get_install_instructions` for exact pinned steps and `detect_sdk` to confirm the SDK is installed before generating any code.

## Requirements

Poki has strict SDK integration requirements. Your game will be rejected if any of these are missing.

### API Requirements

The Yes2SDK methods below cover every Poki-platform call you need. The middle column is what Yes2SDK invokes on `PokiSDK` under the hood. You never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)**. Only the method-naming convention changes (see Integration Example below).

| Platform Requirement | Yes2SDK API | Required |
|---|---|---|
| `PokiSDK.init()` | `Yes2SDK.initializeAsync()` | **Required** |
| `PokiSDK.gameLoadingFinished()` | `Yes2SDK.startGameAsync()` | **Required** |
| `PokiSDK.gameplayStart()` | `game.gameplayStart()` | **Required** (before first ad) |
| `PokiSDK.gameplayStop()` | `game.gameplayStop()` | **Required** (before every ad) |
| `PokiSDK.commercialBreak(...)` | `ads.showInterstitial(placement, cbs)` | Recommended (monetization) |
| `PokiSDK.rewardedBreak(...)` | `ads.showRewarded(placement, cbs)` | Recommended (monetization) |
| `PokiSDK.happyTime(intensity)` | `game.happyTime()` | Optional |
| Loading progress (no-op on Poki) | `Yes2SDK.setLoadingProgress(n)` | Optional |
| `localStorage` (Poki has no cloud data API) | `data.getInt/setInt`, `data.getString/setString`, ... | Optional |

> Poki **does not** support `auth.*`, `banners.*`, or `player.getDataAsync/setDataAsync`. Calls return `FeatureNotSupported`. Guard with `isSupported()` if you share code with other platforms.

### Mandatory Call Sequence

```
1. Yes2SDK.initializeAsync()
2. Yes2SDK.startGameAsync()
3. game.gameplayStart()
4. [player plays]
5. game.gameplayStop()           <-- BEFORE showing any ad
6. ads.showInterstitial(...)     <-- between levels/deaths
7. game.gameplayStart()          <-- resume after ad
```

### Critical Rules

| Rule | Description |
|------|-------------|
| Init before anything | `initializeAsync()` must complete before any SDK call |
| gameplayStart before ads | Must call `gameplayStart()` at least once before showing ads |
| gameplayStop before interstitial | Must call `gameplayStop()` before every `showInterstitial()` |
| Pause during ads | Mute audio and pause game in `beforeAd` callback |
| Resume after ads | Resume game in `afterAd` callback (fires whether ad shown or not) |
| No ads in first 30s | Poki recommends no ads within 30 seconds of gameplay start |
| Max 1 interstitial per 60s | Respect frequency cap to avoid silent rejection |
| No ads during loading | No ad calls before `startGameAsync()` resolves |
| Reward on adViewed only | Grant rewards only in the `adViewed` callback, never in `afterAd` |

## Integration Example

### TypeScript / JavaScript

```typescript
// Initialize
await Yes2SDK.initializeAsync();
await Yes2SDK.startGameAsync();

// Start gameplay
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

// Rewarded ad (player-initiated)
Yes2SDK.game.gameplayStop();
await Yes2SDK.ads.showRewarded('extra-life', {
    beforeAd: () => pauseGame(),
    afterAd: () => {
        resumeGame();
        Yes2SDK.game.gameplayStart();
    },
    adViewed: () => grantExtraLife(),
    adDismissed: () => console.log('No reward')
});
```

### Unity C#

```csharp
Yes2SDK.Yes2SDK.InitializeAsync(onSuccess: () =>
{
    Yes2SDK.Yes2SDK.StartGameAsync(onSuccess: () =>
    {
        Yes2SDK.Yes2SDK.Game.GameplayStart();
    });
});

// Between levels
void OnLevelComplete()
{
    Yes2SDK.Yes2SDK.Game.GameplayStop();
    Yes2SDK.Yes2SDK.Ads.ShowInterstitial("level-complete", "After level",
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
    yes2sdk.start_game(function(self, success, error)
        yes2sdk.session_gameplay_start()
    end)
end)

-- Between levels
yes2sdk.session_gameplay_stop()
yes2sdk.ads_show_interstitial("level-complete",
    function(self) end,       -- beforeAd
    function(self)             -- afterAd
        yes2sdk.session_gameplay_start()
    end,
    function(self)             -- noFill
        yes2sdk.session_gameplay_start()
    end
)
```

## How Poki Works Under the Hood

- Poki loads `PokiSDK` from `game-cdn.poki.com/scripts/v2/poki-sdk.js`
- On poki.com, the platform auto-handles `PokiSDK.init()` and `gameLoadingFinished()` -- do NOT call these manually
- Interstitials wrap `PokiSDK.commercialBreak()` (returns a Promise)
- Rewarded ads wrap `PokiSDK.rewardedBreak()` (resolves with `true` = watched, `false` = dismissed)
- Ad no-fill is signaled via Promise rejection, mapped to the `noFill` callback (NOT `onError`)

### Ad Callback Flow

```
commercialBreak():
  beforeAd -> [ad plays] -> afterAd
  beforeAd -> [no fill]  -> noFill -> afterAd

rewardedBreak():
  beforeAd -> [watched fully]  -> adViewed -> afterAd
  beforeAd -> [dismissed]      -> adDismissed -> afterAd
  beforeAd -> [error/no fill]  -> noFill -> afterAd
```

## How to Submit

You don't upload to Poki yourself. The Yes2Games team handles platform submission.

1. Upload a build on your game page (**Onboarding → Stage 1**)
2. Test it in the Inspector (**Onboarding → Stage 3**). The Debug check covers SDK basics
3. Click **Request Publish** in **Onboarding → Stage 4** and select Poki
4. The Yes2Games team validates the build against Poki's QA criteria, uploads it to inspector.poki.dev, fixes anything they can, and submits to Poki on your behalf
5. You'll see status updates (`pending_review` → `reviewing` → `approved` / `needs_changes`) and feedback messages on the game page

If reviewers send back changes, upload a new build and request publish again on that build.

### What Yes2Games reviewers check before submitting to Poki

- [ ] SDK initializes without errors
- [ ] `gameLoadingFinished` fires (handled by platform)
- [ ] `gameplayStart` called before first ad
- [ ] `gameplayStop` called before every interstitial
- [ ] Game pauses during ads (audio muted, logic stopped)
- [ ] Game resumes after ads
- [ ] No ads in first 30 seconds
- [ ] Interstitials spaced at least 60 seconds apart
- [ ] Rewarded ads grant reward only on full view
- [ ] No external scripts (Poki CSP blocks them)
- [ ] Canvas is responsive (100% width/height, no scrollbars)

## Common Rejection Reasons

| Issue | Fix |
|-------|-----|
| Ads shown without gameplay | Call `gameplayStart()` before any ad |
| Game not pausing during ads | Add `beforeAd` callback that mutes audio and pauses |
| Interstitials too frequent | Space ads at least 60 seconds apart |
| Ads during loading | Move all ad calls after `startGameAsync()` resolves |
| External scripts blocked | Remove all `<script src="http...">` tags. All code must be inlined or bundled |
| No `noFill` handling | Handle the `noFill` callback (not `onError`) to resume gameplay when no ad is available |
| Rewarded without reward | Grant reward in `adViewed`, not `afterAd` |
| Canvas not responsive | Set canvas to `width: 100%; height: 100%; overflow: hidden` |

## Platform-Specific Notes

- **Data storage**: Poki has no cloud data API. The SDK uses `localStorage` with the `yes2sdk_` prefix. The Player module's `getDataAsync`/`setDataAsync` return `FeatureNotSupported`.
- **Auth**: Not supported on Poki. `auth.isSupported()` returns `false`.
- **Banners**: Not supported on Poki. Use interstitial and rewarded ads only.
- **`index.json`**: Poki production uses `index.json` (not `index.html`). The dashboard handles this, but if manually deploying, keep both files in sync.
