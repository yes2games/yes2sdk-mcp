import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDocBySlug, searchDocs } from "../lib/docs.js";
import { readOnlyTool } from "../lib/annotations.js";
import { SUPPORTED_PLATFORMS } from "../lib/platforms.js";
import { SDK_META } from "../lib/sdk-meta.js";

/** Queries about setting up a JS/TS game (rather than an SDK call) get pointed at the JS engine setup. */
const JS_ENGINE_QUERY = /phaser|\bthree(?:\.?js)?\b|\bvite\b|javascript|typescript|@yes2games\/js|\bmock\b|data-yes2-canvas|yes2-?runtime/i;

/** Where JS/TS engine setup lives: the pinned install steps and the developer docs page. */
export function jsEngineFooter(): string {
  const js = SDK_META.js;
  return (
    `JavaScript/TypeScript setup (${js.packageName}@${js.version}: plain canvas, Phaser, three.js, local-dev mock, Vite base: './', data-yes2-canvas): ` +
    `get_install_instructions("js")` +
    (js.docsUrl ? `, docs ${js.docsUrl}` : "") +
    "."
  );
}

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
  "leaderboard",
  "stats",
  "iap",
  "referrals",
  "config",
  "review",
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
      ...readOnlyTool("Search Yes2SDK docs"),
      description:
        "Keyword search across the Yes2SDK documentation — quickstarts, API reference, dashboard guide, integration rules — returning up to the top 5 matching sections with the doc slug of each, for follow-up via get_quickstart(platform) or get_api_reference(module). " +
        "The way in when the question about integration, platform requirements, or the SDK's API is still open-ended: a specific error resolves faster through troubleshoot(symptom), and per-platform module support through get_platform_capabilities(). " +
        "Searches the bundled docs only, with no web access.",
      inputSchema: { query: z.string().min(1).describe("Keywords to search for, e.g. 'rewarded ad reward callback' or 'poki gameplayStop'.") },
      
    },
    async ({ query }) => {
      const hits = searchDocs(query, 5);
      const jsFooter = JS_ENGINE_QUERY.test(query) ? `\n\n${jsEngineFooter()}` : "";
      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No documentation sections matched "${query}". Try broader keywords, or call get_quickstart(platform) / get_api_reference(module) directly.${jsFooter}`,
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
            text: `Top ${hits.length} matches for "${query}":\n\n${body}\n\nFull docs: get_quickstart(platform) or get_api_reference(module).${jsFooter}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_quickstart",
    {
      ...readOnlyTool("Get a Yes2SDK platform quickstart"),
      description:
        `The full quickstart integration guide for one target platform (${SUPPORTED_PLATFORMS.join(", ")}): mandatory call sequence, per-engine examples, critical rules, and the common rejection reasons. ` +
        "The starting point for a new integration, before the first SDK call is written. The TypeScript/JavaScript examples apply to any JS game; engine setup (Phaser, three.js, the local-dev mock) is in get_install_instructions(\"js\").",
      inputSchema: { platform: z.enum(SUPPORTED_PLATFORMS).describe("Target platform.") },
      
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
      return { content: [{ type: "text" as const, text: `${content}\n\n---\n\n${jsEngineFooter()}` }] };
    }
  );

  server.registerTool(
    "get_api_reference",
    {
      ...readOnlyTool("Get a Yes2SDK API reference module"),
      description:
        "The full API reference for one Yes2SDK module — exact method signatures, parameters, return values, and per-platform behavior. " +
        "Modules: overview, lifecycle, ads, analytics, auth, banners, data, errors, friends, game, player, score, session, leaderboard, stats, iap, config, review, upcoming.",
      inputSchema: { module: z.enum(API_MODULES).describe("API module name.") },
      
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
      ...readOnlyTool("List SDK modules"),
      description:
        "The names of every Yes2SDK API reference module. " +
        "A directory for get_api_reference(module) and the yes2sdk://docs/{module} resource when the right module name is not known yet.",
      inputSchema: {},
      
    },
    async () => ({
      content: [{ type: "text" as const, text: API_MODULES.join("\n") }],
    })
  );
}
