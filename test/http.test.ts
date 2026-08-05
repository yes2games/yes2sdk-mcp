import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
const READY_MSG = `HTTP transport listening on 0.0.0.0:${PORT}`;
const ALLOWED_ORIGIN = "https://example.test";
const DENIED_ORIGIN = "https://evil.test";

let child: ChildProcess;

beforeAll(async () => {
  // Build dist/http.js so we test the real shipped artifact.
  execSync("npm run build", { cwd: REPO, stdio: "inherit", timeout: 120_000 });

  child = spawn(process.execPath, ["dist/http.js"], {
    env: { ...process.env, PORT: String(PORT), MCP_ALLOWED_ORIGINS: ALLOWED_ORIGIN },
    cwd: REPO,
  });

  // Wait until the server writes its ready line to stderr.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server did not emit ready within 15 s. stderr so far: ${stderrBuf}`));
    }, 15_000);

    let stderrBuf = "";

    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.includes(READY_MSG)) {
        clearTimeout(timer);
        resolve();
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early with code ${code}. stderr: ${stderrBuf}`));
    });
  });
}, 130_000);

afterAll(async () => {
  if (child && !child.killed) {
    child.kill();
    await new Promise<void>((resolve) => child.on("exit", resolve));
  }
});

describe("GET /health", () => {
  it("returns 200 and {status:'ok'}", async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  }, 10_000);
});

describe("MCP over HTTP", () => {
  it("listTools includes validate_integration", async () => {
    const client = new Client({ name: "http-test", version: "0" });
    const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`));
    await client.connect(transport);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("validate_integration");
    await client.close();
  }, 60_000);

  it("GET /mcp returns 405", async () => {
    const res = await fetch(`${BASE}/mcp`, { method: "GET" });
    expect(res.status).toBe(405);
  }, 10_000);
});

// The server is stateless (sessionIdGenerator: undefined), so it never mints or
// echoes a session id. Advertising session/DELETE support in CORS invites clients
// to attempt flows that always 405.
describe("CORS preflight advertises only what the stateless server serves", () => {
  it("does not advertise Mcp-Session-Id or DELETE", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).not.toMatch(/mcp-session-id/i);
    expect(res.headers.get("access-control-allow-methods")).not.toMatch(/delete/i);
    expect(res.headers.get("access-control-expose-headers")).toBeNull();
  }, 10_000);

  it("still allows the headers the transport does read", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const allowed = res.headers.get("access-control-allow-headers") ?? "";
    expect(allowed).toMatch(/content-type/i);
    expect(allowed).toMatch(/mcp-protocol-version/i);
    expect(res.headers.get("access-control-allow-methods")).toMatch(/post/i);
  }, 10_000);

  it("echoes an allow-listed origin", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  }, 10_000);
});

// The MCP spec requires servers to validate Origin so a page the user happens to
// visit cannot drive the server (DNS rebinding / CSRF). Clients that are not
// browsers send no Origin at all and must keep working — that is every current
// consumer, covered by the listTools test above.
describe("Origin validation", () => {
  it("rejects a POST carrying a non-allow-listed origin", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: DENIED_ORIGIN },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(403);
  }, 10_000);

  it("does not grant CORS to a non-allow-listed origin", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "OPTIONS",
      headers: { Origin: DENIED_ORIGIN },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  }, 10_000);

  it("rejects a non-allow-listed origin on /health too", async () => {
    const res = await fetch(`${BASE}/health`, { headers: { Origin: DENIED_ORIGIN } });
    expect(res.status).toBe(403);
  }, 10_000);
});
