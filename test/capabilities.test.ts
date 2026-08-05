import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { parseCapabilityMatrix } from "../src/tools/capabilities.js";
import { readDocBySlug } from "../src/lib/docs.js";

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

describe("parseCapabilityMatrix", () => {
  it("parses the matrix from overview.md into rows keyed by platform", () => {
    const md = readDocBySlug("api/overview");
    expect(md).not.toBeNull();
    const { platforms, rows } = parseCapabilityMatrix(md as string);
    expect(platforms).toEqual(["poki", "gamedistribution", "crazygames", "yandex", "youtube"]);
    const adsBanner = rows.find((r) => r.module.includes("banner"));
    expect(adsBanner).toBeDefined();
    // Ads: banner: only CrazyGames and Yandex.
    expect(adsBanner?.support.crazygames).toBe("Ready");
    expect(adsBanner?.support.poki).toBe("None");
    // Footnote superscripts are stripped from the status value.
    const data = rows.find((r) => r.module === "Data");
    expect(data?.support.poki).toBe("Partial");
  });
});

describe("get_platform_capabilities", () => {
  it("returns the full matrix with a legend", async () => {
    const res = await client.callTool({ name: "get_platform_capabilities", arguments: {} });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("poki");
    expect(text.toLowerCase()).toContain("crazygames");
    expect(text).toContain("Ready");
    expect(text).toContain("Friends");
  });

  it("filters to a single platform column", async () => {
    const res = await client.callTool({
      name: "get_platform_capabilities",
      arguments: { platform: "poki" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("poki");
    // Friends is not offered on Poki.
    expect(text).toMatch(/Friends: None/);
    // Single-column view: other platforms are not rendered as matrix columns.
    expect(text).not.toMatch(/Module \|/);
  });

  it("filters to a single module across platforms", async () => {
    const res = await client.callTool({
      name: "get_platform_capabilities",
      arguments: { module: "auth" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("auth");
    expect(text.toLowerCase()).toContain("crazygames");
    // Auth is not on Poki. Assert the platform's own cell, not the shared legend.
    expect(text).toMatch(/^ {2}poki: None$/m);
  });

  it("reports when a module filter matches nothing", async () => {
    const res = await client.callTool({
      name: "get_platform_capabilities",
      arguments: { module: "nonexistent-module-xyz" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("no module");
  });
});
