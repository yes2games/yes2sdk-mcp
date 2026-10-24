// One-off smoke test: spawn dist/index.js, drive the stdio JSON-RPC handshake
// (newline-delimited), and confirm tools/list returns the expected tools. Then
// spawn dist/http.js and check the OAuth protected resource metadata.
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
  "list_games",
  "create_game",
  "prepare_upload",
  "finalize_upload",
  "get_build_status",
  "update_game",
  "set_game_image",
  "finalize_image_upload",
  "rename_build",
];
const names = tools.map((t) => t.name).sort();
const toolsOk = expected.every((e) => names.includes(e)) && names.length === expected.length;
console.log(`\ntools: ${toolsOk ? "PASS" : "FAIL"} (expected ${expected.length} tools, got ${names.length})`);

child.stdin.end();
child.kill();

// Opt-in OAuth (MCP_OAUTH_ENABLED): the built HTTP entry serves the protected
// resource metadata, lists sign_in (21 tools), challenges only sign_in without
// a credential, and answers a dashboard tool without one with a normal result.
// With the flag off the metadata route does not exist.
const HTTP_ENTRY = path.resolve(__dirname, "..", "dist", "http.js");
const EXPECTED_PRM = {
  resource: "https://mcp.yes2games.com/mcp",
  authorization_servers: ["https://dashboard.yes2games.com"],
  scopes_supported: ["games:read", "games:write", "builds:write"],
  bearer_methods_supported: ["header"],
  resource_name: "Yes2 dashboard",
};

async function withHttp(port, env, fn) {
  const http = spawn("node", [HTTP_ENTRY], { env: { ...process.env, PORT: String(port), ...env }, stdio: ["ignore", "ignore", "pipe"] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`http entry on ${port} did not start`)), 15_000);
      let err = "";
      http.stderr.on("data", (c) => {
        err += c.toString();
        if (err.includes(`listening on 0.0.0.0:${port}`)) {
          clearTimeout(timer);
          resolve();
        }
      });
      http.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`http entry exited with ${code}: ${err}`));
      });
    });
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    http.kill();
  }
}

const mcpPost = (base, body) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify(body),
  });

const oauthOk = await withHttp(8089, { MCP_OAUTH_ENABLED: "1" }, async (base) => {
  let pass = true;
  for (const prmPath of ["/.well-known/oauth-protected-resource/mcp", "/.well-known/oauth-protected-resource"]) {
    const res = await fetch(`${base}${prmPath}`);
    const body = await res.json().catch(() => null);
    const good =
      res.status === 200 &&
      JSON.stringify(body) === JSON.stringify(EXPECTED_PRM) &&
      res.headers.get("access-control-allow-origin") === "*" &&
      res.headers.get("cache-control") === "max-age=300";
    console.log(`PRM ${prmPath} -> ${res.status} ${good ? "ok" : "WRONG"}`);
    pass &&= good;
  }
  const signIn = await mcpPost(base, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sign_in", arguments: {} } });
  const challenge = signIn.headers.get("www-authenticate") ?? "";
  const gatedOk = signIn.status === 401 && challenge.includes('resource_metadata="https://mcp.yes2games.com/.well-known/oauth-protected-resource/mcp"');
  console.log(`sign_in without auth -> ${signIn.status} ${gatedOk ? "ok" : "WRONG"}`);
  const dash = await mcpPost(base, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_games", arguments: {} } });
  const dashText = await dash.text();
  const dashOk = dash.status === 200 && dash.headers.get("www-authenticate") === null && dashText.includes("You're not signed in to Yes2");
  console.log(`list_games without auth -> ${dash.status} ${dashOk ? "ok" : "WRONG"}`);
  const open = await mcpPost(base, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_docs", arguments: { query: "ads" } } });
  const openOk = open.status === 200 && open.headers.get("www-authenticate") === null;
  console.log(`search_docs without auth -> ${open.status} ${openOk ? "ok" : "WRONG"}`);
  const list = await mcpPost(base, { jsonrpc: "2.0", id: 4, method: "tools/list", params: {} });
  const listText = await list.text();
  const listed = JSON.parse(listText.split("\n").find((l) => l.startsWith("data: "))?.slice(6) ?? listText).result?.tools ?? [];
  const listOk = listed.length === expected.length + 1 && listed.some((t) => t.name === "sign_in");
  console.log(`tools/list with the flag on -> ${listed.length} tools ${listOk ? "ok" : "WRONG"}`);
  await signIn.text();
  await open.text();
  pass &&= dashOk && listOk;
  return pass && gatedOk && openOk;
});

const flagOffOk = await withHttp(8088, { MCP_OAUTH_ENABLED: "0" }, async (base) => {
  const res = await fetch(`${base}/.well-known/oauth-protected-resource/mcp`);
  console.log(`flag off: PRM -> ${res.status} ${res.status === 404 ? "ok" : "WRONG"}`);
  return res.status === 404;
});

const ok = toolsOk && oauthOk && flagOffOk;
console.log(`\nRESULT: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
