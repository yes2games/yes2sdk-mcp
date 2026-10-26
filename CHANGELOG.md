# Changelog

## 0.4.0 (2026-10-26)

Everything since 0.3.1. The hosted server (`https://mcp.yes2games.com/mcp`) has been running
these changes since they merged; this release brings the npm package (the local stdio server)
up to date.

### Dashboard tools (new)

Nine tools that act on the Yes2 dashboard as the caller. With no credential they answer with
the setup steps; the docs and validation tools never need one.

- `list_games`, `create_game`: find or create the `gameId` to upload to.
- `prepare_upload`, `finalize_upload`, `get_build_status`: upload a build zip. The zip goes from
  the user's machine straight to storage through a presigned `curl -X PUT`; the server never
  handles the file. `get_build_status` returns the Inspector URL and upload warnings when ready.
- `update_game`: change a game's name, description, engine, category, tags, orientation,
  Yandex Metrica counter or Jest auto-login reminders.
- `set_game_image`, `finalize_image_upload`: set or remove a game's icon or banner through the
  same presigned upload, with no credential in the command.
- `rename_build`: set or clear a build's display name.
- Preview accounts: one build per game, and a new upload replaces the previous build. The
  upload and limit errors say so.

Credentials: a personal dashboard API key (`y2g_…`). The local stdio server reads it from
`YES2_API_KEY`; over HTTP it is sent as `Authorization: Bearer` or `X-Yes2-Api-Key`. It is
passed through to the dashboard per request and never stored or logged.

### Sign-in (hosted server only)

- Opt-in OAuth sign-in behind `MCP_OAUTH_ENABLED`, through a new `sign_in` tool (21 tools on
  the hosted server, 20 over stdio). Only `sign_in` triggers the client's sign-in; the other
  tools never answer with an HTTP 401, so the connector stays usable without signing in.
- The sign-in texts give each client's real step: Claude Code `/mcp` → the server →
  Authenticate, the claude.ai Connect card, or `codex mcp login yes2sdk`.
- With the flag off the server answers exactly as before (a recorded parity fixture guards it).

### Engines and platforms

- JS engine: `@yes2games/js` package support in `detect_sdk` and `get_install_instructions`.
- Install pins: Unity v2.13.0, Defold v1.9.0, `@yes2games/js` 0.1.1.
- Jest platform, with compliance rules J-001 to J-014.
- `get_platform_capabilities` accepts `portal`.

### Other

- The docs corpus is synced from yes2sdk-www, including the build upload API reference.
- The HTTP server serves the OpenAI apps domain verification token.
- CI runs on Node 26.12.1.

## 0.3.1 (2026-08-18)

- Unity install pins `v2.7.0`, Defold `v1.6.0`.
- `npm run check:sdk-meta` fails on drift between the pinned versions and the engine SDK repos.
