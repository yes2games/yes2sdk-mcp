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
              `First call get_api_reference for "${module}" and get_quickstart for "${platform}".`,
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
              `Start with get_quickstart for "${platform}", then scaffold init + the ad loop with isSupported() guards.`,
            ].join("\n"),
          },
        },
      ],
    })
  );
}
