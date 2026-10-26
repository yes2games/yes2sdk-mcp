import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dashboardTool } from "../lib/annotations.js";
import { redactKeys, type ApiKeyAuth } from "../lib/auth.js";
import { identityOf, signedInSummary, SIGN_IN_CLIENT_STEPS, SIGN_IN_TOOL, type WhoamiIdentity } from "../lib/oauth.js";
import {
  createDashboardClient,
  DashboardError,
  PREVIEW_LIMITS_TEXT,
  seg,
  type DashboardClient,
  type FetchLike,
} from "../lib/dashboard.js";

/**
 * The dashboard tools: list, create and edit games (details, icon and banner),
 * upload a build through the dashboard's presigned-upload flow, and rename a
 * build. They act with the caller's own API key,
 * which arrives per request (see src/lib/auth.ts) and is forwarded to the
 * dashboard, never stored.
 *
 * The server never touches the zip or an image. prepare_upload returns a presigned URL and
 * a ready-to-run curl command, and the agent uploads from the user's machine
 * straight to storage. That keeps the hosted server's memory flat and means a
 * build never passes through this process. set_game_image does the same for an
 * icon or banner through the dashboard's presigned image upload, finished by
 * finalize_image_upload.
 */
export interface DashboardToolContext {
  auth: ApiKeyAuth;
  baseUrl: string;
  fetch?: FetchLike;
  /**
   * MCP_OAUTH_ENABLED (hosted HTTP server only). On, the descriptions and help
   * texts lead with signing in; off keeps every phase 1 text unchanged.
   */
  oauth?: boolean;
  /** OAuth mode: who a `y2a_` token belongs to, when the HTTP gate already asked whoami. */
  identity?: WhoamiIdentity;
}

export const ENGINES = ["unity", "defold", "playcanvas", "cocos", "vanilla", "other"] as const;
export const ORIENTATIONS = ["portrait", "landscape", "both"] as const;
export const ZIP_PLACEHOLDER = "<path/to/build.zip>";
export const IMAGE_KINDS = ["icon", "banner"] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

/**
 * What POST /api/v1/games/:id/image-uploads accepts: PNG, JPEG or WebP, with
 * the exact size in bytes, 1 to 15 MB. The PUT URL is signed to that type and
 * length, lasts 10 minutes, and the upload must be finalized within 60. At
 * most 2 image uploads per game may be open at once (TOO_MANY_OPEN_UPLOADS).
 */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
export const IMAGE_LIMITS =
  "Image limits (from the dashboard route): PNG, JPEG or WebP only, at most 15 MB (15728640 bytes); no width or height is enforced, and a finalized upload replaces the current image.";

const IMAGE_FLOW =
  "Image flow: (1) set_game_image with the image's exact size in bytes and its type (contentType, or imagePath to derive it from the extension); " +
  "(2) the returned curl command PUTs the file from the user's machine straight to storage, within 10 minutes; (3) finalize_image_upload with the uploadId.";

const FLOW =
  "Upload flow: (1) zip the built game with index.html at the root of the zip, not inside a folder; " +
  "(2) prepare_upload with the zip's exact size in bytes; (3) the returned curl command PUTs the zip from the user's machine straight to storage; " +
  "(4) finalize_upload; (5) get_build_status every few seconds until the status is ready or failed.";

const AUTH_NOTE =
  "Acts with the caller's own Yes2 dashboard API key (a y2g_ personal key from Dashboard → Settings), sent as the Authorization: Bearer header (or the bare key in X-Yes2-Api-Key) or, for the local stdio server, the YES2_API_KEY env var. The key is passed through to the dashboard and never stored. Without a key it returns the setup steps instead.";

const AUTH_NOTE_OAUTH =
  "Acts as the signed-in Yes2 dashboard user. Sign-in is opt-in and only needed for the dashboard tools, never for the docs tools: call sign_in, then in Claude Code the user runs /mcp, picks the Yes2SDK server and chooses Authenticate (in claude.ai a Connect card appears; in Codex the user runs `codex mcp login yes2sdk`), or provide an API key instead (a y2g_ personal key from Dashboard → Settings, sent as the bare key in X-Yes2-Api-Key, or for the local stdio server the YES2_API_KEY env var). Without either it returns the sign-in steps. The credential is passed through to the dashboard and never stored.";

