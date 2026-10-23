import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { authFromEnv, authFromHeader, NO_KEY, type ApiKeyAuth } from "../src/lib/auth.js";
import { createDashboardClient, DashboardError, resolveDashboardUrl, DEFAULT_DASHBOARD_API_URL } from "../src/lib/dashboard.js";

const KEY = "y2g_TestKey_abc-123";
const BASE = "https://dash.test/api/v1";
const DASHBOARD_TOOLS = ["list_games", "create_game", "prepare_upload", "finalize_upload", "get_build_status"];

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

type Responder = (call: Call) => Response | Promise<Response>;

function json(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const ok = (data: unknown, status = 200): Response => json(status, { success: true, data });
const fail = (status: number, error: string, code?: string, headers?: Record<string, string>): Response =>
  json(status, { success: false, error, ...(code ? { code } : {}) }, headers);

/** A fetch stand-in that records every call and answers from `responder`. */
function mockFetch(responder: Responder) {
  const calls: Call[] = [];
  const fn = async (input: string, init: RequestInit): Promise<Response> => {
    const call: Call = {
      url: input,
      method: init.method ?? "GET",
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return responder(call);
  };
  return { fn, calls };
}

const clients: Client[] = [];

async function connect(auth: ApiKeyAuth, responder: Responder = () => ok(null)) {
  const fetchMock = mockFetch(responder);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer({ auth, fetch: fetchMock.fn, dashboardApiUrl: BASE });
  const client = new Client({ name: "dashboard-test", version: "0" });
  await server.connect(serverT);
  await client.connect(clientT);
  clients.push(client);
  return { client, calls: fetchMock.calls };
}

afterEach(async () => {
  while (clients.length > 0) await clients.pop()?.close();
});

type CallResult = Awaited<ReturnType<Client["callTool"]>>;

function textOf(res: CallResult): string {
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.map((c) => c.text ?? "").join("\n");
}

const isError = (res: CallResult): boolean => (res as { isError?: boolean }).isError === true;

const withKey: ApiKeyAuth = { status: "ok", apiKey: KEY };

const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  list_games: {},
  create_game: { name: "Zombies" },
  prepare_upload: { gameId: "g1", version: "1.0.0", size: 1234 },
  finalize_upload: { gameId: "g1", uploadId: "u1" },
  get_build_status: { gameId: "g1", uploadId: "u1" },
};

describe("auth parsing", () => {
  it("accepts a y2g_ bearer header", () => {
    expect(authFromHeader(`Bearer ${KEY}`)).toEqual({ status: "ok", apiKey: KEY });
  });

  it("treats an absent or blank header as no key", () => {
    expect(authFromHeader(undefined)).toEqual(NO_KEY);
    expect(authFromHeader("  ")).toEqual(NO_KEY);
  });

  it("rejects anything that is not Bearer y2g_…", () => {
    for (const bad of [KEY, `Basic ${KEY}`, "Bearer sk-ant-xyz", "Bearer y2g_has space", "Bearer y2g_"]) {
      expect(authFromHeader(bad), bad).toEqual({ status: "malformed", source: "header" });
    }
  });

  it("reads YES2_API_KEY bare or with a pasted Bearer prefix", () => {
    expect(authFromEnv(KEY)).toEqual({ status: "ok", apiKey: KEY });
    expect(authFromEnv(`Bearer ${KEY}`)).toEqual({ status: "ok", apiKey: KEY });
    expect(authFromEnv(undefined)).toEqual(NO_KEY);
    expect(authFromEnv("not-a-key")).toEqual({ status: "malformed", source: "env" });
  });

  it("defaults the dashboard URL and trims a trailing slash", () => {
    expect(resolveDashboardUrl(undefined)).toBe(DEFAULT_DASHBOARD_API_URL);
    expect(resolveDashboardUrl("https://x.test/api/v1/")).toBe("https://x.test/api/v1");
  });
});

describe("dashboard tools without a key", () => {
  it("are always listed, open-world, and never claim to be destructive", async () => {
    const { client } = await connect(NO_KEY);
    const { tools } = await client.listTools();
    for (const name of DASHBOARD_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.annotations?.openWorldHint, name).toBe(true);
      expect(tool?.annotations?.destructiveHint, name).toBe(false);
    }
    const readOnly = tools.filter((t) => DASHBOARD_TOOLS.includes(t.name) && t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly.sort()).toEqual(["get_build_status", "list_games"]);
  });

  it.each(DASHBOARD_TOOLS)("%s returns setup steps and calls nothing", async (name) => {
    const { client, calls } = await connect(NO_KEY);
    const res = await client.callTool({ name, arguments: SAMPLE_ARGS[name] });
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toContain("YES2_API_KEY");
    expect(text).toMatch(/Settings/);
    expect(text).toMatch(/Claude Code/);
    expect(text).toMatch(/Codex/);
    expect(text).toContain("bearer_token_env_var");
    expect(calls).toHaveLength(0);
  });

  it("says when the header is not a Yes2 key, without echoing it", async () => {
    const { client, calls } = await connect({ status: "malformed", source: "header" });
    const res = await client.callTool({ name: "list_games", arguments: {} });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toMatch(/not a Yes2 dashboard API key/);
    expect(calls).toHaveLength(0);
  });

  it("leaves the docs tools working", async () => {
    const { client } = await connect(NO_KEY);
    const res = await client.callTool({ name: "list_sdk_modules", arguments: {} });
    expect(isError(res)).toBe(false);
  });
});

