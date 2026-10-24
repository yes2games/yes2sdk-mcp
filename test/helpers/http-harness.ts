/**
 * Shared harness for the HTTP-level OAuth tests: a stub dashboard, a spawned
 * MCP HTTP server, and the request matrix whose phase 1 answers are recorded in
 * test/fixtures/phase1-http.json.
 *
 * Not a test file itself (no .test.ts suffix). capture-phase1.ts uses it to
 * record the fixture against a build of origin/main; phase1-parity.test.ts
 * replays it against this branch with MCP_OAUTH_ENABLED off.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";

export const ALL_SCOPES = ["games:read", "games:write", "builds:write"];

/** Credentials the stub dashboard recognises. */
export const CREDS = {
  key: "y2g_HarnessKey_1",
  revokedKey: "y2g_RevokedKey_1",
  oauthValid: "y2a_ValidToken_1",
  oauthExpired: "y2a_ExpiredToken_1",
  oauthReadOnly: "y2a_ReadOnlyToken_1",
  oauthWhoamiDown: "y2a_WhoamiDown_1",
  oauthWhoamiSlow: "y2a_WhoamiSlow_1",
} as const;

export interface StubCall {
  method: string;
  url: string;
  authorization: string | undefined;
}

export interface StubDashboard {
  url: string;
  calls: StubCall[];
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * A stand-in for the dashboard's /api/v1. `whoami` answers per token; the
 * tool routes answer 401 for revoked or expired credentials, 503 while
 * "whoami is down", and a fixed success otherwise.
 */
export async function startStubDashboard(port = 0): Promise<StubDashboard> {
  const calls: StubCall[] = [];
  const server: Server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
    const auth = req.headers.authorization;
    calls.push({ method: req.method ?? "", url: req.url ?? "", authorization: auth });
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    const path = (req.url ?? "").replace(/^\/api\/v1/, "");

    if (token === CREDS.revokedKey || token === CREDS.oauthExpired) {
      json(res, 401, { success: false, error: "Invalid API key", code: "INVALID_API_KEY" });
      return;
    }
    if (token === CREDS.oauthWhoamiDown) {
      json(res, 503, { success: false, error: "Service unavailable" });
      return;
    }
    if (path === "/whoami") {
      if (token === CREDS.oauthWhoamiSlow) {
        // Never answers inside the MCP's 5 s pre-check budget.
        setTimeout(() => json(res, 200, { success: true, data: { scopes: ALL_SCOPES } }), 7_000);
        return;
      }
      const scopes = token === CREDS.oauthReadOnly ? ["games:read"] : ALL_SCOPES;
      json(res, 200, { success: true, data: { kind: token.startsWith("y2a_") ? "oauth" : "key", scopes } });
      return;
    }
    if (path === "/games" && req.method === "GET") {
      json(res, 200, { success: true, data: [{ id: "g-stub", name: "Stub Game", engine: "unity", buildCount: 0 }] });
      return;
    }
    if (path === "/games" && req.method === "POST") {
      json(res, 201, { success: true, data: { id: "g-new", name: "New Game", engine: "unity" } });
      return;
    }
    json(res, 404, { success: false, error: "Not found", code: "NOT_FOUND" });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}/api/v1`,
    calls,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export interface RunningServer {
  base: string;
  stderr: () => string;
  stop(): Promise<void>;
}

/**
 * Spawn an MCP HTTP server entry (`node <args>`) on `port` and wait for its
 * ready line. `env` is layered over a copy of process.env without
 * MCP_OAUTH_ENABLED, so a test states the flag explicitly.
 */
export async function startServer(args: string[], port: number, env: Record<string, string | undefined>, cwd: string): Promise<RunningServer> {
  const baseEnv: Record<string, string | undefined> = { ...process.env };
  delete baseEnv.MCP_OAUTH_ENABLED;
  delete baseEnv.MCP_ALLOWED_ORIGINS;
  delete baseEnv.OPENAI_APPS_CHALLENGE;
  const child: ChildProcess = spawn(process.execPath, args, {
    env: { ...baseEnv, PORT: String(port), ...env },
    cwd,
  });
  let stderr = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server on ${port} did not start: ${stderr}`)), 20_000);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes(`listening on 0.0.0.0:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server on ${port} exited with ${code}: ${stderr}`));
    });
  });
  return {
    base: `http://127.0.0.1:${port}`,
    stderr: () => stderr,
    stop: async () => {
      if (child.exitCode !== null) return;
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill();
      await exited;
    },
  };
}

export const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
} as const;

let nextId = 1;

