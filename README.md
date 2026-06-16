# @yes2games/yes2sdk-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for the **Yes2SDK**.
It exposes the SDK documentation and a compliance/validation tool to any AI coding
client (Cursor, Claude Code, Windsurf, VS Code Copilot, Cline, Zed, …) over **stdio**.

This is **Tier 1** of the AI-assisted integration plan: it gives the AI *tools it can run*,
not just text it can read — most importantly `validate_integration`, which lets the AI
self-check a game against real platform rejection rules before upload.

The server calls **no LLM** and needs no API key — it is purely a tool provider.

## Tools

| Tool | Input | What it does |
|------|-------|--------------|
| `search_docs` | `{ query }` | Keyword search across all bundled docs; returns top sections with their doc slug. |
| `get_quickstart` | `{ platform }` | Full quickstart guide for `poki` \| `crazygames` \| `yandex` \| `gamedistribution` \| `youtube`. |
| `get_api_reference` | `{ module }` | Full API reference for one module (`overview`, `lifecycle`, `ads`, `analytics`, `auth`, `banners`, `data`, `errors`, `friends`, `game`, `player`, `score`, `session`, `upcoming`). |
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
      "args": ["/ABSOLUTE/PATH/TO/Experimental/mcp/dist/index.js"]
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
      "args": ["/ABSOLUTE/PATH/TO/Experimental/mcp/dist/index.js"]
    }
  }
}
```

Or: `claude mcp add yes2sdk -- node /ABSOLUTE/PATH/TO/Experimental/mcp/dist/index.js`

### Windsurf — `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Experimental/mcp/dist/index.js"]
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
      "args": ["/ABSOLUTE/PATH/TO/Experimental/mcp/dist/index.js"]
    }
  }
}
```

> Tip: once published to npm you can replace `command`/`args` with
> `"command": "npx", "args": ["-y", "@yes2games/yes2sdk-mcp"]` and drop the absolute path.

## Keeping it in sync

The docs and the compliance engine are **copied** from the dashboard repo (source of truth):

```bash
npm run sync-docs        # copies ../Dashboard/docs/**/*.md -> ./docs
npm run sync-compliance  # copies compliance-rules.ts + inspector types -> src/lib
```

Run these (then `npm run build`) whenever the dashboard docs or compliance rules change.
`src/lib/compliance.ts` and `src/lib/inspector-types.ts` are generated — do not edit them
by hand.

## Architecture

- `src/index.ts` — thin stdio entry; builds the server via `createServer()` and connects
  a `StdioServerTransport`.
- `src/server.ts` — `createServer()` factory returning a configured `McpServer`.
  Transport-agnostic, so an HTTP transport can be added later without touching tools.
- `src/tools/` — tool registrations (`docs.ts`, `validate.ts`).
- `src/lib/` — docs scanner/search, copied compliance engine + types, and static
  build-check helpers.
- `docs/` — bundled markdown docs (self-contained for npx users).
