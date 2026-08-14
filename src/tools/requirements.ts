import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRulesForPlatform } from "../lib/compliance.js";
import { readOnlyTool } from "../lib/annotations.js";
import { SUPPORTED_PLATFORMS } from "../lib/platforms.js";

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
      ...readOnlyTool("Get platform requirements"),
      description:
        `The compliance rules a build must satisfy for one platform (${SUPPORTED_PLATFORMS.join(", ")}), each as 'id [severity]: description'. These are the same checks validate_integration runs. ` +
        "Answers \"what do I have to get right for this platform?\" up front; one rule's detail and fix comes from get_compliance_rule(ruleId), and an actual build is graded by validate_integration. " +
        "Returns the rule list only; no build is evaluated.",
      inputSchema: { platform: z.enum(SUPPORTED_PLATFORMS).describe("Target platform.") },
      
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
