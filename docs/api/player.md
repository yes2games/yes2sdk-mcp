# Player — `Yes2SDK.player`

[← Back to overview](overview.md)

Player identity, cloud-backed player data, and connected players (friends who also play). Optional — guard with the support checks.

> **`player` or `data` — which do I use?** For everyday saved state (settings, progress, high scores), the [`data`](data.md) module is simpler — synchronous and typed. Use **`player`** when you need what's unique to a signed-in account: identity (`getPlayer`), connected players, server-verifiable signed info, or storing a structured object as a single cloud-synced record. On CrazyGames, Yandex, and YouTube `player` saved-data and `data` share the same underlying store, so keep any given key in **one** module — don't write the same key through both.

> Two distinct capabilities that differ by platform: **identity** (who the player is) and **cloud data** (per-player save data). Some platforms have one but not the other. Where there is no identity, `getPlayer()` returns an anonymous player (`id: "anonymous"`).

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getPlayer(): Promise<Player>` | Current player info. |
| `getConnectedPlayers(): Promise<ConnectedPlayer[]>` | Friends who also play this game. |
| `getDataAsync(keys: string[] \| string): Promise<PlayerData>` | Load player data for keys. Accepts a JSON-string of keys (Unity bridge). |
| `setDataAsync(data: PlayerData \| string): Promise<void>` | Save player data. Accepts a JSON string (Unity bridge). |
| `flushDataAsync(): Promise<void>` | Flush pending writes. |
| `getSignedPlayerInfoAsync(payload?: string): Promise<SignedPlayerInfo>` | Signed player info for server-side verification. |
| `isDataSupported(): boolean` | Whether save/load works. |
| `isConnectedPlayersSupported(): boolean` | Whether connected players is supported. |

**Types:** `Player = { id: string; name: string | null; photo: string | null }`; `ConnectedPlayer` same shape; `SignedPlayerInfo = { playerId: string; signature: string }`; `PlayerData = Record<string, unknown>`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getPlayer` | —¹ | —¹ | Ready | Ready | —¹ |
| `getConnectedPlayers` | — | — | — | — | — |
| `getDataAsync` | Partial⁴ | Partial⁴ | Ready | Ready | Ready |
| `setDataAsync` | Partial⁴ | Partial⁴ | Ready | Ready | Ready |
| `flushDataAsync` | Partial⁴ | Partial⁴ | —² | Partial² | —² |
| `getSignedPlayerInfoAsync` | — | — | — | Ready³ | — |
| `isDataSupported` | Ready⁴ | Ready⁴ | Ready | Ready | Ready |
| `isConnectedPlayersSupported` | — | — | — | — | — |

¹ Returns a hardcoded anonymous player (`{ id: "anonymous", name: null, photo: null }`).
² Auto-flush platforms — `flushDataAsync` is a no-op (CrazyGames, YouTube) or relies on `setData(flush=true)` (Yandex).
³ Yandex `getPlayer({ signed: true })` returns the player id + signature.
⁴ Poki & GameDistribution have no platform storage API, so the **Core API transparently falls back to namespaced `localStorage`**: `getDataAsync`/`setDataAsync` persist locally (device-local, not cloud/cross-device), `flushDataAsync` is a no-op success, and `isDataSupported()` returns `true`. The platform *strategy* reports no support — the fallback lives in `PlayerAPI`. (Note: the Unity SDK does **not** apply this fallback — its `IsDataSupported()` is true only on CrazyGames, see below.)

**Connected players** isn't offered by the live platforms yet. **Player identity** (`getPlayer`) is anonymous on Poki and GameDistribution, though player saved-data still persists locally there.

---

## Unity (C#)

`Yes2SDK.Player`. Each async method has a callback form and a `Task` form.

| Signature | Description |
|-----------|-------------|
| `void GetPlayerAsync(Action<PlayerInfo> onSuccess = null, Action<Error> onError = null)` / `Task<PlayerInfo> GetPlayerAsync(CancellationToken)` | Player info (Poki → anonymous). |
| `void GetDataAsync(string[] keys, …)` / `Task<string> GetDataAsync(string[] keys, CancellationToken)` | CrazyGames/Yandex/YouTube only. |
| `void SetDataAsync(string dataJson, …)` / `Task SetDataAsync(string dataJson, CancellationToken)` | |
| `void FlushDataAsync(…)` / `Task FlushDataAsync(CancellationToken)` | |
| `void GetConnectedPlayersAsync(…)` / `Task<string> GetConnectedPlayersAsync(CancellationToken)` | FeatureNotSupported on all platforms. |
| `void GetSignedPlayerInfoAsync(string payload, …)` / `Task<string> …` | |
| `bool IsDataSupported()` | True only where cloud data exists. |
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

> Connected players and signed player info are not exposed in the Defold SDK.
