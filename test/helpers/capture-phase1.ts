/**
 * Records test/fixtures/phase1-http.json: the phase 1 server's answers to the
 * parity matrix, plus what it forwarded to the dashboard. Run it against a
 * build of the commit before the OAuth gate (origin/main at cd112ee):
 *
 *   git worktree add /tmp/phase1 cd112ee && (cd /tmp/phase1 && npm ci && npm run build)
 *   npx tsx test/helpers/capture-phase1.ts /tmp/phase1
 *
 * phase1-parity.test.ts replays the same matrix against this branch with
 * MCP_OAUTH_ENABLED off and requires identical output.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordMatrix, startServer, startStubDashboard } from "./http-harness.js";
import { PARITY_PORTS } from "./parity-ports.js";

const root = process.argv[2];
if (!root) {
  process.stderr.write("usage: tsx test/helpers/capture-phase1.ts <phase1 checkout with dist/>\n");
  process.exit(2);
}
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "fixtures", "phase1-http.json");

const stub = await startStubDashboard(PARITY_PORTS.stub);
const server = await startServer([path.join(root, "dist", "http.js")], PARITY_PORTS.server, { DASHBOARD_API_URL: stub.url }, root);
try {
  const responses = await recordMatrix(server.base);
  writeFileSync(OUT, `${JSON.stringify({ responses, dashboardCalls: stub.calls }, null, 2)}\n`);
  process.stdout.write(`wrote ${responses.length} responses and ${stub.calls.length} dashboard calls to ${OUT}\n`);
} finally {
  await server.stop();
  await stub.close();
}
