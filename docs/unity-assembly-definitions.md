# Assembly Definitions (Unity)

> Reference for the three assembly definitions shipped by the Yes2SDK Unity package and how to reference them from your own asmdefs.

## What ships

The package includes three assembly definitions:

| Assembly | File | Platforms | References |
|---|---|---|---|
| `Yes2SDK.Runtime` | `Runtime/Yes2SDK.Runtime.asmdef` | Editor, WebGL | `Unity.Nuget.Newtonsoft-Json` |
| `Yes2SDK.Editor` | `Editor/Yes2SDK.Editor.asmdef` | Editor only | `Yes2SDK.Runtime`, `Unity.Nuget.Newtonsoft-Json` |
| `Yes2SDK.Ktx2` | `Runtime/Ktx2/Yes2SDK.Ktx2.asmdef` | Editor, WebGL | `Yes2SDK.Runtime`, `com.unity.cloud.ktx` (GUID) |

`Yes2SDK.Ktx2` is optional — it only compiles when the `com.unity.cloud.ktx` package is installed (gated by the `YES2SDK_KTX` define constraint). You do not need it unless your game loads KTX2 textures.

## If your game uses assembly definitions

If your game scripts live in their own asmdef, you must add a reference to `Yes2SDK.Runtime` so the compiler can resolve `using Yes2SDK;`.

**In the Inspector:** select your `.asmdef` asset, find **Assembly Definition References**, click **+**, and pick `Yes2SDK.Runtime`.

The resulting JSON entry looks like:

```json
{
  "references": [
    "Yes2SDK.Runtime"
  ]
}
```

Without this reference, any script in your assembly that calls `Yes2SDK.Yes2SDK.InitializeAsync(...)` or any other SDK API will fail to compile with an unresolved type error.

## If your game has no assembly definitions

Loose scripts compile into Unity's implicit `Assembly-CSharp` assembly. Because `Yes2SDK.Runtime` has `autoReferenced: true`, it is automatically available to `Assembly-CSharp` — no action needed. Add `using Yes2SDK;` and the API resolves.

## Why the SDK isolates its editor tools

The SDK's editor tools live in their own `Yes2SDK.Editor` assembly rather than the implicit `Assembly-CSharp-Editor`. This prevents a naming collision: if a game defines a global-namespace class called `Path` or `Environment`, it shadows `System.IO.Path` and `System.Environment` inside `Assembly-CSharp-Editor`, which breaks the SDK's editor scripts. By compiling into a dedicated assembly, the SDK's editor code never shares a namespace scope with game-defined globals. This was resolved in a recent package update (yes2sdk-unity PR #61).

The `Yes2SDK.Editor` assembly is Editor-only, so it never ships in your WebGL build.
