# Error Model

[← Back to overview](overview.md)

Every async SDK call can fail. Failures are surfaced consistently across the three surfaces.

- **Core (TS):** async methods reject with an `ErrorMessage` **object** (not a JS `Error` subclass). Sync methods suppress `NOT_INITIALIZED` (log a warning, return a default) to avoid killing the engine main loop during early init.
- **Unity (C#):** callback overloads invoke `Action<Error>`; Task overloads **throw `Yes2SDKException`** (carries the `Error` and parsed `ErrorCode`).
- **Defold (Lua):** callbacks receive `(self, success, payload)`, where `payload` is an error JSON string `{"code","message","context"}` when `success` is false. Read it with `yes2sdk.parse_error(err)`.

---

## `ErrorMessage` (Core)

| Field | Type | Description |
|-------|------|-------------|
| `code` | `ErrorCodeType` | The error code (see below). |
| `message` | `string` | Human-readable message. |
| `context` | `string` | API context, typically `"<module>.<method>"`. |
| `url?` | `string` | Documentation URL, if available. |
| `originalError?` | `unknown` | Underlying platform error, if any. |

Type guard: `isErrorMessage(value): value is ErrorMessage`.

```ts
try {
  await Yes2SDK.auth.signInAsync();
} catch (err) {
  if (isErrorMessage(err) && err.code === "FEATURE_NOT_SUPPORTED") {
    // expected on platforms without auth — hide the feature
  } else {
    console.error(err);
  }
}
```

---

## `ErrorCode`

Core uses a const object whose values form `ErrorCodeType`:

| Category | Codes |
|----------|-------|
| Initialization | `INITIALIZATION_ERROR`, `CLIENT_UNSUPPORTED`, `NOT_INITIALIZED` |
| Parameter | `INVALID_PARAM`, `INVALID_OPERATION` |
| Network | `NETWORK_FAILURE`, `TIMEOUT` |
| Platform | `PLATFORM_ERROR`, `PLATFORM_NOT_SUPPORTED`, `FEATURE_NOT_SUPPORTED` |
| Ads | `ADS_NOT_LOADED`, `ADS_NO_FILL`, `ADS_BLOCKED`, `ADS_FREQUENCY_LIMITED` |
| Player | `PLAYER_NOT_AUTHENTICATED`, `PLAYER_DATA_CORRUPTED` |
| Storage | `STORAGE_ERROR`, `STORAGE_QUOTA_EXCEEDED` |
| IAP | `IAP_NOT_AVAILABLE`, `IAP_PURCHASE_FAILED`, `IAP_PURCHASE_CANCELLED`, `IAP_ALREADY_PURCHASED` |
| Leaderboard | `LEADERBOARD_NOT_FOUND` |
| Unknown | `UNKNOWN_ERROR` |

Unity's `ErrorCode` enum is a smaller mapped set: `NotInitialized, InvalidParams, FeatureNotSupported, PlatformError, NetworkError, RateLimited, UserCancelled, Unknown, Timeout` (parsed from `Error.Code`, falling back to `Unknown`). `Error.Code` keeps the original string, so you can still match an exact Core code. Defold has no constants: codes are the Core strings above.

---

## Runtime behavior

- Parameter validation failures throw `INVALID_PARAM`.
- Calling an async method before init / without a wired strategy throws `NOT_INITIALIZED`.
- Unhandled platform-side failures are wrapped as `PLATFORM_ERROR` (`message` from the underlying error; `originalError` set).
- `IAP_PURCHASE_CANCELLED` means the player closed the platform checkout without paying, where the platform reports it (Jest does); on Yandex a closed checkout surfaces as `PLATFORM_ERROR`. Do not retry or show an error; return to the game. Unity reports it as `ErrorCode.UserCancelled`; Defold as the code string `"IAP_PURCHASE_CANCELLED"` from `parse_error`.
- **`FEATURE_NOT_SUPPORTED` is the normal signal that a platform doesn't implement a feature**. Handle it gracefully, don't treat it as a bug.
- `isXSupported()` returns `false` (never throws) when no strategy is wired.

---

## `Yes2SDKException` (Unity)

Thrown by all Task overloads:

```csharp
try {
  var user = await Yes2SDK.Yes2SDK.Auth.SignInAsync(cts.Token);
} catch (Yes2SDKException e) {
  if (e.ErrorCode == ErrorCode.FeatureNotSupported) { /* hide UI */ }
}
```

Properties: `Error SdkError { get; }`, `ErrorCode ErrorCode { get; }`. `Error` is a `[Serializable]` struct with `Code`, `Message`, `Context` and a computed `ErrorCode` getter. (Call modules as `Yes2SDK.Yes2SDK.<Module>` from your own code: the namespace and the static class share the name `Yes2SDK`.)

Callback overloads pass the same `Error` to `onError`. Core codes map to the enum: `IAP_PURCHASE_CANCELLED` becomes `ErrorCode.UserCancelled`, `INVALID_PARAM` and `INVALID_OPERATION` become `InvalidParams`, `FEATURE_NOT_SUPPORTED` and `IAP_NOT_AVAILABLE` become `FeatureNotSupported`, `PLAYER_NOT_AUTHENTICATED`, `IAP_PURCHASE_FAILED` and `IAP_ALREADY_PURCHASED` become `PlatformError`, and `TIMEOUT` becomes `Timeout`. An ad with no fill reports `Code == "NoFill"`, which maps to `Unknown`, so match the string.

```csharp
Yes2SDK.Yes2SDK.IAP.PurchaseAsync("gems_100",
    onSuccess: json => GrantAndConsume(Purchase.FromJson(json)),
    onError: err =>
    {
        if (err.ErrorCode == ErrorCode.UserCancelled) return;   // closed checkout: not an error
        ShowPurchaseNotCompleted();
    });
```

---

## Defold (Lua)

A failed callback receives a JSON string with three string fields:

```json
{"code":"IAP_PURCHASE_CANCELLED","message":"The player closed the checkout","context":"iap.purchaseAsync"}
```

| Signature | Description |
|-----------|-------------|
| `yes2sdk.parse_error(err)` | Turns the error into a table `{ code = string, message = string, context = string }`. Never raises: a string that is not this JSON comes back as `code = "UNKNOWN_ERROR"` with the string as `message`, and `nil` gives an empty message. |

Branch on `code`, never on `message`. There are no Lua constants: compare with the Core code strings, such as `"IAP_PURCHASE_CANCELLED"`, `"PLAYER_NOT_AUTHENTICATED"`, `"FEATURE_NOT_SUPPORTED"`, `"INVALID_PARAM"` and `"INVALID_OPERATION"`. The extension adds its own fallback codes: `NOT_INITIALIZED`, `FEATURE_NOT_SUPPORTED` (for example an older runtime without the call), `INVALID_PARAM` (arguments rejected before the call) and `UNKNOWN_ERROR`.

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

yes2sdk.iap_purchase("coins_100", nil, function(self, success, result)
    if success then
        -- grant, then consume
    else
        local err = yes2sdk.parse_error(result)
        if err.code == "IAP_PURCHASE_CANCELLED" then
            -- the player changed their mind, nothing to report
        else
            print("Purchase failed: " .. err.code .. " " .. err.message)
        end
    end
end)
```
