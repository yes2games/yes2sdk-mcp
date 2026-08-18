# @yes2games/yes2sdk-mcp

One integration ships your HTML5 game to every supported web game platform. Docs and the checks that catch a rejection before you submit, for AI assistants.

A [Model Context Protocol](https://modelcontextprotocol.io) server for the **Yes2SDK**, reachable
over **Streamable HTTP** (hosted, nothing to install) or **stdio** (local). It speaks to any MCP
client: Claude, Claude Code, Cursor, Windsurf, VS Code Copilot, Cline, Zed, and the rest.

It gives the AI *tools it can run*, not just text it can read — most importantly
`validate_integration`, which lets the AI self-check a game against real platform rejection
rules before upload.

The server calls **no LLM** and needs no API key — it is purely a tool provider.

## Tools

All tools are read-only (`readOnlyHint`); none write to the consumer filesystem or call the network.

| Tool | Input | What it does |
|------|-------|--------------|
| `get_install_instructions` | `{ engine, platform? }` | Version-pinned install + post-install steps for `unity` \| `defold` \| `js`, plus how to verify the SDK is importable. Call before generating any SDK code. |
| `detect_sdk` | `{ projectPath }` or `{ files }` | Inspect a project (read-only): engine, whether the SDK is installed, the version, and any install steps still required. `projectPath` reads disk (local stdio only); `files` takes the engine-marker files inline, which is how the hosted server sees a project. |
| `search_docs` | `{ query }` | Keyword search across all bundled docs; returns top sections with their doc slug. |
| `get_quickstart` | `{ platform }` | Full quickstart guide for `poki` \| `crazygames` \| `yandex` \| `gamedistribution` \| `youtube`. |
| `get_api_reference` | `{ module }` | Full API reference for one module (`overview`, `lifecycle`, `ads`, `analytics`, `auth`, `banners`, `data`, `errors`, `friends`, `game`, `player`, `score`, `session`, `upcoming`). |
| `list_sdk_modules` | `{}` | List all API reference module names. |
| `get_platform_capabilities` | `{ platform?, module? }` | Module × platform support matrix (`Ready` / `Partial` / not offered); optionally filter to one platform column or one module row. |
| `get_platform_requirements` | `{ platform }` | The compliance rules a build must satisfy for a platform, as `id [severity]: description`. |
| `get_compliance_rule` | `{ ruleId }` | One compliance rule by id (e.g. `P-002`): severity, platform, what it checks, and the fix. |
| `troubleshoot` | `{ symptom }` | Map an error string or description to its likely cause and the ordered fix. |
| `validate_integration` | `{ platform, buildPath? \| inline build, eventLogJson? }` | Static build checks and/or behavioral compliance checks (see below). |

### `validate_integration` — two modes

1. **Static build checks** — give it the build, either as `buildPath` (absolute path to an
   *already-extracted* build folder, local stdio only) or inline as `indexHtml`, `fileList`
   and `jsContents`, which is what the hosted server needs. `jsContents` is what makes the
   bundling check possible; without it that one check is skipped. Checks:
   - Yes2SDK is bundled into the game JS (scans `.js`, `.js.br`, `.js.gz`).
   - No external `<script src="http…">` tags in `index.html` (platforms block them → **FAIL**).
   - `index.html` entry file present (Poki also needs `index.json`).
   - Responsive full-viewport canvas heuristic (`width/height:100%`, `100vw/100vh`).
2. **Behavioral compliance checks** — pass `eventLogJson`: a JSON string of an **exported
   Yes2SDK Inspector event log** (an array of `LogEntry`). Runs the platform's compliance
   rules (e.g. `gameplayStop` before ads, reward only on `adViewed`, no ads in the first
   30 s). These require running the game in the QA Inspector and exporting its log.

You may pass one or both. Always pass `platform`.

## Connecting

Three ways in. None of them need a checkout.

### 1. Claude connector (no setup)

Claude → **Settings → Connectors → YES2SDK**. Connecting exposes all 11 tools, each with its
own permission control. This is the shortest path for anyone not running a local checkout.

### 2. Hosted HTTP

Point any MCP client at `https://mcp.yes2games.com/mcp`. Claude Code:

```json
{
  "mcpServers": {
    "yes2sdk": {
      "type": "http",
      "url": "https://mcp.yes2games.com/mcp"
    }
  }
}
```

The [Claude Code plugin](https://github.com/yes2games/yes2sdk-claude-plugins) registers exactly
this for you, alongside integrate/verify slash commands:

```
/plugin marketplace add yes2games/yes2sdk-claude-plugins
/plugin install yes2sdk@yes2games
```

The hosted server has **no disk access**, so the two tools that inspect a project take inline
content instead of a path — see the `validate_integration` and `detect_sdk` notes above.

### 3. Local, over stdio

Published on npm, so the client spawns it directly. Requires Node 20+. The package carries its
own copy of the docs (`docs/`), so a local run needs no other checkout.

```bash
npx -y @yes2games/yes2sdk-mcp
```

The client blocks below spawn exactly that. To pin a version, use
`@yes2games/yes2sdk-mcp@<version>`.

### Cursor — `.cursor/mcp.json` (or Settings → MCP)

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "npx",
      "args": ["-y", "@yes2games/yes2sdk-mcp"]
    }
  }
}
```

### Claude Code — `.mcp.json` in your project (or `claude mcp add`)

Only needed to run stdio locally; the plugin or the hosted URL above covers normal use.

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "npx",
      "args": ["-y", "@yes2games/yes2sdk-mcp"]
    }
  }
}
```

Or: `claude mcp add yes2sdk -- npx -y @yes2games/yes2sdk-mcp`

