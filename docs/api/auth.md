# Auth: `Yes2SDK.auth`

[← Back to overview](overview.md)

Authentication and account linking. Optional. Guard with `isSupported()`.

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
| `showRegistrationPrompt(options?: RegistrationPromptOptions): RegistrationPromptHandle` | Show the platform's registration prompt to a guest and get `login` / `close` handlers for your own buttons. **Synchronous**. Throws `FEATURE_NOT_SUPPORTED` where the platform has no such prompt, `INVALID_OPERATION` for an already registered player, and `INVALID_PARAM` for a `message` that breaks the rules below. |
| `isAuthenticated(): boolean` | Whether the user is authenticated. |
| `isSupported(): boolean` | Whether auth is supported. |

**Types:** `AuthProvider = "facebook" | "google" | "apple" | "platform" | "anonymous"`; `AuthUser = { id; name; email; photo; provider; isAuthenticated }`; `AuthToken = { accessToken; expiresAt; refreshToken? }`; `RegistrationPromptOptions = { theme?: "light" | "dark"; data?: Record<string, unknown>; message?: string; onClose?: () => void }`; `RegistrationPromptHandle = { login: () => void; close: () => void }`.

**Registration prompt options.** `data` is delivered through `session.getEntryPointData()` after the player registers. `message` is optional. Where the platform checks it, it must be 1 to 140 characters (not blank; length counted in UTF-16 code units, placeholder included, so an emoji counts as 2), must contain `{{registrationCode}}` exactly once, must not contain any other `{{...}}` placeholder, and the code must be separated from neighbouring letters, digits or underscores by a space or punctuation (combining marks count as letters). `onClose` runs when the prompt is dismissed.

**Before you show it:** the prompt is for guests only, so save the guest's progress first. Registration can reload the game, and the saved data is what carries over.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getCurrentUser` | None | None | Ready | Ready | None |
| `signInAsync` | None | None | Ready¹ | Ready² | None |
| `signOutAsync` | None | None | None³ | None³ | None |
| `getTokenAsync` | None | None | Ready⁴ | Ready⁵ | None |
| `linkAccountAsync` | None | None | Ready⁶ | None | None |
| `showRegistrationPrompt` | None | None | None | None | None |
| `isAuthenticated` | None | None | Ready | Ready | None |
| `isSupported` | None | None | Ready⁷ | Ready | None |

¹ `sdk.user.showAuthPrompt()`.  ² `ysdk.auth.openAuthDialog()` then re-fetches the player.  ³ No platform sign-out API.  ⁴ `sdk.user.getUserToken()` (1h local expiry).  ⁵ Signed player info (`getPlayer({signed:true})` → signature).  ⁶ `sdk.user.showAccountLinkPrompt()`.  ⁷ Delegates to `sdk.user.isUserAccountAvailable()`.

`showRegistrationPrompt` is offered on Jest only (guests only; see the Jest quickstart). Every other platform throws `FEATURE_NOT_SUPPORTED`.

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
