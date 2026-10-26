# Build Upload API

> Create and read games, set their icon and banner, and upload versioned builds from CI with an API key (or from an AI assistant signed in with OAuth), instead of clicking through the dashboard.

Every action here has an equivalent in the dashboard UI. Use this API when a build should be uploaded by a pipeline: a tagged release, a nightly job, an engine build step. Interactive uploads keep working exactly as before and are unaffected by anything on this page.

Base URL:

```
https://dashboard.yes2games.com/api/v1
```

## Authentication

Every request carries an API key (a team key or a personal key) as a bearer token:

```
Authorization: Bearer y2g_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Every key belongs to one studio. It can only reach games owned by that studio, and it grants nothing outside the endpoints on this page. A dashboard login token is not accepted here, and a key is not accepted on the dashboard's own routes.

There are two kinds of key. Both reach the same endpoints and only the games of their studio. They differ in who they are shown as, and in how long they live.

| | Team key | Personal key |
|---|---|---|
| Created by | Owners and managers, on the **Team** page | Any owner, manager or developer, in **Settings** |
| Copy again later | Any member except a viewer, with **Copy key** on the **Team** page | Its holder only, with **Reveal** in **Settings**, while the key is active |
| Revoked by | An owner or manager, on the **Team** page | Its holder, in **Settings** |
| Uploads show as | `System · <key name>`, never a person | The holder's name and email |
| Stops working when | It is revoked. It keeps working after its creator leaves the studio. | It is revoked, or the holder leaves the studio, is removed, is demoted to viewer (this includes being made a client contact) or is banned. The next request answers `401` with `INVALID_API_KEY`. |
| Limit | None | 5 per person per studio |

Owners and managers never see, reveal or revoke a member's personal key, but they do get a bell notification, with the key's name and holder and never the key or its prefix, when one is created. The holder manages it in **Settings**. A key whose holder has lost upload rights is still listed, with `active: false` and an **Inactive** badge, so the holder can revoke it. It answers `401` until the holder regains those rights.

### Creating a team key

1. Open the **Team** page in the dashboard.
2. In **Team keys**, click **Create key** and give it a name that says where it will run, for example `github-actions`.
3. Copy the key. Any member of the studio except a viewer can copy it again later with **Copy key** on the same page. The list shows only the key's prefix, so you can tell keys apart without reading them.

### Creating a personal key

1. Click your avatar in the top bar to open **Settings**.
2. In **Personal API keys**, click **Create personal key** and give it a name, for example `my-laptop`.
3. Copy the key. You can reveal it again later from **Settings** while the key is active.

Uploads with a personal key show your name on the build card in Google Chat. The key stops working when you leave the studio or lose upload rights.

Only a studio **owner** or **manager** can create or revoke team keys. Any member except a viewer can copy one. Only the holder of a personal key can create, reveal or revoke it.

Store the key as a secret in your CI provider. It is a credential: treat it like a deploy token, never commit it, never print it in build logs.

### Revoking a key

Revoke a team key with **Revoke** next to it on the **Team** page (owners and managers). Revoke a personal key with **Revoke** next to it in **Settings** (the holder). Revocation takes effect immediately and cannot be undone. A revoked key answers `401` on its next request. Revoke and create a fresh key whenever one may have been exposed.

### OAuth access tokens

An AI assistant connected through the [Yes2SDK MCP server](/docs/mcp-server) (Claude Code, claude.ai, Codex) can sign in to the dashboard with OAuth instead of using a key. You approve it once in the browser, and the app gets an access token that starts with `y2a_`. It sends it the same way:

```
Authorization: Bearer y2a_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Most people never see one of these tokens: the app stores and refreshes it itself. You can list and revoke these connections in **Settings** under **Connected apps**.

A token acts as you, in one of two places fixed when you approved it:

