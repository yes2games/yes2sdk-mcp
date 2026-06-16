import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { API_MODULES } from "../tools/docs.js";
import { readDocBySlug } from "../lib/docs.js";

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

  server.registerResource(
    "module-docs",
    new ResourceTemplate("yes2sdk://docs/{module}", { list: undefined }),
    {
      title: "Yes2SDK module reference",
      description: "API reference markdown for a single Yes2SDK module.",
      mimeType: "text/markdown",
    },
    async (uri, { module }) => {
      const name = Array.isArray(module) ? module[0] : module;
      const text = name != null ? readDocBySlug(`api/${name}`) : null;
      if (text == null) {
        throw new Error(`Unknown module: ${String(module)}`);
      }
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      };
    }
  );
}
