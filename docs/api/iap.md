# IAP: `Yes2SDK.iap`

[← Back to overview](overview.md)

In-app purchases: read the product catalog, initiate a purchase, restore and consume purchases, and check subscription status. Optional. Guard with `isSupported()`.

> Available on **Yandex** today (native payments). Other platforms report `isSupported() === false`; the calls stay safe so a single codebase runs everywhere. Subscriptions are not offered on any current platform (`isSubscriptionSupported() === false` everywhere).

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
| `isSupported(): boolean` | Whether IAP is supported. |
| `isSubscriptionSupported(): boolean` | Whether subscriptions are supported. |

**Types:** `Product = { productId; title; description; imageUri; price; priceCurrencyCode; priceAmount? }`; `PurchaseConfig = { productId: string; developerPayload?: string }`; `Purchase = { purchaseToken; productId; paymentId; purchaseTime; developerPayload?; signedRequest? }`; `SubscriptionStatus = { isActive: boolean; productId: string; expiresAt?; willRenew? }`.

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
| `isSupported` | None | None | None | Ready | None |
| `isSubscriptionSupported` | None | None | None | None¹ | None |

Yandex maps to its native payments API. On every other platform the strategy's `isSupported()` returns `false`. Guard your calls with `isSupported()`.

¹ Subscriptions are not offered anywhere yet. `isSubscriptionSupported()` returns `false` on every platform, Yandex included.

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
