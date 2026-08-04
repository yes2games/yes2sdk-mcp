# Upcoming Modules

[← Back to overview](overview.md)

A few more modules are already implemented in Core and on the rollout path. Their full API is built and tested. What's coming is the platform wiring and the surface bindings (Unity, Defold). They're documented here so you can **design against the final API today** and switch them on with no rework once support lands.

> **Already shipped:** IAP, Leaderboard, Stats, Config (remote flags), and Review (rating prompt) are now **live**: fully supported on Yandex, safe everywhere else. See [iap.md](iap.md), [leaderboard.md](leaderboard.md), [stats.md](stats.md), [config.md](config.md), and [review.md](review.md).

- **Core (TS):** complete, tested API classes. Being wired to the public `Yes2SDK.*` surface as each platform adapter is finished.
- **Unity (C#):** accessors are already present (`Yes2SDK.Achievements`, …) and return a clean `FeatureNotSupported` until their bridge ships. Safe to reference in your code now.
- **Defold (Lua):** arriving alongside the platform rollout.

> **A natural next step.** The modules below map directly to **Facebook Instant Games**, on the platform roadmap, which brings **context**, **tournaments**, and **notifications**. The groundwork is in place.

Each module below is **Coming soon** across all five live platforms unless noted.

---

## Achievements (`AchievementsAPI`)

| Signature | Description |
|-----------|-------------|
| `getAchievementsAsync(): Promise<Achievement[]>` | All achievements. |
| `unlockAsync(achievementId: string): Promise<void>` | Unlock an achievement. |
| `setProgressAsync(achievementId: string, progress: number): Promise<void>` | Set progress (0-100). |
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

These accessors are already present in the Unity SDK and return a clean `FeatureNotSupported` until their platform bridges ship, so you can wire your code against them now:

- `Yes2SDK.Achievements`: `GetAchievementsAsync`, `UnlockAsync`, `SetProgressAsync`
- `Yes2SDK.Context`: `GetContext`, `SwitchAsync`, `ChooseAsync`, `CreateAsync`, `ShareAsync`
- `Yes2SDK.Notifications`: `ScheduleAsync`, `CancelAsync`, `CancelAllAsync`
- `Yes2SDK.Tournament`: `GetCurrentAsync`, `GetAllAsync`, `CreateAsync`, `PostScoreAsync`, `JoinAsync`

`IsSupported()` reports `false` until the bridge is live, so feature-gating with it works seamlessly across the transition.
