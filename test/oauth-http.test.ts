import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_SCOPES,
  CREDS,
  MCP_HEADERS,
  INITIALIZE,
  callTool,
  rpc,
  startServer,
  startStubDashboard,
  type RunningServer,
  type StubDashboard,
} from "./helpers/http-harness.js";

/**
 * The yes2sdk-mcp#108 test matrix with opt-in sign-in, over real HTTP with MCP_OAUTH_ENABLED=1
 * against a stub dashboard (the real whoami and y2a_ tokens are not live yet).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PORT = 8097;

const EXACT_401_CHALLENGE =
  'Bearer error="invalid_token", error_description="Sign in to Yes2 to use dashboard tools", ' +
  'resource_metadata="https://mcp.yes2games.com/.well-known/oauth-protected-resource/mcp", ' +
  'scope="games:read games:write builds:write"';

const NOT_SIGNED_IN =
  "You're not signed in to Yes2. To use dashboard tools, sign in: ask me to 'sign in to Yes2' (I'll call the sign_in tool). In Claude Code, after sign_in run /mcp, pick the Yes2SDK server and choose Authenticate (the dashboard opens in the browser); in claude.ai, a Connect card appears; in Codex, run `codex mcp login yes2sdk`. Alternatively set YES2_API_KEY (y2g_ key) and send it as X-Yes2-Api-Key.";

const EXPECTED_PRM = {
  resource: "https://mcp.yes2games.com/mcp",
  authorization_servers: ["https://dashboard.yes2games.com"],
  scopes_supported: ["games:read", "games:write", "builds:write"],
  bearer_methods_supported: ["header"],
  resource_name: "Yes2 dashboard",
};

let stub: StubDashboard;
let server: RunningServer;

beforeAll(async () => {
  stub = await startStubDashboard();
  server = await startServer(
    ["--import", "tsx", "src/http.ts"],
    PORT,
    { DASHBOARD_API_URL: stub.url, MCP_OAUTH_ENABLED: "1", MCP_ALLOWED_ORIGINS: "https://claude.ai" },
    REPO,
  );
}, 30_000);

afterAll(async () => {
  await server?.stop();
  await stub?.close();
});

async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${server.base}/mcp`, { method: "POST", headers: { ...MCP_HEADERS, ...headers }, body: JSON.stringify(body) });
}

const bearer = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });

/** The tool result inside a 200 SSE or JSON answer. */
async function toolResult(res: Response): Promise<{ text: string; isError: boolean }> {
  const raw = await res.text();
  const json = raw.startsWith("event:") ? raw.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "" : raw;
  const msg = JSON.parse(json) as { result?: { content?: Array<{ text?: string }>; isError?: boolean } };
  return { text: msg.result?.content?.map((c) => c.text ?? "").join("\n") ?? "", isError: msg.result?.isError === true };
}

function whoamiCalls(): number {
  return stub.calls.filter((c) => c.url.endsWith("/whoami")).length;
}

