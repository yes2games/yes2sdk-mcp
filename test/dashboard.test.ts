import { describe, it, expect, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { authFromEnv, authFromHeaders, NO_KEY, type ApiKeyAuth } from "../src/lib/auth.js";
import { createDashboardClient, DashboardError, resolveDashboardUrl, DEFAULT_DASHBOARD_API_URL } from "../src/lib/dashboard.js";

const KEY = "y2g_TestKey_abc-123";
const BASE = "https://dash.test/api/v1";
const DASHBOARD_TOOLS = [
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

const withKey: ApiKeyAuth = { status: "ok", kind: "key", credential: KEY };

const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  list_games: {},
  create_game: { name: "Zombies" },
  prepare_upload: { gameId: "g1", version: "1.0.0", size: 1234 },
  finalize_upload: { gameId: "g1", uploadId: "u1" },
  get_build_status: { gameId: "g1", uploadId: "u1" },
  update_game: { gameId: "g1", name: "Zombies 2" },
  set_game_image: { gameId: "g1", kind: "icon", size: 2048, contentType: "image/png" },
  finalize_image_upload: { gameId: "g1", uploadId: "iu1" },
  rename_build: { gameId: "g1", buildId: "b1", name: "RC" },
};

describe("auth parsing", () => {
  it("accepts a y2g_ bearer header", () => {
    expect(authFromHeaders(`Bearer ${KEY}`)).toEqual({ status: "ok", kind: "key", credential: KEY });
  });

  it("treats an absent or blank header as no key", () => {
    expect(authFromHeaders(undefined)).toEqual(NO_KEY);
    expect(authFromHeaders("  ")).toEqual(NO_KEY);
  });

  it("treats an empty Bearer (an unset ${YES2_API_KEY:-}) as no key", () => {
    expect(authFromHeaders("Bearer")).toEqual(NO_KEY);
    expect(authFromHeaders("Bearer ")).toEqual(NO_KEY);
  });

  it("falls back to a bare key in X-Yes2-Api-Key", () => {
    expect(authFromHeaders(undefined, KEY)).toEqual({ status: "ok", kind: "key", credential: KEY });
    expect(authFromHeaders("Bearer", KEY)).toEqual({ status: "ok", kind: "key", credential: KEY });
    expect(authFromHeaders(undefined, "")).toEqual(NO_KEY);
    expect(authFromHeaders(undefined, `Bearer ${KEY}`)).toEqual({ status: "malformed", source: "header" });
  });

  it("prefers Authorization over X-Yes2-Api-Key", () => {
    const other = "y2g_other";
    expect(authFromHeaders(`Bearer ${KEY}`, other)).toEqual({ status: "ok", kind: "key", credential: KEY });
  });

  it("rejects anything that is not Bearer y2g_…", () => {
    for (const bad of [KEY, `Basic ${KEY}`, "Bearer sk-ant-xyz", "Bearer y2g_has space", "Bearer y2g_"]) {
      expect(authFromHeaders(bad), bad).toEqual({ status: "malformed", source: "header" });
    }
  });

  it("reads YES2_API_KEY bare or with a pasted Bearer prefix", () => {
    expect(authFromEnv(KEY)).toEqual({ status: "ok", kind: "key", credential: KEY });
    expect(authFromEnv(`Bearer ${KEY}`)).toEqual({ status: "ok", kind: "key", credential: KEY });
    expect(authFromEnv(undefined)).toEqual(NO_KEY);
    expect(authFromEnv("not-a-key")).toEqual({ status: "malformed", source: "env" });
  });

  it("defaults the dashboard URL and trims a trailing slash", () => {
    expect(resolveDashboardUrl(undefined)).toBe(DEFAULT_DASHBOARD_API_URL);
    expect(resolveDashboardUrl("https://x.test/api/v1/")).toBe("https://x.test/api/v1");
  });
});

describe("dashboard tools without a key", () => {
  it("are always listed, open-world, and only set_game_image (which can delete) is destructive", async () => {
    const { client } = await connect(NO_KEY);
    const { tools } = await client.listTools();
    for (const name of DASHBOARD_TOOLS) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.annotations?.openWorldHint, name).toBe(true);
      expect(tool?.annotations?.destructiveHint, name).toBe(name === "set_game_image");
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
    expect(text).toContain("X-Yes2-Api-Key");
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

describe("update_game", () => {
  const updated = {
    id: "g1",
    name: "Zombies 2",
    description: null,
    engine: "unity",
    category: "Action",
    tags: ["shooter", "zombies"],
    orientation: "landscape",
    yandex_metrica_counter_id: 12345,
    jest_auto_login_reminders: false,
  };

  it("PATCHes only the fields given, nulls included", async () => {
    const { client, calls } = await connect(withKey, () => ok(updated));
    const res = await client.callTool({
      name: "update_game",
      arguments: {
        gameId: "g1",
        category: "Action",
        tags: ["shooter", "zombies"],
        description: null,
        yandexMetricaCounterId: 12345,
        jestAutoLoginReminders: false,
      },
    });
    expect(isError(res)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/games/g1`);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].headers["Content-Type"]).toBe("application/json");
    expect(calls[0].body).toEqual({
      category: "Action",
      tags: ["shooter", "zombies"],
      description: null,
      yandexMetricaCounterId: 12345,
      jestAutoLoginReminders: false,
    });
    const text = textOf(res);
    expect(text).toContain("tags: shooter, zombies");
    expect(text).toContain("yandexMetricaCounterId: 12345");
    expect(text).toContain("description: (none)");
  });

  it("trims the name and can clear the engine", async () => {
    const { client, calls } = await connect(withKey, () => ok(updated));
    await client.callTool({ name: "update_game", arguments: { gameId: " g1 ", name: "  Zombies 2 ", engine: null } });
    expect(calls[0].url).toBe(`${BASE}/games/g1`);
    expect(calls[0].body).toEqual({ name: "Zombies 2", engine: null });
  });

  it("requires at least one field and calls nothing without one", async () => {
    const { client, calls } = await connect(withKey);
    const res = await client.callTool({ name: "update_game", arguments: { gameId: "g1" } });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toMatch(/at least one field/);
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["a blank name", { name: "   " }],
    ["an unknown engine", { engine: "godot" }],
    ["an unknown orientation", { orientation: "square" }],
    ["a category over 100 characters", { category: "x".repeat(101) }],
    ["more than 20 tags", { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ["a tag over 50 characters", { tags: ["x".repeat(51)] }],
    ["a zero Metrica counter", { yandexMetricaCounterId: 0 }],
    ["a fractional Metrica counter", { yandexMetricaCounterId: 1.5 }],
    ["a string Metrica counter", { yandexMetricaCounterId: "123" }],
    ["a non-boolean reminders flag", { jestAutoLoginReminders: "yes" }],
  ])("rejects %s before calling the dashboard", async (_label, fields) => {
    const { client, calls } = await connect(withKey);
    const res = await client.callTool({ name: "update_game", arguments: { gameId: "g1", ...fields } });
    expect(isError(res)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("maps a 403 to the ownership message", async () => {
    const { client } = await connect(withKey, () => fail(403, "No permission to modify this game"));
    const res = await client.callTool({ name: "update_game", arguments: { gameId: "g1", name: "x" } });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toMatch(/does not own that game/);
    expect(textOf(res)).toContain("No permission to modify this game");
  });

  it("passes the dashboard's validation message on for a 400", async () => {
    const { client } = await connect(withKey, () => fail(400, "No updatable fields supplied"));
    const res = await client.callTool({ name: "update_game", arguments: { gameId: "g1", name: "x" } });
    expect(textOf(res)).toContain("No updatable fields supplied");
  });
});

describe("set_game_image", () => {
  const presigned = (contentType = "image/png", size = 2048) =>
    ok(
      {
        uploadId: "iu1",
        kind: "icon",
        uploadUrl: "https://r2.test/img?sig=abc",
        method: "PUT",
        headers: { "Content-Type": contentType, "Content-Length": String(size) },
        expiresAt: "2026-10-24T12:15:00Z",
      },
      201,
    );

  it("prepares a presigned image upload and returns a credential-free curl PUT", async () => {
    const { client, calls } = await connect(withKey, () => presigned());
    const res = await client.callTool({
      name: "set_game_image",
      arguments: { gameId: "g1", kind: "icon", size: 2048, imagePath: "art/icon.png" },
    });
    expect(isError(res)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/games/g1/image-uploads`);
    expect(calls[0].body).toEqual({ kind: "icon", contentType: "image/png", size: 2048 });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    const text = textOf(res);
    expect(text).toContain("uploadId: iu1");
    expect(text).toContain("curl -X PUT --data-binary @'art/icon.png' -H 'Content-Type: image/png' 'https://r2.test/img?sig=abc'");
    expect(text).toContain("finalize_image_upload with gameId g1 and uploadId iu1");
    expect(text).not.toContain("YES2_API_KEY");
    expect(text).not.toMatch(/Authorization/);
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it("derives the type from the extension, or takes contentType", async () => {
    for (const [args, mime] of [
      [{ imagePath: "b.JPG" }, "image/jpeg"],
      [{ imagePath: "b.jpeg" }, "image/jpeg"],
      [{ imagePath: "b.webp" }, "image/webp"],
      [{ contentType: "image/webp" }, "image/webp"],
      [{ contentType: "image/jpeg", imagePath: "b.jpg" }, "image/jpeg"],
    ] as const) {
      const { client, calls } = await connect(withKey, () => presigned(mime));
      const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "banner", size: 10, ...args } });
      expect(isError(res), JSON.stringify(args)).toBe(false);
      expect(calls[0].body).toEqual({ kind: "banner", contentType: mime, size: 10 });
      expect(textOf(res)).toContain(`-H 'Content-Type: ${mime}'`);
    }
  });

  it("uses a placeholder without imagePath, and shell-quotes a path and the game id", async () => {
    const { client, calls } = await connect(withKey, () => presigned());
    const placeholder = textOf(
      await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "banner", size: 5, contentType: "image/png" } }),
    );
    expect(placeholder).toContain("--data-binary @<path/to/banner>");
    const quoted = textOf(
      await client.callTool({ name: "set_game_image", arguments: { gameId: "../x", kind: "icon", size: 5, imagePath: "/tmp/it's here/i.png" } }),
    );
    expect(quoted).toContain(`--data-binary @'/tmp/it'\\''s here/i.png'`);
    expect(calls[1].url).toBe(`${BASE}/games/..%2Fx/image-uploads`);
  });

  it("states the route's image limits", async () => {
    const { client } = await connect(withKey, () => presigned());
    const text = textOf(await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "icon", size: 5, contentType: "image/png" } }));
    expect(text).toMatch(/PNG, JPEG or WebP/);
    expect(text).toContain("15 MB");
    expect(text).toMatch(/no width or height is enforced/);
    expect(text).toMatch(/10 minutes/);
    expect(text).not.toMatch(/15 minutes/);
  });

  it("refuses bad input without a call", async () => {
    const { client, calls } = await connect(withKey);
    for (const args of [
      { imagePath: "icon.gif", size: 5 },
      { size: 5 },
      { contentType: "image/png" },
      { imagePath: "i.png" },
      { contentType: "image/png", imagePath: "i.webp", size: 5 },
      { contentType: "image/gif", size: 5 },
      { contentType: "image/png", size: 0 },
      { contentType: "image/png", size: 15 * 1024 * 1024 + 1 },
      { imagePath: "i.png", size: 5, remove: true },
      { size: 5, remove: true },
    ]) {
      const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "icon", ...args } });
      expect(isError(res), JSON.stringify(args)).toBe(true);
    }
    expect(calls).toHaveLength(0);
  });

  it("explains the dashboard's image upload errors", async () => {
    for (const [status, code, pattern] of [
      [400, "UNSUPPORTED_IMAGE_TYPE", /PNG, JPEG or WebP/],
      [400, "INVALID_SIZE", /exact size in bytes/],
      [400, "INVALID_KIND", /icon or banner/],
      [413, "IMAGE_TOO_LARGE", /15 MB/],
      [404, "GAME_NOT_FOUND", /list_games/],
      [409, "R2_NOT_ENABLED", /dashboard UI/],
    ] as const) {

      const { client } = await connect(withKey, () => fail(status, "nope", code));
      const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "icon", size: 5, contentType: "image/png" } });
      expect(isError(res), code).toBe(true);
      expect(textOf(res), code).toMatch(pattern);
      expect(textOf(res), code).toContain(`(${code})`);
    }
  });

  it("TOO_MANY_OPEN_UPLOADS says to finish or wait out the open uploads", async () => {
    const { client } = await connect(withKey, () =>
      json(409, { success: false, code: "TOO_MANY_OPEN_UPLOADS", error: "Too many open image uploads", limit: 2 }),
    );
    const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "icon", size: 5, contentType: "image/png" } });
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toMatch(/maximum number of open image uploads \(2\) \(TOO_MANY_OPEN_UPLOADS\)/);
    expect(text).toMatch(/finalize_image_upload/);
    expect(text).toMatch(/expire, which they do within the hour/);
  });

  it("remove: true sends DELETE /games/:id/:kind with the key", async () => {
    const { client, calls } = await connect(withKey, () => ok({ id: "g1", has_banner: false }));
    const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "banner", remove: true } });
    expect(isError(res)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}/games/g1/banner`);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].body).toBeUndefined();
    expect(textOf(res)).toContain("Removed the banner");
  });

  it("remove maps a 403", async () => {
    const { client } = await connect(withKey, () => fail(403, "No permission to modify this game"));
    const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "icon", remove: true } });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toMatch(/does not own that game/);
  });

  it("rejects an unknown kind", async () => {
    const { client, calls } = await connect(withKey);
    const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "logo", size: 5, contentType: "image/png" } });
    expect(isError(res)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("works for an OAuth credential the same way", async () => {
    const token = "y2a_ImageToken_1";
    const { client, calls } = await connect({ status: "ok", kind: "oauth", credential: token }, () => presigned());
    const res = await client.callTool({ name: "set_game_image", arguments: { gameId: "g1", kind: "icon", size: 5, contentType: "image/png" } });
    expect(isError(res)).toBe(false);
    expect(calls[0].headers.Authorization).toBe(`Bearer ${token}`);
    expect(JSON.stringify(res)).not.toContain(token);
  });
});

describe("finalize_image_upload", () => {
  it("POSTs .../image-uploads/:uploadId/finalize with no body and reports the image as set", async () => {
    const { client, calls } = await connect(withKey, () =>
      ok({ uploadId: "iu1", status: "ready", kind: "banner", id: "g1", has_banner: true, onboarding_stage: "assets" }),
    );
    const res = await client.callTool({ name: "finalize_image_upload", arguments: { gameId: "g1", uploadId: "iu/1" } });
    expect(isError(res)).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(`${BASE}/games/g1/image-uploads/iu%2F1/finalize`);
    expect(calls[0].body).toBeUndefined();
    expect(textOf(res)).toContain("Status: ready. The banner of game g1 is set.");
    expect(textOf(res)).toContain("onboarding_stage: assets");
  });

  it("explains each finalize error", async () => {
    for (const [status, code, pattern] of [
      [409, "UPLOAD_NOT_RECEIVED", /curl PUT from set_game_image, then call finalize_image_upload again/],
      [409, "UPLOAD_IN_PROGRESS", /call finalize_image_upload again/],
      [422, "SIZE_MISMATCH", /cannot be finalized; call set_game_image again/],
      [422, "INVALID_IMAGE", /cannot be finalized/],
      [410, "UPLOAD_EXPIRED", /60 minutes/],
      [404, "UPLOAD_NOT_FOUND", /set_game_image for the same gameId/],
    ] as const) {
      const { client } = await connect(withKey, () => fail(status, "nope", code));
      const res = await client.callTool({ name: "finalize_image_upload", arguments: { gameId: "g1", uploadId: "iu1" } });
      expect(isError(res), code).toBe(true);
      expect(textOf(res), code).toMatch(pattern);
    }
  });

  it("keeps the build texts for the same codes on the build routes", async () => {
    const { client } = await connect(withKey, () => fail(409, "nope", "UPLOAD_NOT_RECEIVED"));
    const res = await client.callTool({ name: "finalize_upload", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(textOf(res)).toMatch(/has not received the zip yet/);
  });
});

describe("preview caps", () => {
  const RULE = /Preview accounts: unlimited games; one build per game, and a new upload replaces the previous one unless that build is in review or live\./;

  it("game_limit_reached names the admin-set limit, without the old 3-game advice", async () => {
    const games = await connect(withKey, () => json(409, { success: false, code: "game_limit_reached", error: "Game limit reached", limit: 5 }));
    const created = await games.client.callTool({ name: "create_game", arguments: { name: "x", engine: "unity" } });
    const text = textOf(created);
    expect(isError(created)).toBe(true);
    expect(text).toMatch(/game limit an admin set on it of 5 \(game_limit_reached\)/);
    expect(text).toMatch(RULE);
    expect(text).not.toMatch(/delete one in the dashboard/);
  });

  it("build_limit_reached means an admin-set cap of 0, not 'remove the existing build'", async () => {
    const { client } = await connect(withKey, () => json(409, { success: false, code: "build_limit_reached", error: "Build limit reached", limit: 0 }));
    const res = await client.callTool({ name: "prepare_upload", arguments: { gameId: "g1", version: "2", size: 10 } });
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toMatch(/build limit 0\) \(build_limit_reached\)/);
    expect(text).toMatch(/admin has set this account's build limit to 0/);
    expect(text).toMatch(RULE);
    expect(text).not.toMatch(/Remove the existing build/);
    expect(text).not.toMatch(/did not register/);
  });

  it("finalize_upload explains a 409 build_limit_reached instead of reporting success", async () => {
    const { client, calls } = await connect(withKey, () =>
      json(409, { success: false, code: "build_limit_reached", error: "Build limit reached", limit: 0, uploadId: "u1" }),
    );
    const res = await client.callTool({ name: "finalize_upload", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(calls[0].url).toBe(`${BASE}/games/g1/build-uploads/u1/finalize`);
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toMatch(/\(build_limit_reached\)/);
    expect(text).toMatch(/did not register this upload as a build/);
    expect(text).not.toMatch(/finalized\. Status/);
  });

  it("prepare_upload explains UPLOAD_ALREADY_OPEN: finish the open upload or wait up to 60 minutes", async () => {
    const { client } = await connect(withKey, () =>
      json(409, { success: false, code: "UPLOAD_ALREADY_OPEN", error: "This game already has an upload in progress." }),
    );
    const res = await client.callTool({ name: "prepare_upload", arguments: { gameId: "g1", version: "2", size: 10 } });
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toMatch(/already has an open upload \(pending or processing\) \(UPLOAD_ALREADY_OPEN\)/);
    expect(text).toMatch(/finalize_upload/);
    expect(text).toMatch(/up to 60 minutes/);
  });

  it("build_protected on prepare_upload says the current build is in review or live", async () => {
    const { client } = await connect(withKey, () => json(409, { success: false, code: "build_protected", error: "Build is in review" }));
    const res = await client.callTool({ name: "prepare_upload", arguments: { gameId: "g1", version: "2", size: 10 } });
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toMatch(/in admin review or live \(build_protected\): Build is in review, so a new upload cannot replace it/);
    expect(text).toMatch(RULE);
    expect(text).toMatch(/once the review has ended/);
    expect(text).not.toMatch(/did not register/);
  });

  it("build_protected on finalize_upload says the upload was not registered", async () => {
    const { client } = await connect(withKey, () => json(409, { success: false, code: "build_protected", error: "Build is in review", uploadId: "u1" }));
    const res = await client.callTool({ name: "finalize_upload", arguments: { gameId: "g1", uploadId: "u1" } });
    expect(isError(res)).toBe(true);
    const text = textOf(res);
    expect(text).toMatch(/\(build_protected\)/);
    expect(text).toMatch(/did not register this upload as a build/);
    expect(text).not.toMatch(/finalized\. Status/);
  });

  it("a failed upload with build_protected explains the review or live build", async () => {
    const { client } = await connect(withKey, () =>
      ok({ uploadId: "u1", status: "failed", error: { code: "build_protected", message: "Build is in review" } }),
    );
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", uploadId: "u1" } });
    const text = textOf(res);
    expect(text).toMatch(/Status: failed \(build_protected\)/);
    expect(text).toMatch(/in admin review or live/);
    expect(text).toMatch(RULE);
  });

  it("a failed upload with build_limit_reached explains the admin-set cap", async () => {
    const { client } = await connect(withKey, () =>
      ok({ uploadId: "u1", status: "failed", error: { code: "build_limit_reached", message: "Build limit reached" } }),
    );
    const res = await client.callTool({ name: "get_build_status", arguments: { gameId: "g1", uploadId: "u1" } });
    const text = textOf(res);
    expect(text).toMatch(/build limit to 0/);
    expect(text).toMatch(RULE);
    expect(text).not.toMatch(/Remove the existing build/);
  });

  it("prepare_upload's description states the preview rule", async () => {
    const { client } = await connect(withKey, () => ok({}));
    const { tools } = await client.listTools();
    const prepare = tools.find((t) => t.name === "prepare_upload");
    expect(prepare?.description).toMatch(RULE);
    expect(prepare?.description).toMatch(/replaces the game's current one/);
  });
});

describe("rename_build", () => {
  it("PATCHes the trimmed name to the build's name route", async () => {
    const { client, calls } = await connect(withKey, () => ok({ id: "b1", displayName: "Release candidate" }));
    const res = await client.callTool({
      name: "rename_build",
      arguments: { gameId: "g1", buildId: "b1", name: "  Release candidate " },
    });
    expect(calls[0].url).toBe(`${BASE}/games/g1/builds/b1/name`);
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0].body).toEqual({ name: "Release candidate" });
    expect(textOf(res)).toContain(`now named "Release candidate"`);
  });

  it("clears the name with null", async () => {
    const { client, calls } = await connect(withKey, () => ok({ id: "b1", displayName: null }));
    const res = await client.callTool({ name: "rename_build", arguments: { gameId: "g1", buildId: "b1", name: null } });
    expect(calls[0].body).toEqual({ name: null });
    expect(textOf(res)).toMatch(/Cleared the display name/);
  });

  it("rejects a name over 100 characters before calling", async () => {
    const { client, calls } = await connect(withKey);
    const res = await client.callTool({ name: "rename_build", arguments: { gameId: "g1", buildId: "b1", name: "x".repeat(101) } });
    expect(isError(res)).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("encodes both ids", async () => {
    const { client, calls } = await connect(withKey, () => ok({ id: "b", displayName: "n" }));
    await client.callTool({ name: "rename_build", arguments: { gameId: "g/1", buildId: "../b", name: "n" } });
    expect(calls[0].url).toBe(`${BASE}/games/g%2F1/builds/..%2Fb/name`);
  });

  it.each([
    ["BUILD_NOT_FOUND", 404, /get_build_status/],
    ["NAME_TOO_LONG", 400, /100 characters/],
    ["INVALID_NAME", 400, /string, or null/],
    ["DISPLAY_NAME_COLUMN_MISSING", 503, /cannot rename builds yet/],
  ] as const)("maps %s", async (code, status, pattern) => {
    const { client } = await connect(withKey, () => fail(status, "upstream", code));
    const res = await client.callTool({ name: "rename_build", arguments: { gameId: "g1", buildId: "b1", name: "n" } });
    expect(isError(res)).toBe(true);
    expect(textOf(res)).toContain(code);
    expect(textOf(res)).toMatch(pattern);
    expect(textOf(res)).not.toMatch(/safe to retry/);
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

  it("409 UPLOAD_NOT_RECEIVED sends the agent back to the curl PUT", async () => {
    const text = await errorFor(() => fail(409, "not received", "UPLOAD_NOT_RECEIVED"));
    expect(text).toContain("UPLOAD_NOT_RECEIVED");
    expect(text).toMatch(/curl PUT/);
  });

  it("never doubles a period when the dashboard's message already ends in one", async () => {
    const text = await errorFor(() =>
      fail(409, "Nothing has been uploaded for this upload yet. PUT the zip to uploadUrl, then finalize.", "UPLOAD_NOT_RECEIVED"),
    );
    expect(text).toContain("then finalize. Run (or finish) the curl PUT");
    expect(text).not.toMatch(/\.\./);
    for (const status of [400, 403, 404, 503]) {
      expect(await errorFor(() => fail(status, "Something went wrong."))).not.toMatch(/\.\./);
    }
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

  it("413 without a code names the 20 MB body cap", async () => {
    expect(await errorFor(() => fail(413, "request entity too large"))).toContain("20 MB");
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
      credential: KEY,
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
