# Yes2SDK for Jest - Platform Guide

## Prerequisite

**Install Yes2SDK first.** None of the API below compiles until the SDK is installed in your project:

- **Unity:** UPM git URL `https://github.com/yes2games/yes2sdk-unity.git#<version>`, then `Yes2SDK > Build Window > Install Template`.
- **Defold:** add the release archive to `game.project` `[project]` dependencies, then Project > Fetch Libraries.

Jest needs at least Core 2.10.0, Unity 2.10.0 (2.11.0 for `Platform.Jest`) or Defold 1.8.0.

If you use the Yes2SDK MCP, call `get_install_instructions` for exact pinned steps and `detect_sdk` to confirm the SDK is installed before generating any code.

**Do not add Jest's own SDK.** No Jest Unity package and no Jest `<script>` tag. Yes2SDK loads the Jest SDK itself, and a second copy can conflict with it. In Unity, Yes2SDK logs a warning in the Editor and on each WebGL build when it finds Jest's `com.jest.sdk` package or a leftover `Assets/com.jest.sdk/init.jspre`; remove them.

## What Jest Is

[Jest](https://jest.com) is a mobile-first web game platform. Players come back through SMS and RCS messages, so scheduled notifications do the job a home screen icon does elsewhere. Jest earns from in-app purchases and subscriptions only. There are no in-game ads. Jest's own docs live at [docs.jest.com](https://docs.jest.com/sdk/html5).

The Yes2Games team handles everything on the Jest side: enabling Jest for your studio, the game's Jest credentials, Jest settings, building the bundle, uploading it and running Jest's checks. Your job is to make the game ready so it passes when we publish it.

## Requirements

Jest reviews every game against its [launch checklist](https://docs.jest.com/launch-checklist). Your game will be rejected if any of these are missing.

### API Requirements

The middle column is what Yes2SDK invokes on `JestSDK` under the hood. You never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)**.

| Jest Capability | Yes2SDK API | Required |
|---|---|---|
| `JestSDK.init()` | `Yes2SDK.initializeAsync()` | **Required** |
| `JestSDK.setLoadingProgress()` | `Yes2SDK.setLoadingProgress(n)` | **Required** (harmless when unused) |
| `JestSDK.markGameLoaded()` | `Yes2SDK.startGameAsync()` | **Required** (the moment the game is interactive) |
| Player data store (1 MB per player) | `data.getString/setString`, ..., `player.getDataAsync/setDataAsync` | **Required** (guests save too) |
| Login and registration overlay | `auth.isAuthenticated()`, `auth.showRegistrationPrompt()`, `auth.signInAsync()` | **Required** (prompt guests only) |
| Notifications (registered players) | `notifications.scheduleAsync()`, `cancelAsync()` | **Required** (a D1 to D7 sequence) |
| Payments | `iap.getCatalogAsync()`, `purchaseAsync()`, `getPurchasesAsync()`, `consumePurchaseAsync()` | **Required** if you sell items |
| Subscriptions | `iap.getSubscriptionsAsync()`, `subscribeAsync()` | **Required** if you sell subscriptions |
| `lifecycle.onExitRequested` | `Yes2SDK.on('exitRequested', fn)` | Recommended (save before the player leaves) |
| `lifecycle.onHide` / `onShow` | `Yes2SDK.on('pause', fn)` / `on('resume', fn)` | Recommended |
| `JestSDK.getEntryPayload()` | `session.getEntryPointData()` | Recommended |
| Signed player | `player.getSignedPlayerInfoAsync()` | Optional (for your server) |
| Bot avatars | `player.getBotAvatarAsync(username, size)`, `player.isBotAvatarSupported()` | Optional (avatars for computer-controlled players) |
| `JestSDK.referrals` | `referrals.shareAsync()`, `referrals.listAsync()` | Optional |
| `JestSDK.social.shareImage()` | `context.shareAsync({ intent, image, data })` | Optional |

> Jest **does not** support ads, banners, leaderboards, achievements, tournaments, stats, score, friends, reviews or remote config. Their `isSupported()` checks return `false` and most calls report `FEATURE_NOT_SUPPORTED`. Ad calls stay safe and never show an ad.

### Mandatory Call Sequence

```
1. Yes2SDK.initializeAsync()
2. Yes2SDK.setLoadingProgress(n)    <-- while loading, 0 to 100
3. Yes2SDK.startGameAsync()         <-- the moment the game is interactive
4. iap.getPurchasesAsync()          <-- recover and consume pending purchases
5. [player plays as a guest, progress saved with data.*]
6. auth.showRegistrationPrompt()    <-- guests only, after saving
7. notifications.scheduleAsync()    <-- D1 to D7, once the player is registered
```

### Critical Rules

| Rule | Description |
|------|-------------|
| Loads in under 10 seconds | Keep the first download small. Load the rest after `startGameAsync()` |
| Guests keep progress | Save with `data.*` as a guest, before any login prompt |
| One login prompt at a time | If the game shows its own registration prompt, tell the Yes2Games team so Jest's Automatic login reminders are turned off. Two prompts at once is a rejection |
| Prompt guests only | Check `auth.isAuthenticated()` before `showRegistrationPrompt()` |
| D1 to D7 notifications | At least one per day for the next seven days once the player registers |
| Recover purchases at startup | Grant, then consume, every purchase `getPurchasesAsync()` returns |
| Never re-offer a held plan | Check `isActive` before offering a subscription |
| Save on exit | Save synchronously in the `exitRequested` handler |
| Nothing points outside Jest | No external links, CTAs or outside sign-up prompts |
| No haptics | No vibrations. `performHapticFeedback()` already does nothing on Jest |
| Relative paths only | `index.html` at the zip root, no root-absolute paths such as `/assets/hero.png`. Jest serves games from a sub-path |

### Engine differences on Jest

- **Platform id.** TypeScript `session.getPlatform()` returns `"jest"`. Unity `GetPlatform()` returns `Platform.Jest` (2.11.0 and later; `Platform.Unknown` on 2.10.0).
- **Ads.** TypeScript: `noFill` then `afterAd`. Unity: `onError` with `error.Code == "NoFill"` and no `afterAd`, so resume in `onError`. Defold: `no_fill` then `after_ad`; resume in `after_ad` only.
- **Image sharing.** `context.isSupported()` is `false` on Jest, but image sharing works. Do not gate sharing on it.
- **Error codes.** Defold has no error constants. Compare strings from `yes2sdk.parse_error(err).code`, such as `"PLAYER_NOT_AUTHENTICATED"`.

## Integration Example

### TypeScript / JavaScript

```typescript
// Initialize and report loading progress (0 to 100)
Yes2SDK.setLoadingProgress(0);
await Yes2SDK.initializeAsync();
await loadAssets((percent: number) => Yes2SDK.setLoadingProgress(percent));
await Yes2SDK.startGameAsync(); // calls Jest's markGameLoaded

// Save as a guest too, and synchronously on exit
function saveProgress(): void {
    Yes2SDK.data.setString('progress', JSON.stringify(progress));
}
Yes2SDK.on('exitRequested', () => saveProgress());

// Registration prompt for guests only
function offerRegistration(): void {
    if (Yes2SDK.auth.isAuthenticated()) return;
    saveProgress();
    try {
        const prompt = Yes2SDK.auth.showRegistrationPrompt({
            message: 'My code is {{registrationCode}}. Save my farm!',
            data: { source: 'registration' },
            onClose: () => hideRegistrationScreen(),
        });
        registerButton.onclick = () => prompt.login();
    } catch (error) {
        console.warn('Registration prompt not shown', error); // throws, does not reject
    }
}

// Recover incomplete purchases at startup. Jest returns at most 50 per call and
// shows more only after you consume, so repeat until a round consumes nothing.
for (let round = 0; round < 10; round++) {
    const pending = await Yes2SDK.iap.getPurchasesAsync();
    let consumed = 0;
    for (const purchase of pending) {
        if (!saveHasPurchase(purchase.purchaseToken)) {
            // your own call to /purchases/claim (see Server Verification)
            if (!(await claimOnServer(purchase.signedRequest, purchase.purchaseToken))) continue;
            grantAndSave(purchase.productId, purchase.purchaseToken); // item and token in one save
        }
        try {
            await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
            consumed++;
        } catch (error) {
            // stays pending, retried later
        }
    }
    if (consumed === 0) break;
}

// Subscription entitlement: never offer a plan the player already holds
const subscriptions = await Yes2SDK.iap.getSubscriptionsAsync(); // empty for guests
const vip = subscriptions.find((s) => s.productId === 'vip_monthly');
if (vip?.isActive) unlockVip();
else if (vip) showVipOffer(vip.trialEligible);
```

### Unity C#

```csharp
Yes2SDK.Yes2SDK.InitializeAsync(onSuccess: () =>
{
    Yes2SDK.Yes2SDK.OnExitRequested += SaveProgress; // save synchronously on exit
    StartCoroutine(LoadGame());
});

IEnumerator LoadGame()
{
    Yes2SDK.Yes2SDK.SetLoadingProgress(50); // while loading scenes and assets
    yield return null;
    Yes2SDK.Yes2SDK.StartGameAsync(onSuccess: () => { RecoverPurchases(); CheckVip(); });
}

void SaveProgress()
{
    Yes2SDK.Yes2SDK.Data.SetString("progress", JsonUtility.ToJson(progress));
}

void OfferRegistration()
{
    if (Yes2SDK.Yes2SDK.Auth.IsAuthenticated()) return;
    SaveProgress();
    RegistrationPrompt prompt = Yes2SDK.Yes2SDK.Auth.ShowRegistrationPrompt(
        new RegistrationPromptOptions
        {
            Message = "My code is {{registrationCode}}. Save my farm!",
            Data = new Dictionary<string, object> { { "source", "registration" } }
        },
        onClose: HideRegistrationScreen,
        onError: error => Debug.LogWarning(error.Message));
    if (prompt != null) registerButton.onClick.AddListener(prompt.Login);
}

void CheckVip()
{
    Yes2SDK.Yes2SDK.IAP.GetSubscriptionsAsync(subscriptions =>
    {
        Subscription vip = subscriptions.Find(s => s.ProductId == "vip_monthly");
        if (vip != null && vip.IsActive) UnlockVip();
        else if (vip != null) ShowVipOffer(vip.TrialEligible);
    }, error => Debug.LogWarning(error.Message));
}
```

`RecoverPurchases()` follows the TypeScript loop with `IAP.GetPurchasesAsync` (parse with `Purchase.ListFromJson`) and `IAP.ConsumePurchaseAsync(p.PurchaseToken, ...)`.

### Defold Lua

```lua
local function save_progress()
    yes2sdk.data_set_string("progress", json.encode(progress))
end

yes2sdk.set_loading_progress(0)
yes2sdk.initialize(function(self, success, error)
    if not success then return end
    yes2sdk.on_exit_requested(function(self) save_progress() end)
    load_assets(function(percent) yes2sdk.set_loading_progress(percent) end, function()
        yes2sdk.start_game(function(self, success, error)
            recover_purchases() -- iap_get_purchases, grant, then iap_consume_purchase
            check_vip()
        end)
    end)
end)

local function offer_registration()
    if yes2sdk.auth_is_authenticated() then return end
    save_progress()
    local prompt, err = yes2sdk.auth_show_registration_prompt({
        message = "My code is {{registrationCode}}. Save my farm!",
        data = { source = "registration" },
        on_close = function(self) hide_registration_screen() end,
    })
    if prompt then
        on_register_pressed = function() prompt.login() end
    else
        print(yes2sdk.parse_error(err).code)
    end
end
```

`check_vip()` reads `yes2sdk.iap_get_subscriptions` (a JSON list) and checks `isActive` the same way.

### Notification sequence (D1 to D7)

Jest only sends notifications to registered players; a guest gets `PLAYER_NOT_AUTHENTICATED`. Schedule the sequence when the player registers and again as they progress. Reusing an `id` replaces the earlier notification.

- `scheduledInDays` is a whole number from 0 to 7. Jest picks the time within that day.
- Use `imageAssetId` (an image approved on Jest; ask the Yes2Games team to upload it) or `imageDataUrl` (PNG, JPEG or WebP data URL, at most 2 MiB). Not both.
- Keep bodies at 100 characters or fewer and vary the copy from day to day.
- `cancelAllAsync()` only cancels notifications from the current page session. Use `cancelAsync(id)` with your stable ids.

```typescript
async function scheduleRetentionSequence(): Promise<void> {
    if (!Yes2SDK.auth.isAuthenticated()) return;
    for (let day = 1; day <= 7; day++) {
        const message = MESSAGES[(day - 1) % MESSAGES.length];
        await Yes2SDK.notifications.scheduleAsync({
            id: `retention_d${day}`, // stable per day, so rescheduling replaces it
            title: message.title,
            body: message.body,
            scheduledInDays: day,
            imageAssetId: 'farm_hero',
            data: { source: 'notification', day },
        });
    }
}
```

Unity uses `Notifications.ScheduleAsync(new NotificationOptions { Id, Title, Body, ScheduledInDays, ImageAssetId, Data })`. Defold uses `notifications_schedule({ id, title, body, scheduled_in_days, image_asset_id, data }, callback)`.

## Server Verification

If your game has a backend, never grant paid items, subscription perks or referral rewards on client values alone. Jest signs those values, and the Yes2Games dashboard checks the signatures for you. The Yes2Games team stores your game's Jest credentials, so there is nothing to configure.

| What to verify | `kind` | The token to send |
|---|---|---|
| Player | `player` | `signature` from `player.getSignedPlayerInfoAsync()` |
| Purchase | `purchase` | `purchase.signedRequest` (Unity `Purchase.SignedRequest`) |
| Subscription | `subscription` | `subscription.signedRequest` |
| Referrals | `referrals` | `signedRequest` from `referrals.listAsync()` |

Both endpoints take a JSON body with only a `Content-Type: application/json` header. No API key: the signed token is the credential. Any origin may call them.

**`POST https://dashboard.yes2games.com/api/platform/jest/verify`**

```json
{ "kind": "purchase", "token": "<signed value>", "expectedPlayerId": "<optional>" }
```

`kind` defaults to `"auto"`. Success returns `{ "success": true, "data": { kind, jestGameId, playerId, issuedAt, claims, ledger } }`. `claims` holds the verified purchases, subscriptions, player or referrals. For a subscription, grant the perk only when `status` is `active`. Treat `sandbox: true` as a test with no real money. Player, subscription and referrals tokens expire after 24 hours.

**`POST https://dashboard.yes2games.com/api/platform/jest/purchases/claim`**

```json
{ "token": "<signed purchase value>", "purchaseToken": "<the purchase to claim>" }
```

Returns `{ "success": true, "data": { "claimed": true, "claimedAt": "..." } }` exactly once per purchase. Later calls return `claimed: false` with the original `claimedAt`. To grant exactly once: claim, then grant and save the item with its `purchaseToken` in the same save, then consume. If claim says `claimed: false` and your save lacks the token, the game stopped between claim and save: grant, save, then consume.

Errors return `{ "success": false, "error": "<text>", "code": "<code>" }`:

| Status | `code` | What to do |
|---|---|---|
| 400, 401, 409, 413, 422 | `invalid_request`, `invalid_signature`, `subject_mismatch`, `token_too_old`, ... | Do not grant, do not consume. For `token_too_old`, get a fresh token from Jest |
| 404 | `game_not_configured` | Tell the Yes2Games team. Do not grant |
| 429 | `rate_limited` | Wait for `Retry-After` seconds, then retry |
| 503 | `verification_unavailable`, `ledger_unavailable` | Do not grant or consume yet. Retry later |

## How Jest Works Under the Hood

- Yes2SDK loads the Jest SDK from Jest's CDN at runtime.
- `startGameAsync()` calls Jest's `markGameLoaded`, which tells Jest the game is interactive.
- **Loading screen.** The Yes2Games team sets Jest's loading screen mode. Auto is the default and needs nothing from you. If you want Manual mode (Jest shows your real progress), tell the team. In Manual mode, Jest sends the player home if it gets no progress for 15 seconds, so keep calling `setLoadingProgress` during long loads.
- Ad calls never show an ad. They report a no-fill straight away (see Engine differences above).

## Testing

- **Local.** Open the game with `?yes2sdk_platform=jest` to run Yes2SDK against the Jest adapter. The Jest SDK loads from Jest's CDN, so the page needs network access. Jest's SDK gives you a debug menu to change the player's state.
- **Inspector.** Upload a build on your game page and test it in the Yes2SDK dashboard Inspector.
- **Unity Play Mode.** Exercise subscriptions, notifications, the registration prompt, referrals, image sharing and the exit request with the mocks under **Yes2SDK > Build Window > Play Mode Testing**.

The Yes2Games team runs the Jest Simulator and sandbox checks before submitting.

## How to Submit

You don't upload to Jest yourself. The Yes2Games team handles everything on the Jest side.

1. Upload a build on your game page (**Onboarding → Stage 1**). It needs `index.html` at the zip root and relative paths only.
2. Test it in the Inspector (**Onboarding → Stage 3**).
3. Click **Request Publish** in **Onboarding → Stage 4** and select Jest.
4. Tell the Yes2Games team if the game shows its own registration prompt, or wants Manual loading mode.
5. The Yes2Games team builds the Jest bundle, runs Jest's checks and submits it. You'll see status updates and feedback on the game page.

If reviewers send back changes, upload a new build and request publish again on that build.

### What Yes2Games reviewers check before submitting to Jest

- [ ] Game loads in under 10 seconds
- [ ] `startGameAsync()` runs the moment the game is interactive
- [ ] A guest can play, save and come back to the same progress
- [ ] The registration prompt appears for guests only, and never on top of Jest's own reminder
- [ ] A registered player gets a D1 to D7 notification sequence with images
- [ ] A guest triggers no unhandled notification or subscription errors
- [ ] An interrupted purchase is granted on the next launch, exactly once
- [ ] A subscription the player holds is never offered again
- [ ] Progress is saved when the player leaves
- [ ] No ads, no links or prompts that lead outside Jest, no vibrations
- [ ] Relative asset paths only

## Common Rejection Reasons

| Issue | Fix |
|-------|-----|
| First load takes longer than 10 seconds | Keep the first download small and load the rest after `startGameAsync()` |
| Player sent home while loading (Manual mode) | Keep calling `setLoadingProgress` so Jest hears from the game at least every 15 seconds |
| A guest loses progress, or must register to keep it | Save with `data.setString` as a guest too, before any login prompt |
| Two login prompts at once | Tell the Yes2Games team the game has its own prompt, so Automatic login reminders are turned off |
| No D1 to D7 notification sequence | Schedule at least one notification per day for seven days once the player registers |
| Interrupted purchase not granted on next launch | Recover with `iap.getPurchasesAsync()` at startup, grant, then `consumePurchaseAsync()` |
| A held subscription is offered again | Check `isActive` from `iap.getSubscriptionsAsync()` before offering |
| Links or sign-up prompts that lead outside Jest | Remove them |
| The game vibrates | Remove haptics |
| Bundle refused for root-absolute paths | Make every path relative to `index.html` (`assets/hero.png`, not `/assets/hero.png`) |

## Platform-Specific Notes

- **Data storage:** the Data module and `player.getDataAsync/setDataAsync` share Jest's player store, which follows the player across devices. The limit is 1 MB per player. Past it, `data.setString` skips the write with a warning and `setStringAsync` resolves `false`.
- **Player:** every player, guest or registered, has a stable id. `player.getMode()` returns `"authorized"` for a registered player and `"lite"` for a guest.
- **Bot avatars:** `player.getBotAvatarAsync(username, size)` returns a Jest-generated avatar URL for a bot. The same username always gets the same picture. Other platforms reject it, so check `player.isBotAvatarSupported()` and keep your own art as the fallback.
- **Registration prompt:** throws `INVALID_OPERATION` for a registered player. `INVALID_PARAM` means the message is blank, over 140 characters, or lacks exactly one `{{registrationCode}}`. Jest finishes registration over SMS and reloads the game, so check `auth.isAuthenticated()` on the next launch.
- **Prices:** `Product.priceAmount` is a decimal such as `4.99`, not cents. `developerPayload` is not passed to Jest.
- **Purchases:** a closed checkout rejects with `IAP_PURCHASE_CANCELLED` (Unity: `ErrorCode.UserCancelled`). `consumePurchaseAsync` is safe to repeat. Test purchases have `isSandbox: true`.
- **Subscriptions:** `subscribeAsync` resolves `{ status: "cancelled" }` when the player closes the checkout. Guests get no subscriptions.
- **Exit:** async work started in the `exitRequested` handler is not awaited. Save synchronously.
- **Gameplay events:** keep calling `game.gameplayStart()` and `game.gameplayStop()`. They do nothing on Jest, but the same code then works on the other platforms.
- **Analytics, audio, haptics:** `analytics.log*` is not forwarded to Jest. `session.isAudioEnabled()` is always `true`. Haptic feedback does nothing.
- **Invites:** use Referrals, not `game.inviteLink()`. Jest only counts invited players who complete registration.
- **Referral options:** `referrals.shareAsync` also takes `onboardingSlug` (route invited players through an onboarding game first) and `notificationTemplates` (notifications to the referrer as invited players join). See [Referrals](/docs/api/referrals).
- **Entry point data:** comes only from Jest's entry payload, never from the page URL.
