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
 * The yes2sdk-mcp#108 test matrix, over real HTTP with MCP_OAUTH_ENABLED=1
 * against a stub dashboard (the real whoami and y2a_ tokens are not live yet).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PORT = 8097;

const EXACT_401_CHALLENGE =
  'Bearer error="invalid_token", error_description="Sign in to Yes2 to use dashboard tools", ' +
  'resource_metadata="https://mcp.yes2games.com/.well-known/oauth-protected-resource/mcp", ' +
  'scope="games:read games:write builds:write"';

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

describe("dashboard tools without a usable credential get the 401 challenge", () => {
  it("no auth: 401 with the exact header and a body naming every way in", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
    const body = (await res.json()) as { error: string; error_description: string };
    expect(body.error).toBe("invalid_token");
    expect(body.error_description).toContain("codex mcp login yes2sdk");
    expect(body.error_description).toContain("or set YES2_API_KEY");
    expect(body.error_description).toContain("/mcp");
    expect(stub.calls).toHaveLength(0);
  });

  it("every one of the eight dashboard tools is gated", async () => {
    for (const name of ["list_games", "create_game", "prepare_upload", "finalize_upload", "get_build_status", "update_game", "set_game_image", "rename_build"]) {
      const res = await post(callTool(name, {}));
      expect(res.status, name).toBe(401);
      await res.text();
    }
  });

  it("a foreign bearer: 401", async () => {
    for (const token of ["sk-ant-foreign", "eyJhbGciOiJIUzI1NiJ9.e30.x", "y2r_refreshToken"]) {
      const res = await post(callTool("list_games"), bearer(token));
      expect(res.status, token).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
      await res.text();
    }
  });

  it("Authorization wins: a foreign bearer is refused even with a valid X-Yes2-Api-Key", async () => {
    const res = await post(callTool("list_games"), { ...bearer("sk-foreign"), "X-Yes2-Api-Key": CREDS.key });
    expect(res.status).toBe(401);
    await res.text();
  });

  it("a batch with one dashboard call is gated; a docs-only batch is not", async () => {
    const gated = await post([callTool("search_docs", { query: "ads" }), callTool("list_games")]);
    expect(gated.status).toBe(401);
    await gated.text();
    const open = await post([callTool("search_docs", { query: "ads" }), callTool("list_sdk_modules")]);
    expect(open.status).toBe(200);
    await open.text();
  });

  it("docs stay callable right after a 401", async () => {
    const refused = await post(callTool("list_games"));
    expect(refused.status).toBe(401);
    await refused.text();
    const res = await post(callTool("search_docs", { query: "ads" }));
    expect(res.status).toBe(200);
    await res.text();
  });
});

describe("y2a_ tokens are pre-checked with whoami", () => {
  it("whoami 401: the 401 challenge", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("list_games"), bearer(CREDS.oauthExpired));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(EXACT_401_CHALLENGE);
    await res.text();
    expect(stub.calls.map((c) => c.url)).toEqual(["/api/v1/whoami"]);
    expect(stub.calls[0].authorization).toBe(`Bearer ${CREDS.oauthExpired}`);
  });

  it("a missing scope: 403 insufficient_scope", async () => {
    stub.calls.length = 0;
    const res = await post(callTool("create_game", { name: "x", engine: "unity" }), bearer(CREDS.oauthReadOnly));
    expect(res.status).toBe(403);
    const header = res.headers.get("www-authenticate") ?? "";
    expect(header).toMatch(/^Bearer error="insufficient_scope", /);
    expect(header).toContain('scope="games:read games:write builds:write"');
    expect(header).toContain('resource_metadata="https://mcp.yes2games.com/.well-known/oauth-protected-resource/mcp"');
    expect(((await res.json()) as { error: string }).error).toBe("insufficient_scope");
    expect(stub.calls.map((c) => c.url)).toEqual(["/api/v1/whoami"]);
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

  it("a malformed X-Yes2-Api-Key gets the setup text, leading with sign-in", async () => {
    const res = await post(callTool("list_games"), { "X-Yes2-Api-Key": "nope" });
    expect(res.status).toBe(200);
    const { text, isError } = await toolResult(res);
    expect(isError).toBe(true);
    expect(text).toMatch(/^The X-Yes2-Api-Key header/);
    expect(text.indexOf("Sign in")).toBeLessThan(text.indexOf("API key:"));
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
