# Optimization (Unity)

> Cut your Unity WebGL build down to a size and memory footprint the portals accept: what to measure, which levers pay, and what the Optimizer window does for you.

## Why this matters

Every target platform enforces its own download budget and memory ceiling for a WebGL build, and those limits are checked at upload, not at review. A build that misses them is rejected outright, with the rejection reason pointing at the platform's own rules rather than at anything in this SDK. See each platform's upload requirements page for the exact numbers your build has to clear; they differ per platform and are kept there, not duplicated here, so they never go stale on this page.

The levers on this page (build settings, texture and audio import, code stripping, Addressables) are the same regardless of which platform you ship to. Fix them once and every target benefits.

## Measure before you cut

Guessing which asset or setting is bloating your build wastes a day; the actual numbers take about a minute to pull:

- **The Build Report.** After any WebGL build, `Window > Analysis > Build Profile` (or the report emitted alongside the build) breaks the output down by asset and by category. This is the ground truth for where your bytes are.
- **The tail of `Editor.log`.** Unity prints a size summary for the last build here, including the split between the WASM code, the managed DLLs, and the data file. Useful when you don't have the Build Report window open, or you're comparing two builds from CI.
- **The Optimizer window's Analyze pass.** `Yes2SDK > Optimizer` runs a read-only scan over your project and reports which of the checks below are currently failing, without changing anything. Run this first, then work down the list it produces instead of guessing at what to fix.

## Build settings

This is the fastest, lowest-risk win, and it is already documented in full at [WebGL Build Settings](/docs/unity-webgl-build-settings): compression format, exception support, managed stripping level, and the required WebGL template. That page owns the table of recommended values and why each one matters; this page just points at it so the two never drift out of sync.

Apply them via `Yes2SDK > Build Window > WebGL Settings > Reset to recommended`. The Optimizer's Build Settings check reads the same `PlayerSettings` values that button writes, and reports drift against them, so a project that has run "Reset to recommended" before its last release build will pass this check automatically.

## Code and stripping

**Managed stripping level** — removes unused types and methods from your managed assemblies at IL2CPP build time. Unity's [Managed code stripping](https://docs.unity3d.com/Manual/ManagedCodeStripping.html) page documents exactly what each level removes.

| Level | What it's for | |
|---|---|---|
| `Disabled` | Ships every type in every referenced assembly. The single biggest avoidable contributor to managed code size | |
| `Medium` | Strips unused code while leaving most reflection-reachable types alone | **Recommended** |
| `High` | Strips further, at a higher chance of removing something a library reaches only through reflection. Test a `High` build before shipping it | |

