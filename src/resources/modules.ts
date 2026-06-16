import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_MODULES } from "../tools/docs.js";

/**
 * Register the Yes2SDK module resources: a static `yes2sdk://modules` list and
 * a `yes2sdk://docs/{module}` template that serves per-module API reference
 * markdown. Both reuse the existing docs accessors so there is one source of
 * truth for the module set.
 */
export function registerModuleResources(server: McpServer): void {
  server.registerResource(
    "modules",
    "yes2sdk://modules",
    {
      title: "Yes2SDK modules",
      description: "List of Yes2SDK modules available for integration.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: ["# Yes2SDK modules", "", ...API_MODULES.map((m) => `- ${m}`)].join("\n"),
        },
      ],
    })
  );
}
