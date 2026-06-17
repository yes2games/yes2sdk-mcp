import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerValidateTool } from "./tools/validate.js";
import { registerRequirementsTool } from "./tools/requirements.js";
import { registerInstallTool } from "./tools/install.js";
import { registerDetectTool } from "./tools/detect.js";
import { registerCapabilitiesTool } from "./tools/capabilities.js";
import { registerRuleTool } from "./tools/rule.js";
import { registerTroubleshootTool } from "./tools/troubleshoot.js";
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
        "IMPORTANT — install before code: a project must install the SDK before any code can reference it. Before generating engine code, call detect_sdk(projectPath) to check the project, and get_install_instructions(engine) for the steps. Never emit code referencing the Yes2SDK namespace (Unity), the yes2sdk module (Defold), or window.Yes2SDK (JS) into a project that has not installed the package — it will not compile/resolve.",
        "",
        "Typical flow: 1) detect_sdk(projectPath) / get_install_instructions(engine) to ensure the SDK is installed, 2) get_quickstart for the target platform, 3) get_api_reference per module, 4) search_docs for specifics, 5) validate_integration against the built WebGL output or a captured Inspector event log.",
        "validate_integration checks both static build output (buildPath) and behavioral compliance (eventLogJson) against real platform rejection rules.",
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
  registerModuleResources(server);
  registerIntegratePrompts(server);

  return server;
}
