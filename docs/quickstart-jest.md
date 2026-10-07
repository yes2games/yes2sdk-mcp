# Yes2SDK for Jest - Platform Guide

## Prerequisite

**Install Yes2SDK first.** None of the API below compiles until the SDK is installed in your project:

- **Unity:** UPM git URL `https://github.com/yes2games/yes2sdk-unity.git#<version>`, then `Yes2SDK > Build Window > Install Template`.
- **Defold:** add the release archive to `game.project` `[project]` dependencies, then Project > Fetch Libraries.

If you use the Yes2SDK MCP, call `get_install_instructions` for exact pinned steps and `detect_sdk` to confirm the SDK is installed before generating any code.

> **Do not install Jest's own SDK next to Yes2SDK.** No Jest Unity package, no Jest `<script>` tag in `index.html`. Yes2SDK loads the Jest SDK itself at runtime, and a second copy conflicts with it.

## Requirements

Jest ([jest.com](https://www.jest.com)) runs HTML5 games for players who start as guests and can register with a phone number. There are no in-game ads: Jest games earn through purchases and subscriptions, and keep players with notifications and referrals.

### API Requirements

The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)**.

| Jest feature | Yes2SDK API | Required |
|---|---|---|
| Loading progress | `setLoadingProgress(0..100)` | **Required** |
| Game loaded (`markGameLoaded`) | `startGameAsync()` | **Required** |
| Exit flow | `Yes2SDK.on('exitRequested', fn)` | **Required**: save inside the handler |
| Player store (1 MB) | `data.setString` / `data.setStringAsync` / `data.flushAsync` | **Required** |
| Entry payload | `session.getEntryPointData()` | **Required** when the game reads launch data |
| Incomplete purchases | `iap.getPurchasesAsync()` + `iap.consumePurchaseAsync(token)` | **Required** with IAP |
| Subscriptions | `iap.getSubscriptionsAsync()` / `iap.subscribeAsync(id)` | **Required** with subscriptions |
| Registration overlay | `auth.showRegistrationPrompt(options)` | Recommended (guests only) |
| Notifications | `notifications.scheduleAsync(options)` | Recommended (registered players only) |
| Referrals | `referrals.shareAsync(options)` / `referrals.listAsync()` | Optional |
| Share an image | `context.shareAsync({ image, data })` | Optional |
| Signed player | `player.getSignedPlayerInfoAsync()` | Optional (server verification) |

> Ads, banners, leaderboards, achievements, tournaments, stats, reviews, remote config, friends and score are **not supported** on Jest. The other modules report `isSupported() === false`.
>
> **Ads end without showing an ad (no fill), per engine:** JS and Defold: `noFill` / `no_fill` fires, then `afterAd` / `after_ad`; resume there. Unity: `Ads.IsInterstitialSupported()` and `Ads.IsRewardedSupported()` are `false`, and a show call fires `onError` with `NoFill`; resume in `onError`.

### Critical Rules (Jest launch checklist)

| Rule | Description |
|------|-------------|
| Save as a guest before any login prompt | Confirm the save (`setStringAsync` or `flushAsync`) before `auth.signInAsync()` or the registration prompt. Registration can reload the game. |
| D1 to D7 notifications | For registered players, one `scheduleAsync` per day with `scheduledInDays` 1 to 7, a stable `id` per day, and an image. Guests get `PLAYER_NOT_AUTHENTICATED`. |
| Recover incomplete purchases at startup | `getPurchasesAsync()`, grant and save each item, then `consumePurchaseAsync`. Repeat while the list is not empty. |
| Never re-offer a held subscription | Read `getSubscriptionsAsync()` at launch; grant when `isActive` and hide that offer. |
| Registration prompt for guests | Only while `auth.isAuthenticated()` is false. A custom prompt needs automatic login reminders (the `autoLoginReminders` build option) turned off: ask the Yes2Games team. |
| Save in `exitRequested` | Synchronous writes inside the handler. Yes2SDK flushes player data right after it returns; async work there is not awaited. |
| Loading progress and game loaded | Report progress while loading and call `startGameAsync()` only when playable. In Jest's Manual loading-screen mode Jest exits after 15 s without progress, so use the Automatic mode for now. |
| Relative asset paths | No root-relative (`/assets/...`) or absolute host URLs. |
| Entry payload, not URL params | Launch data arrives through `session.getEntryPointData()`. Jest does not pass game data in the page URL. |
| No reliance on ads | Ad calls end without showing an ad (no fill), see the per-engine note above. Never gate progression on a rewarded ad. |

## Integration Example

### TypeScript / JavaScript

```typescript
await Yes2SDK.initializeAsync();

// Save on exit: synchronous writes only, Yes2SDK flushes right after.
Yes2SDK.on('exitRequested', () => {
    Yes2SDK.data.setString('save', JSON.stringify(game.snapshot()));
});

// Finish purchases a previous session never completed.
for (let list = await Yes2SDK.iap.getPurchasesAsync(); list.length > 0;
     list = await Yes2SDK.iap.getPurchasesAsync()) {
    for (const p of list) {
        grantItem(p.productId);            // and save it
        await Yes2SDK.iap.consumePurchaseAsync(p.purchaseToken);
    }
}

const entry = Yes2SDK.session.getEntryPointData();   // never the URL
await loadAssets((p) => Yes2SDK.setLoadingProgress(p));
await Yes2SDK.startGameAsync();                     // Jest markGameLoaded

if (!Yes2SDK.auth.isAuthenticated()) {
    await Yes2SDK.data.setStringAsync('save', JSON.stringify(game.snapshot()));
    const prompt = Yes2SDK.auth.showRegistrationPrompt({ data: { from: 'save-slot' } });
    signUpButton.onclick = prompt.login;
    notNowButton.onclick = prompt.close;
} else {
    for (let d = 1; d <= 7; d++) {
        await Yes2SDK.notifications.scheduleAsync({
            id: `day${d}`, title: 'Your reward is ready', body: 'Come back for today\'s bonus.',
            scheduledInDays: d, imageAssetId: `reward_day_${d}`,
        });
    }
}
```

### Unity C#

```csharp
Yes2SDK.InitializeAsync(onSuccess: () =>
{
    Yes2SDK.OnExitRequested += () => Yes2SDK.Data.SetString("save", SerializeProgress());

    Yes2SDK.IAP.GetPurchasesAsync(
        onSuccess: json => RestorePurchases(Purchase.ListFromJson(json)));   // grant, save, ConsumePurchaseAsync

    var entry = Yes2SDK.Session.GetEntryPointDataDictionary();
    StartCoroutine(LoadAndStart());   // SetLoadingProgress(p), then StartGameAsync()

    // Registered players: a D1 to D7 return loop.
    if (Yes2SDK.Auth.IsAuthenticated() && Yes2SDK.Notifications.IsSupported())
        for (int d = 1; d <= 7; d++)
            Yes2SDK.Notifications.ScheduleAsync(new NotificationOptions {
                Id = $"day{d}", Title = "We miss you", Body = "Your rewards are waiting.",
                ScheduledInDays = d, ImageDataUrl = Yes2SDKImage.ToPngDataUrl(rewardTexture) });
});
```

Guests: save with `Data.FlushAsync`, then `Auth.ShowRegistrationPrompt(...)` and wire `prompt.Login` / `prompt.Close` to your own buttons. Subscriptions: gate on `IAP.IsSubscriptionSupported()` and grant when `Subscription.IsActive`.

### Defold Lua

```lua
yes2sdk.initialize(function(self, success, error)
    if not success then return end

    yes2sdk.on_exit_requested(function(self)
        yes2sdk.data_set_string("save", serialize_progress())   -- synchronous only
    end)

    if yes2sdk.iap_is_supported() then
        yes2sdk.iap_get_purchases(function(self, ok, purchases_json)
            if ok then
                for _, p in ipairs(json.decode(purchases_json)) do finish_purchase(p) end
            end
        end)
    end

    local entry = yes2sdk.session_get_entry_point_data()   -- always a table
    yes2sdk.start_game(function(self, ok) end)
end)
```

Guests: `auth_show_registration_prompt({...})` after `data_set_string_async` and `data_flush`. Registered players: `notifications_schedule` with `scheduled_in_days` 1 to 7 and `image_asset_id`.

## Common Rejection Reasons

| Issue | Fix |
|-------|-----|
| Progress lost when the player leaves | Write synchronously in `exitRequested`; confirm saves before any login or registration prompt. |
| Paid item never delivered | Recover with `getPurchasesAsync()` at startup, grant and save, then consume. |
| Subscription offered to a subscriber | Check `isActive` from `getSubscriptionsAsync()` before showing the offer. |
| Player sent home during loading | Report progress and call `startGameAsync()`; use Jest's Automatic loading-screen mode. |
| Two login reminders | When you show your own registration prompt, ask the Yes2Games team to turn off automatic login reminders (`autoLoginReminders`) for the game. |
| Assets fail to load | Use relative asset paths only. |
| Shared link opens without its data | Read `session.getEntryPointData()`, not URL parameters. |
| Game waits for an ad forever | Ads end at once without showing (no fill); continue in `afterAd` (Defold `after_ad`, Unity `onError`). |
| SDK errors in the console | Do not ship Jest's own SDK script or Unity package next to Yes2SDK. |

## Platform-Specific Notes

- **Data**: Jest's player store syncs across devices and is limited to 1 MB per game per player; a write past the limit is refused (`setStringAsync` resolves `false`).
- **Auth**: players start as guests. `signInAsync()` opens Jest's login; registration may finish outside the game, so check `isAuthenticated()` on the next launch. Sign-out is not offered.
- **IAP**: verify `signedRequest` on your server before granting value. A closed checkout rejects with `IAP_PURCHASE_CANCELLED` (`subscribeAsync` resolves `{ status: "cancelled" }` instead).
- **Notifications**: registered players only, `scheduledInDays` 0 to 7, an image through `imageAssetId` or `imageDataUrl` (PNG, JPEG or WebP, at most 2 MiB).
- **Context**: `context.shareAsync` opens Jest's share sheet even though `context.isSupported()` is `false`; do not gate on it.
- **Analytics**: logged locally only.
- **Gameplay calls**: keep calling `gameplayStart` / `gameplayStop`. The universal checks still expect them, and on Jest they are safe no-ops.
- Run `validate_integration` and `get_platform_requirements` for Jest: automated Jest rules are pending, so the launch checklist above is verified by hand.
