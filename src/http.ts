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

// Browser origins allowed to reach this server. Empty by default: no browser
// page is trusted, which is what every current consumer needs — CLI hosts and
// server-side fetch send no Origin header at all and are unaffected. The MCP
// spec requires Origin validation so a page the user happens to visit cannot
// drive the server (DNS rebinding / CSRF). Set
// MCP_ALLOWED_ORIGINS=https://a.example,https://b.example to admit a browser
// client.
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

// OpenAI plugin directory domain verification. The submission portal issues a
// token and fetches it from this fixed path on the MCP host; the body must be
// the token alone (no JSON, no newline). Kept in the environment rather than the
// source so a re-verification is a config change, not a release. Unset or blank
// means the route 404s like any unknown path.
const OPENAI_APPS_CHALLENGE_PATH = "/.well-known/openai-apps-challenge";
const OPENAI_APPS_CHALLENGE = (process.env.OPENAI_APPS_CHALLENGE ?? "").trim();

// Nothing on this host is meant for a search index: it serves a JSON-RPC
// endpoint and a healthcheck, not pages. Disallow everything, and name /mcp and
// /.well-known/ explicitly so the OAuth metadata and authorisation-server
// documents an MCP host may expose stay out of crawler results even if a future
// route or an upstream proxy starts answering them. robots.txt is advisory —
// this is hygiene, not access control. The one Allow is the OpenAI domain
// verification token, which a well-behaved verifier must still be able to read.
const ROBOTS_TXT = [
  "User-agent: *",
  `Allow: ${OPENAI_APPS_CHALLENGE_PATH}`,
  "Disallow: /",
  "Disallow: /mcp",
  "Disallow: /.well-known/",
  "",
].join("\n");

const JSONRPC_METHOD_NOT_ALLOWED = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32000, message: "Method not allowed (stateless server)" },
  id: null,
});

// Static message: never reflect the rejected origin back to the caller.
const JSONRPC_FORBIDDEN_ORIGIN = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32000, message: "Invalid Origin header" },
  id: null,
});

function isAllowedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  return origin === undefined || ALLOWED_ORIGINS.includes(origin);
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  // Credentials are not used, so echoing an allow-listed origin is enough; a
  // rejected origin gets no Access-Control-Allow-Origin at all.
  //
  // The advertised methods and headers are exactly what this server serves:
  // POST /mcp, GET /health, and the OPTIONS preflight. Being stateless it never
  // mints or echoes a session id, so Mcp-Session-Id and DELETE are omitted
  // rather than advertised into a guaranteed 405.
  const origin = req.headers.origin;
  if (origin === undefined) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
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

  // Reject before routing so the preflight fails too, and /health is not a
  // cross-origin read either.
  if (!isAllowedOrigin(req)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSONRPC_FORBIDDEN_ORIGIN);
    return;
  }

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

  if (path === "/robots.txt" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(ROBOTS_TXT);
    return;
  }

  if (path === OPENAI_APPS_CHALLENGE_PATH && method === "GET" && OPENAI_APPS_CHALLENGE) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(OPENAI_APPS_CHALLENGE);
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
