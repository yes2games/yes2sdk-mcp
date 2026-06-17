import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { getAllRules, getRuleFixes } from "../src/lib/compliance.js";

let client: Client;

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

describe("rule accessors", () => {
  it("getAllRules dedupes universal rules to one copy each", () => {
    const ids = getAllRules().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("U-001");
    expect(ids).toContain("P-002");
  });

  it("getRuleFixes returns harvested autoFix text", () => {
    const fixes = getRuleFixes("U-001");
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.join(" ").toLowerCase()).toContain("initializeasync");
  });
});

describe("get_compliance_rule", () => {
  it("returns severity, platform, and fix for a known rule", async () => {
    const res = await client.callTool({
      name: "get_compliance_rule",
      arguments: { ruleId: "U-001" },
    });
    const text = textOf(res);
    expect(text).toContain("U-001");
    expect(text).toMatch(/FAIL|WARN|INFO/);
    expect(text.toLowerCase()).toContain("initializeasync");
  });

  it("is case-insensitive on the rule id", async () => {
    const res = await client.callTool({
      name: "get_compliance_rule",
      arguments: { ruleId: "p-002" },
    });
    const text = textOf(res);
    expect(text).toContain("P-002");
    expect(text.toLowerCase()).toContain("poki");
  });

  it("errors with the known ids for an unknown rule", async () => {
    const res = await client.callTool({
      name: "get_compliance_rule",
      arguments: { ruleId: "ZZ-999" },
    });
    const text = textOf(res);
    expect((res as { isError?: boolean }).isError).toBe(true);
    expect(text.toLowerCase()).toContain("no compliance rule");
    expect(text).toContain("U-001");
  });
});
