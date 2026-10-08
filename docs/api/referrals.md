# Referrals: `Yes2SDK.referrals`

[← Back to overview](overview.md)

Let a player invite others with a share link, then read back who joined. Each invite carries a campaign `reference` so conversions can be grouped. Optional. Guard with `isSupported()`.

> Available on **Jest**. Not offered on Poki, GameDistribution, CrazyGames, Yandex or YouTube: there `isSupported()` returns `false`, and `shareAsync` / `listAsync` reject with `FEATURE_NOT_SUPPORTED`, so a single codebase runs everywhere. See the [Jest guide](/docs/jest) for setup.

> **Verify before rewarding.** Never grant a referral reward from the client alone. Send `signedRequest` from `listAsync` to your server and verify it there first. The [Jest guide](/docs/jest) covers server verification.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `shareAsync(options: ShareReferralOptions): Promise<{ canceled: boolean }>` | Open the platform share dialog with a referral link. `options.reference` must be a non-empty string, otherwise the call rejects with `INVALID_PARAM`. Resolves `{ canceled: true }` if the player closes the dialog. |
| `listAsync(): Promise<ReferralList>` | The current player's conversions, grouped by `reference`, plus a signed payload for server verification. |
| `isSupported(): boolean` | Whether referrals are supported on the current platform. |

