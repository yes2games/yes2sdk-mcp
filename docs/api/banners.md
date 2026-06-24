# Banners — `Yes2SDK.banners`

[← Back to overview](overview.md)

Positioned display banners with explicit container IDs and sizes. **Distinct** from the simple top/bottom banner in the [ads](ads.md) module — this module manages multiple named banners.

> Available on **CrazyGames** and **Yandex**. On Yandex this is a single sticky banner: placement and size are managed for you, and `refreshBanners` re-displays it.

---

## Methods (Core)

| Signature | Description |
|-----------|-------------|
| `showBanner(id: string, size: string, x?: number, y?: number): Promise<void>` | Show a banner at an optional `(x, y)`. `id`/`size` non-empty (size e.g. `"300x250"`). |
| `hideBanner(id: string): void` | Hide a specific banner by ID. |
| `hideAllBanners(): void` | Hide all displayed banners. |
| `refreshBanners(): void` | Refresh all displayed banners. |
| `getBannerStatusAsync(): Promise<BannerStatus>` | Query the current banner display status. Resolves `{ isShowing: false }` where there's no status API. |
| `isSupported(): boolean` | Whether banners are supported. |

`BannerStatus = { isShowing: boolean; reason?: string }` (`reason` carries the platform-supplied reason a banner is not showing, e.g. Yandex `'ADV_IS_NOT_CONNECTED'`).

Documented sizes: `"300x250" | "728x90" | "320x50" | "468x60" | "160x600"` (the param is typed `string`, so other values are accepted).

---

## Platform support

| Method | Poki | GameDistribution | CrazyGames | Yandex | YouTube |
|--------|:----:|:----------------:|:----------:|:------:|:-------:|
| `showBanner` | — | — | Ready | Ready¹ | — |
| `hideBanner` | — | — | Ready | Ready¹ | — |
| `hideAllBanners` | — | — | Ready | Ready | — |
| `refreshBanners` | — | — | Ready² | Partial³ | — |
| `getBannerStatusAsync` | — | — | Partial⁴ | Ready⁵ | — |
| `isSupported` | — | — | Ready | Ready | — |

¹ Yandex maps to a single sticky banner (`ysdk.adv.showBannerAdv`); `id`/`size` are ignored.
² CrazyGames `refreshBanners` if the SDK version exposes it (warns otherwise).
³ Yandex has no native refresh — emulated via hide-then-show.
⁴ CrazyGames has no banner status query — always resolves `{ isShowing: false, reason: "STATUS_QUERY_NOT_SUPPORTED" }`.
⁵ Yandex maps to `ysdk.adv.getBannerAdvStatus()` (live state, with a platform `reason`).

---

## Unity (C#)

`Yes2SDK.Banners`. Uses a `BannerSize` enum (serialized to JS via `.ToString()`).

| Signature | Description |
|-----------|-------------|
| `void ShowBanner(string id, BannerSize size, Action onSuccess = null, Action<Error> onError = null)` | |
| `void HideBanner(string id)` | |
| `void HideAllBanners()` | |
| `void RefreshBanners()` | |
| `bool IsSupported()` | Editor: false. |

`BannerSize`: `Leaderboard_728x90`, `Medium_300x250`, `Mobile_320x50`, `Main_468x60`, `Large_Mobile_320x100`.

---

## Defold (Lua)

| Signature | Description |
|-----------|-------------|
| `yes2sdk.banners_show(id, size)` | |
| `yes2sdk.banners_hide(id)` | |
| `yes2sdk.banners_hide_all()` | |
| `yes2sdk.banners_is_supported()` | Boolean (default `false`). |
