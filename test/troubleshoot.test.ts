import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

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

describe("troubleshoot", () => {
  it("maps the Unity namespace error to install steps", async () => {
    const res = await client.callTool({
      name: "troubleshoot",
      arguments: { symptom: "The type or namespace name 'Yes2SDK' could not be found" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("install");
    expect(text).toContain("get_install_instructions");
  });

  it("explains window.Yes2SDK undefined is dashboard-injected", async () => {
    const res = await client.callTool({
      name: "troubleshoot",
      arguments: { symptom: "window.Yes2SDK is undefined in my build" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("dashboard");
  });

  it("points the reward symptom at the U-007 rule", async () => {
    const res = await client.callTool({
      name: "troubleshoot",
      arguments: { symptom: "rewarded ad finished but no reward was granted" },
    });
    const text = textOf(res);
    expect(text).toContain("adViewed");
    expect(text).toContain("U-007");
  });

  it("falls back with next-step tools when nothing matches", async () => {
    const res = await client.callTool({
      name: "troubleshoot",
      arguments: { symptom: "completely unrelated gibberish zzzz" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("no catalogued symptom");
    expect(text).toContain("validate_integration");
  });
});