### Windsurf — `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "yes2sdk": {
      "command": "npx",
      "args": ["-y", "@yes2games/yes2sdk-mcp"]
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
      "command": "npx",
      "args": ["-y", "@yes2games/yes2sdk-mcp"]
    }
  }
}
```

To run a checkout instead of the published package, build it and swap the command for
`node /ABSOLUTE/PATH/TO/dist/index.js`:

```bash
git clone https://github.com/yes2games/yes2sdk-mcp.git
cd yes2sdk-mcp
npm install
npm run build      # tsc -> dist/
```

## Keeping it in sync

The docs, the compliance engine and the engine SDK metadata are **copied** in from the repos
that own them:

```bash
npm run sync-docs        # copies ../../yes2sdk-www/content/docs/**/*.md -> ./docs
npm run sync-compliance  # copies compliance-rules.ts + inspector types -> src/lib
npm run sync-sdk-meta    # copies engine package versions + install steps -> src/lib
```

The docs corpus is owned by the documentation site, so what ships here is what a
reader sees published. The compliance rules are application code and stay owned by
the dashboard. The engine metadata comes from the engine SDK repos themselves, so the
pinned versions are derived rather than typed. Run these (then `npm run build`) whenever
a source changes. `src/lib/compliance.ts`, `src/lib/inspector-types.ts` and
`src/lib/sdk-meta.ts` are generated — do not edit them by hand.

A pinned version that has gone stale is silent: `get_install_instructions` and
`detect_sdk` keep handing developers an install URL for an SDK release that is no
longer current. `npm run check:sdk-meta` catches that — it regenerates the metadata
from the sibling engine SDK repos and diffs it against the committed file:

```bash
npm run check:sdk-meta   # exit 0 in sync, 1 on drift, 2 when the sibling repos are absent
```

Run it after every engine SDK release, and before committing a change to either side.
It reads `../../yes2sdk-unity` and `../../yes2sdk-defold` and never clones them
(ADR-0010), so CI cannot run it — an isolated runner has no access to those private
repos. This is a local gate by design.

The server version lives only in `package.json`. `src/lib/version.ts` reads it at startup and
`createServer()` reports it, so bumping the package is the whole job — there is no second copy
to keep in step.

## Releasing

**Manual, tag-driven.** A human publishes; no workflow does. The hosted container and the
connector are the primary channels and deploy on merge to `main`, so npm is the slow lane and
releases are rare enough that automating them would buy less than the credentials it would cost.

```bash
npm version <major|minor|patch>   # bumps package.json, commits, tags
git push --follow-tags
npm publish                       # from a real terminal: 2FA needs a TTY
gh release create v<version> --generate-notes
```

Notes:

- `publishConfig.access` is `public`; the scope would otherwise default to restricted and the
  first publish would fail `402`.
- `prepare` runs `tsc` on publish, so `dist/` is always built from the committed source.
- The registry's read path lags its write path by roughly a minute. A `404` from `npm view`
  straight after a publish is that lag, not a failure. The authoritative signal is `PUT 200`
  in the npm debug log.
- Publishing from CI would need either a token in repository secrets or npm Trusted Publishing
  (OIDC). Neither is set up, and neither is worth it at this cadence.

## Architecture

- `src/server.ts` — `createServer()` factory returning a configured `McpServer`. Registers every
  tool, resource and prompt, and carries the server `instructions`. Transport-agnostic: both
  entry points build through it, so tool logic is never forked per transport.
- `src/index.ts` — stdio entry, connecting a `StdioServerTransport`. **stdout is the JSON-RPC
  channel**, so anything logged there corrupts the stream; log to stderr only.
- `src/http.ts` — Streamable HTTP entry. Stateless: a fresh server + transport per request.
- `src/tools/` — one registration per tool file: `install.ts`, `detect.ts`, `docs.ts`
  (the four docs tools), `validate.ts`, `requirements.ts`, `capabilities.ts`, `rule.ts`,
  `troubleshoot.ts`.
- `src/resources/`, `src/prompts/` — the `yes2sdk://` module resources and the integrate prompts.
- `src/lib/` — the leaf layer, importing nothing from `tools/`: docs scanner/search (`docs.ts`),
  the copied compliance engine and its types (`compliance.ts`, `inspector-types.ts`), engine
  metadata (`sdk-meta.ts`), static build checks (`build-checks.ts`), shared tool annotations
  (`annotations.ts`), the canonical positioning line (`positioning.ts`) and the version lookup
  (`version.ts`).
- `docs/` — bundled markdown docs, shipped with the package and with the container.

## HTTP transport

The transport behind the hosted endpoint and the Claude connector, and the one to run locally
for any client that cannot spawn a process.

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

### Security note: no authentication, deliberately

The hosted endpoint is unauthenticated by decision, not by omission. Everything it serves is
already public: the SDK docs as published on `developer.yes2games.com`, and a stateless
compliance validator that holds no state between requests. There are no secrets and no user
data behind it, and an auth wall would cost every consumer a credential to read documentation
they can read anyway.

What guards it instead is scope. Every tool is read-only, none touches the consumer filesystem
or the network, and the hosted server has no disk access at all. The Host allowlist and the
`Origin` check above stop a web page the user happens to visit from driving the server.

Revisit this if the server ever gains a tool that writes, or that reads anything not already
published.

### Production deployment

DNS, TLS termination, NGINX reverse proxy, and rootless Podman Quadlet service on the
deploy host (`bakso`) are tracked in the **yes2infra** repo, maintained by @atqamz.

## License

MIT — see [LICENSE](LICENSE).
