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
import { DESCRIPTION } from "./lib/positioning.js";

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
      version: "0.3.0",
    },
    {
      instructions: [
        DESCRIPTION,
        "Yes2SDK engines: TypeScript/JavaScript, Unity, and Defold — HTML5/WebGL only.",
        "",
        "Modules: ads, analytics, auth, banners, data, errors, friends, game, player, score, session, lifecycle.",
        "",
        "Install before code: this server reports whether a project can compile SDK references at all. detect_sdk(projectPath) returns the engine, install state and remaining steps; get_install_instructions(engine) returns the version-pinned steps. Code referencing the Yes2SDK namespace (Unity), the yes2sdk module (Defold) or window.Yes2SDK (JS) will not compile or resolve until the package is installed.",
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
