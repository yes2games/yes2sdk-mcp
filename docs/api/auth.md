# Auth: `Yes2SDK.auth`

[← Back to overview](overview.md)

Authentication and account linking. Optional. Guard with `isSupported()`.

> Available on **CrazyGames**, **Yandex** and **Jest** today. Platform sign-out (`signOutAsync`) isn't offered by any of them, account-linking (`linkAccountAsync`) is CrazyGames-only, and the registration prompt (`showRegistrationPrompt`) is Jest-only. See the [Jest guide](/docs/jest) for Jest accounts.

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

**Registration prompt options.** `data` is delivered through `session.getEntryPointData()` after the player registers. `message` is optional. Jest checks it, and it must be 1 to 140 characters (not blank; length counted in UTF-16 code units, placeholder included, so an emoji counts as 2), must contain `{{registrationCode}}` exactly once, must not contain any other `{{...}}` placeholder, and the code must be separated from neighbouring letters, digits or underscores by a space or punctuation (combining marks count as letters). `onClose` runs when the prompt is dismissed. Keep the message short and plain: Jest may drop emoji and accented characters from a long pre-filled text.

**Before you show it:** the prompt is for guests only, so save the guest's progress first. Registration can reload the game, and the saved data is what carries over. On Jest, also turn off Jest's automatic login reminders for a game that shows its own prompt (see the [Jest guide](/docs/jest)).

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| `getCurrentUser` | None | None | Ready | Ready | None | Ready⁸ |
| `signInAsync` | None | None | Ready¹ | Ready² | None | Ready⁹ |
| `signOutAsync` | None | None | None³ | None³ | None | None³ |
| `getTokenAsync` | None | None | Ready⁴ | Ready⁵ | None | Ready¹⁰ |
| `linkAccountAsync` | None | None | Ready⁶ | None | None | None |
| `showRegistrationPrompt` | None | None | None | None | None | Ready¹¹ |
| `isAuthenticated` | None | None | Ready | Ready | None | Ready¹² |
| `isSupported` | None | None | Ready⁷ | Ready | None | Ready |

¹ `sdk.user.showAuthPrompt()`.  ² `ysdk.auth.openAuthDialog()` then re-fetches the player.  ³ No platform sign-out API.  ⁴ `sdk.user.getUserToken()` (1h local expiry).  ⁵ Signed player info (`getPlayer({signed:true})` → signature).  ⁶ `sdk.user.showAccountLinkPrompt()`.  ⁷ Delegates to `sdk.user.isUserAccountAvailable()`.  ⁸ Returns the Jest player for guests too, with `isAuthenticated: false` until the player registers.  ⁹ Opens Jest's login popup. Jest finishes registration over SMS and brings the player back with a fresh page load, so the call usually rejects with `PLAYER_NOT_AUTHENTICATED` when the popup closes. Check `isAuthenticated()` on the next launch instead of waiting on this promise.  ¹⁰ Jest's signed player payload (an HS256 JWS) as `accessToken`, with a 24h local expiry. Verify it on your server.  ¹¹ Guests only. A registered player gets `INVALID_OPERATION`.  ¹² `true` once the player has registered with Jest; `false` for a guest.

`showRegistrationPrompt` is available on Jest only. On Poki, GameDistribution, CrazyGames, Yandex and YouTube it throws `FEATURE_NOT_SUPPORTED`.

---

## Unity (C#)

`Yes2SDK.Yes2SDK.Auth`. It calls the Core module, so platform support follows the table above.

