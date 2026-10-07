# Player: `Yes2SDK.player`

[← Back to overview](overview.md)

Player identity, cloud-backed player data, and connected players (friends who also play). Optional. Guard with the support checks.

> **`player` or `data`: which do I use?** For everyday saved state (settings, progress, high scores), the [`data`](data.md) module is simpler: synchronous and typed. Use **`player`** when you need what's unique to a signed-in account: identity (`getPlayer`), connected players, server-verifiable signed info, or storing a structured object as a single cloud-synced record. On CrazyGames, Yandex, YouTube, and Jest `player` saved-data and `data` share the same underlying store, so keep any given key in **one** module. Don't write the same key through both.

> Two distinct capabilities that differ by platform: **identity** (who the player is) and **cloud data** (per-player save data). Some platforms have one but not the other. Where there is no identity, `getPlayer()` returns an anonymous player (`id: "anonymous"`).

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getPlayer(): Promise<Player>` | Current player info. |
| `getUniqueId(): Promise<string>` | The player's permanent unique id. Resolves with `"anonymous"` where the player can't be identified. |
| `getIDsPerGame(): Promise<GameIdentity[]>` | The player's identity across the developer's other games on the platform. Empty array where unsupported. |
| `getPayingStatus(): Promise<PayingStatus>` | The player's monetization status. `"unknown"` where unsupported. |
| `getMode(): Promise<PlayerMode>` | The player's session mode (`"lite"` anonymous, `"authorized"` logged-in). `"unknown"` where undeterminable. |
| `getPhoto(size?: PlayerPhotoSize): Promise<string \| null>` | Profile photo URL at the requested size (default `"medium"`); `null` if none. |
| `getConnectedPlayers(): Promise<ConnectedPlayer[]>` | Friends who also play this game. |
| `getDataAsync(keys: string[] \| string): Promise<PlayerData>` | Load player data for keys. Accepts a JSON-string of keys (Unity bridge). |
| `setDataAsync(data: PlayerData \| string): Promise<void>` | Save player data. Accepts a JSON string (Unity bridge). |
| `flushDataAsync(): Promise<void>` | Flush pending writes. |
| `getSignedPlayerInfoAsync(payload?: string): Promise<SignedPlayerInfo>` | Signed player info for server-side verification. |
| `isDataSupported(): boolean` | Whether save/load works. |
| `isConnectedPlayersSupported(): boolean` | Whether connected players is supported. |

**Types:** `Player = { id: string; name: string | null; photo: string | null }`; `ConnectedPlayer` same shape; `SignedPlayerInfo = { playerId: string; signature: string }`; `PlayerData = Record<string, unknown>`; `PayingStatus = "paying" | "partially_paying" | "not_paying" | "unknown"`; `PlayerMode = "lite" | "authorized" | "unknown"`; `PlayerPhotoSize = "small" | "medium" | "large"`; `GameIdentity = { appId: number; userId: string }`.

> **Identity extras (`getUniqueId`, `getIDsPerGame`, `getPayingStatus`, `getMode`, `getPhoto`)** are richest on **Yandex**. On **CrazyGames** and **Jest** the ones backed by a real player identity (`getUniqueId`, `getMode`, `getPhoto`) return live values. On platforms that can't identify the player they return safe defaults: `"anonymous"`, `[]`, `"unknown"`, `"unknown"`, and `null` respectively, so they're always safe to call.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| `getPlayer` | None¹ | None¹ | Ready | Ready | None¹ | Ready⁸ |
| `getUniqueId` | None⁵ | None⁵ | Partial⁷ | Ready | None⁵ | Ready⁸ |
| `getIDsPerGame` | None⁶ | None⁶ | None⁶ | Ready | None⁶ | None⁶ |
| `getPayingStatus` | None⁵ | None⁵ | None⁵ | Ready | None⁵ | None⁵ |
| `getMode` | None⁵ | None⁵ | Partial⁷ | Ready | None⁵ | Ready⁸ |
| `getPhoto` | None⁵ | None⁵ | Partial⁷ | Ready | None⁵ | Ready⁸ |
| `getConnectedPlayers` | None | None | None | None | None | None |
| `getDataAsync` | Partial⁴ | Partial⁴ | Ready | Ready | Ready | Ready⁹ |
| `setDataAsync` | Partial⁴ | Partial⁴ | Ready | Ready | Ready | Ready⁹ |
| `flushDataAsync` | Partial⁴ | Partial⁴ | None² | Partial² | None² | Ready⁹ |
| `getSignedPlayerInfoAsync` | None | None | None | Ready³ | None | Ready¹⁰ |
| `isDataSupported` | Ready⁴ | Ready⁴ | Ready | Ready | Ready | Ready |
| `isConnectedPlayersSupported` | None | None | None | None | None | None |

¹ Returns a hardcoded anonymous player (`{ id: "anonymous", name: null, photo: null }`).
² Auto-flush platforms: `flushDataAsync` is a no-op (CrazyGames, YouTube) or relies on `setData(flush=true)` (Yandex).
³ Yandex `getPlayer({ signed: true })` returns the player id + signature.
⁴ Poki & GameDistribution have no platform storage API, so the **Core API transparently falls back to namespaced `localStorage`**: `getDataAsync`/`setDataAsync` persist locally (device-local, not cloud/cross-device), `flushDataAsync` is a no-op success, and `isDataSupported()` returns `true`. The platform itself has no storage; the SDK provides the fallback. The Unity and Defold SDKs call the same player module in the runtime, so they get the same fallback.
⁵ Yandex-only identity extras. Off-platform they resolve to a safe default (`"anonymous"` / `"unknown"` / `null`). Always safe to call.
⁶ Cross-game identity is Yandex-only; elsewhere it resolves to an empty array.
⁷ CrazyGames has its own player identity, so `getUniqueId`/`getPhoto` reuse `getPlayer()`'s real id/photo (no photo size variants), and `getMode` reflects logged-in (`"authorized"`) vs anonymous (`"lite"`). `getPayingStatus` is still `"unknown"` and `getIDsPerGame` is empty there.
⁸ Jest reads the live Jest player on every call. `getPlayer()` returns `{ id: playerId, name: username, photo: avatarUrl }`; for a guest, `name` and `photo` are `null`. `getMode()` is `"authorized"` for a registered player and `"lite"` for a guest. `getPhoto` asks Jest for a 64, 256 or 1000 pixel avatar (`small`, `medium`, `large`) and returns `null` when there is none.
⁹ Jest stores player data in the Jest player store, which persists across sessions and devices. The `data` module uses the same store, so the two share one budget of 1 MB per game per player. `setDataAsync` merges the keys you pass into the store. It does not check the size first, and a write past the limit fails on Jest's side, possibly without an error. Keep player data well under 1 MB, or use `data.setStringAsync`, which checks the limit and resolves `false`. `flushDataAsync` waits until Jest acknowledges the pending writes. Yes2SDK also flushes on pause and right after the `exitRequested` event.
¹⁰ Jest returns `{ playerId, signature }`, where `signature` is Jest's signed player payload (an HS256 JWS signed with your game's shared secret). It works for guests too. The `payload` argument is ignored on Jest. See [Signed player info on Jest](#signed-player-info-on-jest).

**Connected players** isn't offered by the live platforms yet. **Player identity** (`getPlayer`) is anonymous on Poki and GameDistribution, though player saved-data still persists locally there.

### Signed player info on Jest

`getSignedPlayerInfoAsync()` gives you a value your server can trust. Send `signature` to your server and verify it there before you key anything on `playerId`. The client values alone prove nothing. The [Jest guide](/docs/jest#server-verification) shows which value to send and how the Yes2Games dashboard can check it for you.

```typescript
const { playerId, signature } = await Yes2SDK.player.getSignedPlayerInfoAsync();
// Send signature (and playerId) to your server. Trust playerId only after the server verifies it.
```

Jest player data is limited to 1 MB per game per player, shared with the `data` module. Writes past the limit fail until the stored data gets smaller, so keep saves compact.

---

## Unity (C#)

`Yes2SDK.Yes2SDK.Player`. Each async method has a callback form and a `Task` form.

| Signature | Description |
|-----------|-------------|
| `void GetPlayerAsync(Action<PlayerInfo> onSuccess = null, Action<Error> onError = null)` / `Task<PlayerInfo> GetPlayerAsync(CancellationToken)` | Player info (Poki → anonymous). |
| `void GetDataAsync(string[] keys, …)` / `Task<string> GetDataAsync(string[] keys, CancellationToken)` | Cloud-backed on CrazyGames, Yandex, YouTube and Jest; local storage elsewhere (see the table above). |
| `void SetDataAsync(string dataJson, …)` / `Task SetDataAsync(string dataJson, CancellationToken)` | On Jest, counts toward the 1 MB player store. |
| `void FlushDataAsync(…)` / `Task FlushDataAsync(CancellationToken)` | On Jest, completes once Jest acknowledges the pending writes. |
| `void GetConnectedPlayersAsync(…)` / `Task<string> GetConnectedPlayersAsync(CancellationToken)` | FeatureNotSupported on all platforms. |
| `void GetSignedPlayerInfoAsync(string payload, Action<string> onSuccess = null, Action<Error> onError = null)` / `Task<string> GetSignedPlayerInfoAsync(string payload, CancellationToken)` | `onSuccess` receives a JSON object with `playerId` and `signature`. `payload` is reserved and not included in the signed result. Verify `signature` on your server. FeatureNotSupported where the platform has no signed player info. |
| `bool IsDataSupported()` | Reads the runtime's `isDataSupported()`: true whenever save and load work, including on Jest. |
| `bool IsConnectedPlayersSupported()` | False on all platforms. |

`PlayerInfo` (struct): `Id`, `Name`, `Photo`.

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.player_get_name()` | Display name (default `"Player"`). |
| `yes2sdk.player_get_id()` | Player id (default `""`). |
| `yes2sdk.player_get_data(keys_json, callback)` | `keys_json` = JSON array string. `callback(self, success, data_json)`. |
| `yes2sdk.player_set_data(data_json, callback)` | `data_json` = JSON object string. `callback(self, success, err)`. |
| `yes2sdk.player_flush_data(callback)` | Writes pending `player_set_data` values to the platform. `callback(self, success, err)`: `err` nil on success. Reports `FEATURE_NOT_SUPPORTED` where `player_is_data_supported()` is false. |
| `yes2sdk.player_is_data_supported()` | Boolean. True whenever the SDK is initialized (local storage backs platforms without cloud save). |
| `yes2sdk.player_get_unique_id(callback)` | `callback(self, success, id)`: `"anonymous"` where the player can't be identified. |
| `yes2sdk.player_get_ids_per_game(callback)` | `callback(self, success, ids_json)`: JSON array string, empty where unsupported. |
| `yes2sdk.player_get_paying_status(callback)` | `callback(self, success, status)`: `"unknown"` where unsupported. |
| `yes2sdk.player_get_mode(callback)` | `callback(self, success, mode)`: `"lite"`, `"authorized"`, or `"unknown"`. |
| `yes2sdk.player_get_photo(size, callback)` | `size` = `"small"`/`"medium"`/`"large"`. `callback(self, success, photo_json)`: JSON string URL or `"null"`. |
| `yes2sdk.player_get_signed_info(payload, callback)` | `payload` optional (pass `nil` to skip; Jest ignores it). `callback(self, success, signed_json)`: `{"playerId","signature"}`. Verify server-side. |

> Connected players are not exposed in the Defold SDK.

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

yes2sdk.player_get_signed_info(nil, function(self, success, result)
    if success then
        local signed = json.decode(result)
        -- Send signed.signature to your server and verify it there.
    else
        print(yes2sdk.parse_error(result).code)
    end
end)
```
