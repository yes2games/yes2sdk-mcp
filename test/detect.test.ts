import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS = path.join(HERE, "fixtures", "projects");

let client: Client;

function textOf(res: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

function detect(projectPath: string) {
  return client.callTool({ name: "detect_sdk", arguments: { projectPath } });
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

describe("detect_sdk", () => {
  it("reports a fresh Unity project as not installed, with steps", async () => {
    const text = textOf(await detect(path.join(PROJECTS, "unity-fresh")));
    expect(text).toMatch(/Engine: unity/);
    expect(text).toMatch(/SDK installed: no/);
    expect(text).toContain("Install Template");
    expect(text).toContain("get_install_instructions");
  });

  it("reports an installed Unity project with its pinned version", async () => {
    const text = textOf(await detect(path.join(PROJECTS, "unity-installed")));
    expect(text).toMatch(/Engine: unity/);
    expect(text).toMatch(/SDK installed: yes/);
    expect(text).toContain("2.4.3");
  });

  it("reports a fresh Defold project as not installed", async () => {
    const text = textOf(await detect(path.join(PROJECTS, "defold-fresh")));
    expect(text).toMatch(/Engine: defold/);
    expect(text).toMatch(/SDK installed: no/);
  });

  it("reports an installed Defold project with its tagged version", async () => {
    const text = textOf(await detect(path.join(PROJECTS, "defold-installed")));
    expect(text).toMatch(/Engine: defold/);
    expect(text).toMatch(/SDK installed: yes/);
    expect(text).toContain("1.4.0");
  });

  it("errors on a path that does not exist", async () => {
    const res = await detect(path.join(PROJECTS, "does-not-exist"));
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("not found");
  });
});
