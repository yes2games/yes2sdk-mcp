# IAP: `Yes2SDK.iap`

[← Back to overview](overview.md)

In-app purchases: read the product catalog, initiate a purchase, restore and consume purchases, and manage subscriptions. Optional. Guard with `isSupported()`; guard the subscription calls with `isSubscriptionSupported()`.

> Available on **Yandex** (native payments) and **Jest** today. Other platforms report `isSupported() === false`; the calls stay safe so a single codebase runs everywhere. Subscriptions are offered on Jest only (`isSubscriptionSupported() === true` there, `false` everywhere else). See the Jest quickstart.

> **Always consume after granting.** For consumable products, grant the item to the player first, then call `consumePurchaseAsync` with the purchase token so the player can buy it again.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getCatalogAsync(): Promise<Product[]>` | Product catalog. |
| `getProductAsync(productId: string): Promise<Product \| null>` | Product by ID, or `null` if not found. `productId` must be non-empty. |
| `purchaseAsync(config: PurchaseConfig): Promise<Purchase>` | Initiate a purchase. `config.productId` must be non-empty. |
| `getPurchasesAsync(): Promise<Purchase[]>` | Unconsumed purchases (use to restore items). |
| `consumePurchaseAsync(purchaseToken: string): Promise<void>` | Consume a purchase. `purchaseToken` must be non-empty. |
| `getSubscriptionStatusAsync(productId: string): Promise<SubscriptionStatus>` | Subscription status. |
| `getSubscriptionsAsync(): Promise<Subscription[]>` | Subscription offers with the player's entitlement. Grant access when `isActive` is true. Rejects with `FEATURE_NOT_SUPPORTED` where the platform has no subscriptions. |
| `subscribeAsync(productId: string): Promise<SubscribeResult>` | Start a subscription checkout. Resolves `{ status: "subscribed", subscription }` or `{ status: "cancelled" }` when the player closes checkout. `productId` must be non-empty. Guests are rejected with `PLAYER_NOT_AUTHENTICATED` where the platform requires a registered player. |
| `cancelSubscriptionAsync(productId: string): Promise<boolean>` | Ask the platform to cancel a subscription. `true` if the player confirmed, `false` if they dismissed the dialog. `productId` must be non-empty. |
| `claimRetentionOfferAsync(productId: string): Promise<Subscription>` | Claim the one-time retention discount; resolves with the refreshed subscription. `productId` must be non-empty. |
| `isSupported(): boolean` | Whether IAP is supported. |
| `isSubscriptionSupported(): boolean` | Whether subscriptions are supported. |

**Types:** `Product = { productId; title; description; imageUri; price; priceCurrencyCode; priceAmount? }`; `PurchaseConfig = { productId: string; developerPayload?: string }`; `Purchase = { purchaseToken; productId; paymentId; purchaseTime; developerPayload?; signedRequest?; isSandbox? }`; `SubscriptionStatus = { isActive: boolean; productId: string; expiresAt?; willRenew? }`; `Subscription = { productId; title; description; price; priceAmount; priceCurrencyCode; billingPeriod: "weekly" | "monthly" | "yearly"; isActive; trialEligible; introOffer; retentionOffer; isSandbox?; signedRequest? }` (`introOffer` and `retentionOffer` are `{ priceAmount; durationPeriods }` or `null`); `SubscribeResult = { status: "subscribed"; subscription: Subscription } | { status: "cancelled" }`.

`Purchase.isSandbox` is `true` when no real money changed hands (sandbox tester or platform simulator). Grant the item as usual, but keep it out of revenue reporting. `signedRequest` is a platform-signed payload: verify it on your server before granting anything of lasting value. Both fields are optional and only present where the platform provides them; Yandex purchases carry neither today.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getCatalogAsync` | None | None | None | Ready | None |
| `getProductAsync` | None | None | None | Ready | None |
| `purchaseAsync` | None | None | None | Ready | None |
| `getPurchasesAsync` | None | None | None | Ready | None |
| `consumePurchaseAsync` | None | None | None | Ready | None |
| `getSubscriptionStatusAsync` | None | None | None | None¹ | None |
| `getSubscriptionsAsync` | None | None | None | None¹ | None |
| `subscribeAsync` | None | None | None | None¹ | None |
| `cancelSubscriptionAsync` | None | None | None | None¹ | None |
| `claimRetentionOfferAsync` | None | None | None | None¹ | None |
| `isSupported` | None | None | None | Ready | None |
| `isSubscriptionSupported` | None | None | None | None¹ | None |

Yandex maps to its native payments API. On every other platform the strategy's `isSupported()` returns `false`. Guard your calls with `isSupported()`.

¹ Subscriptions are offered on Jest only. `isSubscriptionSupported()` returns `false` on every other platform, Yandex included, and there the four subscription methods reject with `FEATURE_NOT_SUPPORTED`.

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

### Cancelled checkout

Where the platform reports a closed checkout, `purchaseAsync` rejects with `IAP_PURCHASE_CANCELLED`. This is not a failure and not worth retrying or showing an error for. On Yandex today a closed checkout is not reported separately: it rejects with `PLATFORM_ERROR`, the same as a failed payment, so handle both codes and do not show a hard error dialog for `PLATFORM_ERROR` from `purchaseAsync` either. (`subscribeAsync` reports a closed checkout as `{ status: "cancelled" }` instead of rejecting.)

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

## Defold (Lua)

Async results arrive as JSON strings. Decode with `json.decode`. A re-entrant `iap_purchase` / `iap_consume_purchase` is rejected while one is already in flight (so the in-flight callback is never dropped).

| Signature | Description |
|-----------|-------------|
| `yes2sdk.iap_get_catalog(callback)` | `callback(self, success, catalog_json)`: JSON array of products. |
| `yes2sdk.iap_get_product(product_id, callback)` | `callback(self, success, product_json)`: JSON object, or `"null"` if unknown. |
| `yes2sdk.iap_purchase(product_id, developer_payload, callback)` | `developer_payload` optional (pass `nil` to skip). `callback(self, success, purchase_json)`. Verify server-side. |
| `yes2sdk.iap_get_purchases(callback)` | `callback(self, success, purchases_json)`: JSON array of unconsumed purchases. |
| `yes2sdk.iap_consume_purchase(purchase_token, callback)` | `callback(self, success, err)`: `err` nil on success. |
| `yes2sdk.iap_is_supported()` | Returns `true` where IAP is available (Yandex today). |

> Subscriptions are not exposed in the Defold SDK.
