import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEngineMeta, type Engine } from "../lib/sdk-meta.js";

interface DetectResult {
  engine: Engine | "unknown";
  installed: boolean;
  /** Version found in the project, when detectable. */
  installedVersion: string | null;
  /** Pinned version the MCP knows about, from sdk-meta. */
  expectedVersion: string | null;
  /** Install + post-install steps still needed (empty when installed). */
  missingSteps: string[];
  notes: string[];
}

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf-8");
  } catch {
    return null;
  }
}

function detectEngine(root: string): Engine | "unknown" {
  if (fs.existsSync(path.join(root, "ProjectSettings")) && fs.existsSync(path.join(root, "Packages", "manifest.json"))) {
    return "unity";
  }
  if (fs.existsSync(path.join(root, "game.project"))) return "defold";
  if (fs.existsSync(path.join(root, "package.json"))) return "js";
  return "unknown";
}

function detectUnity(root: string): { installed: boolean; version: string | null } {
  const manifest = readIfExists(path.join(root, "Packages", "manifest.json"));
  if (!manifest) return { installed: false, version: null };
  try {
    const json = JSON.parse(manifest) as { dependencies?: Record<string, string> };
    const entry = json.dependencies?.["com.yes2games.yes2sdk"];
    if (!entry) return { installed: false, version: null };
    // Entry is either a registry version ("2.4.3") or a git URL ("...#v2.4.3").
    const tag = entry.match(/#v?(\d+\.\d+\.\d+)/);
    return { installed: true, version: tag ? tag[1] : entry };
  } catch {
    return { installed: false, version: null };
  }
}

function detectDefold(root: string): { installed: boolean; version: string | null } {
  const proj = readIfExists(path.join(root, "game.project"));
  if (!proj) return { installed: false, version: null };
  const normalized = proj.replace(/\r\n/g, "\n");
  // Any dependencies#N line that points at the yes2sdk-defold release archive.
  const dep = normalized.match(/^\s*dependencies#\d+\s*=\s*.*yes2sdk-defold.*$/m);
  if (!dep) return { installed: false, version: null };
  const tag = dep[0].match(/tags\/v?(\d+\.\d+\.\d+)\.zip/);
  return { installed: true, version: tag ? tag[1] : null };
}

function render(result: DetectResult, root: string): string {
  const lines = [
    `# Yes2SDK project check`,
    `Path: ${root}`,
    `Engine: ${result.engine}`,
    `SDK installed: ${result.installed ? "yes" : "no"}`,
  ];
  if (result.installedVersion) lines.push(`Installed version: ${result.installedVersion}`);
  if (result.expectedVersion) lines.push(`Latest known version: ${result.expectedVersion}`);
  if (
    result.installed &&
    result.installedVersion &&
    result.expectedVersion &&
    result.installedVersion !== result.expectedVersion
  ) {
    lines.push(`Note: installed version differs from the latest known (${result.expectedVersion}).`);
  }
  for (const n of result.notes) lines.push(`Note: ${n}`);
  if (!result.installed && result.missingSteps.length > 0) {
    lines.push("", "## Required before generating SDK code");
    result.missingSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push("", "Run get_install_instructions(engine) for the full, formatted steps.");
  }
  return lines.join("\n");
}

/**
 * Register detect_sdk: inspect a project directory (read-only) and report which
 * engine it is, whether the Yes2SDK is installed, and what install steps remain.
 * Use this before generating SDK code so you never emit references to a package
 * that has not been installed.
 */
export function registerDetectTool(server: McpServer): void {
  server.registerTool(
    "detect_sdk",
    {
      title: "Detect Yes2SDK in a project",
      description:
        "Inspect a project directory and report the engine (unity, defold, js), whether the Yes2SDK is installed, the installed version, and any install steps still required. " +
        "Call this before generating engine code so you never write code referencing an uninstalled SDK. Read-only: it reads project files but never modifies them. " +
        "Pair with get_install_instructions when the SDK is missing.",
      inputSchema: {
        projectPath: z.string().min(1).describe("Absolute path to the root of the game project to inspect."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ projectPath }) => {
      const root = path.resolve(projectPath);
      if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        return {
          content: [{ type: "text" as const, text: `Project path not found or not a directory: ${root}` }],
          isError: true,
        };
      }

      const engine = detectEngine(root);
      const result: DetectResult = {
        engine,
        installed: false,
        installedVersion: null,
        expectedVersion: null,
        missingSteps: [],
        notes: [],
      };

      if (engine === "unknown") {
        result.notes.push(
          "Could not identify the engine (no Unity ProjectSettings/ + Packages/manifest.json, Defold game.project, or package.json found)."
        );
        return { content: [{ type: "text" as const, text: render(result, root) }] };
      }

      const meta = getEngineMeta(engine);
      result.expectedVersion = meta?.version || null;

      if (engine === "unity") {
        const u = detectUnity(root);
        result.installed = u.installed;
        result.installedVersion = u.version;
      } else if (engine === "defold") {
        const d = detectDefold(root);
        result.installed = d.installed;
        result.installedVersion = d.version;
      } else {
        // js: the web runtime is injected by the dashboard at upload, not installed at dev-time.
        result.notes.push(
          "JS/HTML5 projects do not install a dev-time package — the runtime is injected by the dashboard at upload. 'installed: no' is expected here."
        );
      }

      if (!result.installed && meta) {
        result.missingSteps = [...meta.installSteps, ...meta.postInstallSteps];
      }

      return { content: [{ type: "text" as const, text: render(result, root) }] };
    }
  );
}
