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

## Next step

For Claude Code users, the [Yes2SDK Claude Code plugin](/docs/claude-code-plugin) wraps this server and adds one-command integrate and verify flows.
