import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAllRules, getRuleById, getRuleFixes } from "../lib/compliance.js";

function render(id: string): { text: string; isError: boolean } {
  const rule = getRuleById(id);
  if (!rule) {
    const known = getAllRules()
      .map((r) => r.id)
      .join(", ");
    return {
      text: `No compliance rule "${id}". Known rule ids: ${known}.`,
      isError: true,
    };
  }
  const fixes = getRuleFixes(rule.id);
  const lines = [
    `# ${rule.id} [${rule.severity}]`,
    `Platform: ${rule.platform}`,
    `Check: ${rule.description}`,
  ];
  if (fixes.length > 0) {
    lines.push("", "## How to satisfy it");
    fixes.forEach((f) => lines.push(`- ${f}`));
  } else {
    lines.push("", "No specific fix is authored for this rule; it is informational or always passes.");
  }
  lines.push(
    "",
    rule.platform === "universal"
      ? "Universal rule — enforced on every platform by validate_integration."
      : `Enforced for ${rule.platform} by validate_integration. See get_platform_requirements("${rule.platform}") for the full set.`,
  );
  return { text: lines.join("\n"), isError: false };
}

/**
 * Register get_compliance_rule: look up one platform-compliance rule by id and
 * return its severity, what it checks, and the authored fix guidance. The same
 * rules validate_integration runs — use this to understand a single failing rule
 * without re-running a whole validation.
 */
export function registerRuleTool(server: McpServer): void {
  server.registerTool(
    "get_compliance_rule",
    {
      title: "Get one compliance rule",
      description:
        "Look up a single Yes2SDK platform-compliance rule by id (e.g. 'P-002', 'U-001', 'CG-003') and return its severity (FAIL/WARN/INFO), the platform it applies to, what it checks, and the concrete fix(es) to satisfy it. " +
        "Use this when validate_integration or get_platform_requirements surfaces a rule id and you need the detail and fix for that one rule. " +
        "Read-only. For the full rule set of a platform use get_platform_requirements(platform); to validate a build use validate_integration.",
      inputSchema: {
        ruleId: z
          .string()
          .min(1)
          .describe("Rule id, e.g. 'P-002' (Poki), 'U-001' (universal), 'CG-003' (CrazyGames), 'Y-010' (Yandex), 'GD-002' (GameDistribution), 'YT-001' (YouTube). Case-insensitive."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ ruleId }) => {
      const { text, isError } = render(ruleId.trim().toUpperCase());
      return { content: [{ type: "text" as const, text }], ...(isError ? { isError: true } : {}) };
    }
  );
}
