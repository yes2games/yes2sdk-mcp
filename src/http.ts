#!/usr/bin/env node
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { authFromHeaders, type ApiKeyAuth } from "./lib/auth.js";
import { resolveDashboardUrl } from "./lib/dashboard.js";
import { gate, oauthEnabled, PRM, PRM_PATH, PRM_ROOT_PATH, type Challenge, type WhoamiIdentity } from "./lib/oauth.js";

/**
 * Streamable HTTP entry point for the Yes2SDK MCP server. Served at
 * mcp.yes2games.com behind nginx (Cloudflare → origin), deployed to bakso as a
 * rootless Podman Quadlet container.
 *
 * Stateless: a fresh McpServer + transport per POST /mcp request (no sessions).
 * Tool registration is reused from createServer() in server.ts — never
 * duplicated here. The stdio entry (index.ts) uses the same factory.
 *
 * The caller's dashboard API key (`Authorization: Bearer y2g_…`) is read from
 * each request and handed to that request's server only. It is never kept in
 * module state and never logged; the container itself holds no secrets.
 *
 * With MCP_OAUTH_ENABLED=1 a `Bearer y2a_…` OAuth access token is accepted the
 * same way, and sign-in is opt-in through the sign_in tool, which is the only
 * call answered with a 401 sign-in challenge when no credential is presented
 * (src/lib/oauth.ts). Docs tools, initialize and tools/list are never gated.
 */
const PORT = Number(process.env.PORT ?? 8091);

// Lazy OAuth sign-in for the dashboard tools (src/lib/oauth.ts). Config, not a
// secret. Off (the default) is phase 1 byte for byte: no gate, no protected
// resource metadata routes, and every text unchanged.
const OAUTH_ENABLED = oauthEnabled(process.env.MCP_OAUTH_ENABLED);
const DASHBOARD_API_URL = resolveDashboardUrl(process.env.DASHBOARD_API_URL);

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

// Largest JSON-RPC body accepted on POST /mcp. Tool arguments are small (the
// biggest is validate_integration's inline build text), and the container runs
// in 192 MB, so an unbounded buffer is a cheap way to knock it over.
const MAX_BODY_BYTES = 1024 * 1024;

const JSONRPC_BODY_TOO_LARGE = JSON.stringify({
  jsonrpc: "2.0",
  error: { code: -32600, message: `Request body exceeds ${MAX_BODY_BYTES} bytes` },
  id: null,
});

// How much of an oversized body is read and thrown away so its 413 can be
// delivered. Past this the connection is cut instead: the client then sees a
// reset, but nobody gets to stream without limit into a discard loop.
const MAX_DISCARD_BYTES = 16 * MAX_BODY_BYTES;

class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

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
  // rather than advertised into a guaranteed 405. Authorization (or
  // X-Yes2-Api-Key) carries the caller's own dashboard API key for the upload
  // tools.
  const origin = req.headers.origin;
  if (origin === undefined) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Protocol-Version, Authorization, X-Yes2-Api-Key");
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      reject(new BodyTooLargeError());
      return;
    }
    const chunks: Buffer[] = [];
    let received = 0;
    let tooLarge = false;
    req.on("data", (chunk: Buffer) => {
      if (tooLarge) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        // Stop buffering; the rest is drained and discarded while the 413 goes out.
        tooLarge = true;
        chunks.length = 0;
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
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

/**
 * Answers 413 once the client has finished sending. `Connection: close` shuts
 * the socket as soon as the response is out, and a socket closed while the
 * client is still uploading is reset: the client then fails with ECONNRESET or
 * EPIPE and never reads the 413 (about 1 request in 7 for a 2 MB body over
 * loopback). So the rest of the body is read and discarded first, up to
 * MAX_DISCARD_BYTES, and the response goes out after the request's last byte.
 */
function sendBodyTooLarge(req: IncomingMessage, res: ServerResponse): void {
  const respond = (): void => {
    if (res.writableEnded) return;
    res.writeHead(413, { "Content-Type": "application/json", Connection: "close" });
    res.end(JSONRPC_BODY_TOO_LARGE);
  };
  // The parser can finish the request before this runs (its last chunk is what
  // crossed the cap), and then "end" has already fired.
  if (req.complete) {
    respond();
    return;
  }
  let discarded = 0;
  req.on("data", (chunk: Buffer) => {
    discarded += chunk.length;
    if (discarded > MAX_DISCARD_BYTES) req.socket.destroy();
  });
  req.once("end", respond);
  req.resume();
}

function sendChallenge(res: ServerResponse, challenge: Challenge): void {
  // A browser-hosted client can only read the challenge cross-origin if the
  // header is exposed.
  res.writeHead(challenge.status, { ...challenge.headers, "Access-Control-Expose-Headers": "WWW-Authenticate" });
  res.end(challenge.body);
}

const PRM_BODY = JSON.stringify(PRM);

/**
 * RFC 9728 protected resource metadata, at the path-suffixed location clients
 * try first for a resource with a path (/mcp) and at the root. Public, static
 * and readable from any origin, so it is answered before the Origin check.
 */
function servePrm(method: string, res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Protocol-Version");
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET" });
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "max-age=300" });
  res.end(method === "HEAD" ? undefined : PRM_BODY);
}

async function handleMcpPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      sendBodyTooLarge(req, res);
      return;
    }
    // Not JSON. Answered as a JSON-RPC parse error; the body is never echoed or logged.
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
    return;
  }

  let auth: ApiKeyAuth = OAUTH_ENABLED
    ? authFromHeaders(req.headers.authorization, req.headers["x-yes2-api-key"], { oauth: true })
    : authFromHeaders(req.headers.authorization, req.headers["x-yes2-api-key"]);

  // The opt-in sign-in gate. It must answer before the MCP SDK runs: a tool
  // handler can only produce a 200, and only an HTTP 401 with WWW-Authenticate
  // makes a client start sign-in. It refuses only sign_in without a valid
  // credential; a dashboard tool with no credential, or with a sign-in the
  // dashboard no longer accepts, gets a normal text result instead.
  let identity: WhoamiIdentity | undefined;
  if (OAUTH_ENABLED) {
    const decision = await gate(body, auth, DASHBOARD_API_URL);
    if (decision.kind === "refuse") {
      sendChallenge(res, decision.challenge);
      return;
    }
    identity = decision.identity;
    if (decision.expired) auth = { status: "expired" };
  }

  // Stateless: one server + one transport per request, torn down on close. The
  // credential, if any, is bound to this request's server and dies with it.
  const server = OAUTH_ENABLED ? createServer({ auth, oauth: true, identity }) : createServer({ auth });
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

  if (OAUTH_ENABLED && (path === PRM_PATH || path === PRM_ROOT_PATH)) {
    servePrm(method, res);
    return;
  }

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

const SHUTDOWN_GRACE_MS = 8000;
let stopping = false;
const shutdown = (signal: NodeJS.Signals): void => {
  if (stopping) return;
  stopping = true;
  process.stderr.write(`[yes2sdk-mcp] ${signal}: closing the HTTP server\n`);
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS).unref();
  setInterval(() => httpServer.closeIdleConnections(), 100).unref();
  httpServer.close(() => process.exit(0));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