describe("anonymous calls are never gated", () => {
  it("initialize and tools/list with no auth: 200, no challenge", async () => {
    for (const body of [rpc("initialize", INITIALIZE), rpc("tools/list")]) {
      const res = await post(body);
      expect(res.status).toBe(200);
      expect(res.headers.get("www-authenticate")).toBeNull();
      await res.text();
    }
  });

  it("initialize and tools/list ignore a foreign or y2a_ token", async () => {
    stub.calls.length = 0;
    for (const token of ["sk-foreign", CREDS.oauthExpired]) {
      for (const body of [rpc("initialize", INITIALIZE), rpc("tools/list")]) {
        const res = await post(body, bearer(token));
        expect(res.status).toBe(200);
        expect(res.headers.get("www-authenticate")).toBeNull();
        await res.text();
      }
    }
    expect(stub.calls).toHaveLength(0);
  });

  it("a docs tool with no auth: 200, no WWW-Authenticate", async () => {
    const res = await post(callTool("search_docs", { query: "rewarded ad" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    expect((await toolResult(res)).text).toMatch(/matches/);
  });

  it("a docs tool with an expired, foreign or garbage bearer: 200, and the token is ignored", async () => {
    stub.calls.length = 0;
    for (const auth of [bearer(CREDS.oauthExpired), bearer("sk-ant-foreign"), { Authorization: "garbage" }, bearer("y2r_refresh")]) {
      const res = await post(callTool("search_docs", { query: "rewarded ad" }), auth);
      expect(res.status, JSON.stringify(auth)).toBe(200);
      expect(res.headers.get("www-authenticate")).toBeNull();
      await res.text();
    }
    expect(stub.calls).toHaveLength(0);
  });
});

const DASHBOARD_TOOL_NAMES = [
  "list_games",
  "create_game",
  "prepare_upload",
  "finalize_upload",
  "get_build_status",
  "update_game",
  "set_game_image",
  "finalize_image_upload",
  "rename_build",
];

describe("dashboard tools without a credential answer like phase 1, plus the sign-in hint", () => {
  it("no auth: 200, isError, the not-signed-in text, no WWW-Authenticate, nothing sent to the dashboard", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(true);
    expect(text).toBe(NOT_SIGNED_IN);
    expect(stub.calls).toHaveLength(0);
  });

  it("every one of the nine dashboard tools answers 200 with the hint", async () => {
    for (const name of DASHBOARD_TOOL_NAMES) {
      const res = await post(callTool(name, {}));
      expect(res.status, name).toBe(200);
      expect(res.headers.get("www-authenticate"), name).toBeNull();
      const { text, isError } = await toolResult(res);
      expect(isError, name).toBe(true);
      // Input validation can answer first for tools with required arguments;
      // whatever answers, it is a 200 tool result, never a challenge.
      if (name === "list_games") expect(text).toBe(NOT_SIGNED_IN);
    }
  });

  it("a foreign bearer: 200 with the hint", async () => {
    for (const token of ["sk-ant-foreign", "eyJhbGciOiJIUzI1NiJ9.e30.x", "y2r_refreshToken"]) {
      const res = await post(callTool("list_games"), bearer(token));
      expect(res.status, token).toBe(200);
      expect(res.headers.get("www-authenticate")).toBeNull();
      expect((await toolResult(res)).text, token).toBe(NOT_SIGNED_IN);
    }
  });

  it("Authorization wins: a foreign bearer with a valid X-Yes2-Api-Key still gets the hint, not the key", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), { ...bearer("sk-foreign"), "X-Yes2-Api-Key": CREDS.key });
    expect(res.status).toBe(200);
    expect((await toolResult(res)).text).toBe(NOT_SIGNED_IN);
    expect(stub.calls).toHaveLength(0);
  });

  it("a batch with a dashboard call and a docs call: 200", async () => {
    const res = await post([callTool("search_docs", { query: "ads" }), callTool("list_games")]);
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    await res.text();
  });
});

