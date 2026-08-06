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

/**
 * A read-only view of a project's files. `read` returns the contents of a
 * repo-relative file or null when it does not exist; `exists` reports whether a
 * file OR directory is present at a repo-relative path. Two implementations:
 * disk-backed (from projectPath) and map-backed (from inline `files`).
 */
interface FileAccessor {
  read(relPath: string): string | null;
  exists(relPath: string): boolean;
}

/** Normalize a repo-relative path to forward slashes, no leading "./". */
function normalizeRel(relPath: string): string {
  return relPath.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Disk-backed accessor rooted at an absolute project directory. */
function diskAccessor(root: string): FileAccessor {
  return {
    read(relPath: string): string | null {
      try {
        return fs.readFileSync(path.join(root, relPath), "utf-8");
      } catch {
        return null;
      }
    },
    exists(relPath: string): boolean {
      return fs.existsSync(path.join(root, relPath));
    },
  };
}

/** Map-backed accessor over a record of repo-relative path → contents. */
function mapAccessor(files: Record<string, string>): FileAccessor {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(files)) map.set(normalizeRel(k), v);
  return {
    read(relPath: string): string | null {
      const key = normalizeRel(relPath);
      return map.has(key) ? map.get(key)! : null;
    },
    exists(relPath: string): boolean {
      const key = normalizeRel(relPath);
      if (map.has(key)) return true;
      // Treat as a directory if any key sits under it.
      const prefix = key + "/";
      for (const k of map.keys()) {
        if (k.startsWith(prefix)) return true;
      }
      return false;
    },
  };
}

function detectEngine(fa: FileAccessor): Engine | "unknown" {
  if (fa.exists("ProjectSettings") && fa.exists("Packages/manifest.json")) {
    return "unity";
  }
  if (fa.exists("game.project")) return "defold";
  if (fa.exists("package.json")) return "js";
  return "unknown";
}

function detectUnity(fa: FileAccessor): { installed: boolean; version: string | null } {
  const manifest = fa.read("Packages/manifest.json");
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

function detectDefold(fa: FileAccessor): { installed: boolean; version: string | null } {
  const proj = fa.read("game.project");
  if (!proj) return { installed: false, version: null };
  const normalized = proj.replace(/\r\n/g, "\n");
  // Any dependencies#N line that points at the yes2sdk-defold release archive.
  const dep = normalized.match(/^\s*dependencies#\d+\s*=\s*.*yes2sdk-defold.*$/m);
  if (!dep) return { installed: false, version: null };
  const tag = dep[0].match(/tags\/v?(\d+\.\d+\.\d+)\.zip/);
  return { installed: true, version: tag ? tag[1] : null };
}

function render(result: DetectResult, pathLabel: string): string {
  const lines = [
    `# Yes2SDK project check`,
    `Path: ${pathLabel}`,
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

/** Run detection against a file accessor; pathLabel is shown on the "Path:" line. */
function runDetect(fa: FileAccessor, pathLabel: string): string {
  const engine = detectEngine(fa);
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
    return render(result, pathLabel);
  }

  const meta = getEngineMeta(engine);
  result.expectedVersion = meta?.version || null;

  if (engine === "unity") {
    const u = detectUnity(fa);
    result.installed = u.installed;
    result.installedVersion = u.version;
  } else if (engine === "defold") {
    const d = detectDefold(fa);
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

  return render(result, pathLabel);
}

/**
 * Register detect_sdk: inspect a project (read-only) and report which engine it
 * is, whether the Yes2SDK is installed, and what install steps remain. Works
 * either from a local directory (`projectPath`, for stdio) or from inline file
 * contents (`files`, for the hosted/sandboxed server that cannot read disk).
 * Use this before generating SDK code so you never emit references to a package
 * that has not been installed.
 */
export function registerDetectTool(server: McpServer): void {
  server.registerTool(
    "detect_sdk",
    {
      title: "Detect Yes2SDK in a project",
      description:
        "A readiness report for one game project: the engine it uses (unity, defold, js), whether the Yes2SDK is installed, the installed version, and any install steps still required. " +
        "Answers \"can this project compile Yes2SDK code yet?\", and pairs with get_install_instructions when the SDK is missing. " +
        "Two input modes, exactly one per request:\n" +
        "  - `projectPath`: absolute path to the project root, available when this server runs LOCALLY over stdio and can read the disk.\n" +
        "  - `files`: inline map of repo-relative path → contents, keyed on \"game.project\", \"Packages/manifest.json\" or \"package.json\" — the mode for the HOSTED/sandboxed server, which has no disk access.\n" +
        "Project files are inspected, never modified.",
      inputSchema: {
        projectPath: z
          .string()
          .min(1)
          .optional()
          .describe("Absolute path to the root of the game project to inspect (local stdio mode only)."),
        files: z
          .record(z.string())
          .optional()
          .describe(
            "Inline map of repo-relative path → file contents for hosted/sandboxed use. Include at least the engine-marker files: game.project (Defold), ProjectSettings/* and Packages/manifest.json (Unity), or package.json (JS)."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ projectPath, files }) => {
      if (!projectPath && !files) {
        return {
          content: [
            {
              type: "text" as const,
              text:
                "No input provided. detect_sdk has two modes:\n\n" +
                "1) LOCAL stdio: pass `projectPath` = absolute path to the project root. Only works when this MCP server runs locally and can read your disk.\n\n" +
                "2) HOSTED/sandboxed: pass `files` = an inline map of repo-relative path → contents " +
                "(e.g. { \"game.project\": \"…\", \"Packages/manifest.json\": \"…\", \"package.json\": \"…\" }). " +
                "The hosted MCP server cannot read your local disk, so supply the engine-marker files inline.\n\n" +
                "Pass exactly one.",
            },
          ],
          isError: true,
        };
      }

      const notes: string[] = [];
      let fa: FileAccessor;
      let pathLabel: string;

      if (files) {
        if (projectPath) {
          notes.push("Both `projectPath` and `files` were provided — using inline `files` and ignoring `projectPath`.");
        }
        fa = mapAccessor(files);
        pathLabel = "(inline files)";
      } else {
        const root = path.resolve(projectPath!);
        if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Could not read project path: ${root}. ` +
                  "If you are using the HOSTED MCP server, it cannot read your local disk — pass `files` " +
                  "(an inline map of repo-relative path → contents) instead, or run the MCP locally over stdio so `projectPath` can be read.",
              },
            ],
            isError: true,
          };
        }
        fa = diskAccessor(root);
        pathLabel = root;
      }

      // Prepend any pre-detection notes (e.g. both-inputs preference) to the output.
      const body = runDetect(fa, pathLabel);
      if (notes.length === 0) return { content: [{ type: "text" as const, text: body }] };
      const noteLines = notes.map((n) => `Note: ${n}`).join("\n");
      // Insert notes right after the header block (after the "SDK installed:" line region).
      return { content: [{ type: "text" as const, text: `${body}\n${noteLines}` }] };
    }
  );
}
