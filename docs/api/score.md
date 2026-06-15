# Score — `Yes2SDK.score`

[← Back to overview](overview.md)

Score submission, including an encrypted/signed variant for anti-cheat. Supported on **CrazyGames** and **YouTube**.

> On Poki, GameDistribution, and Yandex, score submission isn't offered by the platform — `addScore`/`submitScore` are recorded locally and safe to keep in your code. On YouTube, `submitScore` accepts the encrypted-score string and forwards it as a plain score value.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `addScore(score: number): void` | Add a score value. `score` must be a valid number. |
| `submitScore(encryptedScore: string): void` | Submit an encrypted/signed score. `encryptedScore` non-empty. |
| `isSupported(): boolean` | Whether score submission is supported. |

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `addScore` | —¹ | —¹ | Ready² | —¹ | Ready³ |
| `submitScore` | —¹ | —¹ | Ready² | —¹ | Partial⁴ |
| `isSupported` | — | — | Ready | — | Ready |

¹ Recorded locally; the platform doesn't offer a score API yet.
² CrazyGames `sdk.user.addScore`/`submitScore` if the SDK version exposes them (warns otherwise).
³ YouTube `ytgame.engagement.sendScore({ value })`.
⁴ Parses the string to an int (no encrypted scores on YouTube), then sends; returns early if `NaN`.

---

## Unity (C#)

`Yes2SDK.Score`.

| Signature | Description |
|-----------|-------------|
| `void AddScore(float score)` | |
| `void SubmitScore(string encryptedScore)` | |
| `bool IsSupported()` | Supported on CrazyGames + Yandex + YouTube per the Unity CHANGELOG. Editor: false. |

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.score_add(score)` | |
| `yes2sdk.score_submit(encrypted)` | |
| `yes2sdk.score_is_supported()` | Boolean (default `false`). |
