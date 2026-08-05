#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

/**
 * Streamable HTTP entry point for the Yes2SDK MCP server. Served at
 * mcp.yes2games.com behind nginx (Cloudflare → origin), deployed to bakso as a
 * rootless Podman Quadlet container.
 *
 * Stateless: a fresh McpServer + transport per POST /mcp request (no sessions).
 * Tool registration is reused from createServer() in server.ts — never
 * duplicated here. The stdio entry (index.ts) is untouched and uses the same
 * factory.
 */
const PORT = Number(process.env.PORT ?? 8091);

// DNS-rebinding protection allowlist. The public hostname plus the loopback
// authority the container healthcheck uses. /health is served OUTSIDE the
// transport so a Host: 127.0.0.1 probe is never rejected by host validation.
const ALLOWED_HOSTS = ["mcp.yes2games.com", `127.0.0.1:${PORT}`];

const JSONRPC_METHOD_NOT_ALLOWED = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed (stateless server)" },
  id: null,
});

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  // Reflect the request origin (credentials are not used; this is permissive by
  // design for browser-based MCP clients).
  //
  // The advertised methods and headers are exactly what this server serves:
  // POST /mcp, GET /health, and the OPTIONS preflight. Being stateless it never
  // mints or echoes a session id, so Mcp-Session-Id and DELETE are omitted
  // rather than advertised into a guaranteed 405.
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Protocol-Version");
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Stateless: one server + one transport per request, torn down on close.
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableDnsRebindingProtection: true,
    allowedHosts: ALLOWED_HOSTS,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    const body = await readBody(req);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    process.stderr.write(
      `[yes2sdk-mcp] request error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
    );
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
      );
    }
  }
}

const httpServer = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
  const url = req.url ?? "/";
  const method = req.method ?? "GET";
  const path = url.split("?", 1)[0];

  applyCors(req, res);

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health route lives outside the transport so loopback probes (Host:
  // 127.0.0.1) bypass DNS-rebinding host validation entirely.
  if (path === "/health" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (path === "/mcp") {
    if (method === "POST") {
      void handleMcpPost(req, res);
      return;
    }
    // Stateless server: no standalone SSE stream (GET) and no session to
    // terminate (DELETE).
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(JSONRPC_METHOD_NOT_ALLOWED);
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  process.stderr.write(`[yes2sdk-mcp] HTTP transport listening on 0.0.0.0:${PORT}\n`);
});