| Signature | Description |
|-----------|-------------|
| `bool IsSupported()` | |
| `bool IsAuthenticated()` | Whether the player is signed in (registered) on the platform. `false` before init, on platforms without player accounts, and on any error. |
| `void GetCurrentUserAsync(Action<AuthUser> onSuccess = null, Action<Error> onError = null)` / `Task<AuthUser> …(CancellationToken)` | |
| `void SignInAsync(Action<AuthUser> …)` / `Task<AuthUser> …(CancellationToken)` | |
| `void GetTokenAsync(Action<string> …)` / `Task<string> …(CancellationToken)` | User JWT. |
| `void ShowAccountLinkPromptAsync(Action<bool> …)` / `Task<bool> …(CancellationToken)` | |
| `RegistrationPrompt ShowRegistrationPrompt(RegistrationPromptOptions options = null, Action onClose = null, Action<Error> onError = null)` | Show the registration prompt to a guest (Jest). Returns the open prompt, or `null` after calling `onError` synchronously when the prompt cannot be shown: an already registered player (`INVALID_OPERATION`), a bad message (`INVALID_PARAM`), the SDK not initialized, or no prompt on the platform. `onClose` fires at most once. |

`AuthUser` (struct): `Id`, `Name`, `Photo`, `IsAuthenticated`.

`RegistrationPromptOptions` (class): `RegistrationPromptTheme? Theme` (`Light` or `Dark`), `Dictionary<string, object> Data` (read later through `Session.GetEntryPointData()`), `string Message` (same rules as Core). `RegistrationPrompt` (sealed class): `bool IsOpen`, `void Login()`, `void Close()`. Wire `Login()` and `Close()` to your own buttons.

```csharp
using System.Collections.Generic;
using UnityEngine;
using Yes2SDK;

if (!Yes2SDK.Yes2SDK.Auth.IsAuthenticated())
{
    // Save the guest's progress first: registration can reload the game.
    RegistrationPrompt prompt = Yes2SDK.Yes2SDK.Auth.ShowRegistrationPrompt(
        new RegistrationPromptOptions
        {
            Theme = RegistrationPromptTheme.Dark,
            Message = "Join me in the game! {{registrationCode}} is my code.",
            Data = new Dictionary<string, object> { { "reward", "welcome_back" } }
        },
        onClose: () => HideMyPromptUi(),
        onError: error => Debug.Log(error.Code));

    if (prompt != null)
    {
        // Your buttons call prompt.Login() and prompt.Close().
    }
}
```

Registration may finish outside the game, so check `IsAuthenticated()` again on the next launch. In the Editor the prompt has no UI: the **Player is registered** setting (Yes2SDK > Build Window > Play Mode Testing) decides whether the player is a guest, and `Login()` marks the player registered for the session.

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.auth_is_authenticated()` | Boolean (default `false`). |
| `yes2sdk.auth_sign_in(callback)` | Trigger platform sign-in. `callback(self, success, err)`. |
| `yes2sdk.auth_is_supported()` | Boolean. Whether platform sign-in is supported. Use it to gate a login button. |
| `local prompt, err = yes2sdk.auth_show_registration_prompt(options)` | Show the registration prompt to a guest (Jest). **Synchronous**: returns a handle, or `nil` and an error JSON string (read it with `yes2sdk.parse_error(err)`). Codes: `FEATURE_NOT_SUPPORTED`, `INVALID_OPERATION` (already registered), `INVALID_PARAM` (bad options or message), `NOT_INITIALIZED`. |

`options` (table or JSON string, all optional): `theme` (`"light"` or `"dark"`), `message` (same rules as Core), `data` (table, returned by `session_get_entry_point_data()` after the player registers), `on_close` (`function(self)`, runs once when the prompt closes, always after the call returns, never after an error return). The handle has `prompt.login()` (starts the platform login, the prompt stays open) and `prompt.close()` (closes it). Both return `true` if the prompt was still open, else `false`.

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

if not yes2sdk.auth_is_authenticated() then
    -- save progress first (for example data_set_string_async, then data_flush)
    local prompt, err = yes2sdk.auth_show_registration_prompt({
        theme = "dark",
        message = "Join me in the game! {{registrationCode}} is my code.",
        data = { reward = "welcome_back" },
        on_close = function(self) hide_my_prompt_ui() end,
    })
    if prompt then
        -- wire your own buttons to prompt.login() and prompt.close()
    else
        print(yes2sdk.parse_error(err).code)
    end
end
```

> Token retrieval and account linking are not exposed in the Defold SDK.
