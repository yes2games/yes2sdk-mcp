#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { authFromEnv } from "./lib/auth.js";

/**
 * stdio entry point for the Yes2SDK MCP server. AI coding clients (Cursor,
 * Claude Code, Windsurf, VS Code Copilot, …) spawn this over stdio.
 *
 * Keep this thin: all configuration lives in createServer() so an alternate
 * transport (e.g. HTTP) can reuse the same server.
 */
async function main(): Promise<void> {
  // A local process the user started: their own key may sit in its env.
  const server = createServer({ auth: authFromEnv(process.env.YES2_API_KEY) });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes; the SDK manages the lifecycle.
}

main().catch((err: unknown) => {
  // stdout is the JSON-RPC channel on stdio — log diagnostics to stderr only.
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`[yes2sdk-mcp] fatal: ${message}\n`);
  process.exit(1);
});
