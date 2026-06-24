# IAP — `Yes2SDK.iap`

[← Back to overview](overview.md)

In-app purchases: read the product catalog, initiate a purchase, restore and consume purchases, and check subscription status. Optional — guard with `isSupported()`.

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
| `getCatalogAsync` | — | — | — | Ready | — |
| `getProductAsync` | — | — | — | Ready | — |
| `purchaseAsync` | — | — | — | Ready | — |
| `getPurchasesAsync` | — | — | — | Ready | — |
| `consumePurchaseAsync` | — | — | — | Ready | — |
| `getSubscriptionStatusAsync` | — | — | — | —¹ | — |
| `isSupported` | — | — | — | Ready | — |
| `isSubscriptionSupported` | — | — | — | —¹ | — |

Yandex maps to its native payments API. On every other platform the strategy's `isSupported()` returns `false` — guard your calls with `isSupported()`.

¹ Subscriptions are not offered anywhere yet — `isSubscriptionSupported()` returns `false` on every platform, Yandex included.

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
