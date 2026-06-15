import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runComplianceChecks } from "../lib/compliance.js";
import type { LogEntry, ComplianceResult, ComplianceSeverity } from "../lib/inspector-types.js";
import { runBuildChecks, type BuildFinding, type BuildSeverity } from "../lib/build-checks.js";

const VALIDATE_PLATFORMS = [
  "poki",
  "crazygames",
  "yandex",
  "gamedistribution",
  "youtube",
] as const;

const SEVERITY_ORDER: Record<string, number> = { FAIL: 0, WARN: 1, INFO: 2 };

interface Finding {
  severity: BuildSeverity | ComplianceSeverity;
  label: string;
  message: string;
  fix?: string;
  details?: string;
}

function fromBuildFinding(f: BuildFinding): Finding {
  const out: Finding = { severity: f.severity, label: `[static:${f.check}]`, message: f.message };
  if (f.fix) out.fix = f.fix;
  return out;
}

function fromComplianceResult(r: ComplianceResult): Finding {
  const out: Finding = {
    severity: r.severity,
    label: `[${r.ruleId}] ${r.description}`,
    message: r.message,
  };
  if (r.autoFix) out.fix = r.autoFix;
  if (r.details) out.details = r.details;
  return out;
}

/** Render findings grouped by severity, FAILs first. */
function renderFindings(title: string, findings: Finding[]): string {
  if (findings.length === 0) return `${title}: no findings.`;
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
  const fails = sorted.filter((f) => f.severity === "FAIL");
  const warns = sorted.filter((f) => f.severity === "WARN");
  const infos = sorted.filter((f) => f.severity === "INFO");

  const block = (sev: string, items: Finding[]): string => {
    if (items.length === 0) return "";
    const lines = items.map((f) => {
      const parts = [`- ${sev} ${f.label}: ${f.message}`];
      if (f.details) parts.push(`    details: ${f.details}`);
      if (f.fix) parts.push(`    fix: ${f.fix}`);
      return parts.join("\n");
    });
    return `${sev} (${items.length}):\n${lines.join("\n")}`;
  };

  const summary = `${fails.length} FAIL, ${warns.length} WARN, ${infos.length} INFO`;
  return [
    `${title} — ${summary}`,
    block("FAIL", fails),
    block("WARN", warns),
    block("INFO", infos),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Register the validate_integration tool. Two modes (combinable):
 *   - buildPath:    static checks on an extracted build folder
 *   - eventLogJson: behavioral compliance checks on an exported Inspector log
 */
export function registerValidateTool(server: McpServer): void {
  server.registerTool(
    "validate_integration",
    {
      title: "Validate a Yes2SDK integration",
      description:
        "Self-check a Yes2SDK game integration against the real platform rejection rules before upload. Two modes (you may supply one or both):\n\n" +
        "1) STATIC build checks — pass `buildPath` (absolute path to an ALREADY-EXTRACTED/unzipped build folder). Checks: Yes2SDK bundled into the JS, no external <script src=\"http...\"> tags (platforms block them), index.html present (Poki also needs index.json), and a responsive full-viewport canvas heuristic.\n\n" +
        "2) BEHAVIORAL compliance checks — pass `eventLogJson`: a JSON string of an EXPORTED Yes2SDK Inspector event log (an array of LogEntry objects with fields like type, method, params, success). Runs the platform's compliance rules (e.g. gameplayStop before ads, reward only on adViewed, no ads in the first 30s).\n\n" +
        "Always pass `platform`. If you only have the source code, use buildPath after building/extracting. The behavioral rules require running the game in the QA Inspector and exporting its event log — they cannot be derived from static files.",
      inputSchema: {
        platform: z.enum(VALIDATE_PLATFORMS).describe("Target platform to validate against."),
        buildPath: z
          .string()
          .optional()
          .describe("Absolute path to an already-extracted (unzipped) build folder for static checks."),
        eventLogJson: z
          .string()
          .optional()
          .describe("JSON string: an exported Yes2SDK Inspector event log (array of LogEntry) for behavioral compliance checks."),
      },
    },
    async ({ platform, buildPath, eventLogJson }) => {
      const sections: string[] = [];
      let totalFails = 0;

      if (!buildPath && !eventLogJson) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "No input provided. validate_integration has two modes:\n\n" +
                "1) STATIC build checks: pass `buildPath` = absolute path to an already-extracted build folder. " +
                "Checks SDK bundling, external scripts, entry file, and responsive canvas.\n\n" +
                "2) BEHAVIORAL compliance checks: pass `eventLogJson` = a JSON string of an exported Yes2SDK Inspector event log " +
                "(array of LogEntry). This runs the platform's API-sequence rules (gameplayStop before ads, reward on adViewed only, " +
                "no ads in the first 30s, etc.). These rules require running the game in the QA Inspector and exporting its event log — " +
                "they cannot be checked from static files.\n\n" +
                "Pass one or both (and always `platform`).",
            },
          ],
        };
      }

      // ── Static build checks ──────────────────────────────────────────
      if (buildPath) {
        let buildFindings: Finding[];
        try {
          const raw = await runBuildChecks(buildPath, platform);
          buildFindings = raw.map(fromBuildFinding);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          buildFindings = [
            { severity: "FAIL", label: "[static:error]", message: `Static checks failed to run: ${msg}` },
          ];
        }
        totalFails += buildFindings.filter((f) => f.severity === "FAIL").length;
        sections.push(renderFindings("STATIC BUILD CHECKS", buildFindings));
      }

      // ── Behavioral compliance checks ─────────────────────────────────
      if (eventLogJson) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(eventLogJson);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          sections.push(
            `COMPLIANCE CHECKS — could not parse eventLogJson: ${msg}\n` +
              "Expected a JSON string of an array of LogEntry objects exported from the Yes2SDK Inspector."
          );
          parsed = undefined;
        }

        if (parsed !== undefined) {
          if (!Array.isArray(parsed)) {
            sections.push(
              "COMPLIANCE CHECKS — eventLogJson must be a JSON ARRAY of LogEntry objects " +
                "(an exported Yes2SDK Inspector event log). Got a non-array value."
            );
          } else {
            const logs = parsed as LogEntry[];
            const results = runComplianceChecks(logs, platform);
            // Only surface rules that actually failed (passed===false); list passes as INFO count.
            const failedOrFlagged = results.filter((r) => !r.passed);
            const findings = failedOrFlagged.map(fromComplianceResult);
            totalFails += findings.filter((f) => f.severity === "FAIL").length;
            const passedCount = results.length - failedOrFlagged.length;
            const header = renderFindings(
              `COMPLIANCE CHECKS (${results.length} rules, ${passedCount} passed)`,
              findings
            );
            sections.push(header);
          }
        }
      }

      const verdict =
        totalFails > 0
          ? `VERDICT: ${totalFails} blocking FAIL(s) — fix these before uploading.`
          : "VERDICT: no blocking FAILs. Review any WARNs above.";

      return {
        content: [{ type: "text" as const, text: `${sections.join("\n\n===\n\n")}\n\n${verdict}` }],
      };
    }
  );
}
