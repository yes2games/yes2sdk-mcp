<!-- Generated file, do not edit. Run `npm run sync-platform-reqs` (from api/). Source of truth: api/src/utils/platform-requirements.ts -->

## Build & Upload Limits

- **Total size:** 250 MB
- **Initial download:** 50 MB (≤20 MB to qualify for the mobile homepage)
- **File count:** 1500 files
- **Max per-file:** ⚠️ Not published; verify in portal
- **Entry point:** index.html
- **Paths:** relative paths only, never absolute
- **External requests:** allowed, but must reach gameplay within ~20 seconds
- **Compression:** Brotli recommended over gzip
- **Persistence:** localStorage available
- **Canvas:** landscape on desktop; consistent resolution; runs on 4 GB Chromebook
- **Review:** QA team review; PEGI 12; English localization mandatory

**Sources:**
- https://docs.crazygames.com/requirements/technical/
- https://docs.crazygames.com/requirements/quality/
- https://docs.crazygames.com/resources/optimization-tips/
