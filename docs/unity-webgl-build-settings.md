# WebGL Build Settings (Unity)

> Correct Unity WebGL build settings for the Yes2SDK Dashboard pipeline: what to set, why, and how each portal affects the build.

## Recommended settings

Set these in Unity before building. The fastest way is `Yes2SDK > Build Window > WebGL Settings (expand) > Reset to recommended`. This writes all five settings at once. They are **not** applied automatically at build time; you must expand the WebGL Settings foldout and click the button (or set them manually) before each release build.

| Setting | Recommended value | Why |
|---|---|---|
| Compression Format | **Disabled** | The Yes2SDK Dashboard and each portal's CDN handle delivery and per-platform compression at upload. Compressing in Unity would double-compress and break the pipeline. |
| Decompression Fallback | **Off** | Only relevant when compression is enabled. Leave off. |
| Managed Stripping Level | **Medium** | Reduces build size without stripping types Newtonsoft.Json needs at runtime. |
| Exception Support | **Explicitly Thrown Exceptions Only** | Catches throws from Newtonsoft.Json and other third-party libraries that use try/catch as control flow. About 10% larger than `None` but far more compatible with the .NET ecosystem. Use `None` only after auditing your full dependency graph for throws. |
| WebGL Template | **Yes2SDK-SuperSDK** | The pipeline template. Injects the SDK runtime, sets up a responsive canvas, and keeps all scripts inline (required by Poki's CSP). Install it via `Yes2SDK > Build Window > Install Template`. |

> **Why not per-portal settings?** Platform selection happens in the Dashboard, not Unity. You upload one build; the Dashboard injects the SDK and bundles for each portal at upload time. There is no Unity-side per-portal settings matrix.

## How to apply

1. Open `Yes2SDK > Build Window`.
2. Expand the **WebGL Settings** foldout, then click **Reset to recommended**. This calls `BuildConfig.Default.ApplySettings()` and writes all five settings to `PlayerSettings`.
3. Verify in `File > Build Settings > Player Settings > Publishing Settings` that the values match the table above.
4. Build for WebGL as normal.

If you need a diagnostic build (e.g., to test without a template or with a different stripping level), change the settings manually, build, then reset before your next release build.

## Portal build notes

Each portal enforces its requirements at runtime, not at Unity build time. The Dashboard handles CDN delivery, SDK injection, and platform bundling. There is no per-portal Unity settings matrix to maintain. That said, two build-side rules are worth knowing:

| Rule | Portals | How the SDK handles it |
|---|---|---|
| No external `<script src="http...">` tags | Poki (CSP hard rejection) | `Yes2SDK-SuperSDK` template keeps all scripts inline. Use the template and do not add external scripts. |
| Responsive canvas (100% width/height, no scrollbars) | Poki (hard rejection), CrazyGames (recommended) | `Yes2SDK-SuperSDK` template sets this. Do not override canvas sizing in your HTML. |
| Compression must be off | All portals | Dashboard CDN handles delivery. Unity-side compression breaks the upload pipeline (see table above). |

All other portal requirements (ad lifecycle callbacks, gameplay start/stop, rewarded ad handling, data storage, auth) are runtime behavior enforced by the QA Inspector after upload, not Unity build settings. See each portal's guide and the [feature matrix](/docs/api) for what each portal supports.

## Common rejections

| Symptom | Cause | Fix |
|---|---|---|
| Upload rejected or build fails to load | Compression Format is not `Disabled` | Set Compression to `Disabled` and rebuild. |
| Game doesn't resize / has scrollbars | Canvas sizing overridden or wrong template | Install `Yes2SDK-SuperSDK` template via Build Window; don't override canvas CSS. |
| External scripts blocked on Poki | `<script src="http...">` in template or added manually | Remove external script tags. Use the `Yes2SDK-SuperSDK` template which inlines everything. |
| `System.Exception` crashes in Newtonsoft deserialization | Exception Support set to `None` | Set to `Explicitly Thrown Exceptions Only` and rebuild. |
| Missing template error at build time | Template not installed | Run `Yes2SDK > Build Window > Install Template` before building. |

For runtime rejection reasons (ad timing, gameplayStart/Stop, reward handling), see the per-portal guides and run the QA Inspector on your uploaded build.
