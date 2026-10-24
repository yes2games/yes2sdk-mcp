import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { authFromEnv, authFromHeaders, redactKeys, NO_KEY, type ApiKeyAuth } from "../src/lib/auth.js";
import { createDashboardClient, DashboardError, INVALID_KEY_HELP, type FetchLike } from "../src/lib/dashboard.js";
import { missingKeyText } from "../src/tools/dashboard.js";
import {
  challenge401,
  challenge403,
  gate,
  oauthEnabled,
  requiredScopes,
  whoami,
  PRM,
  TOOL_SCOPES,
} from "../src/lib/oauth.js";

const KEY = "y2g_UnitKey_1";
const TOKEN = "y2a_UnitToken_1";
const BASE = "https://dash.test/api/v1";
const ALL = ["games:read", "games:write", "builds:write"];

const call = (name: string) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: {} } });

function fetchAnswering(status: number, body: unknown): { fn: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fn: FetchLike = async (input) => {
    urls.push(input);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return { fn, urls };
}

describe("MCP_OAUTH_ENABLED", () => {
  it("is off unless set to 1 or true", () => {
    for (const v of [undefined, "", "0", "false", "no", "yes"]) expect(oauthEnabled(v), String(v)).toBe(false);
    for (const v of ["1", "true", "TRUE", " 1 "]) expect(oauthEnabled(v), v).toBe(true);
  });
});

describe("auth parsing with OAuth on", () => {
  const on = { oauth: true };

  it("accepts Bearer y2a_ as an oauth credential", () => {
    expect(authFromHeaders(`Bearer ${TOKEN}`, undefined, on)).toEqual({ status: "ok", kind: "oauth", credential: TOKEN });
  });

  it("still accepts y2g_ keys in either header", () => {
    expect(authFromHeaders(`Bearer ${KEY}`, undefined, on)).toEqual({ status: "ok", kind: "key", credential: KEY });
    expect(authFromHeaders(undefined, KEY, on)).toEqual({ status: "ok", kind: "key", credential: KEY });
  });

  it("calls any other Authorization value foreign", () => {
    for (const bad of ["Bearer sk-ant-1", "Basic abc", "Bearer y2r_refresh", "Bearer y2a_", "garbage"]) {
      expect(authFromHeaders(bad, undefined, on), bad).toEqual({ status: "foreign" });
    }
  });

  it("lets Authorization win over X-Yes2-Api-Key", () => {
    expect(authFromHeaders(`Bearer ${TOKEN}`, KEY, on)).toEqual({ status: "ok", kind: "oauth", credential: TOKEN });
    expect(authFromHeaders("Bearer sk-foreign", KEY, on)).toEqual({ status: "foreign" });
    expect(authFromHeaders("Bearer", KEY, on)).toEqual({ status: "ok", kind: "key", credential: KEY });
  });

  it("does not take a y2a_ token from X-Yes2-Api-Key", () => {
    expect(authFromHeaders(undefined, TOKEN, on)).toEqual({ status: "malformed", source: "header" });
  });

  it("with OAuth off, y2a_ is malformed exactly as in phase 1", () => {
    expect(authFromHeaders(`Bearer ${TOKEN}`)).toEqual({ status: "malformed", source: "header" });
    expect(authFromHeaders("Bearer sk-foreign")).toEqual({ status: "malformed", source: "header" });
  });

  it("stdio never accepts an OAuth token", () => {
    expect(authFromEnv(TOKEN)).toEqual({ status: "malformed", source: "env" });
  });
});

describe("redactKeys", () => {
  it("redacts y2g_, y2a_ and y2r_ credentials", () => {
    expect(redactKeys(`a ${KEY} b ${TOKEN} c y2r_Refresh-1 d`)).toBe("a y2g_[redacted] b y2a_[redacted] c y2r_[redacted] d");
  });
});

describe("requiredScopes", () => {
  it("maps each of the eight dashboard tools to its scope", () => {
    expect(Object.keys(TOOL_SCOPES).sort()).toEqual(
      ["create_game", "finalize_upload", "get_build_status", "list_games", "prepare_upload", "rename_build", "set_game_image", "update_game"],
    );
    expect(requiredScopes(call("list_games"))).toEqual(["games:read"]);
    expect(requiredScopes(call("prepare_upload"))).toEqual(["builds:write"]);
    expect(requiredScopes(call("rename_build"))).toEqual(["games:write"]);
  });

  it("ignores everything that is not a dashboard tools/call", () => {
    for (const body of [
      undefined,
      null,
      "x",
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      call("search_docs"),
      call("toString"),
      call("__proto__"),
      { method: "tools/call", params: { name: 5 } },
      { method: "tools/call" },
    ]) {
      expect(requiredScopes(body), JSON.stringify(body)).toEqual([]);
    }
  });

  it("collects every scope a batch needs", () => {
    expect(requiredScopes([call("search_docs"), call("list_games"), call("create_game")]).sort()).toEqual(["games:read", "games:write"]);
  });
});

describe("challenges", () => {
  it("401 is exactly the header in the design", () => {
    const c = challenge401();
    expect(c.status).toBe(401);
    expect(c.headers["WWW-Authenticate"]).toBe(
      'Bearer error="invalid_token", error_description="Sign in to Yes2 to use dashboard tools", resource_metadata="https://mcp.yes2games.com/.well-known/oauth-protected-resource/mcp", scope="games:read games:write builds:write"',
    );
    const body = JSON.parse(c.body) as { error: string; error_description: string };
    expect(body.error).toBe("invalid_token");
    expect(body.error_description).toContain("or set YES2_API_KEY");
    expect(body.error_description).toContain("codex mcp login yes2sdk");
  });

  it("403 is insufficient_scope and asks for all three scopes", () => {
    const c = challenge403();
    expect(c.status).toBe(403);
    expect(c.headers["WWW-Authenticate"]).toMatch(/^Bearer error="insufficient_scope", /);
    expect(c.headers["WWW-Authenticate"]).toContain('scope="games:read games:write builds:write"');
    expect(JSON.parse(c.body).error).toBe("insufficient_scope");
  });

  it("the PRM is the design's JSON", () => {
    expect(JSON.parse(JSON.stringify(PRM))).toEqual({
      resource: "https://mcp.yes2games.com/mcp",
      authorization_servers: ["https://dashboard.yes2games.com"],
      scopes_supported: ALL,
      bearer_methods_supported: ["header"],
      resource_name: "Yes2 dashboard",
    });
  });
});

describe("whoami", () => {
  it("calls GET {DASHBOARD_API_URL}/whoami with the token", async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fn: FetchLike = async (url, init) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ success: true, data: { scopes: ALL } }), { status: 200 });
    };
    expect(await whoami(BASE, TOKEN, fn)).toEqual({ kind: "ok", scopes: ALL });
    expect(seen[0].url).toBe(`${BASE}/whoami`);
    expect(seen[0].init.method).toBe("GET");
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("reads a bare { scopes } too, and tolerates no scope list", async () => {
    expect(await whoami(BASE, TOKEN, fetchAnswering(200, { scopes: ["games:read"] }).fn)).toEqual({ kind: "ok", scopes: ["games:read"] });
    expect(await whoami(BASE, TOKEN, fetchAnswering(200, { success: true, data: {} }).fn)).toEqual({ kind: "ok", scopes: undefined });
  });

  it("maps 401 to unauthorized and 5xx, 404, a bad body or a network error to unavailable", async () => {
    expect(await whoami(BASE, TOKEN, fetchAnswering(401, {}).fn)).toEqual({ kind: "unauthorized" });
    expect(await whoami(BASE, TOKEN, fetchAnswering(503, {}).fn)).toEqual({ kind: "unavailable" });
    expect(await whoami(BASE, TOKEN, fetchAnswering(404, {}).fn)).toEqual({ kind: "unavailable" });
    expect(await whoami(BASE, TOKEN, async () => new Response("<html>", { status: 200 }))).toEqual({ kind: "unavailable" });
    expect(
      await whoami(BASE, TOKEN, async () => {
        throw new TypeError("fetch failed");
      }),
    ).toEqual({ kind: "unavailable" });
  });

  it("gives up after its timeout", async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    expect(await whoami(BASE, TOKEN, hang, 20)).toEqual({ kind: "unavailable" });
  });
});

