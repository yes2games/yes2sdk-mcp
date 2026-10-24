import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dashboardTool } from "../lib/annotations.js";
import { redactKeys, type ApiKeyAuth } from "../lib/auth.js";
import {
  createDashboardClient,
  DashboardError,
  seg,
  type DashboardClient,
  type FetchLike,
} from "../lib/dashboard.js";

/**
 * The dashboard tools: list and create games, and upload a build through the
 * dashboard's presigned-upload flow. They act with the caller's own API key,
 * which arrives per request (see src/lib/auth.ts) and is forwarded to the
 * dashboard, never stored.
 *
 * The server never touches the zip. prepare_upload returns a presigned URL and
 * a ready-to-run curl command, and the agent uploads from the user's machine
 * straight to storage. That keeps the hosted server's memory flat and means a
 * build never passes through this process.
 */
export interface DashboardToolContext {
  auth: ApiKeyAuth;
  baseUrl: string;
  fetch?: FetchLike;
}

export const ENGINES = ["unity", "defold", "playcanvas", "cocos", "vanilla", "other"] as const;
export const ORIENTATIONS = ["portrait", "landscape", "both"] as const;
export const ZIP_PLACEHOLDER = "<path/to/build.zip>";

const FLOW =
  "Upload flow: (1) zip the built game with index.html at the root of the zip, not inside a folder; " +
  "(2) prepare_upload with the zip's exact size in bytes; (3) the returned curl command PUTs the zip from the user's machine straight to storage; " +
  "(4) finalize_upload; (5) get_build_status every few seconds until the status is ready or failed.";

const AUTH_NOTE =
  "Acts with the caller's own Yes2 dashboard API key (a y2g_ personal key from Dashboard → Settings), sent as the Authorization: Bearer header (or the bare key in X-Yes2-Api-Key) or, for the local stdio server, the YES2_API_KEY env var. The key is passed through to the dashboard and never stored. Without a key it returns the setup steps instead.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: true };

function result(text: string, isError = false): ToolResult {
  // Defence in depth: nothing a dashboard tool returns may carry a key, even
  // one quoted back by an upstream error message.
  const safe = redactKeys(text);
  return { content: [{ type: "text" as const, text: safe }], ...(isError ? { isError: true as const } : {}) };
}

/** The actionable error every dashboard tool returns when no usable key arrived. */
export function missingKeyText(auth: ApiKeyAuth): string {
  const lead =
    auth.status === "malformed"
      ? auth.source === "header"
        ? "The Authorization header sent to this server is not a Yes2 dashboard API key (expected `Bearer y2g_…`)."
        : "YES2_API_KEY is set but is not a Yes2 dashboard API key (expected a value starting with `y2g_`)."
      : "This tool needs a Yes2 dashboard API key, and none reached the server.";
  return [
    lead,
    "",
    "1. Create a personal key in the dashboard: avatar → Settings → Personal API keys → Create personal key. Copy it.",
    "2. Export it in the shell that starts the client: `export YES2_API_KEY=y2g_…`",
    "3. Pass it to this server:",
    "   - Claude Code (hosted server), in .mcp.json: `\"yes2sdk\": { \"type\": \"http\", \"url\": \"https://mcp.yes2games.com/mcp\", \"headers\": { \"Authorization\": \"Bearer ${YES2_API_KEY:-}\" } }`",
    "     or from the CLI: `claude mcp add --transport http yes2sdk https://mcp.yes2games.com/mcp --header \"Authorization: Bearer $YES2_API_KEY\"`",
    "   - Codex, in ~/.codex/config.toml: `[mcp_servers.yes2sdk]` with `url = \"https://mcp.yes2games.com/mcp\"` and `env_http_headers = { \"X-Yes2-Api-Key\" = \"YES2_API_KEY\" }` (the yes2sdk Codex plugin already sends this)",
    "   - Local stdio server (`npx -y @yes2games/yes2sdk-mcp`): add `\"env\": { \"YES2_API_KEY\": \"y2g_…\" }` to its entry.",
    "4. Restart the client so it reconnects with the key.",
    "",
    "The docs and validation tools keep working without a key.",
  ].join("\n");
}

