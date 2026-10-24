import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordMatrix, startServer, startStubDashboard, type Recorded, type StubCall, type StubDashboard } from "./helpers/http-harness.js";
import { PARITY_PORTS } from "./helpers/parity-ports.js";

/**
 * MCP_OAUTH_ENABLED off must be phase 1 byte for byte. The fixture holds what
 * the phase 1 server (origin/main at cd112ee, before the OAuth gate) answered
 * to every request in the matrix (status, every header but Date, the raw body)
 * and what it forwarded to the dashboard. This branch must reproduce all of it
 * with the flag unset and with it set to 0. See helpers/capture-phase1.ts.
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