describe("gate", () => {
  const oauthAuth: ApiKeyAuth = { status: "ok", kind: "oauth", credential: TOKEN };

  it("passes non-dashboard bodies without looking at the credential", async () => {
    const f = fetchAnswering(401, {});
    for (const auth of [NO_KEY, { status: "foreign" } as ApiKeyAuth, oauthAuth]) {
      expect(await gate(call("search_docs"), auth, BASE, f.fn)).toEqual({ kind: "pass" });
    }
    expect(f.urls).toHaveLength(0);
  });

  it("refuses a missing or foreign credential with 401", async () => {
    for (const auth of [NO_KEY, { status: "foreign" } as ApiKeyAuth]) {
      const d = await gate(call("list_games"), auth, BASE);
      expect(d.kind === "refuse" && d.challenge.status).toBe(401);
    }
  });

  it("passes y2g_ keys and malformed keys without a whoami", async () => {
    const f = fetchAnswering(401, {});
    expect(await gate(call("list_games"), { status: "ok", kind: "key", credential: KEY }, BASE, f.fn)).toEqual({ kind: "pass" });
    expect(await gate(call("list_games"), { status: "malformed", source: "header" }, BASE, f.fn)).toEqual({ kind: "pass" });
    expect(f.urls).toHaveLength(0);
  });

  it("y2a_: whoami 401 → 401, missing scope → 403, all scopes → pass, 5xx → pass", async () => {
    const r401 = await gate(call("list_games"), oauthAuth, BASE, fetchAnswering(401, {}).fn);
    expect(r401.kind === "refuse" && r401.challenge.status).toBe(401);

    const readOnly = fetchAnswering(200, { success: true, data: { scopes: ["games:read"] } }).fn;
    const r403 = await gate(call("prepare_upload"), oauthAuth, BASE, readOnly);
    expect(r403.kind === "refuse" && r403.challenge.status).toBe(403);
    expect(await gate(call("get_build_status"), oauthAuth, BASE, readOnly)).toEqual({ kind: "pass" });

    expect(await gate(call("create_game"), oauthAuth, BASE, fetchAnswering(200, { success: true, data: { scopes: ALL } }).fn)).toEqual({ kind: "pass" });
    expect(await gate(call("create_game"), oauthAuth, BASE, fetchAnswering(502, {}).fn)).toEqual({ kind: "pass" });
  });
});

