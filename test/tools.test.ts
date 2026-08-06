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

/**
 * Words that turn a sentence into an order aimed at the model rather than a
 * description of what the tool returns. Published metadata is read by humans
 * and by directory scanners, so a sentence may not open with one of these.
 */
const DIRECTIVE_OPENERS = new Set([
  "always",
  "never",
  "use",
  "call",
  "do",
  "must",
  "first",
  "before",
  "read",
  "pass",
  "run",
  "see",
  "ensure",
  "note",
]);

/**
 * Sentences (and list items) of `text` whose first word is a directive.
 * Splits on sentence boundaries, newlines and bullet markers, so an imperative
 * in the middle of a description is caught, not just one at the very start.
 */
function directiveOpeners(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+|^\s*[-*]\s*/m)
    .map((fragment) => fragment.trim().replace(/^[^A-Za-z]+/, ""))
    .filter((fragment) => {
      const word = fragment.split(/\s+/)[0]?.replace(/[^A-Za-z-]/g, "").toLowerCase();
      return word !== undefined && DIRECTIVE_OPENERS.has(word);
    })
    .map((fragment) => fragment.slice(0, 60));
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
  it("returns exactly the 11 registered tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "detect_sdk",
        "get_api_reference",
        "get_compliance_rule",
        "get_install_instructions",
        "get_platform_capabilities",
        "get_platform_requirements",
        "get_quickstart",
        "list_sdk_modules",
        "search_docs",
        "troubleshoot",
        "validate_integration",
      ].sort()
    );
  });

  it("marks every tool read-only (none mutate the consumer FS or network)", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, `${t.name} should be readOnlyHint:true`).toBe(true);
      expect(t.annotations?.openWorldHint, `${t.name} should be openWorldHint:false`).toBe(false);
      expect(t.annotations?.idempotentHint, `${t.name} should be idempotentHint:true`).toBe(true);
      expect(t.annotations?.destructiveHint, `${t.name} should be destructiveHint:false`).toBe(false);
    }
  });

  // The Claude connector review scanner reads the older annotations.title and
  // reports "Missing annotations: title" when only the top-level field is set,
  // so both have to be present and say the same thing.
  it("carries the same title at the top level and in the annotations", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.title, `${t.name} should have a top-level title`).toBeTruthy();
      expect(t.annotations?.title, `${t.name} should have annotations.title`).toBe(t.title);
    }
  });

  it("has no sentence that starts by instructing the model", async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(directiveOpeners(t.description ?? ""), `${t.name} description`).toEqual([]);
    }
  });
});

describe("get_install_instructions", () => {
  it("returns version-pinned Unity install steps incl. the template", async () => {
    const res = await client.callTool({
      name: "get_install_instructions",
      arguments: { engine: "unity" },
    });
    const text = textOf(res);
    expect(text).toContain("com.yes2games.yes2sdk");
    expect(text).toMatch(/yes2sdk-unity\.git#v\d+\.\d+\.\d+/);
    expect(text).toContain("Install Template");
    expect(text).toContain("using Yes2SDK;");
  });

  it("returns Defold dependency + require line", async () => {
    const res = await client.callTool({
      name: "get_install_instructions",
      arguments: { engine: "defold" },
    });
    const text = textOf(res);
    expect(text).toMatch(/yes2sdk-defold\/archive\/refs\/tags\/v\d+\.\d+\.\d+\.zip/);
    expect(text).toContain('require "yes2sdk.yes2sdk"');
  });

  it("explains the js runtime is dashboard-injected (no package)", async () => {
    const res = await client.callTool({
      name: "get_install_instructions",
      arguments: { engine: "js" },
    });
    const text = textOf(res);
    expect(text.toLowerCase()).toContain("window.yes2sdk");
    expect(text.toLowerCase()).toContain("dashboard");
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

describe("get_platform_requirements", () => {
  it("returns Poki rejection rules", async () => {
    const res = await client.callTool({
      name: "get_platform_requirements",
      arguments: { platform: "poki" },
    });
    const text = textOf(res);
    expect(text.length).toBeGreaterThan(0);
    expect(/P-\d{3}/.test(text)).toBe(true);
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
    expect(instructions ?? "").toMatch(/get_install_instructions/);
  });

  it("has no line that starts by instructing the model", () => {
    expect(directiveOpeners(client.getInstructions() ?? "")).toEqual([]);
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