- **Your studio**, if you hold an owner, manager or developer seat. It reaches the same games and endpoints as a personal key, and uploads show your name.
- **Your personal games**, if you have no studio yet (a preview account). See [Personal games](#personal-games-preview-accounts).

A token carries only the scopes you approved, never admin rights. It stops working, with the same `401 INVALID_API_KEY` as an unknown key, when it is revoked or expires (the app refreshes it), when you lose your seat or are banned, and when a personal-games token's account joins a studio. Joining a studio does not silently widen a connection: sign in again and approve it for the studio.

### Personal games (preview accounts)

A credential acting for your personal games sees only those games: `GET /games` lists them, and every studio's games answer as if they did not exist. `principal.kind` is `personal` in [`GET /whoami`](#check-a-credential).

The preview limits from the dashboard apply unchanged: unlimited games, 1 build per game (a new upload replaces the previous one).

- `POST /games` creates a personal game. There is no game limit by default. If an admin has set one on your account, creating past it answers `409` with `game_limit_reached` and the limit in `limit`.
- A game keeps one build. Uploading to a game that already has its build **replaces** it, through any upload route: the new build is stored and the old one (its bundles, Inspector results and files) is removed in the same step. The upload response carries the removed build in `replacedBuildIds`, and a version is free to reuse when the build that holds it is the one being replaced.
- An upload cannot replace a build that is in review or live (an open publish request, or the game's live build). That upload answers `409 build_protected`, at presign, finalize or the multipart post, until the review finishes. A build that was sent back for changes or rejected is replaced normally, which is how you resubmit.
- One presigned upload per game may be open at a time. Creating a second while the first is waiting for its finalize or still processing answers `409 UPLOAD_ALREADY_OPEN`: finalize the open one, or wait for it to expire (an hour). Retrying the same request with the same `Idempotency-Key` replays the open upload instead.

```json
{ "success": false, "error": "This game already has an upload in progress. Finalize it, or wait for it to expire (up to 60 minutes), then request a new upload.", "code": "UPLOAD_ALREADY_OPEN" }
```

The limits lift once your account is verified.

### Scopes

Each endpoint needs one scope. A credential without it answers `403` with `INSUFFICIENT_SCOPE` and the missing scope in `scope`:

```json
{ "success": false, "error": "This credential lacks the builds:write scope", "code": "INSUFFICIENT_SCOPE", "scope": "builds:write" }
```

| Scope | Endpoints |
|---|---|
| `games:read` | `GET /games`, `GET /games/:gameId`, `GET /games/:gameId/builds`, `GET /games/:gameId/builds/:buildId`, `GET /games/:gameId/build-uploads/:uploadId` |
| `games:write` | `POST /games`, `PATCH /games/:gameId`, `PATCH /games/:gameId/builds/:buildId/name`, `POST` and `DELETE /games/:gameId/icon` and `/banner`, `POST /games/:gameId/image-uploads`, `POST /games/:gameId/image-uploads/:uploadId/finalize` |
| `builds:write` | `POST /games/:gameId/builds`, `POST /games/:gameId/build-uploads`, `POST /games/:gameId/build-uploads/:uploadId/finalize` |

A write scope does not include read. `GET /whoami` needs no scope.

Every API key currently carries all three scopes, so nothing on this page changes for an existing key. An OAuth token carries the scopes approved when it was issued.

### Check a credential

```
GET /api/v1/whoami
```

Describes the credential you sent: the studio it acts in, the person it credits, and its scopes. It never returns the key, its prefix or its id. Use it to check a key before a pipeline relies on it.

```bash
curl https://dashboard.yes2games.com/api/v1/whoami \
  -H "Authorization: Bearer $YES2_API_KEY"
```

```json
{
  "success": true,
  "data": {
    "principal": { "kind": "team", "teamId": "7d1c…", "teamName": "Demo Studio" },
    "user": { "id": "b52e…", "email": "jonas@example.com", "name": "Jonas" },
    "credential": { "kind": "key" },
    "scopes": ["games:read", "games:write", "builds:write"]
  }
}
```

| Field | Notes |
|---|---|
| `principal.kind` | `team`, or `personal` for an OAuth token acting for your [personal games](#personal-games-preview-accounts) |
| `principal.teamId`, `principal.teamName` | The studio whose games the credential reaches. Absent for `personal` |
| `user` | The person the credential acts as: the holder of a personal key, or the user who approved an OAuth token. Absent for a team key, which credits nobody |
| `credential.kind` | `key` for an API key, `oauth` for an OAuth access token |
| `scopes` | What the credential may do. See [Scopes](#scopes) |

---

## Create a game

```
POST /api/v1/games
Content-Type: application/json
```

The new game is owned by the credential's studio. For a [personal-games](#personal-games-preview-accounts) credential it is a personal game. There is no game limit by default; an admin-set limit on the account answers `409 game_limit_reached`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Cannot be blank |
| `description` | string or null | no | |
| `engine` | string or null | no | One of `unity`, `defold`, `playcanvas`, `cocos`, `vanilla`, `other`. Use `vanilla` for a JavaScript or TypeScript game (plain JS, Phaser, three.js); the dashboard shows it as HTML5 / JavaScript. A rejected value returns the accepted list in the error |
| `category` | string or null | no | Up to 100 characters |
| `tags` | string[] | no | Up to 20 tags, each up to 50 characters |
| `orientation` | string | no | `portrait`, `landscape`, or `both`. Defaults to `both` |

```bash
curl -X POST https://dashboard.yes2games.com/api/v1/games \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Age of Zombies","engine":"unity","orientation":"landscape"}'
```

`201 Created`:

```json
{
  "success": true,
  "data": {
    "id": "3f6c1b8e-...",
    "name": "Age of Zombies",
    "description": null,
    "team_id": "9a2d...",
    "engine": "unity",
    "category": null,
    "tags": [],
    "orientation": "landscape",
    "created_at": "2026-08-24T09:12:44.101Z"
  }
}
```

Keep the returned `id`. It is the `:gameId` in every later call.

---

## Update a game

```
PATCH /api/v1/games/:gameId
Content-Type: application/json
```

Same fields as create, plus two platform settings below. All are optional, and only the ones you send are touched. Sending no updatable field at all is a `400`, so an empty body cannot silently do nothing.

| Field | Type | Notes |
|---|---|---|
| `yandexMetricaCounterId` | integer or null | Metrica counter for the Yandex bundle. A positive integer. `null` clears it |
| `jestAutoLoginReminders` | boolean | Whether the Jest bundle shows its auto-login reminders. `true` for a new game |

A value of the wrong type is a `400`: `0`, a negative number, a fraction, or a numeric string for the counter, anything but `true` or `false` for the reminders. Revenue share and team ownership are dashboard-only, and the API ignores them.

```bash
curl -X PATCH https://dashboard.yes2games.com/api/v1/games/$GAME_ID \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"category":"Action","tags":["shooter","zombies"]}'
```

`200 OK` returns the updated game, including `yandex_metrica_counter_id` and `jest_auto_login_reminders`.

---

## Rename a build

```
PATCH /api/v1/games/:gameId/builds/:buildId/name
Content-Type: application/json
```

Sets the build's display name, the label the dashboard shows instead of the zip file name.

| Field | Type | Notes |
|---|---|---|
| `name` | string or null | Up to 100 characters, trimmed. Blank or `null` clears the name |

```bash
curl -X PATCH https://dashboard.yes2games.com/api/v1/games/$GAME_ID/builds/$BUILD_ID/name \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Release candidate"}'
```

`200 OK`:

```json
{ "success": true, "data": { "id": "c81e...", "displayName": "Release candidate" } }
```

`displayName` is camelCase here, unlike the rest of this API, because the dashboard's own rename returns the same body. The build list returns the same value as `display_name`.

---

## Read games and builds

All three reads return rows in snake_case. A game that does not exist and a game owned by another team both answer `404 Game not found`, so a key cannot probe for other teams' game ids.

### List games

```
GET /api/v1/games
```

Lists the key team's games, newest first. `data` is an array of game objects. Use it in CI to look up a game id by name.

```bash
curl https://dashboard.yes2games.com/api/v1/games \
  -H "Authorization: Bearer $YES2_API_KEY"
```

### Get a game

```
GET /api/v1/games/:gameId
```

Returns one game object:

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | |
| `description` | string or null | |
| `team_id` | string | |
| `engine` | string or null | |
| `category` | string or null | |
| `tags` | string[] | |
| `orientation` | string | |
| `yandex_metrica_counter_id` | integer or null | Metrica counter used by the Yandex bundle |
| `jest_auto_login_reminders` | boolean | Whether the Jest bundle shows its auto-login reminders |
| `qa_passed_platforms` | string[] | Platforms the game passed QA for |
| `qa_passed_at` | timestamp or null | |
| `has_icon` | boolean | An icon is uploaded |
| `has_banner` | boolean | A banner is uploaded |
| `build_count` | integer | |
| `created_at`, `updated_at` | timestamp | |

### List builds

```
GET /api/v1/games/:gameId/builds
```

Lists the game's builds, newest first, each with its bundles:

```json
{
  "success": true,
  "data": [
    {
      "id": "c81e...",
      "version": "3.0.9",
      "display_name": "Release candidate",
      "original_filename": "Age of Zombies v3.0.9.zip",
      "original_size_bytes": 48211934,
      "status": "uploaded",
      "notes": "Fixed the wave 10 boss softlock",
      "created_at": "2026-08-24T09:14:02.887Z",
      "bundles": [
        { "platform": "debug", "status": "ready", "size_bytes": 48302211, "created_at": "2026-08-24T09:15:40.112Z" }
      ]
    }
  ]
}
```

`version` is `null` for a build uploaded through the dashboard by hand. `display_name` is `null` until the build is [renamed](#rename-a-build). `bundles` is `[]` until a bundle is built, and holds one entry per bundled target.

### Get a build

```
GET /api/v1/games/:gameId/builds/:buildId
```

Returns one build: the same fields as an entry of the list, plus four camelCase fields that describe what the dashboard made of it.

| Field | Type | Notes |
|---|---|---|
| `engine` | string or null | The engine detected in the zip, for example `unity`, `defold` or `vanilla` |
| `uploadWarnings` | string[] | Advisory findings from the upload analysis, for example root-absolute asset paths. The build is stored either way. `[]` when there are none |
| `bundleErrors` | object[] | One `{ "platform", "error" }` per bundle whose build failed. `[]` when none did |
| `inspectorUrl` | string | The build's QA Inspector page in the dashboard. Open it in a browser while logged in |

```bash
curl https://dashboard.yes2games.com/api/v1/games/$GAME_ID/builds/$BUILD_ID \
  -H "Authorization: Bearer $YES2_API_KEY"
```

```json
{
  "success": true,
  "data": {
    "id": "c81e...",
    "version": "3.0.9",
    "display_name": null,
    "original_filename": "Age of Zombies v3.0.9.zip",
    "original_size_bytes": 48211934,
    "status": "uploaded",
    "notes": "Fixed the wave 10 boss softlock",
    "created_at": "2026-08-24T09:14:02.887Z",
    "bundles": [
      { "platform": "debug", "status": "ready", "size_bytes": 48302211, "created_at": "2026-08-24T09:15:40.112Z" }
    ],
    "engine": "unity",
    "uploadWarnings": [],
    "bundleErrors": [],
    "inspectorUrl": "https://dashboard.yes2games.com/games/3f6c1b8e-.../builds/c81e.../inspect"
  }
}
```

A build that is not in the game answers `404` with `BUILD_NOT_FOUND`.

---

## Upload an icon or banner

```
POST /api/v1/games/:gameId/icon
POST /api/v1/games/:gameId/banner
Content-Type: application/json
```

The body is JSON, not multipart: one `dataUrl` field holding a base64 data URL of type `image/png`, `image/jpeg`, or `image/webp`. The decoded bytes must really be that type (its file signature is checked). The whole request body is capped at 20 MB. An upload replaces the image that is already there.

```bash
curl -X POST https://dashboard.yes2games.com/api/v1/games/$GAME_ID/icon \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"dataUrl\": \"data:image/png;base64,$(base64 -w0 icon.png)\"}"
```

`200 OK` for an icon:

```json
{ "success": true, "data": { "id": "3f6c1b8e-...", "has_icon": true, "onboarding_stage": "qa" } }
```

An icon can complete the game profile, so the icon response carries the game's recomputed onboarding stage. `onboarding_stage` is `null` when the recompute failed. The icon is still stored in that case.

`200 OK` for a banner:

```json
{ "success": true, "data": { "id": "3f6c1b8e-...", "has_banner": true } }
```

### Upload an icon or banner (presigned)

For a client that cannot put the image into a JSON body, such as an AI assistant whose tools run away from your files. The image goes straight to storage, the same way as a [presigned build](#upload-a-large-build-presigned), and the dashboard checks it before storing it. The `dataUrl` route above is unchanged.

**1. Create the upload.**

```
POST /api/v1/games/:gameId/image-uploads
Content-Type: application/json
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | string | yes | `icon` or `banner` |
| `contentType` | string | yes | `image/png`, `image/jpeg` or `image/webp` |
| `size` | integer | yes | The file's exact size in bytes. At most 15728640 (15 MB) |

`201 Created`:

```json
{
  "success": true,
  "data": {
    "uploadId": "0b9a7c1e-...",
    "kind": "icon",
    "uploadUrl": "https://...r2.cloudflarestorage.com/...",
    "method": "PUT",
    "headers": { "Content-Type": "image/png", "Content-Length": "48213" },
    "expiresAt": "2026-10-24T09:29:02.887Z"
  }
}
```

**2. PUT the image** to `uploadUrl` with exactly the returned `headers` and no `Authorization` header, before `expiresAt` (10 minutes). The URL only accepts that type and that many bytes. Do not log it.

```bash
curl --fail-with-body -s -X PUT "$URL" -H 'Content-Type: image/png' --upload-file icon.png
```

**3. Finalize.**

```
POST /api/v1/games/:gameId/image-uploads/:uploadId/finalize
```

The dashboard reads the image back, checks that its size is the declared `size` and that its bytes really are the declared type, stores it as the icon or banner (replacing the current one), and deletes the staged copy. The answer is the same as the `dataUrl` route's, plus the upload's id and status:

```json
{ "success": true, "data": { "uploadId": "0b9a7c1e-...", "status": "ready", "kind": "icon", "id": "3f6c1b8e-...", "has_icon": true, "onboarding_stage": "qa" } }
```

Finalizing again after success answers the same `200`. Finalizing before the PUT has finished is a `409 UPLOAD_NOT_RECEIVED`, and the upload stays usable. An upload that fails a check answers `422`, stores nothing and cannot be reused: create a new one.

| Status | `code` | Meaning |
|---|---|---|
| `400` | `INVALID_KIND` | `kind` is not `icon` or `banner` |
| `400` | `UNSUPPORTED_IMAGE_TYPE` | `contentType` is not PNG, JPEG or WebP |
| `400` | `INVALID_SIZE` | `size` is missing or not a positive whole number |
| `413` | `IMAGE_TOO_LARGE` | `size` is over 15 MB |
| `409` | `TOO_MANY_OPEN_UPLOADS` | This game already has 2 image uploads waiting to be finalized. Finalize them, or wait for them to expire |
| `409` | `UPLOAD_NOT_RECEIVED` | Finalize was called before the image was PUT |
| `409` | `UPLOAD_IN_PROGRESS` | Another finalize call is storing it. Call again shortly |
| `422` | `SIZE_MISMATCH` | The stored image is not the declared size |
| `422` | `INVALID_IMAGE` | The bytes are not a valid image of the declared type |
| `410` | `UPLOAD_EXPIRED` | Not finalized within an hour of being created |
| `404` | `UPLOAD_NOT_FOUND` | No upload with that id belongs to the game and this credential's studio or account |
| `409` | `R2_NOT_ENABLED` | Presigned uploads are not available on this server. Use the `dataUrl` route |

### Remove an icon or banner

```
DELETE /api/v1/games/:gameId/icon
DELETE /api/v1/games/:gameId/banner
```

Removes the image. Removing an image that is not there still answers `200`. The body matches the upload response with `has_icon` or `has_banner` set to `false`. Removing the icon also recomputes `onboarding_stage`.

---

## Upload a build

There are two ways to upload a build. Both produce exactly the same build.

- **Multipart**, one request carrying the zip. The simplest, but the request passes through the dashboard's Cloudflare proxy, which refuses a request body over about **100 MB**. In practice this route is for zips under 100 MB, even though the build cap is 500 MB.
- **Presigned**, three short requests and one direct upload to storage. Works for any zip up to the 500 MB cap and is the way to upload anything larger than 100 MB. See [Upload a large build](#upload-a-large-build-presigned).

```
POST /api/v1/games/:gameId/builds
Content-Type: multipart/form-data
```

| Part | Type | Required | Notes |
|---|---|---|---|
| `build` | file | yes | The WebGL build zip, `index.html` at the zip root or one level down. About 100 MB in practice on this route (see above); use the presigned flow for anything larger |
| `version` | text | yes | Your version string, up to 100 characters. Must be unique within the game |
| `notes` | text | no | Release notes for this build, shown on the build in the dashboard and in the team's new-build notification. Up to 500 characters, trimmed. Blank is the same as absent |

```bash
curl -X POST https://dashboard.yes2games.com/api/v1/games/$GAME_ID/builds \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -F "version=3.0.9" \
  -F "notes=Fixed the wave 10 boss softlock" \
  -F "build=@Age of Zombies v3.0.9.zip"
```

`201 Created`:

```json
{
  "success": true,
  "data": {
    "id": "c81e...",
    "original_filename": "Age of Zombies v3.0.9.zip",
    "original_size_bytes": 48211934,
    "status": "uploaded",
    "notes": "Fixed the wave 10 boss softlock",
    "created_at": "2026-08-24T09:14:02.887Z",
    "version": "3.0.9",
    "engine": "unity",
    "uploadWarnings": [],
    "inspectorUrl": "https://dashboard.yes2games.com/games/3f6c1b8e-.../builds/c81e.../inspect"
  }
}
```

`engine`, `uploadWarnings` and `inspectorUrl` mean the same as on [Get a build](#get-a-build). The response may also carry informational analysis fields such as `compression`, `largest_file_bytes`, and `largest_file_name`. Do not depend on them being present.

### What happens after a successful upload

The build lands in exactly the state an interactive upload produces. It is analyzed, the Yes2SDK integration is verified, a debug bundle is queued so the build opens in the QA Inspector, the game's onboarding stage is recomputed, any earlier QA pass is invalidated, and the team is notified. Nothing extra is required from the pipeline.

The upload is not a publish. Requesting publish for a platform stays a dashboard action, because it needs a saved Inspector session and a human description of the game.

### About `version`

The version is a free-form string, so `1.4.2`, `2026.08.24-nightly`, and `1.2.3-rc4+build567` are all fine. Feed it whatever your engine or CI already produces.

It is unique **per game**. Re-posting a version that a game already has returns `409` and changes nothing, which is what makes a retried or re-run pipeline job safe: the second attempt cannot create a duplicate build. When you genuinely mean to replace a build, upload a new version. The one exception is a [personal game](#personal-games-preview-accounts), where an upload replaces the game's only build: it may reuse that build's version, because the old build is gone once the new one lands.

Builds uploaded through the dashboard by hand carry no version, and they never collide with a versioned one.

---

## Upload a large build (presigned)

For a zip over about 100 MB, or whenever the upload should not depend on one long request. The zip goes straight to storage, and the dashboard analyses it in the background, so neither the size nor a slow analysis can time the request out.

1. **Create the upload.** Say how big the zip is; you get back a URL to PUT it to.
2. **PUT the zip** to that URL, with exactly the headers you were given.
3. **Finalize.** The dashboard answers `202` at once and processes the zip in the background.
4. **Poll the status** until it is `ready` (you get the build) or `failed` (you get the reason).

### 1. Create the upload

```
POST /api/v1/games/:gameId/build-uploads
Content-Type: application/json
Idempotency-Key: <optional, up to 128 characters>
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `version` | string | yes | Same rules as the multipart `version`. Checked now, so a version the game already has is refused before you upload anything |
| `size` | integer | yes | The zip's exact size in bytes. At most 524288000 (500 MB). The upload URL only accepts a body of exactly this size |
| `notes` | string or null | no | Same rules as the multipart `notes` |
| `name` | string or null | no | The build's display name, as set by [Rename a build](#rename-a-build). Up to 100 characters |

`201 Created`:

```json
{
  "success": true,
  "data": {
    "uploadId": "7d1e0c2a-...",
    "uploadUrl": "https://...r2.cloudflarestorage.com/...",
    "method": "PUT",
    "headers": { "Content-Type": "application/zip", "Content-Length": "314572800" },
    "expiresAt": "2026-08-24T09:29:02.887Z"
  }
}
```

The upload must start before `expiresAt` (15 minutes). The URL is a credential for this one upload: do not log it.

Send an `Idempotency-Key` to make a retried request safe. Repeating the request with the same key and the same body returns the same `uploadId` with a fresh URL, instead of a second upload. The same key with a different body is a `409 IDEMPOTENCY_CONFLICT`, and repeating it after the upload was finalized is a `409 UPLOAD_NOT_PENDING` that carries the `uploadId`, so you can read its status.

### 2. PUT the zip

PUT the file to `uploadUrl` with the returned `headers`, and nothing else. No `Authorization` header: the URL carries its own signature.

### 3. Finalize

```
POST /api/v1/games/:gameId/build-uploads/:uploadId/finalize
```

`202 Accepted`:

```json
{ "success": true, "data": { "uploadId": "7d1e0c2a-...", "status": "processing" } }
```

Finalizing is safe to repeat. A second call does not process the zip twice; it answers `202` with the upload's current status. Finalizing before the PUT has finished is a `409 UPLOAD_NOT_RECEIVED`, and the upload stays usable: finish the PUT and finalize again. An upload must be finalized within an hour of being created.

### 4. Poll the status

```
GET /api/v1/games/:gameId/build-uploads/:uploadId
```

```json
{
  "success": true,
  "data": {
    "uploadId": "7d1e0c2a-...",
    "status": "ready",
    "buildId": "c81e...",
    "build": { "id": "c81e...", "version": "3.0.9", "engine": "unity", "uploadWarnings": [], "bundleErrors": [], "inspectorUrl": "https://dashboard.yes2games.com/games/.../builds/c81e.../inspect" }
  }
}
```

| `status` | Meaning |
|---|---|
| `pending` | Created, waiting for the PUT and the finalize call |
| `processing` | Finalized; the zip is being analysed. Poll again in a few seconds |
| `ready` | The build exists. `buildId` and `build` (the [Get a build](#get-a-build) shape) are set |
| `failed` | Nothing was stored. `error` is `{ "code", "message" }`. Fix the cause and create a new upload |

`error.code` is one of the multipart route's codes (`SDK_NOT_INTEGRATED`, `INDEX_HTML_MISSING`, `UPLOAD_ANALYSIS_FAILED`, `VERSION_EXISTS`, `FILE_TOO_LARGE`, `build_protected`, `build_limit_reached`) or one of these: `SIZE_MISMATCH` (the stored object is not the declared size), `UPLOAD_EXPIRED` (not finalized in time, or nothing was uploaded), `PROCESSING_INTERRUPTED` (the server restarted mid-processing) or `PROCESSING_FAILED` (an unexpected server error). The last two are safe to retry with a new upload.

A status is kept for a day after the upload finishes.

### Example: curl

```bash
ZIP=build/WebGL.zip
SIZE=$(wc -c < "$ZIP" | tr -d ' ')
API=https://dashboard.yes2games.com/api/v1/games/$GAME_ID

upload=$(curl --fail-with-body -s -X POST "$API/build-uploads" \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" \
  -d "{\"version\":\"$VERSION\",\"size\":$SIZE}")
UPLOAD_ID=$(echo "$upload" | jq -r .data.uploadId)
URL=$(echo "$upload" | jq -r .data.uploadUrl)

curl --fail-with-body -s -X PUT "$URL" \
  -H 'Content-Type: application/zip' \
  --upload-file "$ZIP"

curl --fail-with-body -s -X POST "$API/build-uploads/$UPLOAD_ID/finalize" \
  -H "Authorization: Bearer $YES2_API_KEY"

while :; do
  status=$(curl --fail-with-body -s "$API/build-uploads/$UPLOAD_ID" \
    -H "Authorization: Bearer $YES2_API_KEY")
  case "$(echo "$status" | jq -r .data.status)" in
    ready)  echo "$status" | jq .data.build; break ;;
    failed) echo "$status" | jq .data.error; exit 1 ;;
    *)      sleep 5 ;;
  esac
done
```

`--upload-file` sends the `Content-Length` curl measures from the file, which matches `size` as long as the zip did not change in between.

---

## Rate limits and client tags

Write requests (every `POST`, `PATCH` and `DELETE` on this page) are limited per key, or per OAuth connection, to 60 a minute. OAuth connections also share a limit of 120 a minute per user, however many apps are connected. Past the limit the answer is `429` with `RATE_LIMITED` and a `Retry-After` header in seconds. Reads, including status polling, are not counted.

An integration can name itself with an `X-Yes2-Client` header, for example `X-Yes2-Client: mcp`: lowercase letters, digits and `-`, up to 32 characters. The dashboard records it on the build's upload activity. Anything else is ignored.

---

## Errors

Every failure answers with `{"success": false, "error": "..."}`, plus a `code` where the table lists one. Branch on `code`, not on the message text.

| Status | `code` | Meaning |
|---|---|---|
| `401` | `INVALID_API_KEY` | Missing, malformed, revoked, or unknown key or OAuth token. Also a personal key or OAuth token whose user lost upload rights, was banned, or (for a personal-games token) joined a studio |
| `403` | `INSUFFICIENT_SCOPE` | The credential lacks the scope this endpoint needs. `scope` names it. See [Scopes](#scopes) |
| `403` | | The credential's studio (or, for a personal-games credential, its user) does not own this game. Returned by the endpoints that change a game |
| `409` | `game_limit_reached` | A preview account is at an admin-set game limit (there is none by default). `limit` carries it. See [Personal games](#personal-games-preview-accounts) |
| `409` | `build_protected` | A preview account's upload would replace a build that is in review or live |
| `409` | `build_limit_reached` | A preview account has an admin-set build limit of 0. `limit` carries it |
| `409` | `UPLOAD_ALREADY_OPEN` | A preview account already has an open presigned upload for this game. Finalize it, or wait for it to expire |
| `404` | | `Game not found` from a read endpoint. See [Read games and builds](#read-games-and-builds) |
| `400` | | `dataUrl` is missing, is not a PNG, JPEG, or WebP base64 data URL, or its bytes are not the declared type |
| `400` | `INVALID_NAME` | A build `name` is neither a string nor `null` |
| `400` | `NAME_TOO_LONG` | A build `name` is over 100 characters after trimming |
| `404` | `BUILD_NOT_FOUND` | No build with that id belongs to the game |
| `400` | `MISSING_VERSION` | No `version`, blank, or over 100 characters |
| `400` | `BUILD_NOTES_TOO_LONG` | `notes` is over 500 characters after trimming |
| `400` | `MISSING_BUILD` | No `build` file part |
| `400` | `UPLOAD_ANALYSIS_FAILED` | The zip could not be read. `details` carries the reason |
| `409` | `VERSION_EXISTS` | This game already has a build at that version |
| `422` | `SDK_NOT_INTEGRATED` | Yes2SDK was not detected in the build |
| `413` | | The zip is over the 500 MB cap, or a JSON body is over 20 MB |
| `413` | `FILE_TOO_LARGE` | A presigned upload declared a `size` over 500 MB |
| `400` | `INVALID_SIZE` | A presigned upload's `size` is missing or not a positive whole number |
| `400` | `INVALID_IDEMPOTENCY_KEY` | `Idempotency-Key` is empty, over 128 characters, or not visible ASCII |
| `409` | `IDEMPOTENCY_CONFLICT` | The `Idempotency-Key` was already used for a different upload |
| `409` | `UPLOAD_NOT_PENDING` | The `Idempotency-Key` belongs to an upload that was already finalized. The body carries its `uploadId` and `status` |
| `409` | `UPLOAD_NOT_RECEIVED` | Finalize was called before the zip was PUT. The upload stays usable |
| `409` | `R2_NOT_ENABLED` | Presigned uploads are not available on this server. Use the multipart route |
| `404` | `UPLOAD_NOT_FOUND` | No upload with that id belongs to the game |
| `429` | `RATE_LIMITED` | Too many writes for this key or OAuth connection. Wait `Retry-After` seconds |
| `400` | | A field failed validation. The message names the field |
| `500` | | Server error. Safe to retry |

`SDK_NOT_INTEGRATED` is the one worth handling explicitly: it means the build itself is wrong, not the request, so retrying it will fail identically. See the engine guides ([Unity](/docs/unity), [Defold](/docs/defold), [JavaScript / TypeScript](/docs/javascript-vite-build#what-the-dashboard-does-with-the-upload)) for what the check looks for.

---

## Example: GitHub Actions

```yaml
- name: Upload build to Yes2Games
  env:
    YES2_API_KEY: ${{ secrets.YES2_API_KEY }}
    GAME_ID: 3f6c1b8e-0000-0000-0000-000000000000
  run: |
    curl --fail-with-body -X POST \
      "https://dashboard.yes2games.com/api/v1/games/$GAME_ID/builds" \
      -H "Authorization: Bearer $YES2_API_KEY" \
      -F "version=${GITHUB_REF_NAME}" \
      --form-string "notes=$(git log -1 --format=%s | cut -c1-500)" \
      -F "build=@build/WebGL.zip"
```

`--fail-with-body` makes curl exit non-zero on a 4xx or 5xx while still printing the JSON, so a failed upload fails the job and says why. Without it curl exits `0` and the pipeline goes green on a rejected build.

The `notes` line attaches the commit subject as release notes. It uses `--form-string` because `-F` would read a subject starting with `@` or `<` as a file path. Keep the `cut -c1-500`: notes over 500 characters fail the whole upload with `BUILD_NOTES_TOO_LONG`.

To make a re-run of the same tag a no-op instead of a failure, treat `409` as success:

```bash
code=$(curl -s -o /tmp/out.json -w '%{http_code}' -X POST \
  "https://dashboard.yes2games.com/api/v1/games/$GAME_ID/builds" \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -F "version=${GITHUB_REF_NAME}" \
  -F "build=@build/WebGL.zip")

case "$code" in
  201) echo "uploaded" ;;
  409) echo "version already uploaded, nothing to do" ;;
  *)   cat /tmp/out.json; exit 1 ;;
esac
```
