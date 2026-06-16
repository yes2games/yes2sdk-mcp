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

let child: ChildProcess;

beforeAll(async () => {
  // Build dist/http.js so we test the real shipped artifact.
  execSync("npm run build", { cwd: REPO, stdio: "inherit", timeout: 120_000 });

  child = spawn(process.execPath, ["dist/http.js"], {
    env: { ...process.env, PORT: String(PORT) },
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
