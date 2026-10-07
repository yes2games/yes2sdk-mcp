# Yes2SDK for Jest - Platform Guide

## Prerequisite

**Install Yes2SDK first.** None of the API below compiles until the SDK is installed in your project. Jest support needs the Yes2SDK runtime 2.10.0, Unity package 2.10.0 or Defold extension 1.8.0:

- **Unity:** UPM git URL `https://github.com/yes2games/yes2sdk-unity.git#v2.10.0`, then `Yes2SDK > Build Window > Install Template`.
- **Defold:** add `https://github.com/yes2games/yes2sdk-defold/archive/refs/tags/v1.8.0.zip` to `game.project` `[project]` dependencies, then Project > Fetch Libraries.

If you use the Yes2SDK MCP, call `get_install_instructions` for exact pinned steps and `detect_sdk` to confirm the SDK is installed before generating any code.

## What Jest Is

[Jest](https://jest.com) is a mobile-first web game platform. Players find games on jest.com and come back through SMS and RCS messages, so scheduled notifications do the job a home screen icon does elsewhere. Jest makes money from in-app purchases and subscriptions only. There are no in-game ads. Jest's own documentation lives at [docs.jest.com](https://docs.jest.com/sdk/html5).

Yes2SDK loads the Jest SDK from Jest's CDN at runtime. You never call `JestSDK` yourself: the same Yes2SDK calls you use on the other platforms work here.

**Do not install Jest's own SDK next to Yes2SDK.** Add no Jest Unity package and no Jest `<script>` tag to your page. Yes2SDK loads the Jest SDK itself whenever the page does not already have it, so a second copy is not needed and can conflict with the one Yes2SDK initializes.

## Setting Up in the Dashboard

Jest settings in the Yes2Games dashboard are available once the dashboard release ships.

### Turning Jest on for your studio

Jest is enabled per studio by a Yes2Games admin. It starts off for every studio, and studios cannot turn it on themselves. Ask the Yes2Games team when you are ready to ship on Jest.

### Jest server verification card

Each game has a **Jest server verification** card on its Overview tab. It lets the dashboard check signed Jest tokens for that game (see [Server Verification](#server-verification)).

| Field | Where it comes from |
|---|---|
| **Jest game id** | Jest Developer Console, **Secrets** section |
| **Shared secret** | Jest Developer Console, **Secrets** section |

- The shared secret is write-only. Once saved it is never shown again; the card shows a short **Secret fingerprint**, who updated it, and when a token was **Last verified**. Leave the secret blank on a later edit to keep the current one.
- Owners and managers can edit the card. Developers see its status only.
- Paste a signed token (for example one from the Jest Simulator) and press **Test token** to confirm the saved id and secret are right. A test does not count as a verification.
- **Remove** deletes the saved id and secret. Token checks stop until you add them again.
- The Jest game id saved here is also the one built into your Jest bundle.

### Automatic login reminders

The game's Overview edit form has a **Jest** box with one setting, **Automatic login reminders**. It is on by default.

- **On:** Jest shows its own login reminder popups to guests.
- **Off:** Jest's automatic reminders are disabled. Calling `auth.signInAsync()` still works.

Turn it **off** if the game shows its own registration prompt with `auth.showRegistrationPrompt`, so the player does not get two prompts. The change takes effect on the next Jest bundle.

### Loading screen mode

The loading screen mode is a Jest setting. You choose it in the Jest Developer Console under your app's settings, not in the Yes2Games dashboard. Jest offers three modes ([Jest loading screen docs](https://docs.jest.com/sdk/loading-screen?engine=html5)):

| Mode | What Jest does |
|---|---|
| **Auto** (default) | Shows a short loading animation and dismisses it after a fixed time |
| **Manual** | Shows an overlay at 0% and lets the game report progress and dismiss it |
| **Off** | Shows no loading overlay |

**Use Auto mode.** In Manual mode, if Jest receives no progress update for 15 seconds it assumes the game failed to load and sends the player back to the home screen. Yes2SDK keeps progress flowing once it has initialized, but nothing can report progress while the engine is still downloading, before the Jest SDK has loaded. Manual mode is safe only when the Jest SDK loads before the engine, which bundles built by the dashboard release do once it ships.

In every mode, `Yes2SDK.startGameAsync()` calls Jest's `markGameLoaded`, which tells Jest the game is interactive. In Manual mode it also dismisses the overlay as if progress had reached 100.

## Requirements

### API Requirements

The Yes2SDK methods below cover every Jest-platform call you need. The middle column is what Yes2SDK invokes on `JestSDK` under the hood. You never call those directly. The same Yes2SDK API works in **TypeScript**, **Unity (`Yes2SDK.Yes2SDK.*`)**, and **Defold (`yes2sdk.*`)**. Only the method-naming convention changes (see Integration Example below).

| Jest Capability | Yes2SDK API | Required |
|---|---|---|
| `JestSDK.init()` | `Yes2SDK.initializeAsync()` | **Required** |
| `JestSDK.setLoadingProgress()` (Manual mode) | `Yes2SDK.setLoadingProgress(n)` | **Required** in Manual mode, harmless in Auto |
| `JestSDK.markGameLoaded()` | `Yes2SDK.startGameAsync()` | **Required** (the moment the game is interactive) |
| Player and signed player | `player.getPlayer()`, `player.getSignedPlayerInfoAsync()` | **Required** (key saves on the player id) |
| Player data store (1 MB per player) | `data.getString/setString`, ..., `player.getDataAsync/setDataAsync` | **Required** (guests save too) |
| Login and registration overlay | `auth.isAuthenticated()`, `auth.showRegistrationPrompt()`, `auth.signInAsync()` | **Required** (prompt guests only) |
| Notifications (registered players) | `notifications.scheduleAsync()`, `cancelAsync()` | **Required** (a D1 to D7 sequence) |
| Payments | `iap.getCatalogAsync()`, `purchaseAsync()`, `getPurchasesAsync()`, `consumePurchaseAsync()` | **Required** if you sell items |
| Subscriptions | `iap.getSubscriptionsAsync()`, `subscribeAsync()` | **Required** if you sell subscriptions |
| `lifecycle.onExitRequested` | `Yes2SDK.on('exitRequested', fn)` | Recommended (save before the player leaves) |
| `lifecycle.onHide` / `onShow` | `Yes2SDK.on('pause', fn)` / `on('resume', fn)` | Recommended |
| `JestSDK.getEntryPayload()` | `session.getEntryPointData()` | Recommended |
| `JestSDK.referrals` | `referrals.shareAsync()`, `referrals.listAsync()` | Optional |
| `JestSDK.social.shareImage()` | `context.shareAsync({ intent, image, data })` | Optional |

> Jest **does not** support ads, banners, leaderboards, achievements, tournaments, stats, score, friends, reviews or remote config. Their support checks return `false` (`isSupported()`, and for ads `isInterstitialSupported()` and `isRewardedSupported()`), and most of their calls report `FEATURE_NOT_SUPPORTED`. Score calls are only logged locally, and `config.getFlagsAsync()` returns the defaults you pass. Ad calls stay safe and never show an ad (Unity: see below).

### Engine differences on Jest

- **Platform id.** TypeScript `session.getPlatform()` returns `"jest"`. In Unity, `GetPlatform()` returns `Platform.Unknown` on Jest, because the `Platform` enum has no Jest member.
- **Ads.** Jest has no ads, and each engine reports the no-fill its own way:
  - TypeScript: `noFill` then `afterAd`; resume in `afterAd`.
  - Unity: `onError` with `NoFill` (check `error.Code`; its `ErrorCode` is `Unknown`), and no `afterAd` follows, so resume in `onError`. `Ads.IsRewardedSupported()` and `Ads.IsInterstitialSupported()` return `false` on Jest, so you can hide ad offers up front.
  - Defold: `no_fill` then `after_ad`; resume in `after_ad` only.
- **Image sharing.** `context.isSupported()` (Unity `Context.IsSupported()`, Defold `context_is_supported()`) is `false` on Jest, but image sharing works. Do not gate sharing on it.
- **Subscriptions.** `iap.isSubscriptionSupported()` is `true` on Jest.
- **Error codes.** Defold has no error constants. Compare strings from `yes2sdk.parse_error(err).code`, such as `"PLAYER_NOT_AUTHENTICATED"`.

## Integration Example

The examples cover startup and loading, guest saves, the exit request, the registration prompt, purchase recovery, subscriptions, referrals, image sharing, entry point data, the signed player and ads. The notification sequence is in the [launch checklist](#jest-launch-checklist) below.

### TypeScript / JavaScript

```typescript
// 1. Initialize and report loading progress (0 to 100)
Yes2SDK.setLoadingProgress(0);
await Yes2SDK.initializeAsync();
await loadAssets((percent: number) => Yes2SDK.setLoadingProgress(percent));

// 2. The game is interactive: this calls Jest's markGameLoaded
await Yes2SDK.startGameAsync();

// 3. Data the player arrived with (referral, notification, registration, share)
const entry = Yes2SDK.session.getEntryPointData();
if (entry.source === 'referral') showWelcomeFromFriend();

// 4. Save progress as a guest too. Jest keeps it in the player store (1 MB).
function saveProgress(): void {
    Yes2SDK.data.setString('progress', JSON.stringify(progress));
}

// 5. Exit request: save synchronously. Yes2SDK flushes player data right after.
Yes2SDK.on('exitRequested', () => saveProgress());

// 6. Registration prompt for guests (turn Automatic login reminders off)
function offerRegistration(): void {
    if (Yes2SDK.auth.isAuthenticated()) return; // guests only
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

// 7. Recover incomplete purchases at startup (see Server Verification for claimOnServer).
// Jest returns at most 50 per call and shows more only after you consume,
// so repeat until the list is empty (bounded, and stop when a round consumes nothing).
const MAX_ROUNDS = 10;
for (let round = 0; round < MAX_ROUNDS; round++) {
    const pending = await Yes2SDK.iap.getPurchasesAsync();
    let consumed = 0;
    for (const purchase of pending) {
        if (!saveHasPurchase(purchase.purchaseToken)) {
            if (!(await claimOnServer(purchase.signedRequest, purchase.purchaseToken))) continue; // stays pending, retried on a later round or launch
            grantAndSave(purchase.productId, purchase.purchaseToken); // item and token in one save
        }
        try {
            await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
            consumed++;
        } catch (error) {
            // IAP_PURCHASE_FAILED: it stays pending and is retried on a later round or launch
        }
    }
    if (consumed === 0) break; // empty, or only purchases left for a later launch
}

// 8. Subscription entitlement: never offer a plan the player already holds
const subscriptions = await Yes2SDK.iap.getSubscriptionsAsync(); // empty for guests
const vip = subscriptions.find((s) => s.productId === 'vip_monthly');
if (vip?.isActive) unlockVip();
else if (vip) showVipOffer(vip.trialEligible);

// 9. Referrals
await Yes2SDK.referrals.shareAsync({
    reference: 'invite_v1',
    text: 'Come help on my farm',
    data: { source: 'referral' },
});
const { referrals, signedRequest } = await Yes2SDK.referrals.listAsync();
const joined = referrals['invite_v1']?.length ?? 0; // verify signedRequest before rewarding

// 10. Share an image (do not gate on context.isSupported())
await Yes2SDK.context.shareAsync({
    intent: 'SHARE',
    image: canvas.toDataURL('image/png'),
    data: { source: 'share' },
});

// 11. Signed player for your server
const { playerId, signature } = await Yes2SDK.player.getSignedPlayerInfoAsync();

// 12. Ads: Jest has none. noFill then afterAd fire at once, so the game just carries on.
await Yes2SDK.ads.showRewarded('extra-life', {
    adViewed: () => grantExtraLife(),
    noFill: () => showNoRewardMessage(),
    afterAd: () => resumeGame(),
});
```

### Unity C#

```csharp
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using Yes2SDK;

// 1. Initialize and report loading progress (0 to 100)
Yes2SDK.Yes2SDK.InitializeAsync(onSuccess: () =>
{
    Yes2SDK.Yes2SDK.OnExitRequested += SaveProgress; // 5. save synchronously on exit
    StartCoroutine(LoadGame());
});

IEnumerator LoadGame()
{
    // ... load scenes and assets, calling:
    Yes2SDK.Yes2SDK.SetLoadingProgress(50);
    yield return null;

    // 2. The game is interactive: this calls Jest's markGameLoaded
    Yes2SDK.Yes2SDK.StartGameAsync(onSuccess: () =>
    {
        // 3. Data the player arrived with
        var entry = Yes2SDK.Yes2SDK.Session.GetEntryPointDataDictionary();
        if (entry.TryGetValue("source", out var source) && (source as string) == "referral")
            ShowWelcomeFromFriend();

        RecoverPurchases();
        CheckVip();
    });
}

// 4. Save progress as a guest too
void SaveProgress()
{
    Yes2SDK.Yes2SDK.Data.SetString("progress", JsonUtility.ToJson(progress));
}

// 6. Registration prompt for guests
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

// 7. Recover incomplete purchases at startup. Jest returns at most 50 per call and
// shows more only after you consume, so fetch again after each round until it is empty.
void RecoverPurchases(int round = 0)
{
    if (round >= 10) return; // bound the loop
    Yes2SDK.Yes2SDK.IAP.GetPurchasesAsync(json =>
    {
        List<Purchase> pending = Purchase.ListFromJson(json);
        if (pending.Count == 0) return; // nothing left to recover
        int left = pending.Count;
        bool consumedAny = false;
        void Done(bool consumed)
        {
            consumedAny |= consumed;
            if (--left == 0 && consumedAny) RecoverPurchases(round + 1); // more may appear now
        }
        void Consume(Purchase p) => Yes2SDK.Yes2SDK.IAP.ConsumePurchaseAsync(p.PurchaseToken,
            onSuccess: () => Done(true), onError: _ => Done(false));

        foreach (Purchase purchase in pending)
        {
            if (SaveHasPurchase(purchase.PurchaseToken)) { Consume(purchase); continue; }
            // Your own call to /api/platform/jest/purchases/claim (see Server Verification)
            ClaimOnServer(purchase.SignedRequest, purchase.PurchaseToken, ok =>
            {
                if (!ok) { Done(false); return; } // stays pending, retried on a later round or launch
                GrantAndSave(purchase.ProductId, purchase.PurchaseToken);
                Consume(purchase);
            });
        }
    }, error => Debug.LogWarning(error.Message));
}

// 8. Subscription entitlement
void CheckVip()
{
    Yes2SDK.Yes2SDK.IAP.GetSubscriptionsAsync(subscriptions =>
    {
        Subscription vip = subscriptions.Find(s => s.ProductId == "vip_monthly");
        if (vip != null && vip.IsActive) UnlockVip();
        else if (vip != null) ShowVipOffer(vip.TrialEligible);
    }, error => Debug.LogWarning(error.Message));
}

// 9. Referrals
Yes2SDK.Yes2SDK.Referrals.ShareAsync(new ReferralShareOptions("invite_v1")
{
    Text = "Come help on my farm",
    Data = new Dictionary<string, object> { { "source", "referral" } }
});
Yes2SDK.Yes2SDK.Referrals.ListAsync(list =>
{
    int joined = list.Referrals.TryGetValue("invite_v1", out var players) ? players.Count : 0;
    // verify list.SignedRequest on a server before rewarding
});

// 10. Share an image (do not gate on Context.IsSupported())
Yes2SDK.Yes2SDK.Context.ShareImageAsync(
    new ContextShareOptions(Yes2SDKImage.ToPngDataUrl(screenshot))
    {
        Data = new Dictionary<string, object> { { "source", "share" } }
    });

// 11. Signed player: JSON with playerId and signature
Yes2SDK.Yes2SDK.Player.GetSignedPlayerInfoAsync(null, json => SendToServer(json));

// 12. Ads: a no-fill arrives as onError with Code "NoFill", and afterAd does not follow
Yes2SDK.Yes2SDK.Ads.ShowRewarded("extra-life", "Extra life",
    afterAd: ResumeGame,
    adViewed: GrantExtraLife,
    onError: error =>
    {
        if (error.Code == "NoFill") ShowNoRewardMessage();
        ResumeGame();
    });
```

### Defold Lua

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

-- 4. Save progress as a guest too
local function save_progress()
    yes2sdk.data_set_string("progress", json.encode(progress))
end

-- 1. Initialize and report loading progress (0 to 100)
yes2sdk.set_loading_progress(0)
yes2sdk.initialize(function(self, success, error)
    if not success then return end
    -- 5. Exit request: save synchronously, the SDK flushes right after
    yes2sdk.on_exit_requested(function(self) save_progress() end)
    load_assets(function(percent) yes2sdk.set_loading_progress(percent) end, function()
        -- 2. The game is interactive: this calls Jest's markGameLoaded
        yes2sdk.start_game(function(self, success, error)
            -- 3. Data the player arrived with (already a table)
            local entry = yes2sdk.session_get_entry_point_data()
            if entry.source == "referral" then show_welcome_from_friend() end
            recover_purchases()
            check_vip()
        end)
    end)
end)

-- 6. Registration prompt for guests
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

-- 7. Recover incomplete purchases, consuming one at a time. Jest returns at most 50
-- per call and shows more only after you consume, so fetch again until it is empty.
function recover_purchases(round)
    round = round or 1
    if round > 10 then return end -- bound the loop
    yes2sdk.iap_get_purchases(function(self, success, purchases_json)
        if not success then return end
        local purchases = json.decode(purchases_json)
        local consumed_any = false
        local function next_purchase(i)
            local purchase = purchases[i]
            if not purchase then
                -- end of this list: fetch again if anything was completed
                if consumed_any then recover_purchases(round + 1) end
                return
            end
            local function consume()
                yes2sdk.iap_consume_purchase(purchase.purchaseToken, function(self, success, error)
                    if success then consumed_any = true end
                    next_purchase(i + 1)
                end)
            end
            if save_has_purchase(purchase.purchaseToken) then return consume() end
            -- your own call to /api/platform/jest/purchases/claim (see Server Verification)
            claim_on_server(purchase.signedRequest, purchase.purchaseToken, function(ok)
                if not ok then return next_purchase(i + 1) end -- stays pending, retried on a later round or launch
                grant_and_save(purchase.productId, purchase.purchaseToken)
                consume()
            end)
        end
        next_purchase(1)
    end)
end

-- 8. Subscription entitlement
function check_vip()
    yes2sdk.iap_get_subscriptions(function(self, success, subscriptions_json)
        if not success then return end
        for _, sub in ipairs(json.decode(subscriptions_json)) do
            if sub.productId == "vip_monthly" then
                if sub.isActive then unlock_vip() else show_vip_offer(sub.trialEligible) end
            end
        end
    end)
end

-- 9. Referrals
yes2sdk.referrals_share({
    reference = "invite_v1",
    text = "Come help on my farm",
    data = { source = "referral" },
}, function(self, success, result_json) end)
yes2sdk.referrals_list(function(self, success, result_json)
    if not success then return end
    local list = json.decode(result_json)
    local joined = list.referrals["invite_v1"] and #list.referrals["invite_v1"] or 0
    -- verify list.signedRequest on a server before rewarding
end)

-- 10. Share an image (do not gate on context_is_supported())
yes2sdk.context_share({ intent = "SHARE", image = png_data_url, data = { source = "share" } },
    function(self, success, err) end)

-- 11. Signed player: '{"playerId":"...","signature":"..."}'
yes2sdk.player_get_signed_info(nil, function(self, success, signed_json)
    if success then send_to_server(signed_json) end
end)

-- 12. Ads: no_fill then after_ad fire at once. Resume in after_ad only.
yes2sdk.ads_show_rewarded("extra-life",
    function(self) end,                        -- before_ad
    function(self) resume_game() end,          -- after_ad
    function(self) end,                        -- ad_dismissed
    function(self) grant_extra_life() end,     -- ad_viewed
    function(self) show_no_reward_message() end -- no_fill
)
```

## Jest Launch Checklist

Jest's [launch checklist](https://docs.jest.com/launch-checklist) lists what a game needs before it goes to review. This table maps each requirement to the Yes2SDK calls that meet it, or says when it is down to the game alone.

| Jest Requirement | Yes2SDK Call(s) |
|---|---|
| Save progress as a guest, before any login prompt | `data.setString(...)` (Unity `Data.SetString`, Defold `data_set_string`), keyed on `(await player.getPlayer()).id` where you need it |
| Prompt guests to register, only while they are a guest | `auth.isAuthenticated()`, then `auth.showRegistrationPrompt({ message, data, onClose })` (Unity `Auth.ShowRegistrationPrompt`, Defold `auth_show_registration_prompt`). Turn **Automatic login reminders** off when the game uses its own prompt |
| Report loading progress and mark the game loaded | `Yes2SDK.setLoadingProgress(n)`, then `Yes2SDK.startGameAsync()` the moment the game is interactive (Unity `SetLoadingProgress` / `StartGameAsync`, Defold `set_loading_progress` / `start_game`) |
| Schedule a D1 to D7 notification sequence for registered players (at least one per day for the next seven days), with images, rescheduled by id | `notifications.scheduleAsync({ id, title, body, scheduledInDays, imageAssetId or imageDataUrl })` (Unity `Notifications.ScheduleAsync` with `NotificationOptions`, Defold `notifications_schedule` with `scheduled_in_days`, `image_asset_id`, `image_data_url`) |
| Fetch the catalog and check out correctly | `iap.getCatalogAsync()`, `iap.purchaseAsync({ productId })` |
| Recover and complete incomplete purchases at startup | `iap.getPurchasesAsync()`, grant, then `iap.consumePurchaseAsync(purchaseToken)`, repeated until `getPurchasesAsync()` returns an empty list (Jest returns at most 50 per call) (Unity `GetPurchasesAsync` / `ConsumePurchaseAsync`, Defold `iap_get_purchases` / `iap_consume_purchase`) |
| Read subscription entitlement and never re-offer a held plan | `iap.getSubscriptionsAsync()`, check `isActive` before offering `iap.subscribeAsync(productId)` |
| Save when the player starts to leave | `Yes2SDK.on('exitRequested', fn)` (Unity `OnExitRequested`, Defold `on_exit_requested`), saving synchronously |
| No in-game ads | Nothing to remove: ad calls never show an ad and report a no-fill straight away. TypeScript: `noFill` then `afterAd`. Unity: `onError` with `NoFill`, no `afterAd`. Defold: `no_fill` then `after_ad` |
| Loads in under 10 seconds | No Yes2SDK call. Your responsibility: keep the first download small |
| No CTAs, prompts or copy that direct users outside Jest | No Yes2SDK call. Your responsibility: no external links or outside sign-up prompts |
| No vibrations or haptics | No Yes2SDK call. Your responsibility: do not rely on `Yes2SDK.performHapticFeedback()` (Unity `PerformHapticFeedback`), which does nothing on Jest |
| Verify on a backend (recommended) | `player.getSignedPlayerInfoAsync()`, `Purchase.signedRequest`, `Subscription.signedRequest`, `ReferralList.signedRequest`, checked with [Server Verification](#server-verification) |

### Notification sequence (D1 to D7)

Jest's launch checklist asks for a D1 to D7 sequence: at least one notification per day for the next seven days, starting when the player registers. Jest only sends notifications to registered players; a guest gets `PLAYER_NOT_AUTHENTICATED`. Schedule the sequence as soon as the player registers, and schedule again as they progress: reusing an `id` replaces the earlier notification, so there is no need to cancel first.

- `scheduledInDays` is a whole number from 0 to 7. Jest picks the time within that day; 0 means later today.
- For the image, use `imageAssetId` (an image you uploaded and got approved in the Jest Developer Console) or `imageDataUrl` (a `data:image/png;base64,`, `data:image/jpeg;base64,` or `data:image/webp;base64,` URL, at most 2 MiB). Not both.
- `body` is 1 to 2000 characters and `title` at most 200, but Jest asks for bodies of 100 characters or fewer, and for copy that varies from day to day (both Jest Fund requirements in the launch checklist).
- There is no list method. `cancelAllAsync()` on Jest only cancels the notifications scheduled in the current page session, so use `cancelAsync(id)` with your stable ids.

```typescript
const MESSAGES = [
    { title: 'Your crops are ready', body: 'Harvest them before the crows do.' },
    { title: 'A new field opened', body: 'Plant something rare today.' },
    { title: 'Your farm misses you', body: 'Come back for your daily bonus.' },
];

async function scheduleRetentionSequence(): Promise<void> {
    if (!Yes2SDK.auth.isAuthenticated()) return;
    for (let day = 1; day <= 7; day++) { // one notification for every day, D1 to D7
        const message = MESSAGES[(day - 1) % MESSAGES.length];
        await Yes2SDK.notifications.scheduleAsync({
            id: `retention_d${day}`, // stable per day, so rescheduling replaces it
            title: message.title,
            body: message.body,
            scheduledInDays: day,
            imageAssetId: 'farm_hero', // or imageDataUrl: canvas.toDataURL('image/png')
            data: { source: 'notification', day },
        });
    }
}
```

```csharp
void ScheduleRetentionSequence()
{
    if (!Yes2SDK.Yes2SDK.Auth.IsAuthenticated()) return;
    string[] bodies = { "Harvest your crops before the crows do.", "A new field opened. Plant something rare." };
    for (int day = 1; day <= 7; day++) // one notification for every day, D1 to D7
    {
        Yes2SDK.Yes2SDK.Notifications.ScheduleAsync(new NotificationOptions
        {
            Id = "retention_d" + day, // stable per day, so rescheduling replaces it
            Title = "Your farm",
            Body = bodies[(day - 1) % bodies.Length],
            ScheduledInDays = day,
            ImageAssetId = "farm_hero",
            Data = new Dictionary<string, object> { { "source", "notification" }, { "day", day } }
        }, onError: error => Debug.LogWarning(error.Message));
    }
}
```

```lua
local function schedule_retention_sequence()
    if not yes2sdk.auth_is_authenticated() then return end
    local bodies = { "Harvest your crops before the crows do.", "A new field opened. Plant something rare." }
    for day = 1, 7 do -- one notification for every day, D1 to D7
        yes2sdk.notifications_schedule({
            id = "retention_d" .. day, -- stable per day, so rescheduling replaces it
            title = "Your farm",
            body = bodies[(day - 1) % #bodies + 1],
            scheduled_in_days = day,
            image_asset_id = "farm_hero",
            data = { source = "notification", day = day },
        }, function(self, success, result_json)
            if not success then print(yes2sdk.parse_error(result_json).code) end
        end)
    end
end
```

## Server Verification

Never grant paid items, subscription perks or referral rewards on client values alone. Jest signs the values it hands the game with your game's shared secret, and the Yes2Games dashboard can check those signatures for you once you have filled in the [Jest server verification card](#jest-server-verification-card).

Both endpoints below are available once the dashboard release ships.

### Which value is the token

| What to verify | `kind` | TypeScript | Unity | Defold |
|---|---|---|---|---|
| Player | `player` | `(await player.getSignedPlayerInfoAsync()).signature` | `signature` in the `GetSignedPlayerInfoAsync` JSON | `signature` in the `player_get_signed_info` JSON |
| Purchase | `purchase` | `purchase.signedRequest` | `Purchase.SignedRequest` | `signedRequest` in the purchase JSON |
| Subscription | `subscription` | `subscription.signedRequest` | `Subscription.SignedRequest` | `signedRequest` in the subscription JSON |
| Referrals | `referrals` | `(await referrals.listAsync()).signedRequest` | `ReferralList.SignedRequest` | `signedRequest` in the `referrals_list` JSON |

A purchase from `purchaseAsync` carries its own signed value. The purchases returned by `getPurchasesAsync` share one signed value per page, which is fine: the server finds each purchase inside it.

### `POST https://dashboard.yes2games.com/api/platform/jest/verify`

No API key, cookie or `Authorization` header. The signed token is the credential, and its audience (the Jest game id) tells the dashboard which game's secret to check it against. Any origin may call it, so the game can call it directly or through your own server. Send only a `Content-Type: application/json` header.

Request body (unknown keys are rejected):

```json
{ "kind": "purchase", "token": "<signed value>", "expectedPlayerId": "<optional Jest player id>" }
```

- `token` (required): the signed value, up to 32768 characters.
- `kind` (optional): `"purchase"`, `"subscription"`, `"player"`, `"referrals"` or `"auto"` (the default, which detects the kind). A token of another kind fails with `wrong_kind`.
- `expectedPlayerId` (optional): when given, the token's player must match it, otherwise `subject_mismatch`.

Player, subscription and referrals tokens must be at most 24 hours old; purchase tokens have no age limit. A token dated more than 5 minutes in the future is rejected.

Success (`200`):

```json
{ "success": true, "data": {
    "kind": "purchase",
    "jestGameId": "...", "playerId": "...", "issuedAt": 1730000000,
    "claims": { },
    "ledger": [ ]
} }
```

`claims` depends on the kind:

| Kind | `claims` |
|---|---|
| `purchase` | `purchases: [{ purchaseToken, productSku, credits, createdAt, completedAt, estimatedRevenue, price, currency, sandbox }]` |
| `subscription` | `subscriptions: [{ sku, displayName, displayDescription, price, currency, billingPeriod, status, trialEligible, retentionOffer, introOffer, estimatedRevenue, sandbox }]` |
| `player` | `player: { playerId, registered, username, avatarUrl }` |
| `referrals` | `referrals: { "<reference>": [{ playerId, joinedAt }] }` |

Every `claims` object also carries `kind`, the same value as the top-level `kind`. Purchase and subscription claims also carry `shape`: `"single"` when the token covers one purchase or subscription, such as the value from `purchaseAsync`, and `"list"` when it covers a whole list, such as the shared value from `getPurchasesAsync`.

`ledger` is set for purchase tokens only (it may be `null`) and lists `{ purchaseToken, firstVerifiedAt, verifyCount, claimedAt, seenBefore }` per purchase. For a subscription, grant the perk only when `status` is `active`. Treat `sandbox: true` as a test with no real money. To grant a purchase, use the claim endpoint below rather than `/verify` alone.

### `POST https://dashboard.yes2games.com/api/platform/jest/purchases/claim`

Grants each purchase at most once. Same auth, CORS and rate limits as `/verify`.

```json
{ "token": "<signed purchase value>", "purchaseToken": "<the purchase to claim>" }
```

Success (`200`): `{ "success": true, "data": { "claimed": true, "claimedAt": "<ISO time>" } }`. `claimed: true` comes back exactly once for a purchase. Every later call returns `claimed: false` with the original `claimedAt`.

How to grant exactly once:

1. Call claim with the signed value and the `purchaseToken`.
2. On success, grant the item and save, storing the `purchaseToken` **in the same save** as the item.
3. Then call `iap.consumePurchaseAsync(purchaseToken)`.

When `getPurchasesAsync` returns a purchase at startup: if your save already holds its `purchaseToken`, just consume it. If claim says `claimed: false` and your save does not hold the token, the game stopped between claim and save: grant, save, then consume. Your save is the authority.

```typescript
const CLAIM_URL = 'https://dashboard.yes2games.com/api/platform/jest/purchases/claim';

async function claimOnServer(token: string | undefined, purchaseToken: string): Promise<boolean> {
    if (!token) return false;
    const response = await fetch(CLAIM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, purchaseToken }),
    });
    const body = await response.json();
    return body.success === true; // claimed true, or false with your save missing the token
}
```

### Errors

Every error has the body `{ "success": false, "error": "<text>", "code": "<code>" }`.

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | The body is not valid JSON in the documented shape |
| 400 | `invalid_token` | The token has no readable audience |
| 401 | `invalid_signature` | Wrong secret, tampered token, audience mismatch, not HS256, or malformed |
| 404 | `game_not_configured` | No credentials saved for that Jest game id |
| 409 | `purchase_player_mismatch` | Claim only: the purchase is already recorded for a different player; nothing claimed |
| 413 | `payload_too_large` | The body is over 64 KB |
| 422 | `subject_mismatch`, `token_too_old`, `token_from_future`, `wrong_kind`, `invalid_payload` | The signature is valid but the payload or its age is not. For `token_too_old`, request a fresh token from Jest |
| 422 | `purchase_not_in_token` | Claim only: the `purchaseToken` is not in the signed value |
| 429 | `rate_limited` | Wait for the `Retry-After` header (seconds), then retry |
| 503 | `verification_unavailable` | The server could not look up the credentials; retry later |
| 503 | `ledger_unavailable` | Claim only: do not grant, retry later |

On any 4xx other than 429, do not grant and do not consume. On a 503, do not grant or consume yet; the purchase stays pending and you can retry later.

Rate limits are per client IP, per minute, shared by both endpoints: 60 requests and 20 failed requests, plus 1200 validly signed requests per Jest game.

## Testing

Jest describes three ways to test ([Jest testing docs](https://docs.jest.com/testing)):

- **Local mock mode.** For day-to-day local work, with no platform needed. Jest's SDK provides a debug menu to adjust the player's state and simulate platform responses. To run Yes2SDK against the Jest adapter locally, open the game with `?yes2sdk_platform=jest`; Yes2SDK then loads the Jest SDK from Jest's CDN, so the page needs network access.
- **The Simulator.** In the Jest Developer Console, the Simulator runs an uploaded build or a local URL against a mocked SDK host. Work through the launch checklist there and submit a self-review with the build. Purchases and subscriptions made in the Simulator are sandbox purchases.
- **Sandbox accounts.** Test an uploaded build on jest.com with a logged-in sandbox account, to check notifications, payments and saves end to end.

While testing, check that:

- A guest can play, save and come back to the same progress.
- The registration prompt only appears for guests, and Jest's own reminders do not show on top of it.
- `startGameAsync()` runs the moment the game is interactive.
- A registered player gets the notification sequence, and a guest does not trigger errors you have not handled.
- An interrupted purchase is granted on the next launch, exactly once.
- `Purchase.isSandbox` / `Subscription.isSandbox` is `true` for test purchases. Grant the item as usual, but keep it out of revenue reporting.

Unity users can also exercise subscriptions, notifications, the registration prompt, referrals, image sharing and the exit request in Play Mode, using the mocks under **Yes2SDK > Build Window > Play Mode Testing**.

## How to Submit

1. Make sure Jest is enabled for your studio and the game's **Jest server verification** card holds the Jest game id and shared secret.
2. Set **Automatic login reminders** for the game.
3. Upload a build on your game page and test it in the Inspector.
4. Click **Request Publish** and select Jest. The Yes2Games team builds the Jest bundle. A Jest bundle never includes ads.
5. The bundle zip is uploaded in the Jest Developer Console under **Manage > Versions**. Run the Simulator checklist on that version before it goes to Jest's review.

Your source build needs `index.html` at the zip root and **relative paths only**. Jest serves games from a sub-path, so root-absolute paths such as `/assets/hero.png` break, and the dashboard refuses to bundle them.

## Common Rejection Reasons

These fail the Simulator checklist or Jest's review. Each one maps to a row of the [launch checklist](#jest-launch-checklist).

| Issue | Fix |
|---|---|
| The player is sent back to the home screen while loading | The loading screen mode is Manual and Jest got no progress for 15 seconds. Switch to Auto mode in the Jest Developer Console |
| The first load takes longer than 10 seconds | Keep the first download small and load the rest after `startGameAsync()` |
| A guest loses progress, or has to register to keep it | Save with `data.setString` as a guest too, before any login prompt |
| Two login prompts at once | Turn **Automatic login reminders** off for the game and rebuild the bundle |
| No D1 to D7 notification sequence | Schedule at least one notification per day for the next seven days once the player registers (see [Notification sequence](#notification-sequence-d1-to-d7)) |
| An interrupted purchase is not granted on the next launch | Recover with `iap.getPurchasesAsync()` at startup, grant, then `iap.consumePurchaseAsync()` |
| A subscription the player holds is offered again | Check `isActive` from `iap.getSubscriptionsAsync()` before offering `iap.subscribeAsync()` |
| Links or sign-up prompts that lead outside Jest | Remove them |
| The game vibrates | Do not rely on haptics. `Yes2SDK.performHapticFeedback()` already does nothing on Jest |

## Common Issues

| Issue | Fix |
|---|---|
| Bundle refused for root-absolute paths | Make every asset path relative to `index.html` (`assets/hero.png`, not `/assets/hero.png`) |
| Saves stop working | The player store holds 1 MB per player. Once a write would pass it, `data.setString` skips the write (with a warning) and `data.setStringAsync` resolves `false`. `player.setDataAsync` does not check the size first: the write fails on Jest's side, possibly without an error. Store less |
| `PLAYER_NOT_AUTHENTICATED` from notifications or subscriptions | The player is a guest. Prompt them to register first |
| `INVALID_OPERATION` from `showRegistrationPrompt` | The player is already registered. Check `auth.isAuthenticated()` first |
| `INVALID_PARAM` from `showRegistrationPrompt` | The message is blank, over 140 characters, does not contain `{{registrationCode}}` exactly once (separated by a space or punctuation), or contains any other `{{...}}` placeholder |
| `signInAsync()` rejects with `PLAYER_NOT_AUTHENTICATED` mid-registration | Jest finishes registration over SMS and reloads the game. Check `auth.isAuthenticated()` on the next launch |
| `token_too_old` from `/verify` | Player, subscription and referrals tokens expire after 24 hours. Ask Jest for a fresh one |
| Progress lost on exit | Save synchronously inside the `exitRequested` handler. Async work started there is not awaited |

## Platform-Specific Notes

- **Data storage:** the Data module and `player.getDataAsync/setDataAsync` share Jest's player store, which follows the player across sessions and devices. The limit is 1 MB per game per player.
- **Player:** `player.getMode()` returns `"authorized"` for a registered player and `"lite"` for a guest. Guests have no username or avatar.
- **Prices:** on Jest, `Product.priceAmount` is a decimal price such as `4.99`, not cents. `developerPayload` is not passed to Jest.
- **Purchases:** a closed checkout rejects with `IAP_PURCHASE_CANCELLED` (Unity: `error.ErrorCode == ErrorCode.UserCancelled`). It is not an error to retry. `consumePurchaseAsync` is safe to repeat.
- **Subscriptions:** `subscribeAsync` resolves `{ status: "cancelled" }` when the player closes the checkout. Jest returns no subscriptions for guests.
- **Analytics:** `analytics.log*` calls are accepted but not forwarded to Jest.
- **Gameplay events:** keep calling `game.gameplayStart()` and `game.gameplayStop()`. They do nothing on Jest, but the universal integration checks expect them, and the same code then works on the other platforms.
- **Audio and haptics:** `session.isAudioEnabled()` is always `true`. Haptic feedback does nothing; Jest asks for no vibrations.
- **Invites:** use Referrals. `game.inviteLink()` is not a Jest share link. Jest only counts invited players who complete registration.
- **Entry point data:** on Jest it comes only from Jest's entry payload, never from the page URL.
