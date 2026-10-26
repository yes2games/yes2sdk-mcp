import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordMatrix, startServer, startStubDashboard, type Recorded, type StubCall, type StubDashboard } from "./helpers/http-harness.js";
import { PARITY_PORTS } from "./helpers/parity-ports.js";

/**
 * MCP_OAUTH_ENABLED off must be phase 1 byte for byte. The fixture holds what
 * the flag-off server answered to every request in the matrix (status, every
 * header but Date, the raw body) and what it forwarded to the dashboard. This
 * branch must reproduce all of it with the flag unset and with it set to 0.
 *
 * Provenance: first recorded from origin/main at cd112ee (before the OAuth
 * gate). It was re-recorded once when set_game_image moved to the presigned
 * image upload and finalize_image_upload was added, a change that does not
 * depend on the flag. Diffed against the cd112ee recording, the only changes
 * were the "Editing a game" instructions line, the set_game_image and
 * finalize_image_upload tool entries and calls, and two JSON-RPC ids shifted
 * by the inserted matrix rows. It was re-recorded again when the image
 * upload URL lifetime went from 15 to 10 minutes; that diff was only
 * "15 minutes" -> "10 minutes" in tools/list and the set_game_image answer.
 * It was re-recorded again when preview accounts moved to unlimited games
 * and one replaced build per game (yes2dashboard#887); that diff was only the
 * preview-rule sentence added to prepare_upload's description in tools/list,
 * and the matching content-length. It was re-recorded again for the 0.4.0
 * release; that diff was only serverInfo.version ("0.3.2" -> "0.4.0") in the
 * two initialize answers.
 * See helpers/capture-phase1.ts.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const fixture = JSON.parse(readFileSync(path.join(HERE, "fixtures", "phase1-http.json"), "utf8")) as {
  responses: Recorded[];
  dashboardCalls: StubCall[];
};

let stub: StubDashboard;

beforeAll(async () => {
  stub = await startStubDashboard(PARITY_PORTS.stub);
}, 30_000);

afterAll(async () => {
  await stub.close();
});

describe.each([
  ["unset", undefined, PARITY_PORTS.server],
  ["0", "0", PARITY_PORTS.server - 2],
])("MCP_OAUTH_ENABLED %s is phase 1 byte for byte", (_label, flag, port) => {
  it("answers every request in the matrix exactly as phase 1 did, and forwards the same dashboard calls", async () => {
    stub.calls.length = 0;
    const server = await startServer(["--import", "tsx", "src/http.ts"], port, { DASHBOARD_API_URL: stub.url, MCP_OAUTH_ENABLED: flag }, REPO);
    try {
      const responses = await recordMatrix(server.base);
      expect(responses.map((r) => r.name)).toEqual(fixture.responses.map((r) => r.name));
      for (let i = 0; i < responses.length; i++) {
        expect(responses[i], responses[i].name).toEqual(fixture.responses[i]);
      }
      // No whoami pre-check, and every credential forwarded exactly as before.
      expect(stub.calls).toEqual(fixture.dashboardCalls);
    } finally {
      await server.stop();
    }
  }, 60_000);
});