export function rpc(method: string, params: Record<string, unknown> = {}): Record<string, unknown> {
  return { jsonrpc: "2.0", id: nextId++, method, params };
}

export function callTool(name: string, args: Record<string, unknown> = {}): Record<string, unknown> {
  return rpc("tools/call", { name, arguments: args });
}

export const INITIALIZE = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "harness", version: "0" },
};

export interface MatrixEntry {
  name: string;
  method: "GET" | "POST" | "OPTIONS";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** Every request whose phase 1 answer the flag-off server must reproduce exactly. */
export function parityMatrix(): MatrixEntry[] {
  // Fixed ids so the recorded bodies are comparable run to run.
  let id = 1000;
  const call = (name: string, args: Record<string, unknown> = {}) => ({
    jsonrpc: "2.0",
    id: id++,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const post = (name: string, body: unknown, headers: Record<string, string> = {}): MatrixEntry => ({
    name,
    method: "POST",
    path: "/mcp",
    headers: { ...MCP_HEADERS, ...headers },
    body,
  });
  return [
    post("initialize, no auth", { jsonrpc: "2.0", id: 1, method: "initialize", params: INITIALIZE }),
    post("initialize, foreign bearer", { jsonrpc: "2.0", id: 2, method: "initialize", params: INITIALIZE }, bearer("sk-foreign")),
    post("tools/list, no auth", { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    post("tools/list, y2a_ bearer", { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} }, bearer(CREDS.oauthValid)),
    post("search_docs, no auth", call("search_docs", { query: "rewarded ad" })),
    post("search_docs, garbage bearer", call("search_docs", { query: "rewarded ad" }), bearer("garbage")),
    post("get_compliance_rule, expired y2a_", call("get_compliance_rule", { ruleId: "poki-ads-1" }), bearer(CREDS.oauthExpired)),
    post("list_games, no auth", call("list_games")),
    post("list_games, y2g_ bearer", call("list_games"), bearer(CREDS.key)),
    post("list_games, y2g_ in X-Yes2-Api-Key", call("list_games"), { "X-Yes2-Api-Key": CREDS.key }),
    post("list_games, empty Bearer + X-Yes2-Api-Key", call("list_games"), { Authorization: "Bearer", "X-Yes2-Api-Key": CREDS.key }),
    post("list_games, revoked y2g_", call("list_games"), bearer(CREDS.revokedKey)),
    post("list_games, y2a_ bearer", call("list_games"), bearer(CREDS.oauthValid)),
    post("list_games, foreign bearer", call("list_games"), bearer("sk-foreign")),
    post("list_games, malformed X-Yes2-Api-Key", call("list_games"), { "X-Yes2-Api-Key": "nope" }),
    post("create_game, y2g_ bearer", call("create_game", { name: "New Game", engine: "unity" }), bearer(CREDS.key)),
    post("create_game, no auth", call("create_game", { name: "New Game", engine: "unity" })),
    post("set_game_image, y2g_ bearer", call("set_game_image", { gameId: "g1", kind: "icon" }), bearer(CREDS.key)),
    post("prepare_upload, no auth", call("prepare_upload", { gameId: "g1", version: "1.0.0", size: 10 })),
    post("batch with a dashboard call, no auth", [call("list_games"), call("search_docs", { query: "ads" })]),
    { name: "GET path-suffixed PRM", method: "GET", path: "/.well-known/oauth-protected-resource/mcp" },
    { name: "GET root PRM", method: "GET", path: "/.well-known/oauth-protected-resource" },
    { name: "OPTIONS path-suffixed PRM", method: "OPTIONS", path: "/.well-known/oauth-protected-resource/mcp" },
    { name: "OPTIONS /mcp", method: "OPTIONS", path: "/mcp" },
    { name: "GET /mcp", method: "GET", path: "/mcp" },
    { name: "GET /health", method: "GET", path: "/health" },
    { name: "GET /robots.txt", method: "GET", path: "/robots.txt" },
  ];
}

export interface Recorded {
  name: string;
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Send one entry and keep everything but the Date header. */
export async function record(base: string, entry: MatrixEntry): Promise<Recorded> {
  const res = await fetch(`${base}${entry.path}`, {
    method: entry.method,
    headers: entry.headers,
    body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    if (key !== "date") headers[key] = value;
  });
  return { name: entry.name, status: res.status, headers, body: await res.text() };
}

export async function recordMatrix(base: string): Promise<Recorded[]> {
  const out: Recorded[] = [];
  for (const entry of parityMatrix()) out.push(await record(base, entry));
  return out;
}
