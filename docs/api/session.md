# Session: `Yes2SDK.session`

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

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| `getCountry` | None | None | Ready | Ready | None | None |
| `getLocale` | Partial¹ | Partial¹ | Partial¹ | Ready | Ready² | Partial¹ |
| `getOrientation` | Partial³ | Partial³ | Partial³ | Partial³ | Partial³ | Partial³ |
| `getDevice` | Partial³ | Partial³ | Ready | Partial³ | Partial³ | Partial³ |
| `getDeviceInfo` | Partial³ | Partial³ | Ready⁷ | Ready⁸ | Partial³ | Partial³ |
| `getEntryPointAsync` | Ready | Partial | Ready | None | None | Partial⁹ |
| `getEntryPointData` | Partial | Partial | Ready | Ready | None | Ready¹⁰ |
| `getTrafficSource` | Ready | Partial | Ready | Partial⁴ | Partial⁴ | Partial⁴ |
| `getPlatform` | Ready | Ready | Ready | Ready | Ready | Ready |
| `getSDKVersion` | None⁵ | None⁵ | None⁵ | None⁵ | None⁵ | None⁵ |
| `isAudioEnabled` | None⁶ | None⁶ | None⁶ | None⁶ | Ready² | None⁶ |

¹ Locale is derived, not from a dedicated locale API: Poki prefers `PokiSDK.getLanguage()`; CrazyGames uses the system **country code** (`getSystemInfo().countryCode`), not a language; GameDistribution and Jest use the browser. All fall back to `navigator.language` (Jest falls back to `"en"` when the browser gives none).
² From `ytgame.system.getLanguage()` / `ytgame.system.isAudioEnabled()`.
³ Derived from `window.innerWidth/Height` or user-agent sniffing, not a platform API.
⁴ Only `document.referrer`; UTM fields are `null`.
⁵ Returns a hardcoded version string.
⁶ Returns `true` (no native audio signal). On YouTube this is a real call: important for certification.
⁷ CrazyGames maps to `getSystemInfo().device.type` (desktop/mobile/tablet; no TV class), falling back to user-agent detection.
⁸ Yandex maps to the native `ysdk.deviceInfo` form-factor flags (more accurate than UA parsing).
⁹ Jest: the `source` field of Jest's entry payload when it is a string, otherwise `""`.
¹⁰ Jest: Jest's entry payload, unchanged. It is always an object (empty when nothing was supplied) and the page URL is never read. It carries the `data` you passed to a referral share (`referrals.shareAsync`), a notification (`notifications.scheduleAsync`), the registration prompt (`auth.showRegistrationPrompt`) or an image share (`context.shareAsync`). `getPlatform()` returns `"jest"`. See the [Jest guide](/docs/jest).

---

## Unity (C#)

`Yes2SDK.Session` (`Yes2SDKSession`). From your own code call it as `Yes2SDK.Yes2SDK.Session`: the namespace and the static class share the name `Yes2SDK`.

| Signature | Description |
|-----------|-------------|
| `string GetLocale()` | |
| `string GetCountry()` | |
| `string GetDevice()` | |
| `string GetOrientation()` | |
| `string GetTrafficSource()` | JSON string. |
| `string GetEntryPointData()` | Launch data as a JSON string, `"{}"` when there is none. Includes the data from a referral share or a registration prompt. |
| `Dictionary<string, object> GetEntryPointDataDictionary()` | The same launch data as a dictionary. Nested values come back as `JObject` / `JArray`, numbers as `long` / `double`. Empty when there is no data or it is not an object. |
| `void SetSessionData(string dataJson)` | In-memory, not persisted. |
| `void GetEntryPointAsync(Action<string> onSuccess = null, Action<Error> onError = null)` | |
| `bool IsAudioEnabled()` | |

```csharp
using System.Collections.Generic;
using Yes2SDK;

Dictionary<string, object> entry = Yes2SDK.Yes2SDK.Session.GetEntryPointDataDictionary();
if (entry.TryGetValue("inviter", out var inviter))
    ShowWelcome(inviter as string);
```

---

## Defold (Lua)

The Defold `session_*` namespace also hosts the gameplay-lifecycle signals (they route to the Core `game` module's `gameplayStart`/`gameplayStop`).

| Signature | Description |
|-----------|-------------|
| `yes2sdk.session_gameplay_start()` | Mark active gameplay start (monetization timing). |
| `yes2sdk.session_gameplay_stop()` | Mark active gameplay stop. Wrap ad calls between stop/start. |
| `yes2sdk.session_get_locale()` | Locale string (default `"en"`). |
| `yes2sdk.session_is_audio_enabled()` | Platform audio state (boolean; `true` where no native signal). |
| `yes2sdk.session_get_entry_point_data()` | Launch data as a Lua table, already decoded. `{}` when there is none, on platforms without it, or on bad JSON. Synchronous. Includes the data from a referral share or a registration prompt. |

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

local entry = yes2sdk.session_get_entry_point_data()
if entry.inviter then
    show_welcome(entry.inviter)
end
```
