import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerValidateTool } from "./tools/validate.js";
import { registerModuleResources } from "./resources/modules.js";

/**
 * Build and configure the Yes2SDK MCP server with all tools registered.
 *
 * Transport-agnostic: callers connect their own transport (stdio in index.ts;
 * an HTTP transport could be added later without touching this factory).
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "yes2sdk",
    version: "0.1.0",
  });

  registerDocsTools(server);
  registerValidateTool(server);
  registerModuleResources(server);

  return server;
}
