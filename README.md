# @yes2games/yes2sdk-mcp

One integration ships your HTML5 game to Poki, CrazyGames, Yandex, GameDistribution, and YouTube Playables. Docs and compliance checks for AI coding assistants.

A [Model Context Protocol](https://modelcontextprotocol.io) server for the **Yes2SDK**, speaking to any AI coding client (Cursor, Claude Code, Windsurf, VS Code Copilot, Cline, Zed, …) over **stdio**.

This is **Tier 1** of the AI-assisted integration plan: it gives the AI *tools it can run*,
not just text it can read — most importantly `validate_integration`, which lets the AI
self-check a game against real platform rejection rules before upload.

The server calls **no LLM** and needs no API key — it is purely a tool provider.

## Tools

All tools are read-only (`readOnlyHint`); none write to the consumer filesystem or call the network.

| Tool | Input | What it does |
|------|-------|--------------|
| `get_install_instructions` | `{ engine, platform? }` | Version-pinned install + post-install steps for `unity` \| `defold` \| `js`, plus how to verify the SDK is importable. Call before generating any SDK code. |
| `detect_sdk` | `{ projectPath }` | Inspect a project (read-only): engine, whether the SDK is installed, the version, and any install steps still required. |
| `search_docs` | `{ query }` | Keyword search across all bundled docs; returns top sections with their doc slug. |
| `get_quickstart` | `{ platform }` | Full quickstart guide for `poki` \| `crazygames` \| `yandex` \| `gamedistribution` \| `youtube`. |
| `get_api_reference` | `{ module }` | Full API reference for one module (`overview`, `lifecycle`, `ads`, `analytics`, `auth`, `banners`, `data`, `errors`, `friends`, `game`, `player`, `score`, `session`, `upcoming`). |
| `list_sdk_modules` | `{}` | List all API reference module names. |
| `get_platform_capabilities` | `{ platform?, module? }` | Module × platform support matrix (`Ready` / `Partial` / not offered); optionally filter to one platform column or one module row. |
| `get_platform_requirements` | `{ platform }` | The compliance rules a build must satisfy for a platform, as `id [severity]: description`. |
| `get_compliance_rule` | `{ ruleId }` | One compliance rule by id (e.g. `P-002`): severity, platform, what it checks, and the fix. |
| `troubleshoot` | `{ symptom }` | Map an error string or description to its likely cause and the ordered fix. |
| `validate_integration` | `{ platform, buildPath?, eventLogJson? }` | Static build checks and/or behavioral compliance checks (see below). |

### `validate_integration` — two modes

1. **Static build checks** — pass `buildPath` (absolute path to an *already-extracted*
   build folder). Checks:
   - Yes2SDK is bundled into the game JS (scans `.js`, `.js.br`, `.js.gz`).
   - No external `<script src="http…">` tags in `index.html` (platforms block them → **FAIL**).
   - `index.html` entry file present (Poki also needs `index.json`).
   - Responsive full-viewport canvas heuristic (`width/height:100%`, `100vw/100vh`).
2. **Behavioral compliance checks** — pass `eventLogJson`: a JSON string of an **exported
   Yes2SDK Inspector event log** (an array of `LogEntry`). Runs the platform's compliance
   rules (e.g. `gameplayStop` before ads, reward only on `adViewed`, no ads in the first
   30 s). These require running the game in the QA Inspector and exporting its log.

You may pass one or both. Always pass `platform`.

## Install & build

```bash
npm install
npm run build      # tsc -> dist/
```

Requires Node 20+. The package ships its own copy of the docs (`docs/`) so it is
self-contained — no dashboard checkout needed when run via `npx`.

## Wiring it into a client

All clients spawn the built `dist/index.js` with `node` over stdio. Replace
`/ABSOLUTE/PATH/TO` with the path to this package.

### Cursor — `.cursor/mcp.json` (or Settings → MCP)

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dist/index.js"]
    }
  }
}
```

### Claude Code — `.mcp.json` in your project (or `claude mcp add`)

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dist/index.js"]
    }
  }
}
```

Or: `claude mcp add yes2sdk -- node /ABSOLUTE/PATH/TO/dist/index.js`

