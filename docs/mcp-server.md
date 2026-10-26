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

**Codex**: the Codex plugin registers it for you, or add it manually:

```bash
codex mcp add yes2sdk --url https://mcp.yes2games.com/mcp
```

**claude.ai and Claude Desktop**: add `https://mcp.yes2games.com/mcp` as a custom connector.

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

Once you sign in with your Yes2 dashboard account (optional, and only for these tools), your assistant can also work on the dashboard for you. It can put a build there (build, zip, upload, wait for processing, then hand you the Inspector link), and it can edit a game's details, icon and banner, and rename a build.

| Tool | What it does |
|---|---|
| `sign_in` | Start signing in to the dashboard (your client then shows how to finish), or, if you already are, say which account and studio the assistant acts as. |
| `list_games` | The games your studio owns, or your personal games on a preview account. |
| `create_game` | Create a new game in your studio (a personal game on a preview account). |
| `prepare_upload` | Start an upload for a game and version; returns a command that sends the zip from your machine straight to storage. |
| `finalize_upload` | Tell the dashboard the zip is uploaded, so it starts processing it. |
| `get_build_status` | Follow processing until the build is ready, then return its Inspector link and any upload warnings. |
| `update_game` | Change a game's name, description, engine, category, tags, orientation, Yandex Metrica counter or Jest auto-login reminders. Only the fields you give change. |
| `set_game_image` | Start setting a game's icon or banner; returns a command that sends the image from your machine straight to storage. PNG, JPEG or WebP, up to 15 MB. It can also remove the image. |
| `finalize_image_upload` | Tell the dashboard the image is uploaded, so it checks it and makes it the icon or banner. |
| `rename_build` | Give a build a display name, or clear it back to the zip file name. |

Neither the zip nor the image passes through the chat or the MCP server: the command your assistant runs sends the file from your machine to a short-lived storage URL that accepts only that one file, with no credential attached. The server never stores your sign-in or your key; it passes them through to the dashboard on each request only. Uploading puts a build on the dashboard; publishing it to platforms is still requested on the dashboard and done by a Yes2Games admin.

The tools use the [Build Upload API](/docs/build-upload-api), which you can also call directly from CI.

### Sign in

Signing in is opt-in. The docs, API reference, platform rules and validator tools never need it: they work without an account, in every client, whether or not you sign in. Until you sign in, a dashboard tool just replies that you're not signed in and how to do it; nothing else changes.

To sign in, say **"sign in to Yes2"**. Your assistant calls the `sign_in` tool. That does not open your browser by itself; the next step depends on your client:

- **Claude Code**: `sign_in` marks the server as needing sign-in. Run `/mcp`, pick the Yes2SDK server and choose **Authenticate**; the dashboard opens in your browser. Until you finish, Claude Code pauses all of the server's tools, docs included. To go back to using it without signing in, choose **Disable** and then **Enable** on the server in `/mcp`.
- **claude.ai** (and Claude Desktop): add `https://mcp.yes2games.com/mcp` as a custom connector; adding it needs no sign-in. `sign_in` shows a **Connect** card; click it and approve in the pop-up.
- **Codex**: run `codex mcp login yes2sdk` (use the name you gave the server) and approve in the browser.

Once you're signed in, asking again ("am I signed in to Yes2?") makes `sign_in` report the account, the studio and the permissions the assistant is using.

The approval page on the dashboard shows:

- which app is asking, by its web address (for example `claude.ai` or `chatgpt.com`), with the name the app gives itself marked as not verified by Yes2. For Claude Code and Codex, it says you will be sent back to an app on this computer: only continue if you just started the sign-in yourself;
- the account it will act as: your studio and your role in it, or your personal games on a preview account;
- what the app will be able to do (see your games and builds, create and edit games, upload builds) and what it will not (publish, download builds, analytics, revenue, team management).

Any owner, manager or developer of a studio can sign in, for that studio, and so can a preview account with no studio yet, for its personal games. **Preview accounts** work with their usual limits until the account is verified: unlimited games; one build per game, and a new upload replaces the previous one unless that build is in review or live. When an upload can't go through, the tool says why instead of uploading. Viewers, client seats and admins with no studio seat cannot connect an app.

Your assistant stays signed in and refreshes its access on its own. To disconnect it, open the dashboard (avatar → **Settings → Connected apps**) and **Revoke** it; the dashboard tools then reply that you're not signed in until you sign in again. Joining a studio also ends a connection made for your personal games: sign in again and approve it for the studio.

### Use an API key instead (CI and headless use)

API keys keep working, and are the way to go where nobody can click through a browser, such as CI. Create a personal key in the dashboard (avatar → **Settings → Personal API keys**) and export it in your shell profile, never in a committed file:

```bash
export YES2_API_KEY=y2g_...
```

Then restart your client from a new terminal. The [Claude Code plugin](/docs/claude-code-plugin) and the Codex plugin pick the variable up on their own. For a manual Claude Code setup:

```bash
claude mcp add --transport http yes2sdk https://mcp.yes2games.com/mcp --header "X-Yes2-Api-Key: $YES2_API_KEY"
```

For other clients, send the key in an `X-Yes2-Api-Key` header (or as `Authorization: Bearer y2g_...`). In Claude Code, prefer `X-Yes2-Api-Key`: a configured `Authorization` header turns off sign-in for that server.

## Next step

For Claude Code users, the [Yes2SDK Claude Code plugin](/docs/claude-code-plugin) wraps this server and adds one-command integrate and verify flows.
