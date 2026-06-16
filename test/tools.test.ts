import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BADBUILD = path.join(HERE, "fixtures", "badbuild");
const GOODBUILD = path.join(HERE, "fixtures", "goodbuild");

let client: Client;

/** Collapse a tool result's text content blocks into a single string. */
function textOf(res: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

beforeAll(async () => {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: "test", version: "0" });
  await server.connect(serverT);
  await client.connect(clientT);
});

afterAll(async () => {
  await client.close();
});

describe("listTools", () => {
  it("returns exactly the 5 registered tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ["get_api_reference", "get_quickstart", "list_sdk_modules", "search_docs", "validate_integration"].sort()
    );
  });
});

describe("get_quickstart", () => {
  it("returns Poki-specific content", async () => {
    const res = await client.callTool({
      name: "get_quickstart",
      arguments: { platform: "poki" },
    });
    const text = textOf(res);
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("poki");
  });
});

describe("get_api_reference", () => {
  it("returns the ads reference", async () => {
    const res = await client.callTool({
      name: "get_api_reference",
      arguments: { module: "ads" },
    });
    const text = textOf(res);
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("ad");
  });
});

describe("search_docs", () => {
  it("returns non-empty text for a real query", async () => {
    const res = await client.callTool({
      name: "search_docs",
      arguments: { query: "rewarded ad" },
    });
    const text = textOf(res);
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("match");
  });
});

describe("validate_integration — static build checks", () => {
  it("badbuild contains FAILs", async () => {
    const res = await client.callTool({
      name: "validate_integration",
      arguments: { platform: "poki", buildPath: BADBUILD },
    });
    const text = textOf(res);
    expect(text).toContain("FAIL");
    expect(text).toContain("blocking FAIL");
  });

  it("goodbuild has no blocking FAIL", async () => {
    const res = await client.callTool({
      name: "validate_integration",
      arguments: { platform: "poki", buildPath: GOODBUILD },
    });
    const text = textOf(res);
    expect(text).toContain("no blocking FAILs");
  });
});

describe("server instructions", () => {
  it("exposes orientation instructions to clients", () => {
    const instructions = client.getInstructions();
    expect(instructions).toBeDefined();
    expect(instructions ?? "").toMatch(/yes2sdk/i);
    expect(instructions ?? "").toMatch(/validate_integration/);
  });
});

describe("validate_integration — behavioral compliance checks", () => {
  it("bad event log references P-002/P-003 or FAIL", async () => {
    const badLog = JSON.stringify([
      { id: "1", timestamp: 1000, type: "call", method: "ads.showInterstitial" },
    ]);
    const res = await client.callTool({
      name: "validate_integration",
      arguments: { platform: "poki", eventLogJson: badLog },
    });
    const text = textOf(res);
    expect(/P-002|P-003/.test(text)).toBe(true);
    expect(text).toContain("FAIL");
  });

  it("malformed JSON returns a graceful error message, not a crash", async () => {
    const res = await client.callTool({
      name: "validate_integration",
      arguments: { platform: "poki", eventLogJson: "{ not valid json" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("could not parse");
  });
});