/** What every dashboard tool answers, with MCP_OAUTH_ENABLED, when no Yes2 credential arrived. */
export const NOT_SIGNED_IN_TEXT =
  "You're not signed in to Yes2. To use dashboard tools, sign in: ask me to 'sign in to Yes2' (I'll call the sign_in tool). " +
  `${SIGN_IN_CLIENT_STEPS} ` +
  "Alternatively set YES2_API_KEY (y2g_ key) and send it as X-Yes2-Api-Key.";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: true };

function result(text: string, isError = false): ToolResult {
  // Defence in depth: nothing a dashboard tool returns may carry a key, even
  // one quoted back by an upstream error message.
  const safe = redactKeys(text);
  return { content: [{ type: "text" as const, text: safe }], ...(isError ? { isError: true as const } : {}) };
}

/**
 * The actionable error every dashboard tool returns when no usable key arrived.
 * With `oauth` (the hosted server with MCP_OAUTH_ENABLED=1) it starts with the
 * opt-in sign-in: no credential or a foreign bearer is not an HTTP 401 there,
 * just this result, so the connector stays usable without signing in.
 */
export function missingKeyText(auth: ApiKeyAuth, oauth = false): string {
  if (oauth) return missingCredentialText(auth);
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

export const SIGN_IN_EXPIRED_TEXT =
  "Your Yes2 sign-in has expired or was revoked. To keep using dashboard tools, sign in again: ask me to 'sign in to Yes2' (I'll call the sign_in tool). " +
  `${SIGN_IN_CLIENT_STEPS} ` +
  "Every other tool keeps working without signing in.";

function missingCredentialText(auth: ApiKeyAuth): string {
  if (auth.status === "expired") return SIGN_IN_EXPIRED_TEXT;
  if (auth.status === "malformed") {
    return `${NOT_SIGNED_IN_TEXT}\n\nThe X-Yes2-Api-Key header sent to this server is not a Yes2 dashboard API key (expected \`y2g_…\`).`;
  }
  return NOT_SIGNED_IN_TEXT;
}

async function run(ctx: DashboardToolContext, body: (client: DashboardClient) => Promise<string>): Promise<ToolResult> {
  if (ctx.auth.status !== "ok") return result(missingKeyText(ctx.auth, ctx.oauth === true), true);
  const client = createDashboardClient({
    credential: ctx.auth.credential,
    baseUrl: ctx.baseUrl,
    fetch: ctx.fetch,
    signInHelp: ctx.oauth === true,
  });
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

interface ImageUploadResult {
  uploadId?: unknown;
  status?: unknown;
  kind?: unknown;
  id?: unknown;
  has_icon?: unknown;
  has_banner?: unknown;
  onboarding_stage?: unknown;
}

interface UploadStatus {
  uploadId?: unknown;
  status?: unknown;
  buildId?: unknown;
  error?: { code?: unknown; message?: unknown } | null;
  build?: Record<string, unknown> | null;
}

/**
 * The curl command for a presigned PUT. Content-Length is left to curl, which
 * measures the file, so a wrong file fails the signature instead of hanging.
 * The URL carries the signature: no Authorization header is ever added.
 */
export function curlCommand(
  prepared: PreparedUpload,
  filePath: string | undefined,
  defaults: { contentType: string; placeholder: string } = { contentType: "application/zip", placeholder: ZIP_PLACEHOLDER },
): string {
  const method = str(prepared.method) ?? "PUT";
  const headers: Record<string, string> = { "Content-Type": defaults.contentType };
  if (prepared.headers && typeof prepared.headers === "object") {
    for (const [name, value] of Object.entries(prepared.headers as Record<string, unknown>)) {
      if (name.toLowerCase() === "content-length" || typeof value !== "string") continue;
      if (name.toLowerCase() === "content-type") delete headers["Content-Type"];
      headers[name] = value;
    }
  }
  const file = filePath ? `@${shellQuote(filePath)}` : `@${defaults.placeholder}`;
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

interface UpdatedGame {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  engine?: unknown;
  category?: unknown;
  tags?: unknown;
  orientation?: unknown;
  yandex_metrica_counter_id?: unknown;
  jest_auto_login_reminders?: unknown;
}

function show(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (Array.isArray(value)) return value.length === 0 ? "(none)" : value.map(String).join(", ");
  return String(value);
}

/** The Content-Type for an image path, from its extension; undefined when the route would refuse it. */
export function imageMimeType(imagePath: string): string | undefined {
  const dot = imagePath.lastIndexOf(".");
  return dot === -1 ? undefined : IMAGE_MIME_BY_EXT[imagePath.slice(dot).toLowerCase()];
}

/** The sign_in tool: listed only with MCP_OAUTH_ENABLED (the hosted HTTP server). */
function registerSignInTool(server: McpServer, ctx: DashboardToolContext): void {
  server.registerTool(
    SIGN_IN_TOOL,
    {
      ...dashboardTool("Sign in to Yes2", { readOnly: true, idempotent: true }),
      description:
        "Sign in to the Yes2 dashboard so dashboard tools (upload, edit games) work; only needed for those tools. " +
        "Call it when the user asks to sign in to Yes2, or after a dashboard tool answered that they are not signed in. Calling it does not open a browser by itself; after calling it, tell the user the step for their client. " +
        "In Claude Code: run /mcp, pick the Yes2SDK server and choose Authenticate (the dashboard opens in the browser). Until Authenticate finishes, Claude Code pauses all of this server's tools, docs included; Disable then Enable on the server in /mcp reverts it to anonymous use without signing in. " +
        "In claude.ai: a Connect card appears for the user to click. In Codex: the user runs `codex mcp login yes2sdk`. " +
        "Already signed in (or with an API key), it reports who the user is, the studio and the scopes. The docs and validation tools never need it.",
      inputSchema: {},
    },
    async () => {
      if (ctx.auth.status !== "ok") return result(missingKeyText(ctx.auth, true), true);
      const kind = ctx.auth.kind;
      if (ctx.identity) return result(signedInSummary(ctx.identity, kind));
      return run(ctx, async (client) => signedInSummary(identityOf({ data: await client.get<unknown>("/whoami") }), kind));
    },
  );
}

export function registerDashboardTools(server: McpServer, ctx: DashboardToolContext): void {
  const authNote = ctx.oauth === true ? AUTH_NOTE_OAUTH : AUTH_NOTE;
  if (ctx.oauth === true) registerSignInTool(server, ctx);
  server.registerTool(
    "list_games",
    {
      ...dashboardTool("List dashboard games", { readOnly: true, idempotent: true }),
      description:
        "The games in the caller's studio on the Yes2 dashboard, newest first, with each game's id, engine and build count. " +
        "The id is the gameId that prepare_upload, finalize_upload and get_build_status take; a game that is not listed yet comes from create_game. " +
        authNote,
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
        authNote,
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
        PREVIEW_LIMITS_TEXT +
        " For a preview account, tell the user before uploading that the new build replaces the game's current one. " +
        FLOW +
        " " +
        authNote,
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
        authNote,
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
        authNote,
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
          } else if (code === "build_protected") {
            lines.push(
              `The game's current build is in admin review or live, so this upload could not replace it and was discarded. ${PREVIEW_LIMITS_TEXT} Upload again with prepare_upload once the review has ended.`,
            );
          } else if (code === "build_limit_reached") {
            lines.push(
              `An admin has set this account's build limit to 0, so the game cannot take a build. ${PREVIEW_LIMITS_TEXT} Retrying will not help; ask a Yes2 admin to lift the limit, or ask to join a studio.`,
            );
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

  server.registerTool(
    "update_game",
    {
      ...dashboardTool("Update a dashboard game", { readOnly: false, idempotent: true }),
      description:
        "Changes a game's details on the Yes2 dashboard: name, description, engine, category, tags, orientation, the Yandex Metrica counter and the Jest auto-login reminders. " +
        "Only the fields given are touched, and at least one is required. null clears description, engine, category or yandexMetricaCounterId; tags replaces the whole list ([] clears it). " +
        "The icon and banner are set with set_game_image, a build's display name with rename_build. " +
        authNote,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id from list_games or create_game."),
        name: z.string().trim().min(1).optional().describe("New game name. Cannot be blank."),
        description: z.string().nullable().optional().describe("New description, trimmed by the dashboard. null clears it."),
        engine: z
          .enum(ENGINES)
          .nullable()
          .optional()
          .describe("'unity', 'defold', 'playcanvas', 'cocos', 'vanilla' (any JavaScript/TypeScript game) or 'other'. null clears it."),
        category: z.string().max(100).nullable().optional().describe("Category, up to 100 characters (e.g. 'Action'). null clears it."),
        tags: z
          .array(z.string().max(50))
          .max(20)
          .optional()
          .describe("The full tag list, replacing the current one: up to 20 tags of up to 50 characters each. [] clears it."),
        orientation: z.enum(ORIENTATIONS).optional().describe("'portrait', 'landscape' or 'both'."),
        yandexMetricaCounterId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe("Yandex Metrica counter id used by the Yandex bundle, a positive integer. null clears it."),
        jestAutoLoginReminders: z.boolean().optional().describe("Whether the Jest bundle shows its auto-login reminders."),
      },
    },
    async ({ gameId, ...fields }) => {
      const body = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      if (Object.keys(body).length === 0) {
        return result(
          "update_game needs at least one field to change besides gameId: name, description, engine, category, tags, orientation, yandexMetricaCounterId or jestAutoLoginReminders.",
          true,
        );
      }
      return run(ctx, async (client) => {
        const game = await client.patch<UpdatedGame>(`/games/${seg(gameId)}`, body);
        const g = game ?? {};
        return [
          `Updated game "${str(g.name) ?? gameId}" (${Object.keys(body).join(", ")}).`,
          `gameId: ${str(g.id) ?? gameId}`,
          `name: ${show(g.name)}`,
          `description: ${show(g.description)}`,
          `engine: ${show(g.engine)}`,
          `category: ${show(g.category)}`,
          `tags: ${show(g.tags)}`,
          `orientation: ${show(g.orientation)}`,
          `yandexMetricaCounterId: ${show(g.yandex_metrica_counter_id)}`,
          `jestAutoLoginReminders: ${show(g.jest_auto_login_reminders)}`,
        ].join("\n");
      });
    },
  );

  server.registerTool(
    "set_game_image",
    {
      ...dashboardTool("Set a game's icon or banner", { readOnly: false, idempotent: false, destructive: true }),
      description:
        "Sets or removes a game's icon or banner on the Yes2 dashboard. " +
        "Setting one: give the image's exact size in bytes (`stat -f%z <file>` on macOS, `stat -c%s <file>` on Linux) and its type, as contentType or as imagePath (the type comes from the extension). " +
        "It returns an uploadId and a ready-to-run curl command that PUTs the file from the user's machine to a presigned storage URL; the command carries no credential, and this server never reads the file. " +
        "After the PUT succeeds, finalize_image_upload stores it. " +
        "PNG, JPEG or WebP, at most 15 MB; no dimensions are enforced; the new image replaces the current one. " +
        "With remove: true it deletes the current image directly instead. " +
        IMAGE_FLOW +
        " " +
        authNote,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id from list_games or create_game."),
        kind: z.enum(IMAGE_KINDS).describe("'icon' or 'banner'."),
        size: z
          .number()
          .int()
          .min(1)
          .max(IMAGE_MAX_BYTES)
          .optional()
          .describe("Exact size of the image file in bytes, at most 15728640 (15 MB). Required unless remove is true."),
        contentType: z
          .enum(IMAGE_CONTENT_TYPES)
          .optional()
          .describe("The image's type: image/png, image/jpeg or image/webp. Omit it when imagePath is given; the extension decides."),
        imagePath: z
          .string()
          .min(1)
          .optional()
          .describe("Optional local path of the image on the user's machine (.png, .jpg, .jpeg or .webp), filled into the curl command and used for the type. Omitted, the command carries a placeholder."),
        remove: z.boolean().optional().describe("true deletes the current icon or banner instead of preparing an upload."),
      },
    },
    async ({ gameId, kind, size, contentType, imagePath, remove }) => {
      if (remove === true) {
        if (imagePath !== undefined || size !== undefined || contentType !== undefined) {
          return result("set_game_image takes either an image to upload (size with contentType or imagePath) or remove: true (to delete it), not both.", true);
        }
        return run(ctx, async (client) => {
          await client.delete<Record<string, unknown>>(`/games/${seg(gameId)}/${kind}`);
          return [
            `Removed the ${kind} of game ${gameId} (removing one that was not there also succeeds).`,
            kind === "icon" ? "The game profile needs an icon to be complete, so add a new one before publishing." : "",
          ]
            .filter((line) => line !== "")
            .join("\n");
        });
      }

      const fromPath = imagePath !== undefined ? imageMimeType(imagePath) : undefined;
      if (imagePath !== undefined && fromPath === undefined) {
        return result(
          `The dashboard accepts only PNG, JPEG or WebP images, and ${imagePath} does not end in .png, .jpg, .jpeg or .webp. Convert it first, then call set_game_image again.`,
          true,
        );
      }
      if (contentType !== undefined && fromPath !== undefined && contentType !== fromPath) {
        return result(`contentType ${contentType} does not match ${imagePath}, which is ${fromPath} by its extension. Give one or make them agree.`, true);
      }
      const type = contentType ?? fromPath;
      if (type === undefined) {
        return result("set_game_image needs the image's type: contentType (image/png, image/jpeg or image/webp) or an imagePath with a .png, .jpg, .jpeg or .webp extension.", true);
      }
      if (size === undefined) {
        return result(
          "set_game_image needs the image's exact size in bytes (`stat -f%z <file>` on macOS, `stat -c%s <file>` on Linux): the upload URL is signed to it.",
          true,
        );
      }

      return run(ctx, async (client) => {
        const prepared = await client.post<PreparedUpload>(`/games/${seg(gameId)}/image-uploads`, { kind, contentType: type, size });
        const uploadId = str(prepared?.uploadId);
        if (!uploadId || !str(prepared?.uploadUrl)) {
          throw new DashboardError("The dashboard did not return an image upload URL. It is safe to call set_game_image again.");
        }
        const placeholder = `<path/to/${kind}>`;
        return [
          `Image upload prepared for the ${kind} of game ${gameId} (${type}, ${size} bytes).`,
          `uploadId: ${uploadId}`,
          `expiresAt: ${str(prepared.expiresAt) ?? "unknown"}`,
          "",
          "Run this on the user's machine" + (imagePath ? ":" : `, replacing ${placeholder} with the image's path:`),
          "",
          curlCommand(prepared, imagePath, { contentType: type, placeholder }),
          "",
          "The URL is signed to that exact type and size and works for 10 minutes. It carries no credential, so nothing needs to be exported first. An empty answer means it landed; an XML error body means it did not (usually a size or type mismatch, or an expired URL, fixed by calling set_game_image again).",
          IMAGE_LIMITS,
          `After the PUT succeeds: finalize_image_upload with gameId ${gameId} and uploadId ${uploadId} (within 60 minutes).`,
        ].join("\n");
      });
    },
  );

  server.registerTool(
    "finalize_image_upload",
    {
      ...dashboardTool("Finalize an icon or banner upload", { readOnly: false, idempotent: true }),
      description:
        "Last step of setting a game's icon or banner, after the curl PUT from set_game_image has succeeded: the dashboard checks the image and makes it the game's icon or banner. " +
        "Calling it again is safe. " +
        IMAGE_FLOW +
        " " +
        authNote,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id the image upload was prepared for."),
        uploadId: z.string().trim().min(1).describe("uploadId returned by set_game_image."),
      },
    },
    async ({ gameId, uploadId }) =>
      run(ctx, async (client) => {
        const res = await client.post<ImageUploadResult>(`/games/${seg(gameId)}/image-uploads/${seg(uploadId)}/finalize`);
        const kind = str(res?.kind) ?? "image";
        const status = str(res?.status) ?? "unknown";
        if (status !== "ready") return `Image upload ${uploadId} finalized. Status: ${status}.`;
        const lines = [`Status: ready. The ${kind} of game ${str(res.id) ?? gameId} is set.`];
        const stage = str(res.onboarding_stage);
        if (stage) lines.push(`onboarding_stage: ${stage}`);
        return lines.join("\n");
      }),
  );

  server.registerTool(
    "rename_build",
    {
      ...dashboardTool("Rename a build", { readOnly: false, idempotent: true }),
      description:
        "Sets a build's display name on the Yes2 dashboard, the label shown instead of the zip file name. " +
        "Up to 100 characters, trimmed; null or a blank name clears it back to the zip file name. " +
        authNote,
      inputSchema: {
        gameId: z.string().trim().min(1).describe("Game id the build belongs to."),
        buildId: z.string().trim().min(1).describe("Build id, from get_build_status once an upload is ready."),
        name: z
          .string()
          .trim()
          .max(100)
          .nullable()
          .describe("New display name, up to 100 characters after trimming. null or blank clears it."),
      },
    },
    async ({ gameId, buildId, name }) =>
      run(ctx, async (client) => {
        const renamed = await client.patch<{ id?: unknown; displayName?: unknown }>(
          `/games/${seg(gameId)}/builds/${seg(buildId)}/name`,
          { name },
        );
        const displayName = str(renamed?.displayName);
        return displayName
          ? `Build ${str(renamed?.id) ?? buildId} is now named "${displayName}".`
          : `Cleared the display name of build ${str(renamed?.id) ?? buildId}; the dashboard shows its zip file name again.`;
      }),
  );
}
