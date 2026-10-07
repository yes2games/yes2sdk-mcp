# Upcoming Modules

[← Back to overview](overview.md)

A few more modules are already implemented in Core and on the rollout path. Their full API is built and tested. What's coming is the platform wiring and the remaining engine bindings: Achievements, Tournament and context switching in Unity and Defold. They're documented here so you can **design against the final API today** and switch them on with no rework once support lands.

> **Already shipped:** IAP, Leaderboard, Stats, Config (remote flags), and Review (rating prompt) are now **live**: fully supported on Yandex, IAP is also ready on Jest, and all of them are safe everywhere else. See [iap.md](iap.md), [leaderboard.md](leaderboard.md), [stats.md](stats.md), [config.md](config.md), and [review.md](review.md).

> **Live on Jest:** Notifications (registered players) and Context image sharing work on [Jest](/docs/jest) today, in Core 2.10.0, Unity 2.10.0 and Defold 1.8.0. Their sections below cover the Jest behaviour and the engine bindings.

- **Core (TS):** complete, tested API classes, reachable as `Yes2SDK.achievements`, `Yes2SDK.context`, `Yes2SDK.notifications` and `Yes2SDK.tournament`. Platform wiring lands as each adapter is finished.
- **Unity (C#):** `Yes2SDK.Yes2SDK.Notifications` and `Context.ShareImageAsync` are live bindings. The Achievements and Tournament accessors, and Context switching, return a clean `FeatureNotSupported` until their bridge ships. Safe to reference in your code now.
- **Defold (Lua):** notifications (`notifications_*`) and image sharing (`context_share`) ship in 1.8.0. Achievements and tournaments are not exposed yet.

> **A natural next step.** The modules below map directly to **Facebook Instant Games**, on the platform roadmap, which brings **context**, **tournaments**, and **notifications**. The groundwork is in place.

Each module below is **Coming soon** on Poki, GameDistribution, CrazyGames, Yandex and YouTube. Jest support is noted per module.

---

## Achievements (`AchievementsAPI`)

| Signature | Description |
|-----------|-------------|
| `getAchievementsAsync(): Promise<Achievement[]>` | All achievements. |
| `unlockAsync(achievementId: string): Promise<void>` | Unlock an achievement. |
| `setProgressAsync(achievementId: string, progress: number): Promise<void>` | Set progress (0-100). |
| `isSupported(): boolean` | |

`Achievement = { id; name; description; iconUrl; status: "locked" | "unlocked" | "in_progress"; progress?; unlockedAt? }`

**Status:** Coming soon. Not supported on Jest either: `isSupported()` returns `false` and every method throws `FEATURE_NOT_SUPPORTED`.

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

`SharePayload = { intent: "INVITE" | "REQUEST" | "CHALLENGE" | "SHARE"; image?: string; text?: string; data?: Record<string, unknown> }`

**Status:** Partial on **Jest** (image sharing only). Coming soon on Poki, GameDistribution, CrazyGames, Yandex and YouTube. On CrazyGames, `shareAsync` already does something different: it creates an invite link, shows CrazyGames' invite button and resolves, ignoring `image` and `data`. On Poki, GameDistribution, Yandex and YouTube it throws `FEATURE_NOT_SUPPORTED`. CrazyGames invite-link sharing is also available through the [game](game.md) module's invite-link methods.

### Image sharing on Jest

`shareAsync(payload)` opens Jest's image share. The player picks where the image goes and writes the caption.

- `image`: a base64 PNG or a `data:image/png;base64,...` URL. A plain URL fails on Jest. When you leave it out, Jest captures the game canvas.
- `data`: handed to the player who opens the share, through `session.getEntryPointData()`.
- `intent` and `text` are ignored on Jest. The promise resolves when the share closes; a cancel is not reported.
- Jest has no threads or groups, so the context is always solo: `getContext()` returns `{ id: null, type: "SOLO" }`, and `getPlayersAsync`, `switchAsync`, `chooseAsync`, `createAsync` and `updateAsync` throw `FEATURE_NOT_SUPPORTED`.
- `isSupported()` is `false` on Jest because it reports context switching, yet sharing works. **Do not gate image sharing on `isSupported()`**. Instead skip the call on CrazyGames, where it would show the invite button instead of sharing your image, and handle `FEATURE_NOT_SUPPORTED` elsewhere. Check the platform with `Yes2SDK.getPlatform()`: share when it returns `"jest"`, or skip when it returns `"crazygames"`.

```ts
if (Yes2SDK.getPlatform() !== "crazygames") {
  try {
    await Yes2SDK.context.shareAsync({
      intent: "SHARE",
      image: canvas.toDataURL("image/png"),
      data: { challenge: "level_12" },
    });
  } catch (err) {
    if (isErrorMessage(err) && err.code === "FEATURE_NOT_SUPPORTED") {
      hideShareButton(); // no image sharing on this platform
    } else {
      console.error(err);
    }
  }
}
```

### Unity (C#)

`Yes2SDK.Yes2SDK.Context` (class `Yes2SDKContext`).

| Signature | Description |
|-----------|-------------|
| `void ShareImageAsync(ContextShareOptions options, Action onSuccess = null, Action<Error> onError = null)` / `Task ShareImageAsync(ContextShareOptions options, CancellationToken cancellationToken)` | Open the platform share sheet with an image, text and entry data. Null options call `onError` synchronously with `InvalidParams`. `onSuccess` means the sheet completed or was dismissed; a cancel is not reported. Poki, GameDistribution, Yandex and YouTube call `onError` with `FeatureNotSupported`. On CrazyGames it shows CrazyGames' invite button and calls `onSuccess`, ignoring the image and data. |
| `void ShareAsync(string text, string imageBase64, Action onSuccess = null, Action<Error> onError = null)` | Shorter form without entry data. |
| `string GetContext()`, `SwitchAsync`, `ChooseAsync`, `CreateAsync` | Not supported: `GetContext()` returns `null`, the others call `onError` with `FeatureNotSupported`. |
| `bool IsSupported()` | Always `false`; it reports context switching only. Do not gate sharing on it. |

`ContextShareOptions` (class): `string ImageDataUrl` (a PNG data URL; raw base64 also works), `string Text`, `Dictionary<string, object> Data` (read by the receiving player through `Session.GetEntryPointData()`). Build the image with `Yes2SDKImage.ToPngDataUrl(Texture2D texture)`. Pass an image: without one, a platform screen capture can come out blank for a WebGL canvas. To skip the share on CrazyGames, check `Yes2SDK.Yes2SDK.GetPlatform() != Platform.CrazyGames`.

```csharp
using System.Collections.Generic;
using UnityEngine;
using Yes2SDK;

if (Yes2SDK.Yes2SDK.GetPlatform() != Platform.CrazyGames)
{
    var options = new ContextShareOptions(Yes2SDKImage.ToPngDataUrl(screenshot))
    {
        Data = new Dictionary<string, object> { { "challenge", "level_12" } }
    };
    Yes2SDK.Yes2SDK.Context.ShareImageAsync(options,
        onSuccess: () => Debug.Log("Share closed"),
        onError: error => Debug.Log(error.Code));
}
```

### Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.context_share(options, callback)` | `options` (table or JSON string, or `nil` for a plain share): `intent` (`"SHARE"` by default, `"INVITE"`, `"REQUEST"` or `"CHALLENGE"`), `image`, `text`, `data` (table). The callback is optional: `callback(self, success, err)`. Options that are not a table or a JSON string fail with `INVALID_PARAM`. Poki, GameDistribution, Yandex and YouTube fail with `FEATURE_NOT_SUPPORTED`. On CrazyGames it shows CrazyGames' invite button and reports success, ignoring `image` and `data`, so skip it when `yes2sdk.get_platform() == "crazygames"`. |
| `yes2sdk.context_is_supported()` | A hint only. It can return `false` where sharing works, so do not gate `context_share` on it. |

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

if yes2sdk.get_platform() ~= "crazygames" then
    yes2sdk.context_share({
        intent = "SHARE",
        image = data_url,              -- prefer a data:image/png;base64,... URL
        data = { challenge = "level_12" },
    }, function(self, success, err)
        if not success then
            print("Share failed: " .. yes2sdk.parse_error(err).code)
        end
    end)
end
```

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

`ScheduleNotificationOptions = { id?; title; body; iconUrl?; imageAssetId?; imageDataUrl?; delaySeconds?; scheduledInDays?; ctaText?; priority?; data? }`

- `id`: stable id. Scheduling again with the same id replaces the earlier notification where the platform supports it; generated when omitted.
- `delaySeconds` / `scheduledInDays`: provide **exactly one**. `delaySeconds` is a positive number of seconds (a platform may cap it, for example at 7 days, and rejects longer delays with `INVALID_PARAM`). `scheduledInDays` is a whole number from 0 to 7 and lets the platform pick the delivery time within that day. Existing calls that pass only `delaySeconds` keep working.
- `ctaText`: call-to-action label, 1 to 50 characters. A platform default is used when omitted.
- `priority`: `"low" | "medium" | "high" | "critical"`, default `"medium"`. Weights delivery where the platform rations notifications.
- `imageAssetId` / `imageDataUrl`: at most one. `imageAssetId` is the id of a pre-approved image on the platform. `imageDataUrl` is a base64 data URL (PNG, JPEG or WebP, lowercase `data:image/...;base64,` prefix as `canvas.toDataURL` produces, at most 2 MiB encoded). Images are ignored where the platform has no notification images.
- Rule violations reject with `INVALID_PARAM`; where the platform requires a registered player, guests are rejected with `PLAYER_NOT_AUTHENTICATED`.
- `data` is handed back through `session.getEntryPointData()` when the player opens the notification.
- There is no method to list scheduled notifications.

**Status:** Live on **Jest** for registered players. Coming soon on Poki, GameDistribution, CrazyGames, Yandex and YouTube, where `isSupported()` returns `false`, `canSubscribeBotAsync()` resolves `false`, and the scheduling, cancel and bot subscribe calls throw `FEATURE_NOT_SUPPORTED`.

### Notifications on Jest

- **Registered players only.** A guest gets `PLAYER_NOT_AUTHENTICATED`. Check `auth.isAuthenticated()` first, or offer the [registration prompt](auth.md).
- **Limits:** `title` at most 200 characters, `body` 1 to 2000 characters, `ctaText` 1 to 50 characters (default `"Play"`), `delaySeconds` at most 7 days. Breaking one rejects with `INVALID_PARAM`.
- `scheduledInDays` lets Jest pick the delivery time. `0` means later today.
- `imageAssetId` is an image from your game's Image Library in Jest's Developer Console. A missing or unapproved id falls back to the game's Hero image. `iconUrl` is ignored.
- Scheduling again with the same `id` replaces the earlier notification, so there is no need to cancel first.
- `cancelAllAsync()` cancels only the notifications scheduled in the current page session. Notifications from earlier sessions stay scheduled; cancel them by `id`.
- `canSubscribeBotAsync()` resolves `false` and `subscribeBotAsync()` throws `FEATURE_NOT_SUPPORTED`.
- Delivery: notifications show in the player's Library tab on Jest. Once a day Jest picks at most one notification per player, across all games, to send as SMS or RCS, weighted by `priority`.

```ts
if (Yes2SDK.notifications.isSupported() && Yes2SDK.auth.isAuthenticated()) {
  await Yes2SDK.notifications.scheduleAsync({
    id: "daily_reward",
    title: "Your reward is ready",
    body: "Come back for today's bonus.",
    scheduledInDays: 1,
    ctaText: "Play",
    priority: "medium",
    data: { reward: "daily" },
  });
}
```

### Unity (C#)

`Yes2SDK.Yes2SDK.Notifications` (class `Yes2SDKNotifications`).

| Signature | Description |
|-----------|-------------|
| `bool IsSupported()` | Whether notifications are supported on the current platform. |
| `void ScheduleAsync(NotificationOptions options, Action<ScheduledNotification> onSuccess = null, Action<Error> onError = null)` / `Task<ScheduledNotification> ScheduleAsync(NotificationOptions options, CancellationToken cancellationToken)` | Schedule a notification. Null options, or `Data` that cannot be written as JSON, call `onError` synchronously with `InvalidParams`. Other rule violations come back as `InvalidParams` through `onError`. A guest gets code `"PLAYER_NOT_AUTHENTICATED"` on platforms that only notify registered players. |
| `void ScheduleAsync(string title, string body, int delaySec, string dataJson, Action<string> onSuccess = null, Action<Error> onError = null)` | Older form. `onSuccess` receives the notification id. Prefer `NotificationOptions`. |
| `void CancelAsync(string notificationId, Action onSuccess = null, Action<Error> onError = null)` / `Task CancelAsync(string notificationId, CancellationToken cancellationToken)` | Cancel by the id returned when scheduling. |
| `void CancelAllAsync(Action onSuccess = null, Action<Error> onError = null)` / `Task CancelAllAsync(CancellationToken cancellationToken)` | Cancel every notification this game scheduled (on Jest, only this session's). |

`NotificationOptions` (class): `string Id`, `string Title`, `string Body`, `int? DelaySeconds`, `int? ScheduledInDays` (set exactly one of the two), `string CtaText`, `NotificationPriority? Priority` (`Low`, `Medium`, `High`, `Critical`; default `Medium`), `string ImageAssetId` or `string ImageDataUrl` (at most one), `string IconUrl`, `Dictionary<string, object> Data`. The rules match Core.

`ScheduledNotification` (struct): `string Id`, `string Title`, `string Body`, `long ScheduledAt` (Unix ms).

```csharp
using System.Collections.Generic;
using UnityEngine;
using Yes2SDK;

if (Yes2SDK.Yes2SDK.Notifications.IsSupported() && Yes2SDK.Yes2SDK.Auth.IsAuthenticated())
{
    var options = new NotificationOptions
    {
        Id = "daily_reward",
        Title = "Your reward is ready",
        Body = "Come back for today's bonus.",
        ScheduledInDays = 1,
        CtaText = "Play",
        Priority = NotificationPriority.Medium,
        Data = new Dictionary<string, object> { { "reward", "daily" } }
    };
    Yes2SDK.Yes2SDK.Notifications.ScheduleAsync(options,
        onSuccess: scheduled => Debug.Log("Scheduled " + scheduled.Id),
        onError: error => Debug.Log(error.Code));
}
```

### Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.notifications_schedule(options, callback)` | `options` table with snake_case keys: `id`, `title` (required), `body`, `delay_seconds` or `scheduled_in_days` (exactly one), `cta_text`, `priority` (`"low"`, `"medium"`, `"high"` or `"critical"`), `image_asset_id` or `image_data_url` (at most one), `icon_url`, `data` (table). A JSON string is passed through as is, so use the camelCase names in that case. `callback(self, success, result_json)`: `{"id","title","body","scheduledAt"}` with `scheduledAt` in ms since the epoch. Invalid options fail with `INVALID_PARAM`. |
| `yes2sdk.notifications_cancel(id, callback)` | `callback(self, success, err)`. A non-string or empty id fails with `INVALID_PARAM`. |
| `yes2sdk.notifications_cancel_all(callback)` | Cancel every notification this game scheduled (on Jest, only this session's). |
| `yes2sdk.notifications_is_supported()` | Boolean. |

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

if yes2sdk.notifications_is_supported() and yes2sdk.auth_is_authenticated() then
    yes2sdk.notifications_schedule({
        id = "daily_reward",
        title = "Your reward is ready",
        body = "Come back for today's bonus.",
        scheduled_in_days = 1,
        cta_text = "Play",
        priority = "medium",
        data = { reward = "daily" },
    }, function(self, success, result_json)
        if not success then
            print(yes2sdk.parse_error(result_json).message)
        end
    end)
end
```

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

**Status:** Coming soon. Not supported on Jest either: `getCurrentAsync()` resolves `null` and the other methods throw `FEATURE_NOT_SUPPORTED`.

---

## Unity accessors

These accessors are already present in the Unity SDK and return a clean `FeatureNotSupported` until their platform bridges ship, so you can wire your code against them now:

- `Yes2SDK.Yes2SDK.Achievements`: `GetAchievementsAsync`, `UnlockAsync`, `SetProgressAsync`
- `Yes2SDK.Yes2SDK.Context`: `GetContext`, `SwitchAsync`, `ChooseAsync`, `CreateAsync` (sharing is live, see [Context](#context-contextapi))
- `Yes2SDK.Yes2SDK.Tournament`: `GetCurrentAsync`, `GetAllAsync`, `CreateAsync`, `PostScoreAsync`, `JoinAsync`

`IsSupported()` reports `false` until the bridge is live, so feature-gating with it works across the transition. The exception is Context: its `IsSupported()` stays `false` even where image sharing works. `Yes2SDK.Yes2SDK.Notifications` is a live binding, covered in [Notifications](#notifications-notificationsapi).
