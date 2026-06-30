<!-- Generated file — do not edit. Run `npm run sync-platform-reqs` (from api/). Source of truth: api/src/utils/platform-requirements.ts -->

## Build & Upload Limits

- **Total size:** 250 MiB
- **Initial download:** 30 MiB (SHOULD be <15 MiB)
- **File count:** 8000 files
- **Max per-file:** 30 MiB (SHOULD be <512 KiB per file)
- **Entry point:** index.html
- **Paths:** relative paths only; filenames limited to [A-Za-z0-9_-.]
- **External requests:** forbidden — no off-platform network
- **Compression:** not documented by Google
- **Persistence:** SDK saveData only; <3 MiB total, ~64 KiB practical per-save cap
- **Canvas:** all aspect ratios, lock nothing; peak JS heap <512 MB
- **Review:** early-access, application-gated; SDK must load before game code; firstFrameReady() then gameReady()

**Sources:**
- https://developers.google.com/youtube/gaming/playables/certification/requirements_stability
- https://developers.google.com/youtube/gaming/playables/certification/requirements_integration
- https://developers.google.com/youtube/gaming/playables/certification/requirements_design
- https://developers.google.com/youtube/gaming/playables/reference/sdk