describe("dashboard client texts", () => {
  async function errorFor(status: number, body: unknown, signInHelp = false): Promise<string> {
    const client = createDashboardClient({ credential: KEY, baseUrl: BASE, fetch: fetchAnswering(status, body).fn, signInHelp });
    const err = await client.get("/games").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DashboardError);
    return (err as Error).message;
  }

  it("a 401 keeps the phase 1 text with OAuth off, and adds sign-in again with it on", async () => {
    expect(await errorFor(401, { success: false, code: "INVALID_API_KEY" })).toBe(INVALID_KEY_HELP);
    const on = await errorFor(401, { success: false, code: "INVALID_API_KEY" }, true);
    expect(on).toContain("Sign in again: Claude Code `/mcp` → Authenticate; Codex `codex mcp login yes2sdk`; claude.ai reconnects automatically.");
  });

  it("explains the preview caps and a missing scope", async () => {
    expect(await errorFor(409, { success: false, error: "Game limit reached", code: "game_limit_reached" })).toMatch(/game limit \(game_limit_reached\).*up to 3 games/);
    expect(await errorFor(409, { success: false, error: "Build limit reached", code: "build_limit_reached" })).toMatch(/build limit \(build_limit_reached\).*1 build per game/);
    expect(await errorFor(403, { success: false, error: "Missing scope", code: "INSUFFICIENT_SCOPE", scope: "builds:write" })).toMatch(
      /not allowed to do that \(INSUFFICIENT_SCOPE\).*Sign in again/,
    );
  });
});

describe("texts with OAuth on", () => {
  const clients: Client[] = [];
  afterEach(async () => {
    while (clients.length > 0) await clients.pop()?.close();
  });

  async function connect(oauth: boolean): Promise<Client> {
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const server = createServer({ auth: NO_KEY, oauth, dashboardApiUrl: BASE });
    const client = new Client({ name: "oauth-test", version: "0" });
    await server.connect(serverT);
    await client.connect(clientT);
    clients.push(client);
    return client;
  }

  it("instructions and dashboard tool descriptions say sign in or provide an API key", async () => {
    const client = await connect(true);
    expect(client.getInstructions()).toContain("sign in or provide an API key");
    const { tools } = await client.listTools();
    for (const tool of tools.filter((t) => t.name in TOOL_SCOPES)) {
      expect(tool.description, tool.name).toContain("or provide an API key instead");
    }
  });

  it("with OAuth off they are unchanged", async () => {
    const client = await connect(false);
    expect(client.getInstructions()).not.toContain("sign in");
    const { tools } = await client.listTools();
    for (const tool of tools.filter((t) => t.name in TOOL_SCOPES)) {
      expect(tool.description, tool.name).not.toContain("sign in");
    }
  });

  it("missingKeyText leads with sign-in only in OAuth mode", () => {
    const on = missingKeyText(NO_KEY, true);
    expect(on.indexOf("Sign in")).toBeGreaterThan(-1);
    expect(on.indexOf("Sign in")).toBeLessThan(on.indexOf("Or use an API key"));
    expect(missingKeyText(NO_KEY)).not.toContain("Sign in");
    expect(missingKeyText({ status: "foreign" }, true)).toMatch(/^The Authorization header sent to this server is not a Yes2 sign-in/);
  });
});
