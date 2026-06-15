# Yes2SDK for YouTube Playables - Platform Guide

## Requirements

YouTube Playables runs your game inside a sandboxed iframe on `youtube.com` and applies the strictest certification checks of any Yes2Games platform. Several APIs are **certification-mandatory** — without them YouTube will reject the game even if it runs fine in the Inspector.

### API Requirements

The Yes2SDK methods below cover every YouTube Playables (`ytgame`) call you need. The middle column is what Yes2SDK invokes on `window.ytgame` under the hood — you never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)** — only the method-naming convention changes (see Integration Example below).

| Platform Requirement | Yes2SDK API | Required |
|---|---|---|
| `ytgame.game.firstFrameReady()` | `Yes2SDK.initializeAsync()` (fires after first paint) | **Required (cert)** |
| `ytgame.game.gameReady()` | `Yes2SDK.startGameAsync()` | **Required (cert)** — game is interactable |
| `ytgame.system.onPause(fn)` | `Yes2SDK.on('pause', fn)` | **Required (cert)** — game MUST stop on pause |
| `ytgame.system.onResume(fn)` | `Yes2SDK.on('resume', fn)` | **Required (cert)** |
| `ytgame.system.onAudioEnabledChange(fn)` | `Yes2SDK.on('audioEnabledChange', fn)` | **Required (cert)** — match platform mute state |
| `ytgame.system.isAudioEnabled()` | `session.isAudioEnabled()` | **Required (cert)** — read at startup |
| `ytgame.system.getLanguage()` | `session.getLocale()` (BCP-47, cached on init) | Recommended |
| `ytgame.ads.requestInterstitialAd()` | `ads.showInterstitial(placement, cbs)` | Recommended (monetization) |
| `ytgame.ads.requestRewardedAd(rewardId)` | `ads.showRewarded(placement, cbs)` | Recommended (monetization) |
| `ytgame.game.loadData()` + `saveData(json)` | `data.getInt/setInt`, `data.getString/setString`, ... | Optional (cloud, 3 MiB cap) |
| `ytgame.engagement.sendScore({ value })` | `score.addScore(n)` | Optional (shown in YouTube UI) |
| `ytgame.health.logError/logWarning` | Auto-wired from SDK logger | Optional |

> Banner ads, auth, friends, and IAP are **not supported** on YouTube Playables. `ads.showBanner`, `auth.*`, `banners.*`, `friends.*`, and `iap.*` return `FeatureNotSupported`.

### Critical Rules

| Rule | Description |
|------|-------------|
| `firstFrameReady` after first paint | Yes2SDK waits one `requestAnimationFrame` after init so your splash/loading screen is on screen before signalling. Do not block the first paint with synchronous work. |
| `gameReady` only when interactable | Call `startGameAsync()` once *all* assets are loaded and the player can actually input. Calling it during loading = cert fail. |
| Pause/resume are mandatory | Pause callback must stop the game loop, audio, and network. Resume is **not** guaranteed — never assume it will fire. |
| Honor `audioEnabledChange` | When YouTube mutes via its player UI, your game must mute too. Read `isAudioEnabled()` at startup, then subscribe to changes. |
| No external scripts | YouTube's sandbox blocks external `<script src="http...">`. All code must be inlined or bundled (the Yes2Games Dashboard handles bundling). |
| `loadData()` before `saveData()` | The Data module preloads on init. Don't call `data.set*()` before `initializeAsync()` resolves. |

## Integration Example

### TypeScript / JavaScript

```typescript
await Yes2SDK.initializeAsync();   // -> ytgame.game.firstFrameReady()

// Cert requirement #1 — honor platform pause
Yes2SDK.on('pause',  () => pauseGameLoop());
Yes2SDK.on('resume', () => resumeGameLoop());

// Cert requirement #2 — match the platform audio state
Yes2SDK.on('audioEnabledChange', ({ enabled }) => {
    setAudioMuted(!enabled);
});
setAudioMuted(!Yes2SDK.session.isAudioEnabled());

await Yes2SDK.startGameAsync();    // -> ytgame.game.gameReady()
Yes2SDK.game.gameplayStart();

// Submit score to YouTube UI
Yes2SDK.score.addScore(1500);

// Rewarded ad
Yes2SDK.game.gameplayStop();
await Yes2SDK.ads.showRewarded('extra-life', {
    beforeAd:  () => pauseGameLoop(),
    afterAd:   () => { resumeGameLoop(); Yes2SDK.game.gameplayStart(); },
    adViewed:  () => grantExtraLife(),
    adDismissed: () => {/* no reward */},
});
```

### Unity C#

```csharp
Yes2SDK.Yes2SDK.OnPause  += () => { AudioListener.pause = true;  Time.timeScale = 0f; };
Yes2SDK.Yes2SDK.OnResume += () => { AudioListener.pause = false; Time.timeScale = 1f; };
Yes2SDK.Yes2SDK.OnAudioEnabledChange += (enabled) => {
    AudioListener.volume = enabled ? 1f : 0f;
};

Yes2SDK.Yes2SDK.InitializeAsync(onSuccess: () =>
{
    Yes2SDK.Yes2SDK.StartGameAsync(onSuccess: () =>
    {
        Yes2SDK.Yes2SDK.Game.GameplayStart();
    });
});

void OnLevelCompleted(int score)
{
    Yes2SDK.Yes2SDK.Score.AddScore(score);
}
```

