# IAP: `Yes2SDK.iap`

[← Back to overview](overview.md)

In-app purchases: read the product catalog, initiate a purchase, restore and consume purchases, and manage subscriptions. Optional. Guard with `isSupported()`; guard the subscription calls with `isSubscriptionSupported()`.

> Available on **Yandex** (native payments) and **Jest** (Jest payments). Poki, GameDistribution, CrazyGames and YouTube report `isSupported() === false`; the calls stay safe so a single codebase runs everywhere. Subscriptions are offered on **Jest** only: `isSubscriptionSupported()` is `true` there and `false` on the other five platforms, Yandex included. See the [Jest guide](/docs/jest) for setup and server verification.

> **Always consume after granting.** For consumable products, grant the item to the player first, then call `consumePurchaseAsync` with the purchase token so the player can buy it again.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getCatalogAsync(): Promise<Product[]>` | Product catalog. |
| `getProductAsync(productId: string): Promise<Product \| null>` | Product by ID, or `null` if not found. `productId` must be non-empty. |
| `purchaseAsync(config: PurchaseConfig): Promise<Purchase>` | Initiate a purchase. `config.productId` must be non-empty. |
| `getPurchasesAsync(): Promise<Purchase[]>` | Unconsumed purchases. Call it at startup to recover purchases a previous session paid for but never granted. |
| `consumePurchaseAsync(purchaseToken: string): Promise<void>` | Consume a purchase. `purchaseToken` must be non-empty. |
| `getSubscriptionStatusAsync(productId: string): Promise<SubscriptionStatus>` | Subscription status. |
| `getSubscriptionsAsync(): Promise<Subscription[]>` | Subscription offers with the player's entitlement. Grant access when `isActive` is true. Rejects with `FEATURE_NOT_SUPPORTED` where the platform has no subscriptions. |
| `subscribeAsync(productId: string): Promise<SubscribeResult>` | Start a subscription checkout. Resolves `{ status: "subscribed", subscription }` or `{ status: "cancelled" }` when the player closes checkout. `productId` must be non-empty. Guests are rejected with `PLAYER_NOT_AUTHENTICATED` where the platform requires a registered player. |
| `cancelSubscriptionAsync(productId: string): Promise<boolean>` | Ask the platform to cancel a subscription. `true` if the player confirmed, `false` if they dismissed the dialog. `productId` must be non-empty. |
| `claimRetentionOfferAsync(productId: string): Promise<Subscription>` | Claim the one-time retention discount; resolves with the refreshed subscription. `productId` must be non-empty. |
| `isSupported(): boolean` | Whether IAP is supported. |
| `isSubscriptionSupported(): boolean` | Whether subscriptions are supported. |

**Types:** `Product = { productId; title; description; imageUri; price; priceCurrencyCode; priceAmount? }`; `PurchaseConfig = { productId: string; developerPayload?: string }`; `Purchase = { purchaseToken; productId; paymentId; purchaseTime; developerPayload?; signedRequest?; isSandbox? }`; `SubscriptionStatus = { isActive: boolean; productId: string; expiresAt?; willRenew? }`; `Subscription = { productId; title; description; price; priceAmount; priceCurrencyCode; billingPeriod: "weekly" | "monthly" | "yearly"; isActive; trialEligible; introOffer; retentionOffer; isSandbox?; signedRequest? }` (`introOffer` and `retentionOffer` are `{ priceAmount; durationPeriods }` or `null`); `SubscribeResult = { status: "subscribed"; subscription: Subscription } | { status: "cancelled" }`.

`Purchase.isSandbox` is `true` when no real money changed hands (sandbox tester or platform simulator). Grant the item as usual, but keep it out of revenue reporting. `signedRequest` is a platform-signed payload: verify it on your server before granting anything of lasting value. Both fields are optional and only present where the platform provides them. Jest purchases and subscriptions carry `signedRequest`, and `isSandbox: true` for sandbox and Developer Console simulator purchases; Yandex purchases carry neither today.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| `getCatalogAsync` | None | None | None | Ready | None | Ready² |
| `getProductAsync` | None | None | None | Ready | None | Ready² |
| `purchaseAsync` | None | None | None | Ready | None | Ready³ |
| `getPurchasesAsync` | None | None | None | Ready | None | Ready⁴ |
| `consumePurchaseAsync` | None | None | None | Ready | None | Ready⁵ |
| `getSubscriptionStatusAsync` | None | None | None | None¹ | None | Ready⁶ ⁷ |
| `getSubscriptionsAsync` | None | None | None | None¹ | None | Ready⁶ |
| `subscribeAsync` | None | None | None | None¹ | None | Ready⁶ |
| `cancelSubscriptionAsync` | None | None | None | None¹ | None | Ready⁶ |
| `claimRetentionOfferAsync` | None | None | None | None¹ | None | Ready⁶ |
| `isSupported` | None | None | None | Ready | None | Ready |
| `isSubscriptionSupported` | None | None | None | None¹ | None | Ready |

Yandex maps to its native payments API and Jest to Jest payments. On every other platform the strategy's `isSupported()` returns `false`. Guard your calls with `isSupported()`.

¹ Yandex offers no subscriptions. `isSubscriptionSupported()` returns `false` there, as on Poki, GameDistribution, CrazyGames and YouTube, and the four subscription methods reject with `FEATURE_NOT_SUPPORTED`.
² On Jest, `priceAmount` is Jest's decimal price (for example `4.99`), not an amount in the smallest currency unit, and `imageUri` is empty. Jest prices are typically in USD.
³ On Jest, `developerPayload` is not passed to the platform. A closed checkout rejects with `IAP_PURCHASE_CANCELLED`, an unknown product with `IAP_NOT_AVAILABLE`, and any other failure with `IAP_PURCHASE_FAILED`. The purchase carries Jest's signed purchase payload as `signedRequest`.
⁴ On Jest this returns the player's incomplete purchases: paid for but not yet completed. Jest returns at most 50 pending purchases per call and shows more only after earlier ones are completed, so call it again after consuming until it returns an empty list. The SDK drops duplicates within a call. Here `signedRequest` is the signed payload for the whole list, shared by every purchase in it.
⁵ On Jest, consuming a purchase that is already complete resolves without an error, so a repeat call is safe. Any other failure rejects with `IAP_PURCHASE_FAILED` and the purchase stays pending, so it comes back from `getPurchasesAsync` on the next launch.
⁶ Jest subscriptions are for registered players. A guest gets an empty list from `getSubscriptionsAsync`, and `subscribeAsync`, `cancelSubscriptionAsync` and `claimRetentionOfferAsync` reject with `PLAYER_NOT_AUTHENTICATED`. Subscribing to a plan the player holds rejects with `IAP_ALREADY_PURCHASED`; cancelling, or claiming a retention offer, for a plan the player does not hold rejects with `INVALID_OPERATION`. Subscriptions are set up per game in Jest's Developer Console.
⁷ Built from `getSubscriptionsAsync`. `expiresAt` and `willRenew` are never set on Jest. For a registered player an unknown `productId` rejects with `IAP_NOT_AVAILABLE`; a guest gets `{ isActive: false, productId }`.

---

## Usage

```typescript
if (Yes2SDK.iap.isSupported()) {
    const products = await Yes2SDK.iap.getCatalogAsync();

    const purchase = await Yes2SDK.iap.purchaseAsync({ productId: "gold_100" });
    grantGold(100);                                       // grant first
    await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken); // then consume
}
```

### Recover incomplete purchases at startup

A purchase can be paid for and then lost to a reload or a crash before the game granted it. On every launch, after init, read the unconsumed purchases, grant each one that was not granted before, save, then consume it. Key your saved grants by `purchaseToken` so a purchase whose consume failed is not granted twice. On Jest, one call returns at most 50 pending purchases and reveals more only after you consume earlier ones, so repeat `getPurchasesAsync` after consuming until it returns an empty list.

```typescript
if (Yes2SDK.iap.isSupported()) {
    const MAX_ROUNDS = 10;                                // bound the loop
    for (let round = 0; round < MAX_ROUNDS; round++) {
        const pending = await Yes2SDK.iap.getPurchasesAsync();
        if (pending.length === 0) break;                  // nothing left to recover
        for (const purchase of pending) {
            if (!save.granted[purchase.purchaseToken]) {
                grantProduct(purchase.productId);
                save.granted[purchase.purchaseToken] = true;
                await saveProgress();                     // persist the grant before consuming
            }
            await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
        }
    }
}
```

### Cancelled checkout

Where the platform reports a closed checkout (Jest does), `purchaseAsync` rejects with `IAP_PURCHASE_CANCELLED`. This is not a failure and not worth retrying or showing an error for. On Yandex today a closed checkout is not reported separately: it rejects with `PLATFORM_ERROR`, the same as a failed payment, so handle both codes and do not show a hard error dialog for `PLATFORM_ERROR` from `purchaseAsync` either. (`subscribeAsync` reports a closed checkout as `{ status: "cancelled" }` instead of rejecting.)

```typescript
if (Yes2SDK.iap.isSupported()) {
    let purchase;
    try {
        purchase = await Yes2SDK.iap.purchaseAsync({ productId: "gold_100" });
    } catch (err) {
        if (isErrorMessage(err) && (err.code === "IAP_PURCHASE_CANCELLED" || err.code === "PLATFORM_ERROR")) {
            return; // checkout closed or payment failed, return to the game quietly
        }
        throw err;
    }
    grantGold(100);
    await Yes2SDK.iap.consumePurchaseAsync(purchase.purchaseToken);
}
```

### Subscriptions

Read the list on every launch: it is the source of truth for entitlements. Never offer a plan the player already holds.

```typescript
if (Yes2SDK.iap.isSubscriptionSupported()) {
    const subs = await Yes2SDK.iap.getSubscriptionsAsync();
    const premium = subs.find((s) => s.productId === "premium_monthly");

    if (premium?.isActive) {
        enablePremiumFeatures();                  // already subscribed, do not offer again
    } else if (premium) {
        const result = await Yes2SDK.iap.subscribeAsync(premium.productId);
        if (result.status === "subscribed") {
            enablePremiumFeatures();
        }                                         // "cancelled": player closed checkout
    }
}
```

---

## Unity (C#)

`Yes2SDK.IAP` (`Yes2SDKIAP`). From your own code call it as `Yes2SDK.Yes2SDK.IAP`: the namespace and the static class share the name `Yes2SDK`.

| Signature | Description |
|-----------|-------------|
| `bool IsSupported()` | Whether IAP is supported (Yandex and Jest). |
| `void GetCatalogAsync(Action<string> onSuccess = null, Action<Error> onError = null)` | JSON array of products. |
| `void PurchaseAsync(string productId, Action<string> onSuccess = null, Action<Error> onError = null, string developerPayload = null)` | Purchase JSON on success. Parse it with `Purchase.FromJson`. |
| `void GetPurchasesAsync(Action<string> onSuccess = null, Action<Error> onError = null)` | JSON array of unconsumed purchases. Call it on launch to recover incomplete purchases. Parse it with `Purchase.ListFromJson`. |
| `void ConsumePurchaseAsync(string purchaseToken, Action onSuccess = null, Action<Error> onError = null)` | Consume after granting. |
| `bool IsSubscriptionSupported()` | Whether subscriptions are supported (Jest). |
| `void GetSubscriptionsAsync(Action<List<Subscription>> onSuccess = null, Action<Error> onError = null)` / `Task<List<Subscription>> GetSubscriptionsAsync(CancellationToken)` | Offers with the player's entitlement. A guest may get an empty list. |
| `void SubscribeAsync(string productId, Action<SubscribeResult> onSuccess = null, Action<Error> onError = null)` / `Task<SubscribeResult> SubscribeAsync(string, CancellationToken)` | A closed checkout is a success with `Status == SubscribeStatus.Cancelled`. |
| `void CancelSubscriptionAsync(string productId, Action<bool> onSuccess = null, Action<Error> onError = null)` / `Task<bool> CancelSubscriptionAsync(string, CancellationToken)` | `true` when the player confirmed, `false` when they dismissed the dialog. Access lasts to the end of the billing period. |
| `void ClaimRetentionOfferAsync(string productId, Action<Subscription> onSuccess = null, Action<Error> onError = null)` / `Task<Subscription> ClaimRetentionOfferAsync(string, CancellationToken)` | Returns the refreshed subscription. A repeat claim is safe. |

Only the four subscription methods have `Task` overloads. Unity has no `GetProductAsync` or `GetSubscriptionStatusAsync`: filter the catalog, and read `IsActive` from `GetSubscriptionsAsync`.

**Types:** `Purchase { string ProductId; string PurchaseToken; string PaymentId; string PurchaseTime; string DeveloperPayload; string SignedRequest; bool IsSandbox }` with `static Purchase FromJson(string json)` (null on bad input) and `static List<Purchase> ListFromJson(string json)` (empty on bad input); `SignedRequest` is null where the platform has none, and `IsSandbox` is `false` when absent. `Subscription { string ProductId; string Title; string Description; string Price; double PriceAmount; string PriceCurrencyCode; string BillingPeriod; bool IsActive; bool TrialEligible; SubscriptionOffer IntroOffer; SubscriptionOffer RetentionOffer; bool IsSandbox; string SignedRequest }`; `SubscriptionOffer { double PriceAmount; int DurationPeriods }`; `SubscribeResult { SubscribeStatus Status; Subscription Subscription; bool IsSubscribed }` (`Subscription` is null unless `Status` is `Subscribed`); `enum SubscribeStatus { Subscribed, Cancelled }`.

**Cancelled checkout:** a closed purchase checkout arrives in `onError` with `err.ErrorCode == ErrorCode.UserCancelled` (`err.Code` keeps the raw `"IAP_PURCHASE_CANCELLED"`). On Yandex a closed checkout arrives as `ErrorCode.PlatformError`, the same as a failed payment, so keep that message neutral.

```csharp
using System.Collections.Generic;
using UnityEngine;
using Yes2SDK;

