# Data: `Yes2SDK.data`

[← Back to overview](overview.md)

PlayerPrefs-style typed key-value storage. Works before init via a `yes2sdk_`-prefixed `localStorage` fallback; on strategy binding any pre-init keys are migrated into the platform store.

> **`data` or `player`: which do I use?** Use **`data`** for almost all saved state: settings, preferences, high scores, and game progress. It's synchronous, typed (`int` / `float` / `string`), and works on every platform: cloud-synced where the platform offers it, local otherwise. Reach for the [`player`](player.md) module only when you need account-tied features: the player's identity, connected players, or server-verifiable signed save data. On CrazyGames, Yandex, and YouTube the two modules share the same underlying store, so keep any given key in **one** module. Don't write the same key through both.

> **Persistence varies by platform.** On Yandex and YouTube this is **cloud-backed** (synced to the player's account). On Poki and GameDistribution there is no storage API, so Data is emulated with **`localStorage`**: device-local, can be cleared by the browser, not synced across devices. CrazyGames uses its native data module.

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

---

## Platform support

The Data module is functional on every platform. The distinction is **storage backing**.

| Capability | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|------------|:----:|:----------------:|:----------:|:------:|:-------:|
| Read/write (`getInt`/`setInt`/…) | Partial | Partial | Ready | Ready | Ready |
| Backing store | localStorage | localStorage | CrazyGames native | Cloud (`player.getData/setData`) | Cloud (`ytgame.game.load/saveData`) |
| Cross-device sync | No | No | Yes | Yes | Yes |

On the cloud platforms (Yandex, YouTube), synchronous setters are **write-behind**: they update an in-memory cache immediately and flush to the cloud on a debounce and on platform pause. The async setters (`set*Async`) await the cloud write and return success.

---

## Unity (C#)

`Yes2SDK.Data`. Editor uses Unity `PlayerPrefs`; CrazyGames uses cloud storage; Poki uses `localStorage`.

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

---

## Defold (Lua)

Local key-value storage.

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
