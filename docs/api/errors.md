# Error Model

[← Back to overview](overview.md)

Every async SDK call can fail. Failures are surfaced consistently across the three surfaces.

- **Core (TS):** async methods reject with an `ErrorMessage` **object** (not a JS `Error` subclass). Sync methods suppress `NOT_INITIALIZED` (log a warning, return a default) to avoid killing the engine main loop during early init.
- **Unity (C#):** callback overloads invoke `Action<Error>`; Task overloads **throw `Yes2SDKException`** (carries the `Error` and parsed `ErrorCode`).
- **Defold (Lua):** callbacks receive `(self, success, payload)`, where `payload` is an error-message string when `success` is false.

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
| IAP | `IAP_NOT_AVAILABLE`, `IAP_PURCHASE_FAILED`, `IAP_ALREADY_PURCHASED` |
| Leaderboard | `LEADERBOARD_NOT_FOUND` |
| Unknown | `UNKNOWN_ERROR` |

Unity's `ErrorCode` enum is a smaller mapped set: `NotInitialized, InvalidParams, FeatureNotSupported, PlatformError, NetworkError, RateLimited, UserCancelled, Unknown` (parsed from `Error.Code`, falling back to `Unknown`).

---

## Runtime behavior

- Parameter validation failures throw `INVALID_PARAM`.
- Calling an async method before init / without a wired strategy throws `NOT_INITIALIZED`.
- Unhandled platform-side failures are wrapped as `PLATFORM_ERROR` (`message` from the underlying error; `originalError` set).
- **`FEATURE_NOT_SUPPORTED` is the normal signal that a platform doesn't implement a feature** — handle it gracefully, don't treat it as a bug.
- `isXSupported()` returns `false` (never throws) when no strategy is wired.

---

## `Yes2SDKException` (Unity)

Thrown by all Task overloads:

```csharp
try {
  var user = await Yes2SDK.Auth.SignInAsync(cts.Token);
} catch (Yes2SDKException e) {
  if (e.ErrorCode == ErrorCode.FeatureNotSupported) { /* hide UI */ }
}
```

Properties: `Error SdkError { get; }`, `ErrorCode ErrorCode { get; }`. `Error` is a `[Serializable]` struct with `Code`, `Message`, `Context` and a computed `ErrorCode` getter.
