<!-- Generated file, do not edit. Run `npm run sync-platform-reqs` (from api/). Source of truth: api/src/utils/platform-requirements.ts -->

## Build & Upload Limits

- **Total size:** 100 MB (uncompressed total; zip must extract to ≤100 MB)
- **Initial download:** ⚠️ Not published; verify in portal
- **File count:** ⚠️ Not published; verify in portal
- **Max per-file:** ⚠️ Not published; verify in portal
- **Entry point:** index.html at archive root
- **Paths:** relative paths; no spaces or Cyrillic characters in file/folder names
- **External requests:** external hosts must be whitelisted in console; https/wss only
- **Compression:** Brotli/Gzip with Decompression Fallback ENABLED (cannot set Content-Encoding on Yandex hosting), or Disabled
- **Persistence:** SDK data API
- **Canvas:** active-area long:short ratio ≤ 1:2; declare orientation; fullscreen on mobile
- **Review:** full moderation 3-5 business days (content-only 1-2)

**Sources:**
- https://yandex.com/dev/games/doc/en/concepts/requirements
- https://yandex.com/dev/games/doc/en/concepts/moderation
- https://yandex.com/dev/games/doc/en/sdk/sdk-about