**Types:** `ShareReferralOptions = { reference: string; data?: Record<string, unknown>; title?: string; text?: string; image?: string; onboardingSlug?: string; notificationTemplates?: ReferralNotificationTemplate[] }` (`reference` is a stable campaign key such as `"unlock_party_mode_v1"`; `data` is delivered to the invited player; `image` is a base64 data URL, PNG, JPEG or WebP, at most 2 MB; `onboardingSlug` and `notificationTemplates` are described under [Onboarding game and referrer notifications](#onboarding-game-and-referrer-notifications)); `ReferralNotificationTemplate = { minConversionCount: number; variants: ReferralNotificationVariant[] }`; `ReferralNotificationVariant = { title?: string | null; body: string; ctaText: string; imageReference?: string | null }`; `ReferralConversion = { playerId: string; joinedAt: string }` (`joinedAt` is ISO 8601); `ReferralList = { referrals: Record<string, ReferralConversion[]>; signedRequest: string }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube | Jest |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|:----:|
| `shareAsync` | None | None | None | None | None | Ready¹ |
| `listAsync` | None | None | None | None | None | Ready² |
| `isSupported` | None | None | None | None | None | Ready |

¹ Opens Jest's referral share flow. The promise resolves when the dialog closes, which does not prove the player shared; `canceled: true` means they dismissed it. Works for guests and registered players. The image size and type are checked by Jest, not by the SDK. Any platform failure rejects with `PLATFORM_ERROR`.
² Jest only counts an invited player once they complete registration. `signedRequest` is Jest's signed referrals payload; verify it on your server before granting a reward.

---

## Usage

```typescript
if (Yes2SDK.referrals.isSupported()) {
    // Inviting player: share a link tied to a campaign reference.
    const { canceled } = await Yes2SDK.referrals.shareAsync({
        reference: "unlock_party_mode_v1",
        data: { inviter: playerName },
        title: "Join my game",
        text: "Play with me!",
    });
    if (!canceled) {
        showInviteSentToast();
    }

    // Later: see who joined, then verify on your server before rewarding.
    const { referrals, signedRequest } = await Yes2SDK.referrals.listAsync();
    const joined = referrals["unlock_party_mode_v1"] ?? [];
    if (joined.length > 0) {
        await myServer.verifyAndReward(signedRequest);
    }
}

// Invited player: the share `data` arrives with the launch data.
const { inviter } = Yes2SDK.session.getEntryPointData();
```

### Onboarding game and referrer notifications

Two more `shareAsync` options are used only on Jest:

- `onboardingSlug`: the slug of a game that invited players go through first, for example a tutorial game. It must be a non-empty string.
- `notificationTemplates`: notifications sent to the referrer as invited players convert. Each template has a `minConversionCount` (a whole number, 0 or more) and at least one variant. In a variant, `body` and `ctaText` are required non-empty strings, `title` is optional, and `imageReference` is the id of a pre-approved image in the platform's image library. Jest uses the template with the highest `minConversionCount` the referrer has reached and picks one of its variants.

Malformed values reject with `INVALID_PARAM` before anything reaches the platform.

```typescript
await Yes2SDK.referrals.shareAsync({
    reference: "party_mode_v1",
    onboardingSlug: "party-tutorial",
    notificationTemplates: [
        { minConversionCount: 1, variants: [{ body: "A friend joined your party!", ctaText: "Play" }] },
        { minConversionCount: 5, variants: [{ title: "Party Mode unlocked", body: "Five friends joined.", ctaText: "Celebrate" }] },
    ],
});
```

---

## Unity (C#)

`Yes2SDK.Referrals` (`Yes2SDKReferrals`). From your own code call it as `Yes2SDK.Yes2SDK.Referrals`: the namespace and the static class share the name `Yes2SDK`.

| Signature | Description |
|-----------|-------------|
| `bool IsSupported()` | Whether referrals are supported on the current platform. |
| `void ShareAsync(ReferralShareOptions options, Action<ReferralShareResult> onSuccess = null, Action<Error> onError = null)` / `Task<ReferralShareResult> ShareAsync(ReferralShareOptions, CancellationToken)` | Open the share flow. Null options, a blank `Reference` or `Data` that cannot be serialized call `onError` right away with `InvalidParams`. |
| `void ListAsync(Action<ReferralList> onSuccess = null, Action<Error> onError = null)` / `Task<ReferralList> ListAsync(CancellationToken)` | Conversions grouped by reference, plus `SignedRequest`. |

**Types:** `ReferralShareOptions { string Reference; Dictionary<string, object> Data; string Title; string Text; string ImageDataUrl; string OnboardingSlug; List<ReferralNotificationTemplate> NotificationTemplates }` (constructors `()` and `(string reference)`; `ImageDataUrl` is a PNG, JPEG or WebP data URL, at most 2 MB; `OnboardingSlug` and `NotificationTemplates` are Jest only, with the rules above, and an empty `OnboardingSlug` or a malformed template calls `onError` right away with `InvalidParams`); `ReferralNotificationTemplate { int MinConversionCount; List<ReferralNotificationVariant> Variants }`; `ReferralNotificationVariant { string Title; string Body; string CtaText; string ImageReference }` (`Body` and `CtaText` required); `ReferralShareResult { bool Canceled }`; `ReferralConversion { string PlayerId; string JoinedAt }`; `ReferralList { Dictionary<string, List<ReferralConversion>> Referrals; string SignedRequest }` (`Referrals` is never null). The invited player reads `Data` through `Session.GetEntryPointData()`.

```csharp
using System.Collections.Generic;
using UnityEngine;
using Yes2SDK;

if (Yes2SDK.Yes2SDK.Referrals.IsSupported())
{
    Yes2SDK.Yes2SDK.Referrals.ShareAsync(
        new ReferralShareOptions("party_mode_v1")
        {
            Title = "Play with me",
            Text  = "Join my party",
            Data  = new Dictionary<string, object> { { "inviter", playerId } },
            NotificationTemplates = new List<ReferralNotificationTemplate>
            {
                new ReferralNotificationTemplate
                {
                    MinConversionCount = 1,
                    Variants = { new ReferralNotificationVariant { Body = "A friend joined your party!", CtaText = "Play" } }
                }
            }
        },
        onSuccess: result => { if (!result.Canceled) ShowThanks(); },
        onError:   err    => Debug.LogWarning(err.Message));

    Yes2SDK.Yes2SDK.Referrals.ListAsync(
        onSuccess: list =>
        {
            // Send list.SignedRequest to your server and grant rewards from what it verifies.
            if (list.Referrals.TryGetValue("party_mode_v1", out var joined))
                Debug.Log($"{joined.Count} players joined");
        },
        onError: err => Debug.LogWarning(err.Message));
}
```

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.referrals_is_supported()` | Boolean. |
| `yes2sdk.referrals_share(options, callback)` | `options` is a table (or JSON string): `reference` (required, non-empty), `data` (table, delivered to the invited player), `title`, `text`, `image` (base64 data URL, PNG, JPEG or WebP, at most 2 MB), and on Jest `onboarding_slug` and `notification_templates` (see below). `callback(self, success, result_json)`: `result_json` is `{"canceled":false}`, with `canceled` set to `true` when the player closed the flow. A missing or empty `reference` fails the callback with `INVALID_PARAM` on the next frame. |
| `yes2sdk.referrals_list(callback)` | `callback(self, success, result_json)`: `{"referrals":{"<reference>":[{"playerId":"...","joinedAt":"..."}]},"signedRequest":"..."}`. Verify `signedRequest` on your server. |

The invited player reads `data` with `yes2sdk.session_get_entry_point_data()`.

`notification_templates` is a list of `{ min_conversion_count = <whole number, 0 or more>, variants = { ... } }`, each with at least one variant `{ title, body, cta_text, image_reference }` (`body` and `cta_text` required). The snake_case names are mapped for you; in a JSON string use the camelCase names (`onboardingSlug`, `notificationTemplates`, `minConversionCount`, `ctaText`, `imageReference`). Malformed values fail with `INVALID_PARAM`.

```lua
yes2sdk.referrals_share({
    reference = "party_mode_v1",
    onboarding_slug = "party-tutorial",
    notification_templates = {
        { min_conversion_count = 1, variants = { { body = "A friend joined your party!", cta_text = "Play" } } },
    },
}, function(self, success, result) end)
```

```lua
local yes2sdk = require "yes2sdk.yes2sdk"

if yes2sdk.referrals_is_supported() then
    -- reference is a stable campaign key (required); data reaches the invited player
    yes2sdk.referrals_share({ reference = "party_mode_v1", data = { from_level = 3 }, title = "Play with me" },
        function(self, success, result)
            if success and not json.decode(result).canceled then
                -- the invite flow was completed
            end
        end)

    yes2sdk.referrals_list(function(self, success, result)
        if success then
            local list = json.decode(result)
            -- list.referrals["party_mode_v1"] = { { playerId = "...", joinedAt = "..." }, ... }
            -- Send list.signedRequest to your server and verify it there before granting any reward.
        else
            print(yes2sdk.parse_error(result).code)
        end
    end)
end
```
