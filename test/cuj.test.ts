import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";

// Critical-user-journey regression for the bug that motivated issue #10:
// an agent pointed at a fresh Unity project generated `using Yes2SDK;` code
// before the package was installed, so it never compiled. This proves the
// server now steers install-before-codegen end to end.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECTS = path.join(HERE, "fixtures", "projects");

let client: Client;

function textOf(res: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
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

describe("CUJ: fresh project installs before codegen", () => {
  it("server instructions make install-before-code the first rule", () => {
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toMatch(/install before code/i);
    expect(instructions).toContain("detect_sdk");
    expect(instructions).toContain("get_install_instructions");
  });

  it("detecting a fresh Unity project blocks codegen and demands install", async () => {
    const detect = textOf(
      await client.callTool({
        name: "detect_sdk",
        arguments: { projectPath: path.join(PROJECTS, "unity-fresh") },
      })
    );
    expect(detect).toMatch(/SDK installed: no/);
    // The agent is told what is required before generating SDK code.
    expect(detect).toMatch(/Required before generating SDK code/i);
    expect(detect).toContain("get_install_instructions");
  });

  it("install instructions are version-pinned and gate code on verification", async () => {
    const install = textOf(
      await client.callTool({
        name: "get_install_instructions",
        arguments: { engine: "unity" },
      })
    );
    expect(install).toMatch(/yes2sdk-unity\.git#v\d+\.\d+\.\d+/);
    expect(install).toContain("Install Template");
    // Explicit gate: do not write namespace code until verification passes.
    expect(install).toContain("using Yes2SDK;");
    expect(install.toLowerCase()).toMatch(/do not write .*code .*until/);
  });

  it("the original error string routes to the install fix via troubleshoot", async () => {
    const fix = textOf(
      await client.callTool({
        name: "troubleshoot",
        arguments: { symptom: "The type or namespace name 'Yes2SDK' could not be found" },
      })
    );
    expect(fix).toContain("get_install_instructions");
    expect(fix.toLowerCase()).toContain("install");
  });

  it("once installed, detection clears the gate for codegen", async () => {
    const detect = textOf(
      await client.callTool({
        name: "detect_sdk",
        arguments: { projectPath: path.join(PROJECTS, "unity-installed") },
      })
    );
    expect(detect).toMatch(/SDK installed: yes/);
    expect(detect).not.toMatch(/Required before generating SDK code/i);
  });
});
