import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRulesForPlatform } from "../lib/compliance.js";

const PLATFORMS = ["poki", "crazygames", "yandex", "gamedistribution", "youtube"] as const;

/**
 * Register get_platform_requirements: lists the compliance rules a build must
 * satisfy for a target platform. Rules come from the generated compliance
 * engine (universal + platform-specific), so they stay in sync with what
 * validate_integration enforces.
 */
export function registerRequirementsTool(server: McpServer): void {
  server.registerTool(
    "get_platform_requirements",
    {
      title: "Get platform requirements",
      description:
        "List the compliance rules a build must satisfy for a given platform " +
        "(poki, crazygames, yandex, gamedistribution, youtube). " +
        "Each rule is the same check validate_integration runs, so use this to learn what to satisfy up front.",
      inputSchema: { platform: z.enum(PLATFORMS).describe("Target platform.") },
    },
    async ({ platform }) => {
      const rules = getRulesForPlatform(platform);
      const text = rules
        .map((r) => `- ${r.id} [${r.severity}]: ${r.description}`)
        .join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
