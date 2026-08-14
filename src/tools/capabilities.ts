import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readDocBySlug } from "../lib/docs.js";
import { readOnlyTool } from "../lib/annotations.js";
import { SUPPORTED_PLATFORMS, isSupportedPlatform, type SupportedPlatform } from "../lib/platforms.js";

/** Platform column keys. Alias kept so the matrix types read in matrix terms. */
export type CapabilityPlatform = SupportedPlatform;

export interface CapabilityRow {
  /** Module label exactly as the matrix lists it, e.g. "Ads: banner". */
  module: string;
  /** Status per platform: "Ready" | "Partial" | "None". */
  support: Record<CapabilityPlatform, string>;
}

export interface CapabilityMatrix {
  platforms: CapabilityPlatform[];
  rows: CapabilityRow[];
  /** Footnote lines (the ¹²³ explanations) under the matrix, verbatim. */
  footnotes: string[];
}

/** Normalize a header cell ("GameDistribution") to a platform key. */
function platformKey(header: string): CapabilityPlatform | null {
  const k = header.toLowerCase().replace(/[^a-z]/g, "");
  return isSupportedPlatform(k) ? k : null;
}

/** Drop footnote superscripts so a status value is just "Ready"/"Partial"/"None". */
function cleanStatus(cell: string): string {
  return cell.replace(/[¹²³⁰-⁹]/g, "").trim();
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Parse the "## Platform support matrix" table out of api/overview.md into a
 * structured matrix. Tied to that doc's table shape; kept data-driven so it
 * stays in sync with what `sync-docs` ships.
 */
export function parseCapabilityMatrix(md: string): CapabilityMatrix {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Platform support matrix/i.test(l));
  if (start === -1) return { platforms: [], rows: [], footnotes: [] };

  // The section runs until the next horizontal rule or heading.
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i] ?? "") || /^##\s+/.test(lines[i] ?? "")) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start + 1, end);
  const tableLines = section.filter((l) => l.trim().startsWith("|"));
  if (tableLines.length < 2) return { platforms: [], rows: [], footnotes: [] };

  const header = splitRow(tableLines[0] ?? "");
  const platforms = header
    .slice(1)
    .map(platformKey)
    .filter((p): p is CapabilityPlatform => p !== null);

  const rows: CapabilityRow[] = [];
  // Skip header (0) and the |---|---| separator (1).
  for (const line of tableLines.slice(2)) {
    const cells = splitRow(line);
    const module = cells[0] ?? "";
    if (!module) continue;
    const support = {} as Record<CapabilityPlatform, string>;
    platforms.forEach((p, i) => {
      support[p] = cleanStatus(cells[i + 1] ?? "");
    });
    rows.push({ module, support });
  }

  const footnotes = section
    .filter((l) => /^[¹²³⁰-⁹]/.test(l.trim()))
    .map((l) => l.trim());

  return { platforms, rows, footnotes };
}

const LEGEND = [
  "Status legend:",
  "  Ready   - fully integrated with the platform's own SDK.",
  "  Partial - works with a sensible fallback or platform-specific scope (e.g. local storage).",
  "  None    - not offered; the call stays safe (returns FeatureNotSupported or a no-op default).",
  "Guard optional features with isSupported() / IsSupported() so one codebase runs everywhere.",
].join("\n");

function renderFull(matrix: CapabilityMatrix): string {
  const header = ["Module", ...matrix.platforms].join(" | ");
  const body = matrix.rows
    .map((r) => [r.module, ...matrix.platforms.map((p) => r.support[p])].join(" | "))
    .join("\n");
  const parts = ["# Yes2SDK platform support matrix", "", header, body, "", LEGEND];
  if (matrix.footnotes.length > 0) parts.push("", "Notes:", ...matrix.footnotes);
  return parts.join("\n");
}

function renderPlatform(matrix: CapabilityMatrix, platform: CapabilityPlatform): string {
  const body = matrix.rows.map((r) => `- ${r.module}: ${r.support[platform]}`).join("\n");
  const parts = [`# Yes2SDK support on ${platform}`, "", body, "", LEGEND];
  if (matrix.footnotes.length > 0) parts.push("", "Notes:", ...matrix.footnotes);
  return parts.join("\n");
}

function renderModule(matrix: CapabilityMatrix, rows: CapabilityRow[]): string {
  const blocks = rows.map((r) => {
    const cells = matrix.platforms.map((p) => `  ${p}: ${r.support[p]}`).join("\n");
    return `${r.module}\n${cells}`;
  });
  return ["# Yes2SDK module support", "", blocks.join("\n\n"), "", LEGEND].join("\n");
}

/**
 * Register get_platform_capabilities: a module × platform support matrix derived
 * from the API reference. Read-only; helps decide what to guard with
 * isSupported() before integrating a module on a given platform.
 */
export function registerCapabilitiesTool(server: McpServer): void {
  server.registerTool(
    "get_platform_capabilities",
    {
      ...readOnlyTool("Get the module × platform support matrix"),
      description:
        `Which Yes2SDK modules are supported on which platforms (${SUPPORTED_PLATFORMS.join(", ")}), as a Ready / Partial / not-offered matrix, optionally narrowed to one platform (a column) or one module (a row). ` +
        "Answers \"do I need to guard this module behind isSupported()?\" — Friends and Auth are CrazyGames/Yandex-only, banners are not offered on Poki. " +
        "Reads the bundled API docs; per-method detail comes from get_api_reference(module).",
      inputSchema: {
        platform: z
          .enum(SUPPORTED_PLATFORMS)
          .optional()
          .describe("Optional: restrict to one platform's column. Omit for the full matrix."),
        module: z
          .string()
          .optional()
          .describe("Optional: restrict to modules whose name contains this text (e.g. 'ads', 'player'). Omit for all modules."),
      },
      
    },
    async ({ platform, module }) => {
      const md = readDocBySlug("api/overview");
      if (md === null) {
        return {
          content: [{ type: "text" as const, text: "Support matrix unavailable (api/overview doc not found)." }],
          isError: true,
        };
      }
      const matrix = parseCapabilityMatrix(md);
      if (matrix.rows.length === 0) {
        return {
          content: [{ type: "text" as const, text: "Could not parse the platform support matrix from the API docs." }],
          isError: true,
        };
      }

      if (module) {
        const needle = module.toLowerCase();
        const matched = matrix.rows.filter((r) => r.module.toLowerCase().includes(needle));
        if (matched.length === 0) {
          const names = matrix.rows.map((r) => r.module).join(", ");
          return {
            content: [
              {
                type: "text" as const,
                text: `No module matches "${module}". Known matrix rows: ${names}.`,
              },
            ],
          };
        }
        return { content: [{ type: "text" as const, text: renderModule(matrix, matched) }] };
      }

      if (platform) {
        return { content: [{ type: "text" as const, text: renderPlatform(matrix, platform) }] };
      }

      return { content: [{ type: "text" as const, text: renderFull(matrix) }] };
    }
  );
}
