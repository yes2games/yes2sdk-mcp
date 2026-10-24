# Yes2SDK MCP Server

> A hosted MCP server that gives your AI coding assistant live access to the Yes2SDK docs, API reference, platform-compliance rules, and a build validator.

If you integrate the SDK with help from an AI assistant (Claude Code, Cursor, Windsurf, VS Code Copilot), connect it to the Yes2SDK MCP server. Your assistant can then pull the exact API reference, quickstart, and platform rules on demand, and validate your build against the same rejection rules each platform enforces.

Works for every supported engine SDK (HTML5/WebGL) on every supported platform. The API overview carries the current support matrix.

## Connect (hosted, recommended)

The server is hosted at `https://mcp.yes2games.com/mcp`. Nothing to build or run.

**Claude Code**: the fastest path is the [Claude Code plugin](/docs/claude-code-plugin), which registers this server for you. To add it manually instead:

```bash
claude mcp add --transport http yes2sdk https://mcp.yes2games.com/mcp
```

**Cursor, Windsurf, VS Code Copilot**: add an HTTP MCP server in your client config:

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

After connecting, ask your assistant to "use the yes2sdk tools" or run `/mcp` (Claude Code) to confirm the `yes2sdk` server is listed.

## Run locally (alternative)

Prefer to run it yourself? Install the npm package and point your client at it over stdio:

```bash
npx -y @yes2games/yes2sdk-mcp
```

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

## What it gives your assistant

| Tool | What it does |
|---|---|
| `search_docs` | Keyword search across the Yes2SDK docs; returns the top matching sections. |
| `get_quickstart` | Full quickstart integration guide for a target platform. |
| `get_api_reference` | API reference for one SDK module (ads, analytics, auth, banners, data, friends, game, player, score, session, lifecycle, …). |
| `list_sdk_modules` | List every available SDK module. |
| `get_platform_requirements` | The compliance rules a build must satisfy for a target platform. |
| `validate_integration` | Validate a build against real platform rejection rules: static build checks and behavioral (event-log) checks. |

## Upload builds and edit games on the dashboard

With your own dashboard API key, your assistant can also work on the Yes2 dashboard for you. It can put a build there (build, zip, upload, wait for processing, then hand you the Inspector link), and it can edit a game's details, icon and banner, and rename a build.

| Tool | What it does |
|---|---|
| `list_games` | The games your studio owns. |
| `create_game` | Create a new game in your studio. |
| `prepare_upload` | Start an upload for a game and version; returns a command that sends the zip from your machine straight to storage. |
| `finalize_upload` | Tell the dashboard the zip is uploaded, so it starts processing it. |
| `get_build_status` | Follow processing until the build is ready, then return its Inspector link and any upload warnings. |
| `update_game` | Change a game's name, description, engine, category, tags, orientation, Yandex Metrica counter or Jest auto-login reminders. Only the fields you give change. |
| `set_game_image` | Set a game's icon or banner; returns a command that sends the image from your machine. PNG, JPEG or WebP, up to about 15 MB. It can also remove the image. |
| `rename_build` | Give a build a display name, or clear it back to the zip file name. |

The zip never passes through the MCP server, and the server never stores your key: it is passed through to the dashboard on each request only. `set_game_image` works the same way: the command it returns reads `$YES2_API_KEY` from your shell, so neither the image nor the key passes through the chat or the MCP server. Uploading puts a build on the dashboard; publishing it to platforms is still requested on the dashboard and done by a Yes2Games admin.

**Set up the key.** Create a personal key in the dashboard (avatar → **Settings → Personal API keys**) and export it in your shell profile, never in a committed file:

```bash
export YES2_API_KEY=y2g_...
```

Then restart your client from a new terminal. The [Claude Code plugin](/docs/claude-code-plugin) and the Codex plugin pick the variable up on their own. For a manual Claude Code setup:

```bash
claude mcp add --transport http yes2sdk https://mcp.yes2games.com/mcp --header "Authorization: Bearer $YES2_API_KEY"
```

For other clients, send `Authorization: Bearer y2g_...` (or the bare key in an `X-Yes2-Api-Key` header) to the server. Without a key, every other tool keeps working, and the dashboard tools reply with these setup steps. The claude.ai connector cannot send a key yet.

The tools use the [Build Upload API](/docs/build-upload-api), which you can also call directly from CI.

## Next step

For Claude Code users, the [Yes2SDK Claude Code plugin](/docs/claude-code-plugin) wraps this server and adds one-command integrate and verify flows.
