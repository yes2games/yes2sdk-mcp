# Coexisting with Other SDKs (Unity)

> How to gate native-only SDKs out of your WebGL build, migrate save data safely, and initialize Yes2SDK before gameplay starts.

## The gating model

Games that ship on mobile or PC alongside a web build often include SDKs that have no WebGL counterpart — ByteBrew, Nakama, Firebase Analytics, Unity IAP, and similar. Those packages must not be compiled into the WebGL build. Use `#if !UNITY_WEBGL` to keep them on the native branch and `#else` to route the equivalent call through Yes2SDK.

**Example — analytics event on level complete:**

```csharp
void OnLevelComplete(string levelId, int score)
{
#if !UNITY_WEBGL
    // Mobile / Desktop: your existing analytics SDK
    ByteBrew.NewCustomEvent("level_complete", levelId);
#else
    // WebGL: Yes2SDK routes to the platform's analytics backend
    Yes2SDK.Yes2SDK.Analytics.LogEvent("level_complete",
        new Dictionary<string, object> { { "level", levelId }, { "score", score } });
#endif
}
```

The `#if !UNITY_WEBGL` branch compiles only in standalone/mobile builds. The `#else` branch compiles only in WebGL builds (including the Editor WebGL mock). This keeps your project buildable on all targets without conditional package installs.

> **Editor note:** `#if UNITY_WEBGL && !UNITY_EDITOR` guards the real DllImport calls inside the SDK. When you run Play Mode in the Editor, `UNITY_WEBGL` is not defined, so the `#else` branch above also fires in the Editor. You can test the Yes2SDK mock path in Editor without switching platform.

If the native SDK is installed as a Unity package and declares its own assembly definition, you may also need a platform constraint on its asmdef (set `includePlatforms` to exclude WebGL) in addition to the `#if` guards.

## Save-data migration and key namespaces

Yes2SDK's `Data` module provides typed key-value storage (`GetInt`, `SetInt`, `GetFloat`, `SetFloat`, `GetString`, `SetString`). In the Editor and on Poki/GameDistribution it falls back to `PlayerPrefs` / `localStorage` under the hood; on Yandex, YouTube, and CrazyGames it uses the platform's cloud store.

If your game already writes save data directly through `PlayerPrefs` (or another local store), you risk **key collisions**: a legacy key `"highScore"` and a Yes2SDK key `"highScore"` point to different backing stores on cloud platforms, and on Poki/Editor they share the same `PlayerPrefs` namespace and will overwrite each other.

### Recommended: prefix all Yes2SDK keys

Pick a short, stable prefix and use it for every key you write through Yes2SDK:

```csharp
const string KeyPrefix = "mygame_";

Yes2SDK.Yes2SDK.Data.SetInt(KeyPrefix + "highScore", value);
int score = Yes2SDK.Yes2SDK.Data.GetInt(KeyPrefix + "highScore", 0);
```

### One-time migration

If players already have data in raw `PlayerPrefs`, read the legacy keys once and write them through Yes2SDK Data so they survive on cloud platforms:

```csharp
void MigrateLegacyData()
{
    const string migrationFlag = "mygame_migrated_v1";

    // Check migration flag through Yes2SDK so it lives in the platform store
    if (Yes2SDK.Yes2SDK.Data.GetInt(migrationFlag, 0) == 1)
        return;

    // Read legacy PlayerPrefs keys
    if (PlayerPrefs.HasKey("highScore"))
    {
        int legacy = PlayerPrefs.GetInt("highScore", 0);
        Yes2SDK.Yes2SDK.Data.SetInt("mygame_highScore", legacy);
        PlayerPrefs.DeleteKey("highScore");
    }

    if (PlayerPrefs.HasKey("soundEnabled"))
    {
        int legacy = PlayerPrefs.GetInt("soundEnabled", 1);
        Yes2SDK.Yes2SDK.Data.SetInt("mygame_soundEnabled", legacy);
        PlayerPrefs.DeleteKey("soundEnabled");
    }

    // Mark as migrated
    Yes2SDK.Yes2SDK.Data.SetInt(migrationFlag, 1);
    PlayerPrefs.Save();
}
```

Call `MigrateLegacyData()` once per session, before your game reads any save data. On cloud platforms (Yandex, YouTube) the migrated data is then synced to the player's account on the next write cycle.

See [Data API reference](/docs/api/data) for platform-by-platform storage behavior.

## Init ordering

Yes2SDK must be initialized before any SDK call fires — including analytics, data reads, and ad requests. Keep all other SDKs' initialization on their own platform branch so neither block blocks the other.

```csharp
void Start()
{
#if !UNITY_WEBGL
    // Native-only SDKs initialize here, independent of Yes2SDK
    NativeSdkA.Initialize();
    NativeSdkB.Initialize();
#else
    // WebGL: initialize Yes2SDK first, then start gameplay inside the callback
    Yes2SDK.Yes2SDK.SetLoadingProgress(0);

    Yes2SDK.Yes2SDK.InitializeAsync(onSuccess: () =>
    {
        Yes2SDK.Yes2SDK.SetLoadingProgress(100);

        Yes2SDK.Yes2SDK.StartGameAsync(onSuccess: () =>
        {
            // SDK is ready — begin gameplay, load assets, show UI
            StartCoroutine(LoadGame());
        });
    });
#endif
}
```

The documented bootstrap sequence is:

1. `Yes2SDK.Yes2SDK.InitializeAsync(...)` — connects to the platform SDK
2. `Yes2SDK.Yes2SDK.SetLoadingProgress(n)` — optional; reports loading progress (0–100) while assets load
3. `Yes2SDK.Yes2SDK.StartGameAsync(...)` — signals the platform that loading is done and gameplay can begin

No SDK module call (analytics event, data read, ad request) should fire before `InitializeAsync` completes. Wiring other SDKs' init inside the `#if !UNITY_WEBGL` branch ensures their callbacks never interfere with Yes2SDK's async init on the WebGL path.