describe("request mapping", () => {
  it("list_games sends GET /games with the key and the client header", async () => {
    const { client, calls } = await connect(withKey, () =>
      ok([{ id: "g1", name: "Zombies", engine: "unity", build_count: 3 }]),
    );
    const res = await client.callTool({ name: "list_games", arguments: {} });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/games`);
    expect(calls[0].method).toBe("GET");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].headers["X-Yes2-Client"]).toBe("mcp");
    expect(textOf(res)).toContain("Zombies");
    expect(textOf(res)).toContain("g1");
  });

  it("create_game posts only the fields given", async () => {
    const { client, calls } = await connect(withKey, () =>
      ok({ id: "g9", name: "Zombies", engine: "vanilla", orientation: "landscape" }, 201),
    );
    const res = await client.callTool({
      name: "create_game",
      arguments: { name: "Zombies", engine: "vanilla", orientation: "landscape" },
    });
    expect(calls[0].url).toBe(`${BASE}/games`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].body).toEqual({ name: "Zombies", engine: "vanilla", orientation: "landscape" });
    expect(textOf(res)).toContain("gameId: g9");
  });

  it("create_game rejects an engine the dashboard does not accept", async () => {
    const { client, calls } = await connect(withKey);
    const res = await client.callTool({ name: "create_game", arguments: { name: "x", engine: "godot" } });
    expect(isError(res)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  const prepared = {
    uploadId: "up_1",
    uploadUrl: "https://storage.test/bucket/key?X-Sig=abc&X-Exp=1",
    method: "PUT",
    headers: { "Content-Type": "application/zip", "Content-Length": "1234" },
    expiresAt: "2026-10-23T12:00:00.000Z",
  };

  it("prepare_upload posts version/size/notes/name and returns a placeholder curl", async () => {
    const { client, calls } = await connect(withKey, () => ok(prepared, 201));
    const res = await client.callTool({
      name: "prepare_upload",
      arguments: { gameId: "g1", version: "1.4.2", size: 1234, notes: "boss fix", name: "RC" },
    });
    expect(calls[0].url).toBe(`${BASE}/games/g1/build-uploads`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({ version: "1.4.2", size: 1234, notes: "boss fix", name: "RC" });
    const text = textOf(res);
    expect(text).toContain("uploadId: up_1");
    expect(text).toContain("expiresAt: 2026-10-23T12:00:00.000Z");
    expect(text).toContain(
      "curl -X PUT --data-binary @<path/to/build.zip> -H 'Content-Type: application/zip' 'https://storage.test/bucket/key?X-Sig=abc&X-Exp=1'",
    );
    expect(text).toContain("finalize_upload");
  });

  it("prepare_upload fills and shell-quotes a given zipPath", async () => {
    const { client } = await connect(withKey, () => ok(prepared, 201));
    const res = await client.callTool({
      name: "prepare_upload",
      arguments: { gameId: "g1", version: "1", size: 1234, zipPath: "/tmp/it's here/build.zip" },
    });
    expect(textOf(res)).toContain(`--data-binary @'/tmp/it'\\''s here/build.zip'`);
    expect(textOf(res)).not.toContain("<path/to/build.zip>");
  });

  it("prepare_upload explains how to measure the size", async () => {
    const { client } = await connect(withKey);
    const { tools } = await client.listTools();
    const description = tools.find((t) => t.name === "prepare_upload")?.description ?? "";
    expect(description).toContain("stat -f%z");
    expect(description).toContain("stat -c%s");
    expect(description).toContain("index.html");
  });

  it("encodes path ids so they cannot leave their route", async () => {
    const { client, calls } = await connect(withKey, () => ok({ uploadId: "u", status: "processing" }, 202));
    await client.callTool({ name: "finalize_upload", arguments: { gameId: "../admin", uploadId: "u/1" } });
    expect(calls[0].url).toBe(`${BASE}/games/..%2Fadmin/build-uploads/u%2F1/finalize`);
  });

  it("finalize_upload posts to the finalize route and points at polling", async () => {
    const { client, calls } = await connect(withKey, () => ok({ uploadId: "u1", status: "processing" }, 202));
    const res = await client.callTool({ name: "finalize_upload", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(calls[0].url).toBe(`${BASE}/games/g1/build-uploads/u1/finalize`);
    expect(calls[0].method).toBe("POST");
    expect(textOf(res)).toContain("Status: processing");
    expect(textOf(res)).toContain("get_build_status");
  });
});

describe("get_build_status", () => {
  const build = {
    id: "b1",
    version: "1.4.2",
    engine: "unity",
    uploadWarnings: [{ code: "ROOT_ABSOLUTE_PATH", message: "index.html references /assets" }],
    bundleErrors: [],
    inspectorUrl: "https://dashboard.yes2games.com/inspector?build=b1",
  };

  it("reports processing and asks for another poll", async () => {
    const { client, calls } = await connect(withKey, () => ok({ uploadId: "u1", status: "processing" }));
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(calls[0].url).toBe(`${BASE}/games/g1/build-uploads/u1`);
    expect(calls[0].method).toBe("GET");
    expect(textOf(res)).toMatch(/processing/);
    expect(textOf(res)).toMatch(/few seconds/);
  });

  it("when ready, follows buildId to the build and surfaces the Inspector link", async () => {
    const { client, calls } = await connect(withKey, (call) =>
      call.url.endsWith("/build-uploads/u1") ? ok({ uploadId: "u1", status: "ready", buildId: "b1" }) : ok(build),
    );
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/games/g1/build-uploads/u1`, `${BASE}/games/g1/builds/b1`]);
    const text = textOf(res);
    expect(text).toContain("inspectorUrl: https://dashboard.yes2games.com/inspector?build=b1");
    expect(text).toContain("engine: unity");
    expect(text).toContain("ROOT_ABSOLUTE_PATH: index.html references /assets");
    expect(text).toMatch(/Show the user this Inspector link/);
  });

  it("uses an embedded build without a second request", async () => {
    const { client, calls } = await connect(withKey, () => ok({ uploadId: "u1", status: "ready", buildId: "b1", build }));
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(calls).toHaveLength(1);
    expect(textOf(res)).toContain("buildId: b1");
  });

  it("reads an existing build by buildId", async () => {
    const { client, calls } = await connect(withKey, () => ok(build));
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", buildId: "b1" } });
    expect(calls[0].url).toBe(`${BASE}/games/g1/builds/b1`);
    expect(textOf(res)).toContain("inspectorUrl:");
  });

  it("explains a failed upload with its code", async () => {
    const { client } = await connect(withKey, () =>
      ok({ uploadId: "u1", status: "failed", error: { code: "SDK_NOT_INTEGRATED", message: "Yes2SDK not found" } }),
    );
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(textOf(res)).toContain("failed (SDK_NOT_INTEGRATED)");
    expect(textOf(res)).toContain("validate_integration");
  });

  it("takes exactly one of uploadId or buildId", async () => {
    const { client, calls } = await connect(withKey);
    for (const args of [{ gameId: "g1" }, { gameId: "g1", uploadId: "u", buildId: "b" }]) {
      const res = await client.callTool({ name: "get_build_status", arguments: args });
      expect(isError(res)).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("error mapping", () => {
  async function errorFor(response: () => Response | Promise<Response>): Promise<string> {
    const { client } = await connect(withKey, response);
    const res = await client.callTool({ name: "list_games", arguments: {} });
    expect(isError(res)).toBe(true);
    return textOf(res);
  }

  it("401 INVALID_API_KEY points at Settings and YES2_API_KEY", async () => {
    const text = await errorFor(() => fail(401, "Invalid API key", "INVALID_API_KEY"));
    expect(text).toContain("INVALID_API_KEY");
    expect(text).toContain("Settings");
    expect(text).toContain("YES2_API_KEY");
  });

  it("409 VERSION_EXISTS asks for a new version", async () => {
    const text = await errorFor(() => fail(409, "Version 1.0 already exists", "VERSION_EXISTS"));
    expect(text).toContain("VERSION_EXISTS");
    expect(text).toMatch(/new version/);
  });

  it("413 FILE_TOO_LARGE names the cap", async () => {
    expect(await errorFor(() => fail(413, "too big", "FILE_TOO_LARGE"))).toContain("500 MB");
  });

  it("429 RATE_LIMITED passes Retry-After on", async () => {
    const text = await errorFor(() => fail(429, "Slow down", "RATE_LIMITED", { "Retry-After": "30" }));
    expect(text).toContain("RATE_LIMITED");
    expect(text).toContain("30 seconds");
  });

  it("403 and 404 carry the dashboard's message", async () => {
    expect(await errorFor(() => fail(403, "Forbidden"))).toMatch(/does not own that game/);
    expect(await errorFor(() => fail(404, "Game not found"))).toContain("Game not found");
  });

  it("5xx says retrying is safe", async () => {
    expect(await errorFor(() => fail(503, "Unavailable"))).toMatch(/safe to retry/);
  });

  it("a non-JSON body is a clean error", async () => {
    expect(await errorFor(() => new Response("<html>bad gateway</html>", { status: 502 }))).toMatch(/HTTP 502/);
  });

  it("a network failure names the base URL only", async () => {
    const text = await errorFor(() => {
      throw new TypeError(`fetch failed: Authorization: Bearer ${KEY}`);
    });
    expect(text).toContain(BASE);
    expect(text).not.toContain(KEY);
  });

  it("times out instead of hanging", async () => {
    const client = createDashboardClient({
      apiKey: KEY,
      baseUrl: BASE,
      timeoutMs: 20,
      fetch: (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    });
    const err = await client.get("/games").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DashboardError);
    expect((err as Error).message).toMatch(/did not answer within/);
  });
});

describe("the key never leaks", () => {
  it("is absent from every tool's output, even when the dashboard echoes it", async () => {
    const { client } = await connect(withKey, (call) => {
      if (call.url.endsWith("/games") && call.method === "GET") return fail(400, `bad key ${KEY}`);
      if (call.url.endsWith("/games")) return ok({ id: KEY, name: `name ${KEY}` }, 201);
      if (call.url.endsWith("/build-uploads")) return ok({ uploadId: KEY, uploadUrl: `https://s.test/?k=${KEY}`, expiresAt: KEY }, 201);
      if (call.url.endsWith("/finalize")) return ok({ uploadId: KEY, status: KEY });
      return ok({ uploadId: KEY, status: "failed", error: { code: "X", message: `echo ${KEY}` } });
    });
    for (const name of DASHBOARD_TOOLS) {
      const res = await client.callTool({ name, arguments: SAMPLE_ARGS[name] });
      expect(textOf(res), name).not.toContain(KEY);
      expect(JSON.stringify(res), name).not.toContain(KEY);
    }
  });

  it("is absent from the tool listing and the server instructions", async () => {
    const { client } = await connect(withKey);
    const { tools } = await client.listTools();
    expect(JSON.stringify(tools)).not.toContain(KEY);
    expect(client.getInstructions() ?? "").not.toContain(KEY);
  });
});

describe("server instructions", () => {
  it("describe the upload flow", async () => {
    const { client } = await connect(NO_KEY);
    const instructions = client.getInstructions() ?? "";
    for (const name of DASHBOARD_TOOLS) expect(instructions).toContain(name);
    expect(instructions).toContain("YES2_API_KEY");
    expect(instructions).toContain("inspectorUrl");
  });
});
