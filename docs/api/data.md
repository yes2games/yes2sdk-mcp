# Data: `Yes2SDK.data`

[← Back to overview](overview.md)

PlayerPrefs-style typed key-value storage. Works before init via a `yes2sdk_`-prefixed `localStorage` fallback; on strategy binding any pre-init keys are migrated into the platform store.

> **`data` or `player`: which do I use?** Use **`data`** for almost all saved state: settings, preferences, high scores, and game progress. It's synchronous, typed (`int` / `float` / `string`), and works on every platform: cloud-synced where the platform offers it, local otherwise. Reach for the [`player`](player.md) module only when you need account-tied features: the player's identity, connected players, or server-verifiable signed save data. On CrazyGames, Yandex, YouTube, and Jest the two modules share the same underlying store, so keep any given key in **one** module. Don't write the same key through both.

> **Persistence varies by platform.** On Yandex and YouTube this is **cloud-backed** (synced to the player's account). On Poki and GameDistribution there is no storage API, so Data is emulated with **`localStorage`**: device-local, can be cleared by the browser, not synced across devices. CrazyGames uses its native data module. On **Jest** it is the Jest player store, which persists across sessions and devices and holds at most 1 MB per game per player.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getInt(key, defaultValue?)` | Get an int (default `0`). `key` non-empty. |
| `setInt(key, value)` | Set an int. `value` must be a valid integer. |
| `getFloat(key, defaultValue?)` | Get a float (default `0`). |
| `setFloat(key, value)` | Set a float. |
| `getString(key, defaultValue?)` | Get a string (default `""`). |
| `setString(key, value)` | Set a string. |
| `hasKey(key)` | Whether a key exists. |
| `deleteKey(key)` | Delete a single key. |
| `deleteAll()` | Delete all SDK keys. |
| `setStringAsync(key, value): Promise<boolean>` | Set + await confirmation. `true` on confirmed write, `false` on failure (e.g. quota). |
| `setIntAsync(key, value): Promise<boolean>` | Async confirmed int write. |
| `setFloatAsync(key, value): Promise<boolean>` | Async confirmed float write. |
| `flushAsync(): Promise<boolean>` | Write any batched values to the platform and await confirmation. Resolves `true` at once where there is nothing to flush. |

---

## Platform support

The Data module is functional on every platform. The distinction is **storage backing**.

| Capability | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|------------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| Read/write (`getInt`/`setInt`/…) | Partial | Partial | Ready | Ready | Ready | Ready |
| Backing store | localStorage | localStorage | CrazyGames native | Cloud (`player.getData/setData`) | Cloud (`ytgame.game.load/saveData`) | Cloud (Jest player store) |
| Cross-device sync | No | No | Yes | Yes | Yes | Yes |

On the cloud platforms (Yandex, YouTube), synchronous setters are **write-behind**: they update an in-memory cache immediately and flush to the cloud on a debounce and on platform pause. The async setters (`set*Async`) await the cloud write and return success.

### Jest storage

- **1 MB per game per player.** The `data` and [`player`](player.md) modules share this budget. Yes2SDK measures the store before each write: a write that would pass the limit is skipped. `set*Async` resolves `false`, and the synchronous setters log a warning and skip the write. Writes keep failing until the stored data gets smaller.
- **Tied to the player.** Jest keeps the store with the player record, keyed to the Jest player id, which guests also have.
- **Values are strings.** A value another engine stored as a non-string comes back as its JSON text.
- **Flushes.** Jest batches writes. `set*Async` and `flushAsync` resolve once Jest acknowledges them. Yes2SDK also flushes when the game is hidden (`pause`) and right after the `exitRequested` event, so a synchronous save in the `exitRequested` handler is covered. See the [Jest guide](/docs/jest).

---

## Unity (C#)

`Yes2SDK.Yes2SDK.Data`. Editor uses Unity `PlayerPrefs`; on WebGL it uses the platform store from the table above (CrazyGames cloud storage, Poki `localStorage`, the Jest player store on Jest).

| Signature | Description |
|-----------|-------------|
| `int GetInt(string key, int defaultValue = 0)` | |
| `void SetInt(string key, int value)` | |
| `float GetFloat(string key, float defaultValue = 0f)` | |
| `void SetFloat(string key, float value)` | |
| `string GetString(string key, string defaultValue = "")` | |
| `void SetString(string key, string value)` | |
| `bool HasKey(string key)` | |
| `void DeleteKey(string key)` | |
| `void DeleteAll()` | |
| `void SetStringAsync(string key, string value, Action<bool> onSuccess = null, Action<Error> onError = null)` / `Task<bool> SetStringAsync(string key, string value, CancellationToken)` | Set a string and await platform confirmation. `true` on a confirmed write. On Jest, `false` when the write would pass the 1 MB limit. |
| `void FlushAsync(Action<bool> onSuccess = null, Action<Error> onError = null)` / `Task<bool> FlushAsync(CancellationToken)` | Write batched values to the platform and await confirmation. Call it at a checkpoint or before the game may close. |

---

## Defold (Lua)

Key-value storage backed by the same store as the Core `data` module (see the table above). Requires `local yes2sdk = require "yes2sdk.yes2sdk"`.

| Signature | Description |
|-----------|-------------|
| `yes2sdk.data_get_int(key, default)` | |
| `yes2sdk.data_set_int(key, value)` | |
| `yes2sdk.data_get_float(key, default)` | |
| `yes2sdk.data_set_float(key, value)` | |
| `yes2sdk.data_get_string(key, default)` | |
| `yes2sdk.data_set_string(key, value)` | |
| `yes2sdk.data_has_key(key)` | |
| `yes2sdk.data_delete_key(key)` | |
| `yes2sdk.data_delete_all()` | |
| `yes2sdk.data_set_string_async(key, value, callback)` | Set a string and learn whether the platform confirmed it. `callback(self, success, err)`: `success` is `false` when the platform did not confirm; `err` is nil on success, an error JSON string on failure (read it with `yes2sdk.parse_error(err)`). |
| `yes2sdk.data_flush(callback)` | Write pending data to the platform. Same callback as `data_set_string_async`. |

`data_set_string` is fire and forget. Use `data_set_string_async` or `data_flush` before something that may end the session, such as a login prompt.
