# Yes2SDK Claude Code Plugin

> A Claude Code plugin that auto-registers the hosted Yes2SDK MCP server and adds integrate and verify slash commands. No local server to run.

If you use [Claude Code](https://claude.com/claude-code) to build your game, this plugin is the fastest way to integrate the Yes2SDK. Installing it registers the hosted [Yes2SDK MCP server](/docs/mcp-server) for you and adds slash commands that scaffold the integration and check your build against every platform's rules.

**Prerequisite**: Claude Code installed.

## Install

In Claude Code, run:

```
/plugin marketplace add yes2games/yes2sdk-claude-plugins
/plugin install yes2sdk@yes2games
```

Then confirm the MCP server is connected:

```
/mcp
```

You should see the `yes2sdk` server listed (remote HTTP, `https://mcp.yes2games.com/mcp`).

## Commands

| Command | What it does |
|---|---|
| `/integrate-all` | Scaffold the unified init + ad loop with `isSupported()` guards, portable across all five platforms. |
| `/verify-all` | Validate your build against all five platforms; one pass/fail table. |
| `/verify-poki` | Poki compliance + static checks. |
| `/verify-crazygames` | CrazyGames compliance + static checks. |
| `/verify-yandex` | Yandex Games compliance + static checks. |
| `/verify-gamedistribution` | GameDistribution compliance + static checks. |
| `/verify-youtube` | YouTube Playables compliance + static checks (strictest). |
| `/yes2sdk-docs <query>` | Search the Yes2SDK docs from the chat. |

## What else it ships

The plugin includes a `yes2sdk-platform-rules` skill that carries the highest-leverage cross-platform compliance gotchas, so Claude applies them automatically while integrating, and defers to the MCP server for the authoritative rule set.

## How it relates to the MCP server

The plugin is a thin Claude Code front end for the [Yes2SDK MCP server](/docs/mcp-server). The slash commands call the MCP tools; they don't reimplement them. If you use a different assistant (Cursor, Windsurf, VS Code Copilot), connect to the MCP server directly instead.
