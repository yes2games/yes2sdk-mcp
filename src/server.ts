import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerValidateTool } from "./tools/validate.js";
import { registerRequirementsTool } from "./tools/requirements.js";
import { registerModuleResources } from "./resources/modules.js";
import { registerIntegratePrompts } from "./prompts/integrate.js";

/**
 * Build and configure the Yes2SDK MCP server with all tools registered.
 *
 * Transport-agnostic: callers connect their own transport (stdio in index.ts;
 * an HTTP transport could be added later without touching this factory).
 */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "yes2sdk",
      version: "0.1.0",
    },
    {
      instructions: [
        "Yes2SDK MCP server. Helps integrate the Yes2SDK (TypeScript/JavaScript, Unity, and Defold — HTML5/WebGL only) into games targeting Poki, CrazyGames, Yandex, GameDistribution, and YouTube.",
        "",
        "Modules: ads, analytics, auth, banners, data, errors, friends, game, player, score, session, lifecycle.",
        "",
        "Typical flow: 1) get_quickstart for the target platform, 2) get_api_reference per module, 3) search_docs for specifics, 4) validate_integration against the built WebGL output or a captured Inspector event log.",
        "validate_integration checks both static build output (buildPath) and behavioral compliance (eventLogJson) against real platform rejection rules.",
      ].join("\n"),
    }
  );

  registerDocsTools(server);
  registerValidateTool(server);
  registerRequirementsTool(server);
  registerModuleResources(server);
  registerIntegratePrompts(server);

  return server;
}
