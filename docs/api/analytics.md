# Analytics: `Yes2SDK.analytics`

[← Back to overview](overview.md)

Track gameplay events. All methods are synchronous, fire-and-forget.

> **Good to know:** Custom events (`logEvent`, `logScore`, `logTutorial`, `logPurchase`) are recorded locally on every platform. Bring your own analytics pipeline if you need delivery. **Exception (Yandex):** when a Metrica counter ID is configured for the game (dashboard game settings), these events are additionally delivered to **Yandex Metrica** as `reachGoal` calls (see the [Yandex quickstart](../quickstart-yandex.md)). The **gameplay lifecycle** is wired to each platform's real engagement signals: `logLevelStart`/`logLevelEnd` drive `gameplayStart`/`gameplayStop`, which platforms use for monetization timing.

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
| `isSupported(): boolean` | Whether analytics is supported (true, covers gameplay tracking). |

`AnalyticsParameters = Record<string, string | number | boolean>`

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `logEvent` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ |
| `logLevelStart` | Partial² | Partial³ | Partial² | Partial²˒⁵ | None⁴ |
| `logLevelEnd` | Partial² | Partial³ | Partial² | Partial²˒⁵ | None⁴ |
| `logScore` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ |
| `logTutorial` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ |
| `logPurchase` | None¹ | None¹ | None¹ | Metrica⁵ | None¹ |
| `isSupported` | Ready | Ready | Ready | Ready | Ready |

¹ Logged locally (`logger.debug`) only: no platform delivery.
² Logs locally **and** calls the real `gameplayStart`/`gameplayStop` (`PokiSDK`, CrazyGames `sdk.game`, Yandex `GameplayAPI`).
³ GameDistribution drives internal gameplay state only (no platform gameplay call).
⁴ YouTube sets an internal gameplay flag only. Note: the YouTube strategy additionally exposes real **`reportError`/`reportWarning`** backed by `ytgame.health.logError`/`logWarning` (not part of the cross-platform analytics surface).
⁵ **Yandex only, when a Metrica counter ID is configured** for the game: the call also fires `ym('reachGoal', …)`. Goal name is the `eventName` for `logEvent`; `score` / `tutorial` / `purchase` / `level_start` / `level_end` for the typed methods. Without a counter configured it degrades to local logging (¹). Metrica is separate from the YaGames SDK. The dashboard injects the counter tag into Yandex builds. See the [Yandex quickstart](../quickstart-yandex.md).

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
