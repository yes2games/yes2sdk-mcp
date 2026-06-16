import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register the Yes2SDK integration prompts. Each prompt produces a user message
 * that steers the model through the documented integration flow, pointing it at
 * the docs tools (get_api_reference / get_quickstart) and validate_integration.
 */
export function registerIntegratePrompts(server: McpServer): void {
  server.registerPrompt(
    "integrate_module",
    {
      title: "Integrate a Yes2SDK module",
      description: "Guide integration of one module for one platform.",
      argsSchema: { module: z.string(), platform: z.string() },
    },
    ({ module, platform }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Integrate the Yes2SDK "${module}" module for the "${platform}" platform.`,
              `First make sure the SDK is installed: call get_install_instructions for the project's engine and confirm the install + post-install steps are done. Do not write code referencing the Yes2SDK namespace/module before that.`,
              `Then call get_api_reference for "${module}" and get_quickstart for "${platform}".`,
              `Then write the integration code guarded by isSupported(), and finish by running validate_integration.`,
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "setup_new_project",
    {
      title: "Set up a new Yes2SDK project",
      description: "Bootstrap a fresh game project with the Yes2SDK.",
      argsSchema: { engine: z.string(), platform: z.string() },
    },
    ({ engine, platform }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Set up a new ${engine} project integrating the Yes2SDK for ${platform}.`,
              `Step 1 — install: call get_install_instructions for "${engine}" and walk through the install + post-install steps (e.g. Unity's required WebGL template). The Yes2SDK namespace/module does not exist until this is done, so do not generate SDK code yet.`,
              `Step 2 — read: call get_quickstart for "${platform}" for the mandatory call sequence and rules.`,
              `Step 3 — code: scaffold init + the ad loop with isSupported() guards, then run validate_integration.`,
            ].join("\n"),
          },
        },
      ],
    })
  );
}
