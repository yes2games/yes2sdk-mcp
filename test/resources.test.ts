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

describe("resources", () => {
  it("lists the modules resource", async () => {
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain("yes2sdk://modules");
  });

  it("reads the modules resource as a non-empty list", async () => {
    const res = await client.readResource({ uri: "yes2sdk://modules" });
    const text = (res.contents[0] as { text?: string }).text ?? "";
    expect(text.toLowerCase()).toContain("ads");
  });

  it("reads a per-module doc via template", async () => {
    const res = await client.readResource({ uri: "yes2sdk://docs/ads" });
    const text = (res.contents[0] as { text?: string }).text ?? "";
    expect(text.length).toBeGreaterThan(0);
    expect(text.toLowerCase()).toContain("ad");
  });
});