if (Yes2SDK.Yes2SDK.IAP.IsSupported())
{
    // On launch: recover purchases a previous session paid for but never granted.
    // On Jest, call GetPurchasesAsync again after consuming until the list is empty.
    Yes2SDK.Yes2SDK.IAP.GetPurchasesAsync(
        onSuccess: json =>
        {
            foreach (Purchase purchase in Purchase.ListFromJson(json))
                GrantSaveAndConsume(purchase);   // grant once per PurchaseToken, save, then ConsumePurchaseAsync
        },
        onError: err => Debug.LogWarning(err.Message));
}

// When the player taps "buy":
Yes2SDK.Yes2SDK.IAP.PurchaseAsync("gems_100",
    onSuccess: json =>
    {
        var purchase = Purchase.FromJson(json);
        if (purchase == null) return;
        GrantItem(purchase.ProductId);
        if (purchase.IsSandbox) MarkAsTestPurchase(purchase);   // keep it out of revenue reporting
        Yes2SDK.Yes2SDK.IAP.ConsumePurchaseAsync(purchase.PurchaseToken);
    },
    onError: err =>
    {
        if (err.ErrorCode == ErrorCode.UserCancelled) return;   // the player changed their mind
        ShowPurchaseNotCompleted();
    });

// Subscriptions: the list is the source of truth for entitlements.
if (Yes2SDK.Yes2SDK.IAP.IsSubscriptionSupported())
{
    Yes2SDK.Yes2SDK.IAP.GetSubscriptionsAsync(
        onSuccess: subscriptions =>
        {
            foreach (Subscription sub in subscriptions)
            {
                if (sub.IsActive) GrantVip(sub);                 // never re-offer it
                else ShowOffer(sub, showTrial: sub.TrialEligible);
            }
        },
        onError: err => HideSubscriptions());
}