async function run(ctx: DashboardToolContext, body: (client: DashboardClient) => Promise<string>): Promise<ToolResult> {
  if (ctx.auth.status !== "ok") return result(missingKeyText(ctx.auth), true);
  const client = createDashboardClient({ apiKey: ctx.auth.apiKey, baseUrl: ctx.baseUrl, fetch: ctx.fetch });
  try {
    return result(await body(client));
  } catch (err) {
    if (err instanceof DashboardError) return result(err.message, true);
    // Anything else is a bug here, not a dashboard answer. Its text is not
    // trusted to be clean, so it is not echoed.
    return result("The dashboard tool failed unexpectedly. It is safe to retry.", true);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function describeItem(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    const message = str(obj.message);
    const code = str(obj.code);
    if (message) return code ? `${code}: ${message}` : message;
  }
  return JSON.stringify(item);
}

function listSection(title: string, items: unknown): string[] {
  if (!Array.isArray(items) || items.length === 0) return [`${title}: none`];
  return [`${title} (${items.length}):`, ...items.map((item) => `  - ${describeItem(item)}`)];
}

interface Game {
  id?: unknown;
  name?: unknown;
  engine?: unknown;
  orientation?: unknown;
  build_count?: unknown;
  created_at?: unknown;
}

interface PreparedUpload {
  uploadId?: unknown;
  uploadUrl?: unknown;
  method?: unknown;
  headers?: unknown;
  expiresAt?: unknown;
}

interface UploadStatus {
  uploadId?: unknown;
  status?: unknown;
  buildId?: unknown;
  error?: { code?: unknown; message?: unknown } | null;
  build?: Record<string, unknown> | null;
}

/** The curl command for a presigned PUT. Content-Length is left to curl, which measures the file. */
export function curlCommand(prepared: PreparedUpload, zipPath: string | undefined): string {
  const method = str(prepared.method) ?? "PUT";
  const headers: Record<string, string> = { "Content-Type": "application/zip" };
  if (prepared.headers && typeof prepared.headers === "object") {
    for (const [name, value] of Object.entries(prepared.headers as Record<string, unknown>)) {
      if (name.toLowerCase() === "content-length" || typeof value !== "string") continue;
      if (name.toLowerCase() === "content-type") delete headers["Content-Type"];
      headers[name] = value;
    }
  }
  const file = zipPath ? `@${shellQuote(zipPath)}` : `@${ZIP_PLACEHOLDER}`;
  const headerArgs = Object.entries(headers).map(([name, value]) => `-H ${shellQuote(`${name}: ${value}`)}`);
  return [`curl -X ${method}`, `--data-binary ${file}`, ...headerArgs, shellQuote(String(prepared.uploadUrl))].join(" ");
}

function renderBuild(build: Record<string, unknown>, gameId: string): string {
  const inspectorUrl = str(build.inspectorUrl);
  const lines = [
    "Status: ready. The build is on the dashboard.",
    `gameId: ${gameId}`,
    `buildId: ${str(build.id) ?? "unknown"}`,
    `version: ${str(build.version) ?? "unknown"}`,
    `engine: ${str(build.engine) ?? "not detected"}`,
    `inspectorUrl: ${inspectorUrl ?? "not available"}`,
    ...listSection("uploadWarnings", build.uploadWarnings),
    ...listSection("bundleErrors", build.bundleErrors),
  ];
  if (inspectorUrl) {
    lines.push(
      "",
      `Show the user this Inspector link so they can play and QA the build: ${inspectorUrl}`,
    );
  }
  if (Array.isArray(build.uploadWarnings) && build.uploadWarnings.length > 0) {
    lines.push("Mention the upload warnings to the user too; they do not block the build but may block a platform review.");
  }
  return lines.join("\n");
}

export function registerDashboardTools(server: McpServer, ctx: DashboardToolContext): void {
  server.registerTool(
    "list_games",
    {
      ...dashboardTool("List dashboard games", { readOnly: true, idempotent: true }),
      description:
        "The games in the caller's studio on the Yes2 dashboard, newest first, with each game's id, engine and build count. " +
        "The id is the gameId that prepare_upload, finalize_upload and get_build_status take; a game that is not listed yet comes from create_game. " +
        AUTH_NOTE,
      inputSchema: {},
    },
    async () =>
      run(ctx, async (client) => {
        const games = await client.get<Game[]>("/games");
        if (!Array.isArray(games) || games.length === 0) {
          return "This studio has no games yet. create_game makes one.";
        }
        const lines = games.map((g) => {
          const parts = [`engine: ${str(g.engine) ?? "unset"}`];
          if (typeof g.build_count === "number") parts.push(`builds: ${g.build_count}`);
          return `- ${str(g.name) ?? "(unnamed)"} — id: ${str(g.id) ?? "?"} (${parts.join(", ")})`;
        });
        return [`${games.length} game(s) in this studio:`, ...lines].join("\n");
      }),
  );

  server.registerTool(
    "create_game",
    {
      ...dashboardTool("Create a dashboard game", { readOnly: false, idempotent: false }),
      description:
        "Creates a game in the caller's studio on the Yes2 dashboard and returns its id, the gameId for uploading builds. " +
        "Each call makes a new game, so list_games is the way to check whether it already exists. " +
        AUTH_NOTE,
      inputSchema: {
        name: z.string().trim().min(1).max(200).describe("Game name as studios and reviewers will see it."),
        engine: z
          .enum(ENGINES)
          .optional()
          .describe("Engine: 'unity', 'defold', 'playcanvas', 'cocos', 'vanilla' (any JavaScript/TypeScript game: plain JS, Phaser, three.js) or 'other'."),
        description: z.string().max(5000).optional().describe("Optional short description of the game."),
        orientation: z.enum(ORIENTATIONS).optional().describe("'portrait', 'landscape' or 'both'. The dashboard defaults to 'both'."),
      },
    },
    async ({ name, engine, description, orientation }) =>
      run(ctx, async (client) => {
        const body: Record<string, string> = { name };
        if (engine !== undefined) body.engine = engine;
        if (description !== undefined) body.description = description;
        if (orientation !== undefined) body.orientation = orientation;
        const game = await client.post<Game>("/games", body);
        return [
          `Created game "${str(game?.name) ?? name}".`,
          `gameId: ${str(game?.id) ?? "unknown"}`,
          `engine: ${str(game?.engine) ?? "unset"}`,
          `orientation: ${str(game?.orientation) ?? "both"}`,
          "",
          "Next: prepare_upload with this gameId to upload a build.",
        ].join("\n");
      }),
  );

  server.registerTool(
    "prepare_upload",
    {
      ...dashboardTool("Prepare a build upload", { readOnly: false, idempotent: false }),
      description:
        "Step 2 of uploading a build to the Yes2 dashboard: reserves the version and returns an uploadId, an expiry, and a ready-to-run curl command that PUTs the zip to a presigned storage URL. " +
        "The URL is signed to the exact size given, so the size has to be the zip's byte count: `stat -f%z build.zip` on macOS, `stat -c%s build.zip` on Linux. " +
        "This server never reads the zip; the curl command runs on the user's machine. " +
        FLOW +
        " " +
        AUTH_NOTE,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id from list_games or create_game."),
        version: z.string().trim().min(1).max(100).describe("Build version, free-form (e.g. '1.4.2' or '2026.10.23-nightly'). Unique per game."),
        size: z.number().int().positive().describe("Exact size of the zip in bytes. Max 500 MB."),
        notes: z.string().max(500).optional().describe("Optional release notes shown on the build."),
        name: z.string().max(100).optional().describe("Optional display name for the build."),
        zipPath: z
          .string()
          .min(1)
          .optional()
          .describe("Optional local path of the zip on the user's machine, filled into the curl command. Omitted, the command carries a <path/to/build.zip> placeholder."),
      },
    },
    async ({ gameId, version, size, notes, name, zipPath }) =>
      run(ctx, async (client) => {
        const body: Record<string, string | number> = { version, size };
        if (notes !== undefined) body.notes = notes;
        if (name !== undefined) body.name = name;
        const prepared = await client.post<PreparedUpload>(`/games/${seg(gameId)}/build-uploads`, body);
        const uploadId = str(prepared?.uploadId);
        if (!uploadId || !str(prepared?.uploadUrl)) {
          throw new DashboardError("The dashboard did not return an upload URL. It is safe to retry prepare_upload.");
        }
        const lines = [
          `Upload prepared for version ${version} (${size} bytes).`,
          `uploadId: ${uploadId}`,
          `expiresAt: ${str(prepared.expiresAt) ?? "unknown"}`,
          "",
          "Run this from the directory that holds the zip" + (zipPath ? ":" : `, replacing ${ZIP_PLACEHOLDER} with the zip's path:`),
          "",
          curlCommand(prepared, zipPath),
          "",
          "The zip must be exactly the size given above, or storage rejects the PUT. An empty answer means it landed; an XML error body means it did not (usually a size mismatch or an expired URL, fixed by preparing again).",
          `After the PUT succeeds: finalize_upload with gameId ${gameId} and uploadId ${uploadId}, then get_build_status every few seconds until the status is ready or failed.`,
        ];
        return lines.join("\n");
      }),
  );

  server.registerTool(
    "finalize_upload",
    {
      ...dashboardTool("Finalize a build upload", { readOnly: false, idempotent: true }),
      description:
        "Step 4 of uploading a build to the Yes2 dashboard, after the curl PUT has succeeded: tells the dashboard the zip is in storage so it can check, analyse and register the build. " +
        "Processing continues after this returns, and calling it again is safe and reports the current status. " +
        FLOW +
        " " +
        AUTH_NOTE,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id the upload was prepared for."),
        uploadId: z.string().trim().min(1).describe("uploadId returned by prepare_upload."),
      },
    },
    async ({ gameId, uploadId }) =>
      run(ctx, async (client) => {
        const res = await client.post<UploadStatus>(`/games/${seg(gameId)}/build-uploads/${seg(uploadId)}/finalize`);
        const status = str(res?.status) ?? "processing";
        return [
          `Upload ${uploadId} finalized. Status: ${status}.`,
          status === "ready" || status === "failed"
            ? `get_build_status with gameId ${gameId} and uploadId ${uploadId} has the result.`
            : `The dashboard is processing the build. Poll get_build_status with gameId ${gameId} and uploadId ${uploadId} every few seconds until the status is ready or failed.`,
        ].join("\n");
      }),
  );

  server.registerTool(
    "get_build_status",
    {
      ...dashboardTool("Get build upload status", { readOnly: true, idempotent: true }),
      description:
        "Step 5 of uploading a build to the Yes2 dashboard: the status of an upload (gameId + uploadId: pending, processing, ready or failed) or of an existing build (gameId + buildId). " +
        "When ready it returns the build id, the detected engine, upload warnings, bundle errors and the Inspector link where the user can play and QA the build. " +
        "While processing, polling every few seconds is expected. " +
        FLOW +
        " " +
        AUTH_NOTE,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id."),
        uploadId: z.string().trim().min(1).optional().describe("uploadId from prepare_upload. Give this or buildId."),
        buildId: z.string().trim().min(1).optional().describe("Id of an existing build. Give this or uploadId."),
      },
    },
    async ({ gameId, uploadId, buildId }) => {
      if ((uploadId === undefined) === (buildId === undefined)) {
        return result("get_build_status takes exactly one of uploadId (an upload in progress) or buildId (an existing build), plus gameId.", true);
      }
      return run(ctx, async (client) => {
        const game = seg(gameId);
        if (buildId !== undefined) {
          const build = await client.get<Record<string, unknown>>(`/games/${game}/builds/${seg(buildId)}`);
          return renderBuild(build ?? {}, gameId);
        }

        const upload = await client.get<UploadStatus>(`/games/${game}/build-uploads/${seg(uploadId as string)}`);
        const status = str(upload?.status) ?? "unknown";
        if (status === "ready") {
          const embedded = upload.build && typeof upload.build === "object" ? upload.build : undefined;
          const readyBuildId = str(upload.buildId) ?? str(embedded?.id);
          if (embedded && str(embedded.inspectorUrl)) return renderBuild(embedded, gameId);
          if (readyBuildId) {
            const build = await client.get<Record<string, unknown>>(`/games/${game}/builds/${seg(readyBuildId)}`);
            return renderBuild(build ?? {}, gameId);
          }
          return renderBuild(embedded ?? {}, gameId);
        }
        if (status === "failed") {
          const code = str(upload.error?.code);
          const message = str(upload.error?.message) ?? "no reason given";
          const lines = [`Status: failed${code ? ` (${code})` : ""}. ${message}`];
          if (code === "SDK_NOT_INTEGRATED") {
            lines.push("Yes2SDK was not detected in the build, so uploading the same zip again fails the same way. validate_integration on the build output shows what is missing.");
          } else if (code === "VERSION_EXISTS") {
            lines.push("This game already has a build at that version; prepare_upload with a new version.");
          } else if (code === "UPLOAD_EXPIRED") {
            lines.push("The zip was not uploaded and finalized within the hour; start again with prepare_upload.");
          } else if (code === "PROCESSING_INTERRUPTED" || code === "PROCESSING_FAILED") {
            lines.push("The dashboard failed while processing the build, not because of the zip itself as far as it knows; prepare_upload again to retry.");
          } else {
            lines.push("A fixed zip goes through prepare_upload again, with a new uploadId.");
          }
          return lines.join("\n");
        }
        if (status === "pending") {
          return `Status: pending. The dashboard has not started on upload ${uploadId}: the curl PUT has not landed, or finalize_upload has not been called yet.`;
        }
        if (status === "processing") {
          return `Status: processing. The dashboard is checking and registering the build; poll again in a few seconds.`;
        }
        return `Status: ${status}.`;
      });
    },
  );
}
