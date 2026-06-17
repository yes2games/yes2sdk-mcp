import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDocBySlug, searchDocs } from "../lib/docs.js";

/** Platforms with a quickstart guide. */
const QUICKSTART_PLATFORMS = [
  "poki",
  "crazygames",
  "yandex",
  "gamedistribution",
  "youtube",
] as const;

/** API reference modules under docs/api/. */
export const API_MODULES = [
  "overview",
  "lifecycle",
  "ads",
  "analytics",
  "auth",
  "banners",
  "data",
  "errors",
  "friends",
  "game",
  "player",
  "score",
  "session",
  "upcoming",
] as const;

/**
 * Register the documentation tools: search_docs, get_quickstart,
 * get_api_reference. All read from the package's bundled `docs/` directory.
 */
export function registerDocsTools(server: McpServer): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search Yes2SDK docs",
      description:
        "Search the Yes2SDK documentation (quickstarts, API reference, dashboard guide, integration rules) by keyword. " +
        "Returns the top matching sections with their doc slug so you can follow up with get_quickstart or get_api_reference. " +
        "Use this for anything about integrating the Yes2SDK, platform requirements (Poki, CrazyGames, Yandex, GameDistribution, YouTube), or the SDK's API.",
      inputSchema: { query: z.string().min(1).describe("Keywords to search for, e.g. 'rewarded ad reward callback' or 'poki gameplayStop'.") },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ query }) => {
      const hits = searchDocs(query, 5);
      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No documentation sections matched "${query}". Try broader keywords, or call get_quickstart(platform) / get_api_reference(module) directly.`,
            },
          ],
        };
      }
      const body = hits
        .map((h, i) => {
          const heading = h.heading && h.heading !== "(intro)" ? ` › ${h.heading}` : "";
          return `### ${i + 1}. ${h.slug}${heading}\n(source: docs/${h.relPath})\n\n${h.excerpt}`;
        })
        .join("\n\n---\n\n");
      return {
        content: [
          {
            type: "text" as const,
            text: `Top ${hits.length} matches for "${query}":\n\n${body}\n\nFull docs: get_quickstart(platform) or get_api_reference(module).`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_quickstart",
    {
      title: "Get a Yes2SDK platform quickstart",
      description:
        "Return the full quickstart integration guide for a target platform (poki, crazygames, yandex, gamedistribution, youtube). " +
        "These guides include the mandatory call sequence, per-engine examples, critical rules, and common rejection reasons. " +
        "Read the quickstart for the platform you're integrating before writing SDK calls.",
      inputSchema: { platform: z.enum(QUICKSTART_PLATFORMS).describe("Target platform.") },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ platform }) => {
      const slug = `quickstart-${platform}`;
      const content = readDocBySlug(slug);
      if (content === null) {
        return {
          content: [{ type: "text" as const, text: `Quickstart not found for platform "${platform}" (expected docs/${slug}.md).` }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: content }] };
    }
  );

  server.registerTool(
    "get_api_reference",
    {
      title: "Get a Yes2SDK API reference module",
      description:
        "Return the full API reference for one Yes2SDK module. Modules: overview, lifecycle, ads, analytics, auth, banners, data, errors, friends, game, player, score, session, upcoming. " +
        "Use this for precise method signatures and behavior when calling the SDK.",
      inputSchema: { module: z.enum(API_MODULES).describe("API module name.") },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async ({ module }) => {
      const slug = `api/${module}`;
      const content = readDocBySlug(slug);
      if (content === null) {
        return {
          content: [{ type: "text" as const, text: `API reference not found for module "${module}" (expected docs/${slug}.md).` }],
          isError: true,
        };
      }
      return { content: [{ type: "text" as const, text: content }] };
    }
  );

  server.registerTool(
    "list_sdk_modules",
    {
      title: "List SDK modules",
      description:
        "List all Yes2SDK API reference module names available for integration. " +
        "Use the returned names with get_api_reference(module) or the yes2sdk://docs/{module} resource.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    async () => ({
      content: [{ type: "text" as const, text: API_MODULES.join("\n") }],
    })
  );
}
