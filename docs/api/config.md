# Config — `Yes2SDK.config`

[← Back to overview](overview.md)

Remote configuration / feature flags: a flat `string → string` map you can read at runtime to toggle features, run experiments, or tune balancing without shipping a new build.

> **Safe everywhere.** Pass your in-game `defaults` to `getFlagsAsync`. On **Yandex** the remote values are merged over your defaults. On platforms **without** a remote-config service the call returns your provided defaults as-is — so it's always safe to call, and `isSupported()` reports whether remote overrides are actually available.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getFlagsAsync(options?: GetFlagsOptions): Promise<ConfigFlags>` | Resolve feature flags. Returns the provided `defaults` on platforms without remote config. |
| `isSupported(): boolean` | Whether a remote-config service is available (overrides your defaults). |

**Types:** `ConfigFlags = Record<string, string>`; `GetFlagsOptions = { defaults?: Record<string, string>; clientFeatures?: Array<{ name: string; value: string }> }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getFlagsAsync` | Partial¹ | Partial¹ | Partial¹ | Ready | Partial¹ |
| `isSupported` | —² | —² | —² | Ready | —² |

¹ No remote-config service — `getFlagsAsync` returns the `defaults` you pass, unchanged. Your code still works; it just never sees a remote override.
² The strategy's `isSupported()` returns `false` (only Yandex has remote config). Treat `getFlagsAsync` as always available; treat `isSupported()` as "are remote overrides possible here?".

---

## Usage

```typescript
const flags = await Yes2SDK.config.getFlagsAsync({
    defaults: { newShop: "false", dailyReward: "100" },
});

if (flags.newShop === "true") {
    showNewShop();
}
const reward = Number(flags.dailyReward);
```

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.config_get_flags(options_json, callback)` | `options_json` = JSON object string carrying your `defaults`. `callback(self, success, flags_json)` — JSON map; your defaults unchanged where remote config is unavailable. |
| `yes2sdk.config_is_supported()` | Returns `true` where remote overrides are available (Yandex today). |
