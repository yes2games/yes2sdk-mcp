// One-off smoke test: spawn dist/index.js, drive the stdio JSON-RPC handshake
// (newline-delimited), and confirm tools/list returns the expected tools.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "dist", "index.js");

const child = spawn("node", [ENTRY], { stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const pending = new Map();
child.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
child.stderr.on("data", (c) => process.stderr.write(`[server stderr] ${c}`));

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}
function request(id, method, params) {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: "2.0", id, method, params });
  });
}

const init = await request(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0.0.0" },
});
console.log("initialize ->", init.result?.serverInfo);

send({ jsonrpc: "2.0", method: "notifications/initialized" });

const list = await request(2, "tools/list", {});
const tools = list.result?.tools ?? [];
console.log(`tools/list -> ${tools.length} tools:`);
for (const t of tools) console.log(`  - ${t.name}: ${t.title ?? ""}`);

// Exercise one tool to confirm content flows back.
const search = await request(3, "tools/call", {
  name: "search_docs",
  arguments: { query: "rewarded ad reward" },
});
const firstText = search.result?.content?.[0]?.text ?? "";
console.log(`\nsearch_docs call -> ${firstText.slice(0, 80).replace(/\n/g, " ")}...`);

const expected = [
  "search_docs",
  "get_quickstart",
  "get_api_reference",
  "list_sdk_modules",
  "get_platform_requirements",
  "validate_integration",
  "get_install_instructions",
  "detect_sdk",
  "get_platform_capabilities",
  "get_compliance_rule",
  "troubleshoot",
];
const names = tools.map((t) => t.name).sort();
const ok = expected.every((e) => names.includes(e)) && names.length === expected.length;
console.log(`\nRESULT: ${ok ? "PASS" : "FAIL"} (expected ${expected.length} tools, got ${names.length})`);

child.stdin.end();
child.kill();
process.exit(ok ? 0 : 1);
