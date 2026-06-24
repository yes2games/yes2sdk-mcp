# Session — `Yes2SDK.session`

[← Back to overview](overview.md)

Information about the current play session: device, locale, country, entry point, traffic source.

> Treat session info as a **hint**, not a guarantee. Don't branch core game logic on it. Several values are derived from the browser (orientation, device) rather than a platform API, and some have no source on a given platform.

---

## Methods (Core)

| Signature | Returns | Description |
|-----------|---------|-------------|
| `getCountry()` | `string` | ISO 3166-1 alpha-2 country code (e.g. `"US"`); empty if unavailable. |
| `getLocale()` | `string` | Locale (e.g. `"en_US"`). |
| `getOrientation()` | `DeviceOrientation` | `"portrait"` or `"landscape"`. |
| `getDevice()` | `DeviceType` | `"desktop" \| "mobile" \| "tablet" \| "tv" \| "unknown"`. |
| `getDeviceInfo()` | `DeviceInfo` | **Synchronous.** Resolved `DeviceType` plus boolean form-factor flags (`isMobile` / `isDesktop` / `isTablet` / `isTV`). |
| `getEntryPointAsync()` | `Promise<string>` | How the game was launched. |
| `getEntryPointData()` | `EntryPointData` | Launch data (e.g. share-link params). Empty object if none. |
| `setSessionData(data)` | `void` | Set session data. |
| `getTrafficSource()` | `TrafficSource` | Referrer + UTM params. |
| `getTrafficSourceJson()` | `string` | `JSON.stringify(getTrafficSource())` (Unity bridge). |
| `getEntryPointDataJson()` | `string` | `JSON.stringify(getEntryPointData())` (Unity bridge). |
| `getPlatform()` | `string` | Platform identifier string. |
| `getSDKVersion()` | `string` | SDK version string. |
| `isAudioEnabled()` | `boolean` | Whether platform audio is enabled. `true` where no native signal. Pair with the `audioEnabledChange` event. |

**Types:** `DeviceOrientation = "portrait" | "landscape"`; `DeviceType = "desktop" | "mobile" | "tablet" | "tv" | "unknown"`; `DeviceInfo = { type: DeviceType; isMobile: boolean; isDesktop: boolean; isTablet: boolean; isTV: boolean }` (at most one flag is `true`; all `false` when `type` is `"unknown"`); `EntryPointData = Record<string, unknown>`; `TrafficSource = { referrer, utmCampaign, utmSource, utmMedium }` (each `string | null`).

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getCountry` | — | — | Ready | Ready | — |
| `getLocale` | Partial¹ | Partial¹ | Partial¹ | Ready | Ready² |
| `getOrientation` | Partial³ | Partial³ | Partial³ | Partial³ | Partial³ |
| `getDevice` | Partial³ | Partial³ | Ready | Partial³ | Partial³ |
| `getDeviceInfo` | Partial³ | Partial³ | Ready⁷ | Ready⁸ | Partial³ |
| `getEntryPointAsync` | Ready | Partial | Ready | — | — |
| `getEntryPointData` | Partial | Partial | Ready | Ready | — |
| `getTrafficSource` | Ready | Partial | Ready | Partial⁴ | Partial⁴ |
| `getPlatform` | Ready | Ready | Ready | Ready | Ready |
| `getSDKVersion` | —⁵ | —⁵ | —⁵ | —⁵ | —⁵ |
| `isAudioEnabled` | —⁶ | —⁶ | —⁶ | —⁶ | Ready² |

¹ Locale is derived, not from a dedicated locale API: Poki prefers `PokiSDK.getLanguage()`; CrazyGames uses the system **country code** (`getSystemInfo().countryCode`), not a language; GameDistribution uses the browser. All fall back to `navigator.language`.
² From `ytgame.system.getLanguage()` / `ytgame.system.isAudioEnabled()`.
³ Derived from `window.innerWidth/Height` or user-agent sniffing — not a platform API.
⁴ Only `document.referrer`; UTM fields are `null`.
⁵ Returns a hardcoded version string.
⁶ Returns `true` (no native audio signal). On YouTube this is a real call — important for certification.
⁷ CrazyGames maps to `getSystemInfo().device.type` (desktop/mobile/tablet; no TV class), falling back to user-agent detection.
⁸ Yandex maps to the native `ysdk.deviceInfo` form-factor flags (more accurate than UA parsing).

---

## Unity (C#)

`Yes2SDK.Session`.

| Signature | Description |
|-----------|-------------|
| `string GetLocale()` | |
| `string GetCountry()` | |
| `string GetDevice()` | |
| `string GetOrientation()` | |
| `string GetTrafficSource()` | JSON string. |
| `string GetEntryPointData()` | URL params as JSON. |
| `void SetSessionData(string dataJson)` | In-memory, not persisted. |
| `void GetEntryPointAsync(Action<string> onSuccess = null, Action<Error> onError = null)` | |
| `bool IsAudioEnabled()` | |

---

## Defold (Lua)

The Defold `session_*` namespace also hosts the gameplay-lifecycle signals (they route to the Core `game` module's `gameplayStart`/`gameplayStop`).

| Signature | Description |
|-----------|-------------|
| `yes2sdk.session_gameplay_start()` | Mark active gameplay start (monetization timing). |
| `yes2sdk.session_gameplay_stop()` | Mark active gameplay stop. Wrap ad calls between stop/start. |
| `yes2sdk.session_get_locale()` | Locale string (default `"en"`). |
| `yes2sdk.session_is_audio_enabled()` | Platform audio state (boolean; `true` where no native signal). |
