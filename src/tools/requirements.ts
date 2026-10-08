import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getRulesForPlatform } from "../lib/compliance.js";
import type { ComplianceRule } from "../lib/inspector-types.js";
import { readOnlyTool } from "../lib/annotations.js";
import { SUPPORTED_PLATFORMS } from "../lib/platforms.js";
import { getLaunchChecklist, hasPlatformRules } from "../lib/launch-checklists.js";
import { PLATFORM_LABELS } from "../lib/build-checks.js";

function ruleLines(rules: ComplianceRule[]): string {
  return rules.map((r) => `- ${r.id} [${r.severity}]: ${r.description}`).join("\n");
}

/**
 * The requirements text for one platform. A platform with automated rules gets
 * the plain rule list, exactly as before. A platform without any gets an
 * explicit "pending" notice first, so an empty platform section never reads as
 * "nothing to do". A hand-written launch checklist, where one exists, follows
 * the automated rules as manual items.
 */
export function renderRequirements(platform: string): string {
  const rules = getRulesForPlatform(platform);
  const checklist = getLaunchChecklist(platform);
  const name = checklist?.platformName ?? PLATFORM_LABELS[platform] ?? platform;
  const pending = !hasPlatformRules(platform);

  if (!pending && !checklist) return ruleLines(rules);

  const parts: string[] = [];
  if (pending) {
    parts.push(
      `Automated compliance rules for ${name} are pending: validate_integration runs no ${name}-specific rule yet, only the universal rules below.` +
        (checklist ? " Until they ship, the launch checklist below is the platform requirement set; verify each item by hand." : "")
    );
  }
  parts.push(
    pending
      ? `Universal rules (automated, every platform):\n${ruleLines(rules)}`
      : `Automated rules (universal and ${name}-specific, run by validate_integration):\n${ruleLines(rules)}`
  );
  if (checklist) {
    const items = checklist.items.map((item, i) => `${i + 1}. [manual] ${item}`).join("\n");
    parts.push(`${name} launch checklist (manual). ${checklist.summary}\n${items}`);
  }
  return parts.join("\n\n");
}

/**
 * Register get_platform_requirements: lists the compliance rules a build must
 * satisfy for a target platform. Rules come from the generated compliance
 * engine (universal + platform-specific), so they stay in sync with what
 * validate_integration enforces. Platforms that publish a launch checklist also
 * get it, as manual items from the hand-written launch-checklists module.
 */
export function registerRequirementsTool(server: McpServer): void {
  server.registerTool(
    "get_platform_requirements",
    {
      ...readOnlyTool("Get platform requirements"),
      description:
        `The compliance rules a build must satisfy for one platform (${SUPPORTED_PLATFORMS.join(", ")}), each as 'id [severity]: description'. These are the same checks validate_integration runs. ` +
        "Where a platform publishes a launch checklist (Jest), its items follow as [manual] entries, and a platform whose automated rules are not built yet says so explicitly. " +
        "Answers \"what do I have to get right for this platform?\" up front; one rule's detail and fix comes from get_compliance_rule(ruleId), and an actual build is graded by validate_integration. " +
        "Returns the rule list only; no build is evaluated.",
      inputSchema: { platform: z.enum(SUPPORTED_PLATFORMS).describe("Target platform.") },
      
    },
    async ({ platform }) => {
      return { content: [{ type: "text" as const, text: renderRequirements(platform) }] };
    }
  );
}
