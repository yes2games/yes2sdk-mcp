# Upcoming Modules

[← Back to overview](overview.md)

Seven more modules are already implemented in Core and on the rollout path. Their full API is built and tested — what's coming is the platform wiring and the surface bindings (Unity, Defold). They're documented here so you can **design against the final API today** and switch them on with no rework once support lands.

- **Core (TS):** complete, tested API classes. Being wired to the public `Yes2SDK.*` surface as each platform adapter is finished.
- **Unity (C#):** accessors are already present (`Yes2SDK.IAP`, …) and return a clean `FeatureNotSupported` until their bridge ships — safe to reference in your code now.
- **Defold (Lua):** arriving alongside the platform rollout.

> **A natural next step.** Several of these map directly to capabilities the live platforms already expose. Yandex offers native **IAP**, **leaderboards**, and **stats** (its SDK type definitions already declare `getStats`/`setStats`/`incrementStats`), and Facebook Instant Games — on the platform roadmap — brings **context**, **tournaments**, and **notifications**. The groundwork is in place.

Each module below is **Coming soon** across all five live platforms unless noted.

---

## Achievements (`AchievementsAPI`)

| Signature | Description |
|-----------|-------------|
| `getAchievementsAsync(): Promise<Achievement[]>` | All achievements. |
| `unlockAsync(achievementId: string): Promise<void>` | Unlock an achievement. |
| `setProgressAsync(achievementId: string, progress: number): Promise<void>` | Set progress (0–100). |
| `isSupported(): boolean` | |

`Achievement = { id; name; description; iconUrl; status: "locked" | "unlocked" | "in_progress"; progress?; unlockedAt? }`

**Status:** Coming soon.

---

## Context (`ContextAPI`)

Social context (Facebook-style threads/groups).

| Signature | Description |
|-----------|-------------|
| `getContext(): Context` | Current context. |
| `getType(): ContextType` | Context type. |
| `getPlayersAsync(): Promise<ContextPlayer[]>` | Players in the context. |
| `switchAsync(contextId: string): Promise<void>` | Switch context. |
| `chooseAsync(options?: ChooseContextOptions): Promise<void>` | Show the context chooser. |
| `createAsync(playerId: string): Promise<void>` | Create a context with a player. |
| `isSizeBetween(min: number, max: number): ContextSizeResult` | Check context size range. |
| `shareAsync(payload: SharePayload): Promise<void>` | Share to the context. |
| `updateAsync(payload: UpdatePayload): Promise<void>` | Post an update to the context. |
| `isSupported(): boolean` | |

`ContextType = "POST" | "THREAD" | "GROUP" | "SOLO"`

**Status:** Coming soon. In the meantime, CrazyGames invite-link sharing is available today through the [game](game.md) module's invite-link methods.

---

## IAP (`IAPAPI`)

| Signature | Description |
|-----------|-------------|
| `getCatalogAsync(): Promise<Product[]>` | Product catalog. |
| `getProductAsync(productId: string): Promise<Product \| null>` | Product by ID. |
| `purchaseAsync(config: PurchaseConfig): Promise<Purchase>` | Initiate a purchase. |
| `getPurchasesAsync(): Promise<Purchase[]>` | Unconsumed purchases. |
| `consumePurchaseAsync(purchaseToken: string): Promise<void>` | Consume a purchase. |
| `getSubscriptionStatusAsync(productId: string): Promise<SubscriptionStatus>` | Subscription status. |
| `isSupported(): boolean` / `isSubscriptionSupported(): boolean` | |

`Product = { productId; title; description; imageUri; price; priceCurrencyCode; priceAmount? }`

**Status:** Coming soon — Yandex IAP is the first target (native support already available on the platform).

---

## Leaderboard (`LeaderboardAPI`)

| Signature | Description |
|-----------|-------------|
| `getLeaderboardAsync(name: string): Promise<Leaderboard>` | Leaderboard by name. |
| `setScoreAsync(name: string, score: number, metadata?: string): Promise<LeaderboardEntry>` | Submit a score; returns the player's entry. |
| `getEntriesAsync(name: string, count?: number, offset?: number): Promise<LeaderboardEntry[]>` | Entries (default count 10, offset 0). |
| `getPlayerEntryAsync(name: string): Promise<LeaderboardEntry \| null>` | Player's entry, or `null` if unranked. |
| `getConnectedPlayerEntriesAsync(name: string, count?: number, offset?: number): Promise<LeaderboardEntry[]>` | Friends' entries. |
| `isSupported(): boolean` | |

`LeaderboardEntry = { rank; playerId; playerName; playerPhoto; score; formattedScore; timestamp; metadata? }`

**Status:** Coming soon — Yandex leaderboards are the first target. For write-only score submission available today, see the [score](score.md) module.

---

## Notifications (`NotificationsAPI`)

| Signature | Description |
|-----------|-------------|
| `scheduleAsync(options: ScheduleNotificationOptions): Promise<ScheduledNotification>` | Schedule a notification. |
| `cancelAsync(notificationId: string): Promise<void>` | Cancel one. |
| `cancelAllAsync(): Promise<void>` | Cancel all. |
| `canSubscribeBotAsync(): Promise<boolean>` | Whether the player can subscribe to the bot. |
| `subscribeBotAsync(): Promise<void>` | Subscribe to the bot. |
| `isSupported(): boolean` | |

`ScheduleNotificationOptions = { title; body; iconUrl?; delaySeconds; data? }`

**Status:** Coming soon.

---

## Stats (`StatsAPI`)

| Signature | Description |
|-----------|-------------|
| `getStatsAsync(keys: string[]): Promise<Record<string, number>>` | Get stats by keys. |
| `setStatsAsync(stats: Record<string, number>): Promise<void>` | Set stats. |
| `incrementStatsAsync(increments: Record<string, number>): Promise<Record<string, number>>` | Increment stats; returns updated values. |
| `isSupported(): boolean` | |

**Status:** Coming soon — Yandex stats are the first target (`getStats`/`setStats`/`incrementStats` already declared in its SDK).

---

## Tournament (`TournamentAPI`)

| Signature | Description |
|-----------|-------------|
| `getCurrentAsync(): Promise<Tournament \| null>` | Current tournament, or `null`. |
| `getAllAsync(): Promise<Tournament[]>` | All available tournaments. |
| `createAsync(options: CreateTournamentOptions): Promise<Tournament>` | Create a tournament. |
| `postScoreAsync(score: number): Promise<void>` | Post a score to the current tournament. |
| `shareAsync(score: number, data?: Record<string, unknown>): Promise<void>` | Share with a score. |
| `joinAsync(tournamentId: string): Promise<void>` | Join a tournament. |
| `isSupported(): boolean` | |

`Tournament = { id; title; contextId; endTime; payload? }`

**Status:** Coming soon.

---

## Unity accessors

These accessors are already present in the Unity SDK and return a clean `FeatureNotSupported` until their platform bridges ship — so you can wire your code against them now:

- `Yes2SDK.Leaderboard`: `GetLeaderboardAsync`, `SetScoreAsync`, `GetEntriesAsync`, `GetPlayerEntryAsync`
- `Yes2SDK.IAP`: `GetCatalogAsync`, `PurchaseAsync`, `GetPurchasesAsync`, `ConsumePurchaseAsync`
- `Yes2SDK.Achievements`: `GetAchievementsAsync`, `UnlockAsync`, `SetProgressAsync`
- `Yes2SDK.Context`: `GetContext`, `SwitchAsync`, `ChooseAsync`, `CreateAsync`, `ShareAsync`
- `Yes2SDK.Notifications`: `ScheduleAsync`, `CancelAsync`, `CancelAllAsync`
- `Yes2SDK.Tournament`: `GetCurrentAsync`, `GetAllAsync`, `CreateAsync`, `PostScoreAsync`, `JoinAsync`
- `Yes2SDK.Stats`: `GetStatsAsync`, `SetStatsAsync`, `IncrementStatsAsync`

`IsSupported()` reports `false` until the bridge is live, so feature-gating with it works seamlessly across the transition.
