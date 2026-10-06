# Referrals: `Yes2SDK.referrals`

[← Back to overview](overview.md)

Let a player invite others with a share link, then read back who joined. Each invite carries a campaign `reference` so conversions can be grouped. Optional. Guard with `isSupported()`.

> Not offered on the current platforms. `isSupported()` returns `false` on Poki, GameDistribution, CrazyGames, Yandex and YouTube, and `shareAsync` / `listAsync` reject with `FEATURE_NOT_SUPPORTED`. The API is in Core so you can build against it and adopt it where a platform supports it.

> **Verify before rewarding.** Never grant a referral reward from the client alone. Send `signedRequest` from `listAsync` to your server and verify it there first.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `shareAsync(options: ShareReferralOptions): Promise<{ canceled: boolean }>` | Open the platform share dialog with a referral link. `options.reference` must be a non-empty string, otherwise the call rejects with `INVALID_PARAM`. Resolves `{ canceled: true }` if the player closes the dialog. |
| `listAsync(): Promise<ReferralList>` | The current player's conversions, grouped by `reference`, plus a signed payload for server verification. |
| `isSupported(): boolean` | Whether referrals are supported on the current platform. |

**Types:** `ShareReferralOptions = { reference: string; data?: Record<string, unknown>; title?: string; text?: string; image?: string }` (`reference` is a stable campaign key such as `"unlock_party_mode_v1"`; `data` is delivered to the invited player; `image` is a base64 data URL, PNG, JPEG or WebP, at most 2 MB); `ReferralConversion = { playerId: string; joinedAt: string }` (`joinedAt` is ISO 8601); `ReferralList = { referrals: Record<string, ReferralConversion[]>; signedRequest: string }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `shareAsync` | None | None | None | None | None |
| `listAsync` | None | None | None | None | None |
| `isSupported` | None | None | None | None | None |

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
