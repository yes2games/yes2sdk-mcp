import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getEngineMeta, type EngineMeta } from "../lib/sdk-meta.js";

const ENGINES = ["unity", "defold", "js"] as const;

function renderSteps(label: string, steps: string[]): string {
  if (steps.length === 0) return "";
  const body = steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `${label}\n${body}`;
}

function renderInstructions(meta: EngineMeta): string {
  const versionLine = meta.version
    ? `Package: ${meta.packageName} (v${meta.version})`
    : `Package: ${meta.packageName}`;
  const parts = [
    `# Install the Yes2SDK for ${meta.displayName}`,
    "",
    versionLine,
    meta.minEngineVersion ? `Requires engine version: ${meta.minEngineVersion}+` : "",
    `Repo: ${meta.repoUrl}`,
    "",
    renderSteps("## Install", meta.installSteps),
    renderSteps("## After installing", meta.postInstallSteps),
    `## Verify the SDK is available\n${meta.verify}`,
    "",
    "Do not write SDK code that references the Yes2SDK namespace/module until the steps above are done and verification passes — otherwise the code will not compile/resolve.",
  ];
  return parts.filter((p) => p !== "").join("\n\n");
}

/**
 * Register get_install_instructions: the first step for any fresh project.
 * Returns the exact, version-pinned steps to add the Yes2SDK to a project for a
 * given engine, plus how to confirm the SDK symbol is available. Instructions
 * only — this tool never writes to the user's filesystem.
 */
export function registerInstallTool(server: McpServer): void {
  server.registerTool(
    "get_install_instructions",
    {
      title: "Get Yes2SDK install instructions",
      description:
        "Return the exact, version-pinned steps to add the Yes2SDK to a project for a given engine (unity, defold, js), including the post-install steps (e.g. Unity's required WebGL template) and how to verify the SDK is importable. " +
        "ALWAYS call this before generating any engine code for a project that has not yet installed the SDK — generated code referencing the Yes2SDK namespace/module will not compile until install completes. " +
        "Returns instructions as text; it does not modify the project. Does not detect what is already installed (use detect_sdk for that).",
      inputSchema: {
        engine: z
          .enum(ENGINES)
          .describe("Target engine: 'unity' (UPM package), 'defold' (native extension), or 'js' (HTML5 runtime injected by the dashboard)."),
        platform: z
          .enum(["poki", "crazygames", "yandex", "gamedistribution", "youtube"])
          .optional()
          .describe("Optional target platform. Install is the same across platforms; this only adds a context note."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    async ({ engine, platform }) => {
      const meta = getEngineMeta(engine);
      if (!meta) {
        return {
          content: [{ type: "text" as const, text: `No install instructions for engine "${engine}". Supported: ${ENGINES.join(", ")}.` }],
          isError: true,
        };
      }
      let text = renderInstructions(meta);
      if (platform) {
        text += `\n\nAfter install, run get_quickstart("${platform}") for the platform-specific call sequence and rules.`;
      }
      return { content: [{ type: "text" as const, text }] };
    }
  );
}
