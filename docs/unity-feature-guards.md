# Guarding Unsupported Features (Unity)

> Check `IsSupported()` before wiring optional features, and treat `FeatureNotSupported` errors as expected no-ops rather than failures.

## `FEATURE_NOT_SUPPORTED` is normal

When the active portal does not implement a feature, the SDK returns `ErrorCode.FeatureNotSupported` (`Error.cs:63`). This is not a bug. It is the expected signal that the portal simply does not offer that capability.

Do not add noisy error logging or abort your flow on `FeatureNotSupported`. The right response is a silent no-op: hide the feature UI, skip the call, and continue normally.

```csharp
Yes2SDK.Yes2SDK.Banners.ShowBanner("top", BannerSize.Leaderboard,
    onSuccess: () => { /* banner shown */ },
    onError: (Error err) =>
    {
        if (err.ErrorCode == ErrorCode.FeatureNotSupported)
        {
            // Portal doesn't support banners — hide the container and continue
            bannerContainer.SetActive(false);
            return;
        }
        // Unexpected error — log and handle
        Debug.LogWarning($"Banner error: {err}");
    }
);
```

The `Error` struct fields are:
- `Code`: string identifier (e.g. `"FeatureNotSupported"`)
- `ErrorCode`: typed `ErrorCode` enum value, parsed from `Code`
- `Message`: human-readable description
- `Context`: API call that produced the error (e.g. `"Yes2SDK.Banners.ShowBanner"`)

## The `IsSupported()` guard

Four modules expose `IsSupported()` so you can check capability at startup rather than discovering it at call time:

| Module | Method | File |
|---|---|---|
| `Banners` | `Yes2SDK.Yes2SDK.Banners.IsSupported()` | `Runtime/Banners/Yes2SDKBanners.cs:103` |
| `Score` | `Yes2SDK.Yes2SDK.Score.IsSupported()` | `Runtime/Score/Yes2SDKScore.cs:59` |
| `Auth` | `Yes2SDK.Yes2SDK.Auth.IsSupported()` | `Runtime/Auth/Yes2SDKAuth.cs:55` |
| `Friends` | `Yes2SDK.Yes2SDK.Friends.IsSupported()` | `Runtime/Friends/Yes2SDKFriends.cs:66` |

All return `bool`. In the Unity Editor all four return `false` (the `#if UNITY_WEBGL && !UNITY_EDITOR` branch is inactive). The real portal value is only available in a WebGL build.

Check at startup and drive UI state from the result:

```csharp
void Start()
{
    if (Yes2SDK.Yes2SDK.Banners.IsSupported())
    {
        // Wire up banner UI
        bannerContainer.SetActive(true);
        Yes2SDK.Yes2SDK.Banners.ShowBanner("top", BannerSize.Leaderboard);
    }
    else
    {
        // Hide banner container entirely — portal doesn't support it
        bannerContainer.SetActive(false);
    }

    if (Yes2SDK.Yes2SDK.Score.IsSupported())
    {
        leaderboardButton.SetActive(true);
    }
    else
    {
        leaderboardButton.SetActive(false);
    }
}
```

## Stub modules always return `FeatureNotSupported`

Some modules are stubs: they extend `Yes2SDKStubModule` and return `FeatureNotSupported` on every portal, in every environment. They also expose `IsSupported()` which always returns `false`. If you call their methods the `onError` callback fires immediately with `ErrorCode.FeatureNotSupported`. No JavaScript bridge call is made.

Current stub modules include `Achievements` and `Context`. Calling `IsSupported()` on them always returns `false`.

## Async / Task API

If you use the `Task<T>` overloads instead of callbacks, catch `FeatureNotSupported` from the thrown exception or check the result:

```csharp
try
{
    await Yes2SDK.Yes2SDK.Auth.GetCurrentUserAsync();
}
catch (Yes2SDKException ex) when (ex.ErrorCode == ErrorCode.FeatureNotSupported)
{
    // Portal does not support auth — skip auth-gated features
    authPanel.SetActive(false);
}
```

Guard with `IsSupported()` first to avoid the allocations entirely if the portal never supports the feature.

## Which portals support what

See the [feature matrix](/docs/api) for a portal-by-portal breakdown of which modules are supported. Use it to decide at design time which features need guards and which are always-on.
