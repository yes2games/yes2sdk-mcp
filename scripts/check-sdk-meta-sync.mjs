#!/usr/bin/env node
// Verifies the committed src/lib/sdk-meta.ts matches what sync-sdk-meta would
// produce from the engine SDK repos. Drift means an engine SDK released a new
// version without `npm run sync-sdk-meta` being re-run, so get_install_instructions
// and detect_sdk hand developers a stale pinned version to install.
//
// Requires the engine SDK repos checked out as siblings under the workspace SDK
// directory — the documented layout. It does NOT clone anything (ADR-0010): an
// isolated CI runner without those PRIVATE repos cannot run this. Run it locally
// before committing, and after every engine SDK release.
//
//   exit 0 — in sync
//   exit 1 — drift: re-run `npm run sync-sdk-meta` and commit the result
//   exit 2 — engine SDK sources missing: check them out as siblings

import fs from "node:fs";
import { generate, sourcesExist, SDK_WORKSPACE, DESTINATION } from "./sync-sdk-meta.mjs";

// Normalize CRLF -> LF so a Windows checkout does not read as drift against the
// LF the generator emits.
const lf = (s) => s.replace(/\r\n/g, "\n");

if (!sourcesExist()) {
  console.error(`[check-sdk-meta-sync] engine SDK sources not found under ${SDK_WORKSPACE}`);
  console.error("[check-sdk-meta-sync] check out the engine SDK repos as siblings, then retry.");
  process.exit(2);
}

const { out, unityVersion, defoldVersion } = generate();
const have = fs.existsSync(DESTINATION) ? fs.readFileSync(DESTINATION, "utf-8") : "";

if (lf(have) !== lf(out)) {
  console.error(`[check-sdk-meta-sync] STALE: ${DESTINATION}`);
  console.error(
    `[check-sdk-meta-sync] engine SDK sources are at unity v${unityVersion}, defold v${defoldVersion}.`,
  );
  console.error("[check-sdk-meta-sync] run `npm run sync-sdk-meta` and commit the result.");
  process.exit(1);
}

console.log(
  `[check-sdk-meta-sync] OK — sdk-meta.ts matches unity v${unityVersion}, defold v${defoldVersion}.`,
);
