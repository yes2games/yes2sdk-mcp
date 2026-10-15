# Analytics: `Yes2SDK.analytics`

[← Back to overview](overview.md)

Track gameplay events. All methods are synchronous, fire-and-forget.

> **Good to know:** Player events are recorded for you on **Y2G-Portal** and **Jest** only (see [Player events](#player-events) below). On every other platform the analytics calls are safe to keep in your code, but they are logged locally only: use the data the platform itself provides. **Exception (Yandex):** when a Metrica counter ID is configured for the game (dashboard game settings), these events are additionally delivered to **Yandex Metrica** as `reachGoal` calls (see the [Yandex quickstart](/docs/yandex)). The **gameplay lifecycle** is wired to each platform's real engagement signals: `logLevelStart`/`logLevelEnd` drive `gameplayStart`/`gameplayStop`, which platforms use for monetization timing. Jest has no gameplay signal, so on Jest the level calls do not drive `gameplayStart`/`gameplayStop`; they are still recorded as player events.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `logEvent(eventName: string, valueToSum?: number, parameters?: AnalyticsParameters): void` | Custom event. `eventName` must be non-empty. |
| `logLevelStart(level: string): void` | Level start. Drives `gameplayStart` where supported. |
| `logLevelEnd(level: string, score?: number, success?: boolean, durationSeconds?: number): void` | Level end. Drives `gameplayStop` where supported. |
| `logScore(score: number, level?: string): void` | Score event. |
| `logTutorial(step: string, completed: boolean): void` | Tutorial event. `step` must be non-empty. |
| `logPurchase(productId: string, price: number, currency: string): void` | Purchase event. `productId`/`currency` non-empty. |
| `logTutorialStart(): void` | Alias → `logTutorial("tutorial_start", false)`. |
| `logTutorialEnd(): void` | Alias → `logTutorial("tutorial_end", true)`. |
| `isSupported(): boolean` | Whether analytics is supported. On Jest it is `false` when the build does not record player events. |

`AnalyticsParameters = Record<string, string | number | boolean>`

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Y2G-Portal | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:------:|:----:|
| `logEvent` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ | Recorded⁶ | Recorded⁶ |
| `logLevelStart` | Partial² | Partial³ | Partial² | Partial²˒⁵ | None⁴ | Recorded⁷ | Recorded⁷ |
| `logLevelEnd` | Partial² | Partial³ | Partial² | Partial²˒⁵ | None⁴ | Recorded⁷ | Recorded⁷ |
| `logScore` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ | Recorded⁶ | Recorded⁶ |
| `logTutorial` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ | Recorded⁶ | Recorded⁶ |
| `logPurchase` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ | Recorded⁶ | Recorded⁶ |
| `isSupported` | Ready | Ready | Ready | Ready | Ready | Ready⁹ | Ready⁸ |

¹ Logged locally (`logger.debug`) only: no platform delivery.
² Logs locally **and** calls the real `gameplayStart`/`gameplayStop` (`PokiSDK`, CrazyGames `sdk.game`, Yandex `GameplayAPI`).
³ GameDistribution drives internal gameplay state only (no platform gameplay call).
⁴ YouTube sets an internal gameplay flag only. Note: on YouTube the SDK additionally exposes real **`reportError`/`reportWarning`** backed by `ytgame.health.logError`/`logWarning` (not part of the cross-platform analytics surface).
⁵ **Yandex only, when a Metrica counter ID is configured** for the game: the call also fires `ym('reachGoal', …)`. Goal name is the `eventName` for `logEvent`; `score` / `tutorial` / `purchase` / `level_start` / `level_end` for the typed methods. Without a counter configured it degrades to local logging (¹). Metrica is separate from the YaGames SDK. The dashboard injects the counter tag into Yandex builds. See the [Yandex quickstart](/docs/yandex).
⁶ Y2G-Portal and Jest: recorded as a [player event](#player-events). Yes2SDK does not forward events to Jest's own event capture, which Jest has retired.
⁷ Y2G-Portal and Jest: recorded as a player event. Jest has no gameplay start or stop signal, so on Jest the level calls do not reach the platform's gameplay API. See the [Jest guide](/docs/jest).
⁸ Jest: `true` only when the build records player events, otherwise `false`.
⁹ Y2G-Portal: `true` only when the game is opened on play.yes2games.com. Anywhere else, such as an Inspector preview, it is `false`.

---

## Player events

Y2G-Portal and Jest builds record your analytics calls as anonymous player events, so you can see how players move through your game.

| Platform | Player events |
|----------|---------------|
| Y2G-Portal | Recorded |
| Jest | Recorded |
| Poki, CrazyGames, GameDistribution, YouTube Playables | Not recorded. Use the analytics the platform provides. |
| Yandex | Not recorded. Metrica forwarding works as described above. |

Event types:

| Type | Sent by |
|------|---------|
| `event` | `logEvent`: any custom name you choose |
| `levelStart` | `logLevelStart` |
| `levelEnd` | `logLevelEnd` |
| `score` | `logScore` |
| `tutorial` | `logTutorial`, `logTutorialStart`, `logTutorialEnd` |
| `purchase` | `logPurchase` |

Notes:

- `logEvent` accepts any non-empty name, so you can track events specific to your game.
- Events are anonymous. Each page load gets a random session id that is not stored, and no personal data is collected.
- Events are sent in small batches, and a failed send never affects your game.
- The funnel view is on your game page, under the **Player events** tab. Figures can lag by up to an hour.
- On platforms that do not record player events the same calls are harmless, so one codebase runs everywhere.

### Which call feeds what

| Call | What you see on the game page |
|------|-------------------------------|
| `logLevelStart(level)` | Level starts and the level funnel. |
| `logLevelEnd(level, score, success, durationSeconds?)` | Level ends, wins, win rate and best score. Always pass `success`: `true` for a win, `false` for a loss, quit or timeout. Without it wins show 0. |
| `logTutorial(step, completed)` | The Tutorial table. Send `completed: false` when a step is reached and `true` when it is done. The **Tutorial completions** tile adds up every `completed: true` across all steps, so send `true` only on the final step if the tile should mean "finished the tutorial". |
| `logPurchase(productId, price, currency)` | Purchases and revenue. Real money only, and only after the purchase is confirmed. `currency` must be a three letter code such as `USD` or `EUR`, and `price` a number from 0 to 1,000,000. A purchase outside those limits is dropped. Prices are kept to two decimal places. |
| `logEvent(eventName, valueToSum?, parameters?)` | Your own events, in the Explore events section. `valueToSum` is a number that is added up per event name. |
| `logScore(score, level?)` | Nothing in the funnel today. Put the score in `logLevelEnd` instead. |
| Sessions | Counted from your events. A game that sends no events has no sessions, so call at least one analytics method. |

Limits and habits that keep the numbers useful:

- Use stable level ids such as `"1"` or `"forest-3"`, not an id that is new on every attempt. Each type keeps up to 200 distinct ids per day, and the rest are shown as `(other)`.
- `logLevelStart` and `logLevelEnd` also drive gameplay start and stop on platforms that use them. Pair every start with an end, and do not use them for sub-steps.
- An event name is at most 64 characters. Parameters are flat `string`, `number` or `boolean` values and must stay under about 2 KB.
- Do not log per frame or per tick. Stay well under 60 calls a minute.
- Events are anonymous. Never put anything personal in parameters.

### Call names by engine

| Engine | Calls |
|--------|-------|
| JavaScript | `Yes2SDK.analytics.logLevelStart`, `logLevelEnd`, `logTutorial`, `logPurchase`, `logEvent` |
| Unity | `Yes2SDK.Analytics.LogLevelStart`, `LogLevelEnd`, `LogTutorialStart`, `LogTutorialEnd`, `LogPurchase`, `LogEvent` |
| Defold | `yes2sdk.analytics_log_level_start`, `analytics_log_level_end`, `analytics_log_tutorial_start`, `analytics_log_tutorial_end`, `analytics_log_event` |

Notes for Unity and Defold:

- The tutorial calls take no step id. They appear as the steps `tutorial_start` (reached) and `tutorial_end` (completed). Because `tutorial_end` is the completed one, it is also what the Tutorial completions tile counts.
- `LogEvent` and `analytics_log_event` take a name and parameters only, with no `valueToSum`. Defold passes the parameters as a JSON string, for example `json.encode({ level = 3 })`.
- `LogLevelEnd` and `analytics_log_level_end` take the score and the `success` flag directly. Pass `success` every time.
- Defold has no analytics purchase call. Purchases are reported automatically, see below.

### Purchases are reported for you

On Jest, with newer SDK builds, a successful SDK in-app purchase is reported automatically. You do not call `logPurchase` for it, and Unity and Defold games need no call either.

- The report uses the price the player actually paid and its currency. If the platform does not return that, the catalog price is used, so load the catalog before you sell.
- If you also call `logPurchase` by hand for the same purchase, it is not counted twice.
- Failed, cancelled and restored purchases are not reported.
- Sandbox purchases and zero-price purchases are not reported.
- The Yes2Games portal has no in-app purchases, so there is nothing to report there. Other platforms do not record player events.

Call `logPurchase` yourself only for real-money purchases that do not go through the SDK in-app purchase module.

### Platform names

Player events carry the platform they came from. On play.yes2games.com the SDK reports the platform as `portal`, and on Jest as `jest` (`getPlatform()` in JavaScript, `get_platform` in Defold). These are the two platform choices you see in the dashboard.

### Where it shows up

Open your game page in the Dashboard and go to the **Player events** tab. It appears only for games that are live on Jest or the Yes2Games portal. Live means published, not just approved.

- Funnel cards: sessions, level starts, win rate and tutorial completions.
- A daily trend, plus tables for levels, tutorial steps and purchases.
- **Explore events**: count any event and narrow it down.
  - Filter by event (built in or custom), platform and date range (UTC, up to 45 days). You can add one `key=value` parameter filter.
  - Group by Event, Day, Platform or one Parameter.
  - Grouping or filtering by a parameter covers the last 45 days. Other groupings cover the date range you picked.
  - Results show up to 100 groups. Anything beyond that is added up in an `(other)` row.
  - Purchase revenue is shown only to people who are allowed to see revenue.
- Purchases are shown in USD, converted from the currency the game reports at that day's exchange rate. A currency with no exchange rate is shown as reported and is not included in the USD total.
- Numbers can lag by up to about an hour.

### Instrumentation checklist

Follow this when you add events to a game, by hand or with a coding agent.

1. Call `logLevelStart(level)` when a level really begins, and `logLevelEnd(level, score, success)` when it ends, once per start. Cover every exit: win, loss, quit and timeout.
2. Always pass `success`: `true` for a win, `false` otherwise.
3. Use stable level ids (`"1"`, `"forest-3"`), never a per-attempt id.
4. For a tutorial, send `completed: false` as steps are reached and `completed: true` only on the final step. In Unity and Defold use the tutorial start and end calls.
5. Do not call `logPurchase` for SDK in-app purchases on Jest, they are reported automatically. Use it only for other confirmed real-money purchases.
6. Use `logEvent` for anything game specific. Keep names under 64 characters and parameters flat and small, with nothing personal in them.
7. Never log per frame or per tick.
8. Run the game in the Inspector. It already lists analytics events, so check that each start has an end, `success` is set and the ids look right before you upload. Inspector runs are never recorded in Player events, so testing there does not change your numbers.

---

## Unity (C#)

`Yes2SDK.Analytics` (`Yes2SDKAnalytics`).

| Signature | Description |
|-----------|-------------|
| `void LogEvent(string name, Dictionary<string, object> parameters = null)` | Custom event. |
| `void LogLevelStart(string level)` | Level start (Poki → `gameplayStart()`). |
| `void LogLevelEnd(string level, int score, bool success, float durationSeconds = -1f)` | Level end. Negative duration = omitted. |
| `void LogScore(int score, string level = "")` | |
| `void LogTutorialStart()` | |
| `void LogTutorialEnd()` | |
| `void LogPurchase(string productId, float price, string currency)` | |

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.analytics_log_level_start(level)` | |
| `yes2sdk.analytics_log_level_end(level, score, success, duration_seconds)` | `duration_seconds` optional (nil/negative → omitted). |
| `yes2sdk.analytics_log_score(score, level)` | |
| `yes2sdk.analytics_log_tutorial_start()` | |
| `yes2sdk.analytics_log_tutorial_end()` | |
| `yes2sdk.analytics_log_game_choice(decision, choice)` | Logs a `game_choice` custom event `{decision, choice}`. |