### Defold Lua

```lua
yes2sdk.initialize(function(self, success, error)
    if not success then return end

    -- Cert: honor pause/resume
    yes2sdk.on_pause(function(self) pause_game_loop() end)
    yes2sdk.on_resume(function(self) resume_game_loop() end)

    -- Cert: honor audio mute state
    yes2sdk.on_audio_enabled_change(function(self, enabled)
        sound.set_group_gain("master", enabled and 1 or 0)
    end)
    if not yes2sdk.session_is_audio_enabled() then
        sound.set_group_gain("master", 0)
    end

    yes2sdk.start_game(function(self, success, error)
        yes2sdk.session_gameplay_start()
    end)
end)

-- Submit score
yes2sdk.score_add(level_score)
```

## How YouTube Playables Works Under the Hood

- The `ytgame` global is loaded from `https://www.youtube.com/game_api/v1` and only works inside the YouTube iframe. Outside YouTube, the SDK loader treats this as a no-op and the platform reports as `Unknown` / `Debug`.
- `Yes2SDK.initializeAsync()` waits one `requestAnimationFrame` before calling `firstFrameReady()` so your loading screen is guaranteed to be visible — required by Playables certification.
- `Yes2SDK.startGameAsync()` calls `gameReady()` to dismiss YouTube's loading shim. Do **not** call this until your game is actually playable.
- `data.*` is backed by `ytgame.game.loadData()` / `saveData()` with a single JSON blob (3 MiB cap). Writes are batched with a 500 ms debounce.
- `score.addScore(n)` calls `ytgame.engagement.sendScore({ value: n })`. YouTube displays the **highest** score, not the latest — submit every score.
- Errors and warnings from the SDK are mirrored to `ytgame.health.logError/logWarning` for YouTube's health reporting.

## How to Submit

You don't upload to YouTube yourself — the Yes2Games team handles platform submission via YouTube Creator Studio's Playables flow.

1. Upload a build on your game page (**Onboarding → Stage 1**)
2. Test it in the Inspector (**Onboarding → Stage 3**) — pay extra attention to the pause/resume and audio-mute checks since YouTube's cert is the strictest
3. Click **Request Publish** in **Onboarding → Stage 4** and select YouTube Playables
4. The Yes2Games team runs YouTube's cert checklist against the build, submits it through YouTube Creator Studio, and shepherds it through Google's review
5. You'll see status updates and feedback messages on the game page

If YouTube cert sends back changes, upload a new build and request publish again on that build.

### What Yes2Games reviewers (and YouTube's cert) check before submission

- [ ] `firstFrameReady` fires within the loading screen window
- [ ] `gameReady` fires only when the game is interactable
- [ ] Game pauses immediately on `onPause` (audio + game loop + network)
- [ ] Game audio matches `isAudioEnabled()` at startup and on every change
- [ ] No external scripts loaded at runtime
- [ ] Game does not assume `onResume` will fire after `onPause`
- [ ] Cloud saves stay under 3 MiB serialized

## Common Rejection Reasons

| Issue | Fix |
|-------|-----|
| `firstFrameReady` fires before first paint | The SDK already handles this — don't block init with sync asset loading. Move heavy work behind `setLoadingProgress` updates. |
| Game keeps playing audio after `onPause` | Subscribe to `Yes2SDK.on('pause', ...)` and `on('audioEnabledChange', ...)`. Don't rely on `visibilitychange`. |
| Audio doesn't mute when player mutes YouTube | Read `session.isAudioEnabled()` at startup AND subscribe to `audioEnabledChange`. |
| `gameReady` called too early | Wait until all assets are loaded and the game accepts input. Loading screens don't count as "ready". |
| Save data > 3 MiB | Trim what you store — YouTube hard-caps cloud saves at 3 MiB UTF-16. |
| External script blocked by CSP | Bundle all third-party code into your game zip via the Yes2SDK Dashboard. Don't load `<script src="https://...">` at runtime. |

## Platform-Specific Notes

- **Banners / Auth / Friends / IAP**: Not supported. `isSupported()` returns `false`; calls reject with `FeatureNotSupported`.
- **Locale**: `session.getLocale()` returns the cached BCP-47 tag (`en`, `fr-FR`, `ja`, ...). Cached at init so calls are synchronous.
- **Score**: YouTube shows the highest score automatically — no leaderboard API needed. Submit every score with `score.addScore(n)`.
- **Sandbox**: No DOM access beyond the game canvas, no third-party network requests, no `localStorage` quota beyond what `data.*` uses internally.
- **Outside YouTube**: When run outside the YouTube iframe (Inspector, dev preview), the SDK no-ops on platform calls and reports the platform as `Debug` / `Unknown`.
