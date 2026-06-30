# Leaderboard — `Yes2SDK.leaderboard`

[← Back to overview](overview.md)

Named leaderboards: submit scores, read top/ranked entries, and fetch the current player's or friends' standings. Optional — guard with `isSupported()`.

> Available on **Yandex** today (`ysdk.getLeaderboards()`). Other platforms report `isSupported() === false`; the calls stay safe (no-op / empty results) so a single codebase runs everywhere. For write-only score submission that's available more widely, see the [score](score.md) module.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getLeaderboardAsync(name: string): Promise<Leaderboard>` | Leaderboard by name. `name` must be non-empty. |
| `setScoreAsync(name: string, score: number, metadata?: string): Promise<LeaderboardEntry>` | Submit a score; returns the player's entry. |
| `getEntriesAsync(name: string, count?: number, offset?: number): Promise<LeaderboardEntry[]>` | Entries (default `count` 10, `offset` 0). `count` must be positive. |
| `getPlayerEntryAsync(name: string): Promise<LeaderboardEntry \| null>` | The player's entry, or `null` if unranked. |
| `getConnectedPlayerEntriesAsync(name: string, count?: number, offset?: number): Promise<LeaderboardEntry[]>` | Friends' entries (default `count` 10, `offset` 0). |
| `isSupported(): boolean` | Whether leaderboards are supported. |

**Types:** `Leaderboard = { name: string; contextId: string | null; entries: LeaderboardEntry[] }`; `LeaderboardEntry = { rank: number; playerId: string; playerName: string; playerPhoto: string | null; score: number; formattedScore: string; timestamp: number; metadata?: string }`.

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getLeaderboardAsync` | — | — | — | Ready | — |
| `setScoreAsync` | — | — | — | Ready | — |
| `getEntriesAsync` | — | — | — | Ready | — |
| `getPlayerEntryAsync` | — | — | — | Ready | — |
| `getConnectedPlayerEntriesAsync` | — | — | — | Ready | — |
| `isSupported` | — | — | — | Ready | — |

Yandex maps to its native leaderboards API. On every other platform the strategy's `isSupported()` returns `false` — guard your calls with `isSupported()`.

---

## Usage

```typescript
if (Yes2SDK.leaderboard.isSupported()) {
    // Submit a score
    const entry = await Yes2SDK.leaderboard.setScoreAsync("high-scores", 9999);
    console.log(`Your rank: ${entry.rank}`);

    // Read the top 10
    const top = await Yes2SDK.leaderboard.getEntriesAsync("high-scores", 10);
    top.forEach((e) => console.log(`${e.rank}. ${e.playerName} — ${e.formattedScore}`));
}
```

---

## Defold (Lua)

Async results arrive as JSON strings — decode with `json.decode`.

| Signature | Description |
|-----------|-------------|
| `yes2sdk.leaderboard_get(name, callback)` | `callback(self, success, leaderboard_json)`. |
| `yes2sdk.leaderboard_set_score(name, score, metadata, callback)` | `metadata` optional (pass `nil` to skip). `callback(self, success, entry_json)`. |
| `yes2sdk.leaderboard_get_entries(name, count, offset, callback)` | `callback(self, success, entries_json)` — JSON array. |
| `yes2sdk.leaderboard_get_player_entry(name, callback)` | `callback(self, success, entry_json)` — JSON object, or `"null"` if unranked. |
| `yes2sdk.leaderboard_is_supported()` | Returns `true` where leaderboards exist (Yandex today). |

> Connected-player entries are not exposed in the Defold SDK.
