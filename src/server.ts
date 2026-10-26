import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerValidateTool } from "./tools/validate.js";
import { registerRequirementsTool } from "./tools/requirements.js";
import { registerInstallTool } from "./tools/install.js";
import { registerDetectTool } from "./tools/detect.js";
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerRuleTool } from "./tools/rule.js";
import { registerTroubleshootTool } from "./tools/troubleshoot.js";
import { registerDashboardTools } from "./tools/dashboard.js";
import { registerModuleResources } from "./resources/modules.js";
import { registerIntegratePrompts } from "./prompts/integrate.js";
import { DESCRIPTION } from "./lib/positioning.js";
import { VERSION } from "./lib/version.js";
import { NO_KEY, type ApiKeyAuth } from "./lib/auth.js";
import { resolveDashboardUrl, type FetchLike } from "./lib/dashboard.js";
import type { WhoamiIdentity } from "./lib/oauth.js";

export interface ServerOptions {
  /**
   * The caller's dashboard API key for this server instance only. Over HTTP it
   * comes from the request's Authorization header, over stdio from
   * YES2_API_KEY. Defaults to no key: the docs tools work, the dashboard tools
   * return setup steps.
   */
  auth?: ApiKeyAuth;
  /** Dashboard API base. Defaults to DASHBOARD_API_URL, then the production URL. */
  dashboardApiUrl?: string;
  /** Injected fetch for tests. */
  fetch?: FetchLike;
  /**
   * MCP_OAUTH_ENABLED, for the hosted HTTP server only (stdio never sets it).
   * On, the instructions and dashboard tool texts say "sign in or provide an
   * API key"; off, every text is exactly phase 1.
   */
  oauth?: boolean;
  /** OAuth mode: who the request's `y2a_` token belongs to, when the HTTP gate already asked whoami. */
  identity?: WhoamiIdentity;
}

const UPLOAD_INSTRUCTIONS_KEY =
  "Uploading a build to the Yes2 dashboard (needs the user's own dashboard API key, sent as Authorization: Bearer y2g_… or the YES2_API_KEY env var; without one these tools return the setup steps): list_games or create_game for the gameId; zip the built game with index.html at the zip root; prepare_upload(gameId, version, size in bytes) returns an uploadId and a curl PUT command that sends the zip from the user's machine straight to storage (this server never handles the file); after the PUT, finalize_upload(gameId, uploadId); then get_build_status(gameId, uploadId) every few seconds until ready or failed. When ready, show the user the inspectorUrl and any uploadWarnings.";

const EDIT_INSTRUCTIONS_KEY =
  "Editing a game with the same key: update_game(gameId, fields) changes name, description, engine, category, tags, orientation, yandexMetricaCounterId or jestAutoLoginReminders; set_game_image(gameId, kind: icon | banner, size in bytes, contentType or imagePath) returns an uploadId and a curl PUT command that sends the image from the user's machine straight to storage with no credential in it, then finalize_image_upload(gameId, uploadId) sets it (remove: true deletes the image instead); rename_build(gameId, buildId, name) sets a build's display name, null clears it.";

const EDIT_INSTRUCTIONS_OAUTH =
  "Editing a game with the same sign-in or key: update_game(gameId, fields) changes name, description, engine, category, tags, orientation, yandexMetricaCounterId or jestAutoLoginReminders; set_game_image(gameId, kind: icon | banner, size in bytes, contentType or imagePath) returns an uploadId and a curl PUT command that sends the image from the user's machine straight to storage with no credential in it, then finalize_image_upload(gameId, uploadId) sets it (remove: true deletes the image instead); rename_build(gameId, buildId, name) sets a build's display name, null clears it.";

const UPLOAD_INSTRUCTIONS_OAUTH =
  "Uploading a build to the Yes2 dashboard (sign-in is opt-in and only needed for the dashboard tools; the docs and validation tools never need it. To sign in, call sign_in when the user asks to sign in to Yes2 or after a dashboard tool says they are not signed in; it does not open a browser by itself. In Claude Code, after calling sign_in tell the user to run /mcp, pick the Yes2SDK server and choose Authenticate (the dashboard opens in the browser; this server's tools pause until then, and Disable → Enable in /mcp reverts to anonymous); in claude.ai a Connect card appears; in Codex the user runs `codex mcp login yes2sdk`. A y2g_ API key sent as X-Yes2-Api-Key works too): list_games or create_game for the gameId; zip the built game with index.html at the zip root; prepare_upload(gameId, version, size in bytes) returns an uploadId and a curl PUT command that sends the zip from the user's machine straight to storage (this server never handles the file); after the PUT, finalize_upload(gameId, uploadId); then get_build_status(gameId, uploadId) every few seconds until ready or failed. When ready, show the user the inspectorUrl and any uploadWarnings.";

/**
 * Build and configure the Yes2SDK MCP server with all tools registered.
 *
 * Transport-agnostic: callers connect their own transport (stdio in index.ts,
 * Streamable HTTP in http.ts). The HTTP entry builds one server per request,
 * which is what scopes `options.auth` to that request.
 */
export function createServer(options: ServerOptions = {}): McpServer {
  const server = new McpServer(
    {
      name: "yes2sdk",
      version: VERSION,
    },
    {
      instructions: [
        DESCRIPTION,
        "Yes2SDK engines: TypeScript/JavaScript (the @yes2games/js npm package: plain canvas, Phaser, three.js; the dashboard injects the SDK at upload), Unity, and Defold — HTML5/WebGL only.",
        "",
        "Modules: ads, analytics, auth, banners, data, errors, friends, game, player, score, session, lifecycle, iap, notifications, referrals.",
        "",
        "Install before code: this server reports whether a project can compile SDK references at all. detect_sdk(projectPath) returns the engine, install state and remaining steps; get_install_instructions(engine) returns the version-pinned steps. Code referencing the Yes2SDK namespace (Unity), the yes2sdk module (Defold) or window.Yes2SDK (JS) will not compile or resolve until the package is installed. For JS, install @yes2games/js (types, runtime helpers, local-dev mock), never bundle yes2sdk.umd.js, build with Vite base: './', and mark the game canvas data-yes2-canvas.",
        "",
        "Typical flow: 1) detect_sdk(projectPath) / get_install_instructions(engine) to ensure the SDK is installed, 2) get_quickstart for the target platform, 3) get_api_reference per module, 4) search_docs for specifics, 5) validate_integration against the built WebGL output or a captured Inspector event log.",
        "validate_integration checks both static build output (buildPath) and behavioral compliance (eventLogJson) against real platform rejection rules.",
        "",
        options.oauth === true ? UPLOAD_INSTRUCTIONS_OAUTH : UPLOAD_INSTRUCTIONS_KEY,
        options.oauth === true ? EDIT_INSTRUCTIONS_OAUTH : EDIT_INSTRUCTIONS_KEY,
      ].join("\n"),
    }
  );

  registerInstallTool(server);
  registerDetectTool(server);
  registerDocsTools(server);
  registerValidateTool(server);
  registerRequirementsTool(server);
  registerCapabilitiesTool(server);
  registerRuleTool(server);
  registerTroubleshootTool(server);
  registerDashboardTools(server, {
    auth: options.auth ?? NO_KEY,
    baseUrl: resolveDashboardUrl(options.dashboardApiUrl ?? process.env.DASHBOARD_API_URL),
    fetch: options.fetch,
    oauth: options.oauth === true,
    identity: options.identity,
  });
  registerModuleResources(server);
  registerIntegratePrompts(server);

  return server;
}
