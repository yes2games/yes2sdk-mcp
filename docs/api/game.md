# Game: `Yes2SDK.game`

[← Back to overview](overview.md)

Gameplay lifecycle signals, invite links, platform settings, and clipboard. The gameplay signals are the most important part: platforms use them to time ads and measure engagement.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `gameplayStart(): void` | Active gameplay started (not menus/loading). |
| `gameplayStop(): void` | Active gameplay stopped (death, pause, menu, before an ad). |
| `happyTime(): void` | Signal a positive moment (high score, level complete). |
| `inviteLink(paramsJson: string): Promise<string>` | Generate an invite URL embedding params. `paramsJson` = JSON string of `Record<string,string>`. Returns the URL. |
| `getInviteParam(key: string): string` | Read a param from the launching invite link. Empty string if absent. |
| `showInviteButton(paramsJson: string): void` | Show a platform invite button. |
| `hideInviteButton(): void` | Hide the platform invite button. |
| `getSettings(): string` | Platform game settings as a JSON string. |
| `copyToClipboard(text: string): void` | Copy text to clipboard. |
| `getServerTimeAsync(): Promise<number>` | Current server time as Unix epoch milliseconds. Falls back to the local `Date.now()` clock where there's no server-time API. |

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| `gameplayStart` | Ready | Partial¹ | Ready | Ready | Partial² | Partial¹⁰ |
| `gameplayStop` | Ready | Partial¹ | Ready | Ready | Partial² | Partial¹⁰ |
| `happyTime` | None | None | Ready | None | None | None |
| `inviteLink` | Ready³ | None | Ready | None | None | None¹¹ |
| `getInviteParam` | Ready⁴ | None | Ready | None | None | None¹¹ |
| `showInviteButton` | None | None | Ready | None | None | None¹² |
| `hideInviteButton` | None | None | Ready | None | None | None |
| `getSettings` | None⁵ | None⁵ | Ready⁶ | None⁵ | Ready⁷ | None⁵ |
| `copyToClipboard` | Partial⁸ | Partial⁸ | Partial⁸ | Partial⁸ | Partial⁸ | Partial⁸ |
| `getServerTimeAsync` | Partial⁹ | Partial⁹ | Partial⁹ | Ready | Partial⁹ | Partial⁹ |

¹ Internal state only: GameDistribution has no platform gameplay call.
² YouTube sets an internal flag; the real lifecycle uses `firstFrameReady`/`gameReady` (driven by the SDK's `startGame`).
³ `PokiSDK.shareableURL`.  ⁴ `PokiSDK.getURLParam`.  ⁵ Returns `"{}"`.  ⁶ Reads CrazyGames `disableChat`/`muteAudio`.  ⁷ Reads `system.getLanguage()` + `isAudioEnabled()`.  ⁸ Uses the browser `navigator.clipboard` (and CrazyGames' `copyToClipboard` where present), not a dedicated platform API.  ⁹ No server-time API: returns the local (unsynced) device clock via `Date.now()`. Yandex returns tamper-proof `ysdk.serverTime()`.
¹⁰ Jest has no gameplay start or stop signal. The calls are safe and update Yes2SDK's own gameplay state only. On Jest, loading ends with `startGameAsync()`, which tells Jest the game is loaded (see [lifecycle](lifecycle.md) and the [Jest guide](/docs/jest)).
¹¹ Jest has no invite links. `inviteLink` only returns the game page's own URL with your params, which is not a Jest share link. `getInviteParam` only reads the page's own query string, which carries no Jest invite data. Jest launch data comes from `session.getEntryPointData()`, so use [referrals](referrals.md) to invite players.
¹² Throws `FEATURE_NOT_SUPPORTED` on Jest.

---

## Unity (C#)

`Yes2SDK.Yes2SDK.Game`. Settings changes arrive on the static event `Yes2SDKGame.OnSettingsChanged` (`Action<GameSettings>`).

| Signature | Description |
|-----------|-------------|
| `void GameplayStart()` / `void GameplayStop()` | |
| `void HappyTime()` | |
| `void InviteLinkAsync(Dictionary<string,string> parameters, Action<string> onSuccess = null, Action<Error> onError = null)` / `Task<string> …(CancellationToken)` | |
| `string GetInviteParam(string key)` | |
| `void ShowInviteButton(Dictionary<string,string> parameters = null)` / `void HideInviteButton()` | |
| `GameSettings GetSettings()` | |
| `void CopyToClipboard(string text)` | Editor uses `GUIUtility.systemCopyBuffer`. |

`GameSettings` (struct): `DisableChat`, `MuteAudio`.

---

## Defold (Lua)

> Defold routes the gameplay-lifecycle signals through the `session_*` namespace (`session_gameplay_start` / `session_gameplay_stop`; see [session.md](session.md)). The `game_*` namespace covers the rest.

| Signature | Description |
|-----------|-------------|
| `yes2sdk.game_happy_time()` | Positive-moment signal (CrazyGames uses it for ad timing). |
| `yes2sdk.game_get_settings()` | JSON string of settings (`"{}"` if unavailable). |
| `yes2sdk.game_copy_to_clipboard(text)` | |
| `yes2sdk.game_invite_link(params_json, callback)` | `params_json` = JSON object. `callback(self, success, url_or_err)`. |
