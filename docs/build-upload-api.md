# Build Upload API

> Create a game and upload versioned builds from CI with a team API key, instead of clicking through the dashboard.

Every action here has an equivalent in the dashboard UI. Use this API when a build should be uploaded by a pipeline: a tagged release, a nightly job, an engine build step. Interactive uploads keep working exactly as before and are unaffected by anything on this page.

Base URL:

```
https://dashboard.yes2games.com/api/v1
```

## Authentication

Every request carries a team API key as a bearer token:

```
Authorization: Bearer y2g_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

A key belongs to a **team**, not to a person. It can only reach games owned by that team, and it grants nothing outside the three endpoints below. A dashboard login token is not accepted here, and a key is not accepted on the dashboard's own routes.

### Creating a key

1. Open the **Team** page in the dashboard.
2. In **API Keys**, click **Create key** and give it a name that says where it will run, for example `github-actions`.
3. Copy the key immediately. It is shown **once** and never again. Afterwards only its prefix is visible, so you can tell keys apart without being able to read them.

Only a team **owner** or **manager** can create, list, or revoke keys.

Store the key as a secret in your CI provider. It is a credential: treat it like a deploy token, never commit it, never print it in build logs.

### Revoking a key

Click **Revoke** next to the key on the Team page. Revocation takes effect immediately and cannot be undone. A revoked key answers `401` on its next request. Revoke and create a fresh key whenever one may have been exposed.

---

## Create a game

```
POST /api/v1/games
Content-Type: application/json
```

The new game is owned by the key's team.

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Cannot be blank |
| `description` | string or null | no | |
| `engine` | string or null | no | One of `unity`, `defold`, `playcanvas`, `cocos`, `vanilla`, `other`. A rejected value returns the accepted list in the error |
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

Same fields as create, all optional, and only the ones you send are touched. Sending no updatable field at all is a `400`, so an empty body cannot silently do nothing.

```bash
curl -X PATCH https://dashboard.yes2games.com/api/v1/games/$GAME_ID \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"category":"Action","tags":["shooter","zombies"]}'
```

`200 OK` returns the updated game.

---

## Upload a build

```
POST /api/v1/games/:gameId/builds
Content-Type: multipart/form-data
```

| Part | Type | Required | Notes |
|---|---|---|---|
| `build` | file | yes | The WebGL build zip, `index.html` at the zip root or one level down. Max 500 MB |
| `version` | text | yes | Your version string, up to 100 characters. Must be unique within the game |

```bash
curl -X POST https://dashboard.yes2games.com/api/v1/games/$GAME_ID/builds \
  -H "Authorization: Bearer $YES2_API_KEY" \
  -F "version=3.0.9" \
  -F "build=@Age of Zombies v3.0.9.zip"
```

`201 Created`:

```json
{
  "success": true,
  "data": {
    "id": "c81e...",
    "game_id": "3f6c1b8e-...",
    "engine": "unity",
    "version": "3.0.9",
    "status": "uploaded",
    "created_at": "2026-08-24T09:14:02.887Z"
  }
}
```

### What happens after a successful upload

The build lands in exactly the state an interactive upload produces. It is analyzed, the Yes2SDK integration is verified, a debug bundle is queued so the build opens in the QA Inspector, the game's onboarding stage is recomputed, any earlier QA pass is invalidated, and the team is notified. Nothing extra is required from the pipeline.

The upload is not a publish. Requesting publish for a platform stays a dashboard action, because it needs a saved Inspector session and a human description of the game.

### About `version`

The version is a free-form string, so `1.4.2`, `2026.08.24-nightly`, and `1.2.3-rc4+build567` are all fine. Feed it whatever your engine or CI already produces.

It is unique **per game**. Re-posting a version that a game already has returns `409` and changes nothing, which is what makes a retried or re-run pipeline job safe: the second attempt cannot create a duplicate build. When you genuinely mean to replace a build, upload a new version.

Builds uploaded through the dashboard by hand carry no version, and they never collide with a versioned one.

---

## Errors

Every failure answers with `{"success": false, "error": "...", "code": "..."}`. Branch on `code`, not on the message text.

| Status | `code` | Meaning |
|---|---|---|
| `401` | `INVALID_API_KEY` | Missing, malformed, revoked, or unknown key |
| `403` | | The key's team does not own this game |
| `400` | `MISSING_VERSION` | No `version`, blank, or over 100 characters |
| `400` | `MISSING_BUILD` | No `build` file part |
| `400` | `UPLOAD_ANALYSIS_FAILED` | The zip could not be read. `details` carries the reason |
| `409` | `VERSION_EXISTS` | This game already has a build at that version |
| `422` | `SDK_NOT_INTEGRATED` | Yes2SDK was not detected in the build |
| `413` | | The zip is over the 500 MB cap |
| `400` | | A field failed validation. The message names the field |
| `500` | | Server error. Safe to retry |

`SDK_NOT_INTEGRATED` is the one worth handling explicitly: it means the build itself is wrong, not the request, so retrying it will fail identically. See the engine guides for what the check looks for.

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
      -F "build=@build/WebGL.zip"
```

`--fail-with-body` makes curl exit non-zero on a 4xx or 5xx while still printing the JSON, so a failed upload fails the job and says why. Without it curl exits `0` and the pipeline goes green on a rejected build.

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
