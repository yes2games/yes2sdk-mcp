# Yes2SDK for GameDistribution - Platform Guide

> **Install Yes2SDK first.** None of the API below compiles until the SDK is
> installed in your project — Unity: UPM git URL
> `https://github.com/yes2games/yes2sdk-unity.git#<version>` **plus**
> `Yes2SDK > Build Window > Install Template`; Defold: add the release archive to
> `game.project` `[project]` dependencies, then Project > Fetch Libraries. If you
> use the Yes2SDK MCP, call `get_install_instructions` for exact pinned steps and
> `detect_sdk` to confirm the SDK is installed before generating any code.

## Requirements

GameDistribution (GD) uses an **event-driven** SDK rather than a promise-based one — instead of awaiting an ad call you listen for `SDK_GAME_START`, `SDK_GAME_PAUSE`, and `SDK_REWARDED_WATCH_COMPLETE` events. Yes2SDK hides this behind the standard `ads.*` callbacks, so you write the same code as on Poki/CG.

### API Requirements

The Yes2SDK methods below cover every GameDistribution call you need. The middle column is what Yes2SDK invokes on `gdsdk` under the hood — you never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)** — only the method-naming convention changes (see Integration Example below).

| Platform Requirement | Yes2SDK API | Required |
|---|---|---|
| `window.GD_OPTIONS = { gameId, onEvent }` + load `main.min.js` | `Yes2SDK.initializeAsync()` (Dashboard injects `gameId`) | **Required** |
| `SDK_GAME_PAUSE` event handling | `Yes2SDK.on('pause', fn)` (auto-wired during ads) | **Required** (mute audio + pause logic) |
| `SDK_GAME_START` event handling | `Yes2SDK.on('resume', fn)` / `afterAd` callback | **Required** (resume after ads) |
| `SDK_REWARDED_WATCH_COMPLETE` event | `adViewed` callback on `ads.showRewarded(...)` | **Required** (grant reward) |
| `gdsdk.showAd('interstitial')` | `ads.showInterstitial(placement, cbs)` | Recommended (monetization) |
| `gdsdk.showAd('rewarded')` | `ads.showRewarded(placement, cbs)` | Recommended (monetization) |
| Gameplay lifecycle (GD has no native API) | `game.gameplayStart()` / `gameplayStop()` (analytics only) | Recommended |
| Loading progress (GD has no native API) | `Yes2SDK.setLoadingProgress(n)` | Optional |
| `localStorage` (GD has no cloud data API) | `data.getInt/setInt`, `data.getString/setString`, ... | Optional |
| `SDK_GDPR_TRACKING` / `SDK_GDPR_TARGETING` | Auto-handled by Dashboard build pipeline | Optional |

> GameDistribution **does not** support `auth.*`, `banners.*` (display banners are platform-managed, not game-managed), `friends.*`, or `player.getDataAsync/setDataAsync`. Those return `FeatureNotSupported`.

### Critical Rules

| Rule | Description |
|------|-------------|
| `gameId` is mandatory | `window.GD_OPTIONS.gameId` must be set **before** the SDK script loads. The Yes2SDK Dashboard injects the correct ID when bundling. |
| Event-based, not promise-based | GD does not return Promises from `showAd`. Yes2SDK wraps the event flow so `await ads.showInterstitial(...)` still works. |
| `SDK_GAME_PAUSE` fires on ad start | Mute audio + pause game loop in your `beforeAd` callback. |
| `SDK_GAME_START` fires after ad ends | Resume in `afterAd`. Note: this event also fires once at initial game start — Yes2SDK distinguishes the two. |
| `SDK_REWARDED_WATCH_COMPLETE` is the only reward signal | Reward is granted in the `adViewed` callback. If the player dismisses the rewarded ad early, only `afterAd` + `adDismissed` fire. |
| No external scripts beyond GD's SDK | All third-party scripts must be bundled. GD will reject builds that load arbitrary scripts at runtime. |

## Integration Example

### TypeScript / JavaScript

```typescript
await Yes2SDK.initializeAsync();
await Yes2SDK.startGameAsync();

Yes2SDK.game.gameplayStart();

// Interstitial between levels
Yes2SDK.game.gameplayStop();
await Yes2SDK.ads.showInterstitial('level-complete', {
    beforeAd: () => { muteAudio(); pauseGame(); },
    afterAd:  () => { unmuteAudio(); resumeGame(); Yes2SDK.game.gameplayStart(); },
});

// Rewarded — reward MUST be granted in adViewed (mapped from SDK_REWARDED_WATCH_COMPLETE)
Yes2SDK.game.gameplayStop();
await Yes2SDK.ads.showRewarded('extra-life', {
    beforeAd:    () => pauseGame(),
    afterAd:     () => { resumeGame(); Yes2SDK.game.gameplayStart(); },
    adViewed:    () => grantExtraLife(),
    adDismissed: () => {/* no reward */},
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

void OnLevelComplete()
{
    Yes2SDK.Yes2SDK.Game.GameplayStop();
    Yes2SDK.Yes2SDK.Ads.ShowInterstitial("level-complete", "Between levels",
        beforeAd: () => { AudioListener.pause = true;  Time.timeScale = 0f; },
        afterAd:  () => {
            AudioListener.pause = false; Time.timeScale = 1f;
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
    function(self) end,                                  -- beforeAd
    function(self) yes2sdk.session_gameplay_start() end, -- afterAd
    function(self) yes2sdk.session_gameplay_start() end  -- noFill
)
```