describe("sign_in is the opt-in", () => {
  it("is listed with the product description", async () => {
    const res = await post(rpc("tools/list"));
    const raw = await res.text();
    const json = raw.startsWith("event:") ? raw.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? "" : raw;
    const tools = (JSON.parse(json) as { result: { tools: Array<{ name: string; description?: string; annotations?: Record<string, unknown> }> } }).result.tools;
    expect(tools).toHaveLength(21);
    const signIn = tools.find((t) => t.name === "sign_in");
    expect(signIn?.description).toMatch(/^Sign in to the Yes2 dashboard so dashboard tools \(upload, edit games\) work; only needed for those tools\./);
    expect(signIn?.annotations?.readOnlyHint).toBe(true);
    expect(signIn?.annotations?.idempotentHint).toBe(true);
  });

  it("no auth: 401 with the exact header", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("sign_in"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
    const body = (await res.json()) as { error: string; error_description: string };
    expect(body.error).toBe("invalid_token");
    expect(body.error_description).toContain("codex mcp login yes2sdk");
    expect(body.error_description).toContain("Or set YES2_API_KEY");
    expect(stub.calls).toHaveLength(0);
  });

  it("a foreign bearer or a malformed X-Yes2-Api-Key: 401", async () => {
    for (const headers of [bearer("sk-ant-foreign"), { "X-Yes2-Api-Key": "nope" }]) {
      const res = await post(callTool("sign_in"), headers);
      expect(res.status, JSON.stringify(headers)).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
      await res.text();
    }
  });

  it("an expired y2a_: 401", async () => {
    const res = await post(callTool("sign_in"), bearer(CREDS.oauthExpired));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
    await res.text();
  });

  it("a valid y2a_: the summary, from the gate's single whoami", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("sign_in"), bearer(CREDS.oauthValid));
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(false);
    expect(text).toBe("Signed in to Yes2 as Stub Dev (dev@stub.test) in Stub Studio, via sign-in. Scopes: games:read, games:write, builds:write.");
    expect(stub.calls.map((c) => c.url)).toEqual(["/api/v1/whoami"]);
  });

  it("a read-only y2a_ is still signed in: sign_in needs no scope", async () => {
    const res = await post(callTool("sign_in"), bearer(CREDS.oauthReadOnly));
    expect(res.status).toBe(200);
    expect((await toolResult(res)).text).toMatch(/via sign-in\. Scopes: games:read\.$/);
  });

  it("a y2g_ key: the summary from whoami with the key", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("sign_in"), { "X-Yes2-Api-Key": CREDS.key });
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(false);
    expect(text).toBe("Signed in to Yes2 as Stub Dev (dev@stub.test) in Stub Studio, via API key. Scopes: games:read, games:write, builds:write.");
    expect(stub.calls.map((c) => `${c.url} ${c.authorization}`)).toEqual([`/api/v1/whoami Bearer ${CREDS.key}`]);
  });

  it("whoami down for a y2a_: falls through and reports the error as text", async () => {
    const res = await post(callTool("sign_in"), bearer(CREDS.oauthWhoamiDown));
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(true);
    expect(text).toMatch(/server error \(HTTP 503\)/);
  });

  it("docs stay callable right after a sign_in 401", async () => {
    const refused = await post(callTool("sign_in"));
    expect(refused.status).toBe(401);
    await refused.text();
    const res = await post(callTool("search_docs", { query: "ads" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    await res.text();
  });
});

describe("y2a_ tokens are pre-checked with whoami", () => {
  it("an expired y2a_ on a dashboard tool: a 200 'sign in again' result, never a 401 (Claude Code would drop the whole connector)", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), bearer(CREDS.oauthExpired));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    const out = await toolResult(res);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("Your Yes2 sign-in has expired or was revoked");
    expect(out.text).not.toContain(CREDS.oauthExpired);
    expect(stub.calls.map((c) => c.url)).toEqual(["/api/v1/whoami"]);
  });

  it("an expired y2a_ on sign_in: the 401 challenge, so the client refreshes or re-authenticates", async () => {
    const res = await post(callTool("sign_in"), bearer(CREDS.oauthExpired));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
    await res.text();
  });

  it("a missing scope: no 403 from the MCP; the call goes to the dashboard, which enforces scopes per route", async () => {
    const res = await post(callTool("create_game", { name: "x", engine: "unity" }), bearer(CREDS.oauthReadOnly));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    await res.text();
  });

  it("the same read-only token runs a games:read tool", async () => {
    const res = await post(callTool("list_games"), bearer(CREDS.oauthReadOnly));
    expect(res.status).toBe(200);
    expect((await toolResult(res)).text).toContain("Stub Game");
  });

  it("whoami 200 with every scope: the tool runs and forwards the same token", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), bearer(CREDS.oauthValid));
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(false);
    expect(text).toContain("Stub Game");
    expect(text).not.toContain(CREDS.oauthValid);
    expect(stub.calls.map((c) => `${c.method} ${c.url} ${c.authorization}`)).toEqual([
      `GET /api/v1/whoami Bearer ${CREDS.oauthValid}`,
      `GET /api/v1/games Bearer ${CREDS.oauthValid}`,
    ]);
  });

  it("Authorization wins: a y2a_ bearer is used over X-Yes2-Api-Key", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), { ...bearer(CREDS.oauthValid), "X-Yes2-Api-Key": CREDS.key });
    expect(res.status).toBe(200);
    await res.text();
    expect(stub.calls.every((c) => c.authorization === `Bearer ${CREDS.oauthValid}`)).toBe(true);
  });

  it("whoami 5xx: falls through, the tool runs and reports the error as text", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), bearer(CREDS.oauthWhoamiDown));
    expect(res.status).toBe(200);
    expect(res.headers.get("www-authenticate")).toBeNull();
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(true);
    expect(text).toMatch(/server error \(HTTP 503\)/);
    expect(stub.calls.map((c) => c.url)).toEqual(["/api/v1/whoami", "/api/v1/games"]);
  });

  it("whoami timeout (5 s): falls through and the tool runs", async () => {
    const started = Date.now();
    const res = await post(callTool("list_games"), bearer(CREDS.oauthWhoamiSlow));
    expect(res.status).toBe(200);
    expect((await toolResult(res)).text).toContain("Stub Game");
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(4_500);
    expect(elapsed).toBeLessThan(7_000);
  }, 20_000);

  it("a docs tool with a y2a_ token never calls whoami", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("search_docs", { query: "ads" }), bearer(CREDS.oauthValid));
    expect(res.status).toBe(200);
    await res.text();
    expect(whoamiCalls()).toBe(0);
  });
});