**IL2CPP code generation** — how much native code the [IL2CPP backend](https://docs.unity3d.com/Manual/IL2CPP.html) emits from your managed assemblies.

| Option | What it's for | |
|---|---|---|
| `Faster (smaller) builds` | Less native code, at a modest runtime cost WebGL games rarely notice | **Recommended** |
| `Faster runtime` | Maximum runtime speed, at a larger build. Choose it only when profiling says the runtime cost is real | |

**Exception support** — each step up adds real code size and runtime cost, because the compiler has to emit unwinding and stack-tracking logic.

| Option | What it's for | |
|---|---|---|
| `None` | Smallest output. Crashes instead of throwing if anything in your dependency graph relies on catching | |
| `Explicitly Thrown Exceptions Only` | The usual floor for third-party libraries that use `try`/`catch` as control flow | **Recommended** |
| `Full With Stack Trace` | Readable stack traces in a shipped build, at the largest size and runtime cost | |

Three more levers here are on-or-off rather than a choice between named options:

- **Engine module stripping.** `Project Settings > Player > Other Settings > Strip Engine Code`, combined with the Unity feature detection that runs at build time, drops entire engine subsystems (physics, particle systems, video) your project never references. It only works if nothing in your code path references the subsystem, including through reflection or a `Resources`-loaded asset that pulls it in indirectly.
- **`link.xml` as a footgun.** A `link.xml` that preserves a whole assembly (`<assembly fullname="..." preserve="all"/>`) silences stripping for everything in it, often to work around one type that needed to survive. Scope the entry to the specific type or method instead, or the assembly stops shrinking no matter how aggressive your stripping level is.
- **The managed-DLL size table.** The Build Report (see above) lists every managed assembly and its stripped size. Read it after any stripping-level or `link.xml` change; it is the fastest way to see whether the change actually did anything.

## Textures

Textures are the single biggest lever in nearly every WebGL project, usually by a wide margin over code size. Every setting below lives on the texture's import inspector, documented field by field in Unity's [Texture Import Settings](https://docs.unity3d.com/Manual/class-TextureImporter.html) reference.

| Setting | What it's for | Set it to |
|---|---|---|
| Max Size | Caps the shipped resolution per platform. Unity otherwise ships whatever the source asset is, so a 4K source drawn at 128px is pure waste | Whatever size it is actually drawn at |
| Compression format | A GPU-native compressed format costs far less than an uncompressed one at a visually similar quality | Compressed, except 1-bit masks and lookup textures that artifacts would break |
| Crunch compression | Compresses the already-compressed format further for storage and download, decompressing back to the GPU format at load time | On for textures that are large on disk and rarely change |
| Generate Mip Maps | Only pays off for a texture viewed at varying distance in 3D. A UI sprite at a fixed size carries mip data it never samples, roughly a third of its memory | Off for UI and 2D sprites |
| Read/Write Enabled | Keeps a CPU-side copy alongside the GPU copy, roughly doubling memory cost | Off, unless a script genuinely reads the texture back |
| Source dimensions | A non-power-of-two texture Unity pads or resizes at import can end up larger in memory than its file suggests | A power of two where practical; otherwise read the inspector's in-memory size rather than assuming |

### Sprite atlases

A loose sprite (one not packed into a [Sprite Atlas](https://docs.unity3d.com/Manual/class-SpriteAtlas.html)) costs a draw call of its own whenever it's on screen alongside other loose sprites, and its texture is padded up to the next power-of-two size in memory regardless of its actual dimensions. Packing related sprites into a Sprite Atlas shares one texture and one set of draw calls across all of them, and packs tightly instead of padding each one individually.

The Optimizer's Sprite Atlases check scans your project for sprites that aren't a member of any Sprite Atlas and flags them. Where it finds a natural grouping (sprites already sharing a folder, or already referenced together by the same prefab), it can create a new Sprite Atlas asset and assign them to it; it will not merge sprites into an atlas that already exists without confirming the change first, and the dry-run listing shows exactly which sprites move before anything is written.

### Texture compression (KTX2)

KTX2 with Basis Universal compression is a texture format that stays compressed on the GPU and compresses far better than the platform-native formats (DXT, ETC, ASTC) at a comparable visual quality, which is why it's worth converting your largest textures to it for WebGL specifically. Producing a KTX2 file requires the `toktx` command-line tool from the KTX-Software project to be on your machine's `PATH`; Unity itself doesn't ship an encoder for it.

If `toktx` isn't found on `PATH`, the Optimizer's KTX2 check reports this as an advisory rather than a failure, and does nothing further: it will not attempt to convert anything without the tool available, and it will not block your build over a missing optional tool. Install `toktx`, confirm it resolves from a terminal, then re-run the check to get real findings instead of the advisory.

### Texture references

Converting a texture to KTX2 produces a new asset; it does not retarget the scenes, prefabs, and materials that already reference the original texture. Left alone, you end up shipping both the old texture and the new one, with nothing actually using the smaller file.

The Optimizer reports which scene and prefab references still point at a texture that has a converted counterpart, so you know exactly what to repoint. It does not rewrite those scenes or prefabs for you. A scene or prefab edit changes gameplay-visible content and can conflict with version control or in-flight work in ways a texture import setting never does, so it is treated as a decision for you to make per object, not something a bulk fix-all button should do silently.

## Audio

Every setting below is on the clip's import inspector, documented field by field in Unity's [Audio Clip](https://docs.unity3d.com/Manual/class-AudioClip.html) reference.

| Setting | What it's for | Set it to |
|---|---|---|
| Force To Mono | Halves decoded size for anything that doesn't need stereo separation | On for most SFX and for music that isn't mixed for stereo |
| Vorbis quality | Trades file size against audible fidelity. Most game audio doesn't need the default's headroom | A few notches below default on non-critical assets |
| Sample rate override | A file recorded at a high rate but played back as ambience or a low-fidelity effect downsamples with no audible difference | Overridden down wherever the source rate exceeds what's audible |

**Load type** is the one that costs the most when it's wrong, and the right answer depends on clip length:

| Option | What it's for | Use it for |
|---|---|---|
| `Decompress On Load` | Decodes once at load, so playback carries zero decode overhead but the clip is fully resident | Short SFX: footsteps, UI clicks, hits |
| `Streaming` | Reads from disk during playback, so the whole file is never resident at once | Music and ambience |

Using `Decompress On Load` for a music track is the common, expensive mistake. These are all cheap wins almost every project leaves on the table, because the defaults favor fidelity over size and nobody revisits audio import after the first pass.

## Meshes and models

These live on the model's import inspector, documented in Unity's [Model Import Settings](https://docs.unity3d.com/Manual/FBXImporter-Model.html) reference.

| Setting | What it's for | Set it to |
|---|---|---|
| Mesh Compression | Quantizes vertex data. `Off` ships full precision; `Low`, `Medium`, `High` progressively quantize | `Medium`, which most meshes tolerate with no visible difference |
| Read/Write Enabled | Keeps a CPU-side copy alive for scripts that query or modify geometry at runtime | Off, unless something genuinely reads mesh data back |
| Optimize Mesh Data | Strips vertex channels (unused UV sets, vertex colors, tangents) that no active shader consumes | On, broadly. It removes data you were shipping for no reason |
| Animation Type | A static prop imported with its full rig, skin, and clips still attached ships all of that unused data | `None` for anything that never animates |
| Blend shapes and tangents | Only needed by blend-shape animation and by normal mapping that needs tangent space | Off on any model that uses neither |

## Shaders

Shader variants multiply fast: every keyword combination your project touches (per light type, per shadow setting, per platform quality tier) can produce a separate compiled variant, and WebGL has to compile or fetch each one the first time it's needed. [Shader stripping](https://docs.unity3d.com/Manual/shader-variant-stripping.html) (`Project Settings > Graphics > Shader Stripping`) removes variants for keyword combinations your build never actually requests, and is worth configuring deliberately rather than leaving at the default. Audit the `Always Included Shaders` list too: a shader added there compiles all of its variants unconditionally, even if nothing in your scenes uses it. Trimming your quality tiers down to the ones you actually ship reduces the variant count further, since Unity compiles per active tier.

On WebGL specifically, shader compilation happens on the player's machine, so a large uncompiled variant set is also first-frame time, not just download size. A project that trims its variants sees a faster time-to-interactive as well as a smaller build.

## Packages and assemblies

- **Unreferenced packages.** A package sitting in the manifest that nothing in your project actually calls still ships its runtime code (and, for WebGL, its jslib and plugin footprint) in the build. Periodically check the manifest against what's actually used and remove what isn't.
- **Everything in `Assembly-CSharp`.** Code that lives entirely in the default assembly recompiles as a single unit on every change and gets no assembly-level stripping boundary. Splitting your own code into [assembly definitions](https://docs.unity3d.com/Manual/ScriptCompilationAssemblyDefinitionFiles.html) doesn't shrink a build by itself, but it makes stripping and incremental builds far more effective, because unreferenced assemblies can be dropped wholesale instead of relying on per-symbol stripping to find dead code inside one enormous assembly.
## Resources folders

Every asset under a [`Resources`](https://docs.unity3d.com/Manual/SpecialFolders.html) folder ships in the build whether anything loads it or not. Unity can't statically prove what a runtime `Resources.Load("some/path")` call will ask for, so it has to assume every asset in there might be asked for, and packs all of them. Worse, `Resources` content lands in the *initial* download rather than in a bundle fetched later, so an unused prefab in there is time the player waits before the first frame.

A `Resources` folder that accumulated assets over a project's lifetime is a common and invisible source of bloat, because nothing in the editor marks those assets as shipped. The folder is also special by name, not by location: `Assets/Resources`, `Assets/Art/Resources`, and any other `Resources` folder anywhere under `Assets` all behave the same way, so a project usually has more of them than anyone remembers. The one exception is a `Resources` folder underneath an `Editor` folder, which is editor-only and never reaches a build.

Moving an asset out changes how it loads, so there is no single mechanical fix:

| What's loading it | Move it to |
|---|---|
| Nothing, it's left over | Delete it, or move it anywhere else under `Assets` |
| One scene or prefab that could just reference it | A direct serialized reference on the object that uses it, which lets Unity strip it when nothing references it |
| Code that picks an asset by name at runtime | [Addressables](#addressables), which keeps the load-by-key pattern but moves the content out of the initial download |

Auditing this is worth doing periodically rather than once. The Optimizer's `resources-folders` check lists what's currently in there, but it deliberately stops at reporting: only your own code knows which of the three destinations above is the right one.

## Missing script references

A component whose script no longer resolves shows in the inspector as `The associated script can not be loaded`. It happens when a script is deleted, renamed without its meta file, or moved between assemblies. The object keeps the serialized component entry, complete with the values that were set on it, and the build writes all of that out to a script that will never load.

The size cost is small. The real cost is behavioral: the object silently doesn't do the thing it was configured to do, and it fails at runtime rather than at build time. A prefab that half-works in a build but works in the editor is very often this.

Finding them by hand is unpleasant because a broken component only announces itself when you select the object. [`GameObjectUtility.GetMonoBehavioursWithMissingScriptCount`](https://docs.unity3d.com/ScriptReference/GameObjectUtility.GetMonoBehavioursWithMissingScriptCount.html) is what an editor script uses to sweep for them, and it is what the Optimizer's `missing-script-references` check calls. That check scans every prefab under `Assets` plus the currently open scene; it doesn't force other scenes open, because opening a scene would discard whatever is unsaved in the one you're in.

It reports rather than fixes, deliberately. Unity offers `Remove Monobehaviours with Missing Script` on the object's context menu, but dropping the component is only the right answer once you've decided the behaviour is genuinely gone. If the script was moved or renamed, restoring it keeps the values that were configured on it, and removing the component throws them away.

## Addressables

If your Build Report shows the *initial* download as the bottleneck rather than the total build size, [Addressables](https://docs.unity3d.com/Packages/com.unity.addressables@latest) is the answer: it moves content out of the main build and into asset bundles fetched on demand, so the initial download only needs what's required to reach the first playable frame.

Bundle compression is the one setting with a clear WebGL answer:

| Compression | What it's for | |
|---|---|---|
| `LZ4` | Decompresses fast enough that a WebGL runtime doesn't stall noticeably fetching a group mid-play | **Recommended** for content loaded during active play |
| `LZMA` | Compresses smaller, decompresses slower. Fine where the extra time is paid once and nobody is waiting on a frame | Content fetched once up front |
| `Uncompressed` | No decompression cost, largest download | Rarely worth it over the network |

The rest is layout and hygiene:

- **Group layout.** Group content by what loads together (a level's assets in one group, not scattered across groups keyed by asset type), so a single content fetch pulls everything a scene needs in one request instead of many small ones.
- **Duplicate assets across groups.** A texture or prefab referenced by two different Addressable groups gets duplicated into both bundles unless you either share it explicitly or let the Addressables build analyze rules catch it. Run the built-in duplicate-asset analyze rule before shipping; it's the fastest way to find bytes you're paying for twice.
- **What changes about the first-frame path.** Once content is moved to Addressables, your loading screen has to actually wait on the relevant `Addressables.LoadAssetAsync` calls before proceeding, rather than assuming everything is already resident because it shipped in the main build. Projects that adopt Addressables without auditing their loading code often end up with a smaller download and the same time-to-interactive, because they were never actually waiting on the assets they moved.

If your project hasn't installed the Addressables package yet, none of the checks above apply until it does; there's no cost to leaving them for later if your initial download is already inside budget.

## Memory and runtime

- **Initial memory size and heap growth.** WebGL's heap is a fixed-size `ArrayBuffer` that has to be sized up front (Unity's [memory in Unity Web](https://docs.unity3d.com/Manual/webgl-memory.html) page covers how the runtime lays it out); too small and the runtime has to grow and reallocate it during play, which is a visible stall. Set `Player Settings > Publishing Settings > Memory Size` based on what your Build Report and in-play profiling actually show you using, with headroom, rather than leaving the default.
- **GC allocation in `Update`.** Every allocation inside a per-frame method eventually triggers a garbage collection pass, and WebGL's GC pauses are typically longer and more visible than a native build's. Look for allocations from LINQ, string concatenation, boxing, or `new` calls inside `Update`, `FixedUpdate`, and anything called from them, and hoist them out to run once instead of every frame.
- **`targetFrameRate` on WebGL.** Leaving `Application.targetFrameRate` at `-1` (uncapped) lets the game loop run as fast as the browser will schedule it, burning CPU (and battery on mobile browsers) for no visual benefit past the display's refresh rate. Cap it explicitly.
- **Physics tick rate.** `Fixed Timestep` set lower than your game actually needs runs physics more often than necessary. If your gameplay doesn't need a fine-grained simulation, raising it reduces CPU work every frame.
- **Canvas rebuild storms.** A Unity UI Canvas rebuilds its entire layout whenever any element inside it changes, not just the one that changed. A single Canvas holding a large, frequently-updated UI (a HUD with a live counter, for instance) can trigger far more rebuild work than expected; splitting a frequently-updated element into its own Canvas isolates the rebuild to just that subtree.
- **Device pixel ratio.** Rendering at the browser's full device pixel ratio on a high-DPI display can multiply your fill-rate cost several times over for a difference many players won't notice on a small canvas. Capping the effective render resolution below the device's native ratio is often the cheapest fill-rate win available.

## Pre-upload checklist

Walk this before every release build.

| Check | Section | Optimizer check |
|---|---|---|
| WebGL build settings match the pipeline defaults | [Build settings](#build-settings) | `build-settings` |
| Loose sprites are packed into atlases | [Sprite atlases](#sprite-atlases) | `sprite-atlases` |
| Large textures are converted to KTX2 | [Texture compression (KTX2)](#texture-compression-ktx2) | `texture-compression-ktx2` |
| Scene and prefab references point at the converted textures | [Texture references](#texture-references) | `texture-references` |
| Read/Write is off on textures nothing reads back | [Textures](#textures) | `readable-textures` |
| Mipmaps are off on sprites drawn at a fixed size | [Textures](#textures) | `texture-mipmaps` |
| Managed stripping and exception support are set deliberately | [Code and stripping](#code-and-stripping) | - |
| Audio import (mono, load type, quality) matches clip usage | [Audio](#audio) | `audio-import-settings` |
| Read/Write is off on meshes nothing reads back | [Meshes and models](#meshes-and-models) | `readable-meshes` |
| Mesh import (compression, unused channels) is trimmed | [Meshes and models](#meshes-and-models) | - |
| Shader variants and Always Included Shaders are audited | [Shaders](#shaders) | - |
| The manifest carries only what's actually used | [Packages and assemblies](#packages-and-assemblies) | - |
| `Resources` folders carry only what's genuinely loaded by name | [Resources folders](#resources-folders) | `resources-folders` |
| No object carries a component whose script is missing | [Missing script references](#missing-script-references) | `missing-script-references` |
| Runtime settings (frame rate, GC pressure, memory size) are checked in play mode | [Memory and runtime](#memory-and-runtime) | - |

Rows for the remaining sections are added as their checks ship. A row with no check yet leaves the third column as a dash, never a promise of a check that does not exist.