### Windsurf — `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dist/index.js"]
    }
  }
}
```

### VS Code (Copilot agent mode) — `.vscode/mcp.json`

```json
{
  "servers": {
    "yes2sdk": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/dist/index.js"]
    }
  }
}
```

> Tip: once published to npm you can replace `command`/`args` with
> `"command": "npx", "args": ["-y", "@yes2games/yes2sdk-mcp"]` and drop the absolute path.

## Keeping it in sync

The docs and the compliance engine are **copied** from the dashboard repo (source of truth):

```bash
npm run sync-docs        # copies ../../yes2dashboard/docs/**/*.md -> ./docs
npm run sync-compliance  # copies compliance-rules.ts + inspector types -> src/lib
```

Run these (then `npm run build`) whenever the dashboard docs or compliance rules change.
`src/lib/compliance.ts` and `src/lib/inspector-types.ts` are generated — do not edit them
by hand.

The server version is declared twice — `package.json` `version` and the `version` passed to
`new McpServer()` in `src/server.ts`. Bump both together; clients report the second one.

## Architecture

- `src/index.ts` — thin stdio entry; builds the server via `createServer()` and connects
  a `StdioServerTransport`.
- `src/server.ts` — `createServer()` factory returning a configured `McpServer`.
  Transport-agnostic, so an HTTP transport can be added later without touching tools.
- `src/tools/` — tool registrations (`docs.ts`, `validate.ts`).
- `src/lib/` — docs scanner/search, copied compliance engine + types, and static
  build-check helpers.
- `docs/` — bundled markdown docs (self-contained for npx users).

## HTTP transport

An alternative Streamable HTTP entry point for clients that cannot use stdio (e.g.
remote or containerised deployments).

### Running

```bash
npm run build      # compile TypeScript to dist/ (required before first run)
npm run http       # node dist/http.js
```

### Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `8091` | TCP port the server binds on `0.0.0.0`. |
| `MCP_ALLOWED_ORIGINS` | *(empty)* | Comma-separated browser origins allowed to call the server, e.g. `https://a.example,https://b.example`. Empty means no browser page is trusted. See Origin validation below. |

There is no `HOST` variable — the server always binds `0.0.0.0`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | Stateless Streamable HTTP MCP endpoint. A fresh server + transport is created per request. |
| `GET` | `/health` | Returns `{"status":"ok"}`. Used for container healthchecks; exempt from host validation. |
| Other | `/mcp` | Returns 405. |
| Any | anything else | Returns 404. |

### DNS-rebinding protection

Host-header validation is enabled. Only the following `Host` values are accepted on
`POST /mcp`:

- `mcp.yes2games.com` — the public hostname behind Cloudflare/NGINX.
- `127.0.0.1:<PORT>` — loopback access (e.g. `127.0.0.1:8091`).

`GET /health` is served outside the transport and bypasses this check entirely, so
container probes on `127.0.0.1` work without needing to be in the allowlist.

Clients connecting from any other host must be added to `ALLOWED_HOSTS` in `src/http.ts`.

### Origin validation

The MCP spec requires servers to validate the `Origin` header so a web page the user
happens to visit cannot drive the server (DNS rebinding / CSRF). Any request carrying
an `Origin` that is not in `MCP_ALLOWED_ORIGINS` gets `403` on every route, and no
`Access-Control-Allow-Origin` header.

Requests with **no** `Origin` header are unaffected. That covers every current
consumer: CLI MCP hosts and server-side `fetch` do not send one. Only browser-based
clients need an entry in `MCP_ALLOWED_ORIGINS`.

CORS advertises only what is served — `GET,POST,OPTIONS` and
`Content-Type, Mcp-Protocol-Version`. The server is stateless, so it never mints or
echoes `Mcp-Session-Id`.

### Security note

v1 is unauthenticated. The server exposes only public SDK docs and the stateless
compliance validator — no secrets and no user data — so this is acceptable for the
initial deployment.

### Production deployment

DNS, TLS termination, NGINX reverse proxy, and rootless Podman Quadlet service on the
deploy host (`bakso`) are tracked in the **yes2infra** repo, maintained by @atqamz.

## License

MIT — see [LICENSE](LICENSE).