describe("y2g_ keys are unchanged", () => {
  it.each([
    ["Authorization: Bearer", bearer(CREDS.key)],
    ["X-Yes2-Api-Key", { "X-Yes2-Api-Key": CREDS.key }],
    ["empty Bearer + X-Yes2-Api-Key", { Authorization: "Bearer", "X-Yes2-Api-Key": CREDS.key }],
  ])("%s: no whoami, the tool runs with the key", async (_label, headers) => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), headers);
    expect(res.status).toBe(200);
    expect((await toolResult(res)).text).toContain("Stub Game");
    expect(stub.calls.map((c) => `${c.url} ${c.authorization}`)).toEqual([`/api/v1/games Bearer ${CREDS.key}`]);
  });

  it("a revoked key still gets a tool error, not a challenge, and the text explains signing in", async () => {
    const res = await post(callTool("list_games"), bearer(CREDS.revokedKey));
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(true);
    expect(text).toContain("INVALID_API_KEY");
    expect(text).toContain("codex mcp login yes2sdk");
  });

  it("a malformed X-Yes2-Api-Key gets the not-signed-in text, then names the bad header", async () => {
    const res = await post(callTool("list_games"), { "X-Yes2-Api-Key": "nope" });
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(true);
    expect(text.startsWith(NOT_SIGNED_IN)).toBe(true);
    expect(text).toContain("X-Yes2-Api-Key header");
  });
});

describe("protected resource metadata", () => {
  for (const prmPath of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
    it(`GET ${prmPath}: the PRM JSON, cacheable, readable from any origin`, async () => {
      const res = await fetch(`${server.base}${prmPath}`, { headers: { Origin: "https://not-allowlisted.test" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(res.headers.get("cache-control")).toBe("max-age=300");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(await res.json()).toEqual(EXPECTED_PRM);
    });

    it(`OPTIONS ${prmPath}: a CORS preflight that allows MCP-Protocol-Version`, async () => {
      const res = await fetch(`${server.base}${prmPath}`, {
        method: "OPTIONS",
        headers: { Origin: "https://not-allowlisted.test", "Access-Control-Request-Headers": "mcp-protocol-version" },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-headers")).toMatch(/mcp-protocol-version/i);
    });
  }

  it("lists exactly the scopes the 401 challenge asks for", () => {
    expect(EXPECTED_PRM.scopes_supported).toEqual(ALL_SCOPES);
  });

  it("robots.txt is left alone", async () => {
    const body = await (await fetch(`${server.base}/robots.txt`)).text();
    expect(body).toMatch(/^Disallow: \/\.well-known\/$/m);
  });
});

describe("credentials stay out of the logs", () => {
  it("no token or key reaches stderr", () => {
    for (const value of Object.values(CREDS)) expect(server.stderr()).not.toContain(value);
  });
});