## How GameDistribution Works Under the Hood

- The SDK is loaded from `https://html5.api.gamedistribution.com/main.min.js`. Yes2SDK sets `window.GD_OPTIONS` (with `gameId` injected by the Dashboard) **before** appending the script tag so the SDK picks up the config on init.
- All ad signalling is event-based via the `onEvent` callback. Yes2SDK registers internal listeners for `SDK_GAME_PAUSE`, `SDK_GAME_START`, and `SDK_REWARDED_WATCH_COMPLETE`, then translates them to the standard `beforeAd` / `afterAd` / `adViewed` / `adDismissed` callbacks.
- GD has **no native gameplay lifecycle API**. `gameplayStart()` / `gameplayStop()` are kept for cross-platform code consistency — they're tracked locally for analytics but never call GD APIs.
- GD has **no cloud data API**. `data.*` uses `localStorage` with the `yes2sdk_` prefix.
- GDPR consent events (`SDK_GDPR_TRACKING` / `SDK_GDPR_TARGETING`) are handled by the Dashboard build pipeline — your game doesn't need to react to them.

### Ad Event Flow

```
ads.showInterstitial(placement, cbs):
  beforeAd → gdsdk.showAd('interstitial') → SDK_GAME_PAUSE → [ad plays] → SDK_GAME_START → afterAd
  beforeAd → throw                                                                       → noFill → afterAd

ads.showRewarded(placement, cbs):
  beforeAd → gdsdk.showAd('rewarded') → SDK_GAME_PAUSE
           → [watched fully]   → SDK_REWARDED_WATCH_COMPLETE → adViewed   → SDK_GAME_START → afterAd
           → [dismissed early] → SDK_GAME_START (no reward)               → adDismissed    → afterAd
```

## How to Submit

You don't upload to GameDistribution yourself — the Yes2Games team handles platform submission, including the `gameId` registration.

1. Upload a build on your game page (**Onboarding → Stage 1**)
2. Test it in the Inspector (**Onboarding → Stage 3**)
3. Click **Request Publish** in **Onboarding → Stage 4** and select GameDistribution
4. The Yes2Games team registers your game on GameDistribution (or reuses an existing listing), injects the correct `gameId` into the bundle, uploads it to gamedistribution.com, and submits it to GD's review on your behalf
5. You'll see status updates (`pending_review` → `reviewing` → `approved` / `needs_changes`) and feedback messages on the game page

If reviewers send back changes, upload a new build and request publish again on that build.

### What Yes2Games reviewers (and GD's review) check before submission

- [ ] `gameId` matches the GD portal registration (handled by Yes2Games)
- [ ] Game pauses (audio muted, logic stopped) on `SDK_GAME_PAUSE`
- [ ] Game resumes on `SDK_GAME_START` after ads
- [ ] Rewarded ads grant the reward on `SDK_REWARDED_WATCH_COMPLETE`
- [ ] No external scripts beyond the GD SDK itself
- [ ] Game serves at HTTPS and runs in an iframe without console errors

## Common Rejection Reasons

| Issue | Fix |
|-------|-----|
| Missing or wrong `gameId` | Register your game at gamedistribution.com first, then enter the GD `gameId` in the Yes2SDK Dashboard's Platform Keys settings. |
| Audio plays through ads | Mute in `beforeAd` (fires on `SDK_GAME_PAUSE`), restore in `afterAd` (fires on `SDK_GAME_START`). |
| Rewarded ads always granting | Only grant reward in the `adViewed` callback — not in `afterAd`. `afterAd` runs even on dismissal. |
| Game freezes after ad | Make sure `afterAd` resumes your game loop. The SDK's `onEvent` handler runs out of your game's animation frame loop. |
| External script blocked | Bundle all third-party code in your game zip. GameDistribution iframes block arbitrary cross-origin script loads. |
| `SDK_GAME_START` resumes too early | This event also fires at initial game start — Yes2SDK distinguishes the initial fire from post-ad fires. If you handle the event yourself, gate on `gameplayActive`. |

## Platform-Specific Notes

- **Currency**: GameDistribution reports revenue in EUR. The Yes2SDK Dashboard normalizes to USD for display.
- **Auth / Friends / Banners / IAP**: Not supported. Calls return `FeatureNotSupported`.
- **Data**: `localStorage` only. Anonymous cross-device sync is not possible.
- **Locale**: `session.getLocale()` returns `navigator.language` (browser locale).
- **GDPR**: Handled at the build pipeline level — your game does not need to expose consent UI for GD.