// When the player taps "subscribe":
Yes2SDK.Yes2SDK.IAP.SubscribeAsync("vip_monthly",
    onSuccess: result => { if (result.IsSubscribed) GrantVip(result.Subscription); },
    onError:   err    => ShowPurchaseNotCompleted());
```

---

## Defold (Lua)

Async results arrive as JSON strings. Decode with `json.decode`. A re-entrant `iap_purchase` / `iap_consume_purchase` is rejected while one is already in flight (so the in-flight callback is never dropped). Failures carry an error JSON string; read it with `yes2sdk.parse_error(err)` (see [Errors](errors.md)).

| Signature | Description |
|-----------|-------------|
| `yes2sdk.iap_get_catalog(callback)` | `callback(self, success, catalog_json)`: JSON array of products. |
| `yes2sdk.iap_get_product(product_id, callback)` | `callback(self, success, product_json)`: JSON object, or `"null"` if unknown. |
| `yes2sdk.iap_purchase(product_id, developer_payload, callback)` | `developer_payload` optional (pass `nil` to skip). `callback(self, success, purchase_json)`. Purchase fields: `purchaseToken`, `productId`, `paymentId`, `purchaseTime`, `developerPayload`, plus `signedRequest` and `isSandbox` where the platform provides them. Verify server-side. |
| `yes2sdk.iap_get_purchases(callback)` | `callback(self, success, purchases_json)`: JSON array of unconsumed purchases. Call it on launch to recover incomplete purchases. |
| `yes2sdk.iap_consume_purchase(purchase_token, callback)` | `callback(self, success, err)`: `err` nil on success. |
| `yes2sdk.iap_is_supported()` | Returns `true` where IAP is available (Yandex and Jest). |
| `yes2sdk.iap_is_subscription_supported()` | Returns `true` where subscriptions are available (Jest). |
| `yes2sdk.iap_get_subscriptions(callback)` | `callback(self, success, subscriptions_json)`: JSON array of `{productId, title, description, price, priceAmount, priceCurrencyCode, billingPeriod, isActive, trialEligible, introOffer, retentionOffer}`, plus `isSandbox` and `signedRequest` where provided. |
| `yes2sdk.iap_subscribe(product_id, callback)` | `callback(self, success, result_json)`: `{"status":"subscribed","subscription":{...}}` or `{"status":"cancelled"}`. A second call while one is open fails on the next frame with `INVALID_OPERATION`. |
| `yes2sdk.iap_cancel_subscription(product_id, callback)` | `callback(self, success, cancelled)`: `cancelled` is a Lua boolean on success, the error JSON on failure. |
| `yes2sdk.iap_claim_retention_offer(product_id, callback)` | `callback(self, success, subscription_json)`: the refreshed subscription. |
| `yes2sdk.iap_get_subscription_status(product_id, callback)` | `callback(self, success, status_json)`: `{"isActive":true,"productId":"...","expiresAt":<unix ms>,"willRenew":true}`; `expiresAt` and `willRenew` only when known. |

**Cancelled checkout:** a closed purchase checkout fails the `iap_purchase` callback with `parse_error(err).code == "IAP_PURCHASE_CANCELLED"` (Yandex reports `PLATFORM_ERROR` instead). `iap_subscribe` normally reports a closed checkout as `{"status":"cancelled"}`, but it can also arrive as a failure with `IAP_PURCHASE_CANCELLED`: treat both as a change of mind.

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

-- On launch, after initialize: finish purchases a previous session never completed.
-- iap_consume_purchase takes one call at a time, so consume the next one in the previous callback.
-- On Jest, call iap_get_purchases again after consuming until the list is empty.
if yes2sdk.iap_is_supported() then
    yes2sdk.iap_get_purchases(function(self, success, purchases_json)
        if success then
            for _, purchase in ipairs(json.decode(purchases_json)) do
                finish_purchase(purchase)   -- grant once per purchaseToken, save, then queue the consume
            end
        end
    end)
end

yes2sdk.iap_purchase("coins_100", nil, function(self, success, result)
    if success then
        finish_purchase(json.decode(result))
    elseif yes2sdk.parse_error(result).code ~= "IAP_PURCHASE_CANCELLED" then
        show_purchase_failed()
    end
end)

if yes2sdk.iap_is_subscription_supported() then
    yes2sdk.iap_get_subscriptions(function(self, success, subscriptions_json)
        if not success then return end
        for _, sub in ipairs(json.decode(subscriptions_json)) do
            if sub.productId == "premium_monthly" then
                if sub.isActive then
                    grant_premium()                -- already subscribed: never offer it again
                else
                    show_subscribe_button(sub)
                end
            end
        end
    end)
end

-- When the player taps the button:
yes2sdk.iap_subscribe("premium_monthly", function(self, success, result_json)
    if success then
        if json.decode(result_json).status == "subscribed" then
            grant_premium()
        end                                        -- "cancelled": the player closed the checkout
    elseif yes2sdk.parse_error(result_json).code ~= "IAP_PURCHASE_CANCELLED" then
        show_purchase_failed()
    end
end)
```
