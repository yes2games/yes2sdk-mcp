# Stats — `Yes2SDK.stats`

[← Back to overview](overview.md)

Numeric player statistics: read, set, and atomically increment named counters (matches played, distance travelled, coins earned). Optional — guard with `isSupported()`.

> Available on **Yandex** today (`getStats` / `setStats` / `incrementStats`). Other platforms report `isSupported() === false`; the calls stay safe so a single codebase runs everywhere.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `getStatsAsync(keys: string[]): Promise<Record<string, number>>` | Get stats for the given keys. |
| `setStatsAsync(stats: Record<string, number>): Promise<void>` | Set stats as name → value pairs. |
| `incrementStatsAsync(increments: Record<string, number>): Promise<Record<string, number>>` | Atomically increment stats by the given deltas; returns the updated values. |
| `isSupported(): boolean` | Whether stats are supported. |

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `getStatsAsync` | — | — | — | Ready | — |
| `setStatsAsync` | — | — | — | Ready | — |
| `incrementStatsAsync` | — | — | — | Ready | — |
| `isSupported` | — | — | — | Ready | — |

Yandex maps to its native stats API. On every other platform the strategy's `isSupported()` returns `false` — guard your calls with `isSupported()`.

---

## Usage

```typescript
if (Yes2SDK.stats.isSupported()) {
    // Read current stats
    const stats = await Yes2SDK.stats.getStatsAsync(["gamesPlayed", "coins"]);

    // Atomically bump counters; the updated values come back
    const updated = await Yes2SDK.stats.incrementStatsAsync({ gamesPlayed: 1, coins: 50 });
    console.log(`Games played: ${updated.gamesPlayed}`);
}
```
