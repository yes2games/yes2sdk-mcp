import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

let client: Client;

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

describe("prompts", () => {
  it("lists integrate_module and setup_new_project", async () => {
    const { prompts } = await client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual(["integrate_module", "setup_new_project"].sort());
  });

  it("integrate_module fills in module + platform", async () => {
    const res = await client.getPrompt({
      name: "integrate_module",
      arguments: { module: "ads", platform: "poki" },
    });
    const text = res.messages.map((m) => (m.content as { text?: string }).text ?? "").join("\n");
    expect(text.toLowerCase()).toContain("ads");
    expect(text.toLowerCase()).toContain("poki");
  });
});
