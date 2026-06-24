# Review — `Yes2SDK.review`

[← Back to overview](overview.md)

In-game rating / feedback prompt. Ask the platform to show its native "rate this game" dialog at a good moment (after a win, a level complete, a long session).

> **Yandex only.** On every other platform `canReviewAsync()` reports `canReview: false` (reason `"FEATURE_NOT_SUPPORTED"`) and `isSupported()` returns `false`, so the calls are safe no-ops. `requestReviewAsync()` checks eligibility internally — the platform decides whether the prompt is actually shown (it won't re-prompt a player who has already rated), so a `feedbackSent: false` result is normal and not an error.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `canReviewAsync(): Promise<ReviewEligibility>` | Whether the rating prompt may currently be shown. |
| `requestReviewAsync(): Promise<ReviewResult>` | Request the rating prompt. Eligibility is checked internally; resolves with whether feedback was sent. |
| `isSupported(): boolean` | Whether a rating prompt is available. |

**Types:** `ReviewEligibility = { canReview: boolean; reason?: string }`; `ReviewResult = { feedbackSent: boolean }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `canReviewAsync` | —¹ | —¹ | —¹ | Ready | —¹ |
| `requestReviewAsync` | —¹ | —¹ | —¹ | Ready | —¹ |
| `isSupported` | — | — | — | Ready | — |

¹ Returns `{ canReview: false, reason: "FEATURE_NOT_SUPPORTED" }` / a no-op result. Only Yandex (`ysdk.feedback`) exposes a rating prompt.

---

## Usage

```typescript
if (Yes2SDK.review.isSupported()) {
    const { canReview } = await Yes2SDK.review.canReviewAsync();
    if (canReview) {
        const { feedbackSent } = await Yes2SDK.review.requestReviewAsync();
        // feedbackSent === false is normal (e.g. player already rated)
    }
}
```
