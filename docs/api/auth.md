# Auth — `Yes2SDK.auth`

[← Back to overview](overview.md)

Authentication and account linking. Optional — guard with `isSupported()`.

> Available on **CrazyGames** and **Yandex** today. Platform sign-out (`signOutAsync`) isn't offered by either platform, and account-linking (`linkAccountAsync`) is CrazyGames-only.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getCurrentUser(): AuthUser \| null` | Current user, or `null`. |
| `getCurrentUserAsync(): Promise<AuthUser \| null>` | Async alias (Unity bridge). |
| `signInAsync(provider?: AuthProvider): Promise<AuthUser>` | Trigger sign-in. |
| `signOutAsync(): Promise<void>` | Sign out. |
| `getTokenAsync(): Promise<AuthToken>` | Get a server-verifiable token. |
| `linkAccountAsync(provider: AuthProvider): Promise<void>` | Link an account provider. |
| `showAccountLinkPromptAsync(): Promise<void>` | Alias → `linkAccountAsync("platform")`. |
| `isAuthenticated(): boolean` | Whether the user is authenticated. |
| `isSupported(): boolean` | Whether auth is supported. |

**Types:** `AuthProvider = "facebook" | "google" | "apple" | "platform" | "anonymous"`; `AuthUser = { id; name; email; photo; provider; isAuthenticated }`; `AuthToken = { accessToken; expiresAt; refreshToken? }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getCurrentUser` | — | — | Ready | Ready | — |
| `signInAsync` | — | — | Ready¹ | Ready² | — |
| `signOutAsync` | — | — | —³ | —³ | — |
| `getTokenAsync` | — | — | Ready⁴ | Ready⁵ | — |
| `linkAccountAsync` | — | — | Ready⁶ | — | — |
| `isAuthenticated` | — | — | Ready | Ready | — |
| `isSupported` | — | — | Ready⁷ | Ready | — |

¹ `sdk.user.showAuthPrompt()`.  ² `ysdk.auth.openAuthDialog()` then re-fetches the player.  ³ No platform sign-out API.  ⁴ `sdk.user.getUserToken()` (1h local expiry).  ⁵ Signed player info (`getPlayer({signed:true})` → signature).  ⁶ `sdk.user.showAccountLinkPrompt()`.  ⁷ Delegates to `sdk.user.isUserAccountAvailable()`.

---

## Unity (C#)

`Yes2SDK.Auth`. Available on CrazyGames.

| Signature | Description |
|-----------|-------------|
| `bool IsSupported()` | |
| `void GetCurrentUserAsync(Action<AuthUser> onSuccess = null, Action<Error> onError = null)` / `Task<AuthUser> …(CancellationToken)` | |
| `void SignInAsync(Action<AuthUser> …)` / `Task<AuthUser> …(CancellationToken)` | |
| `void GetTokenAsync(Action<string> …)` / `Task<string> …(CancellationToken)` | User JWT. |
| `void ShowAccountLinkPromptAsync(Action<bool> …)` / `Task<bool> …(CancellationToken)` | |

`AuthUser` (struct): `Id`, `Name`, `Photo`, `IsAuthenticated`.

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.auth_is_authenticated()` | Boolean (default `false`). |
| `yes2sdk.auth_sign_in(callback)` | Trigger platform sign-in. `callback(self, success, err)`. |

> Token retrieval and account linking are not exposed in the Defold SDK.
