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
        "(poki, crazygames, yandex, gamedistribution, youtube), each as 'id [severity]: description' — the same checks validate_integration runs. " +
        "Use this to learn what to satisfy up front; for the detail and fix of one rule id pass it to get_compliance_rule(ruleId), and to check an actual build run validate_integration. " +
        "Read-only. Returns the rule list only; it does not evaluate a build.",
      inputSchema: { platform: z.enum(PLATFORMS).describe("Target platform.") },
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
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
