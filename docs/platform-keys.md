# Platform Keys & Submission

> Which portal credentials to gather before submitting, and how the Dashboard onboarding flow takes you from build zip to live game.

## Per-portal keys and configuration

The Dashboard's build pipeline injects the SDK and any required platform configuration automatically. Most portals need no credential from you — the Yes2Games team handles registration and injection after you request publish. The table below shows what the codebase actually requires per portal.

| Portal | Integrator-supplied key / config | Who handles it | Source |
|---|---|---|---|
| **Poki** | None — no per-game credential required | Dashboard + Yes2Games team | No `platformGameId` set; platform enablement only (`team_platform_permissions`) |
| **CrazyGames** | None — no per-game credential required | Dashboard + Yes2Games team | No `platformGameId` set; platform enablement only |
| **Yandex** | None — no per-game credential required | Yes2Games team registers game in Yandex Games Console on your behalf | No `platformGameId` set; build uses LZMA-rezip (`useLzma`) |
| **GameDistribution** | `gameId` — your GD game UUID from the [GameDistribution Developer Portal](https://developer.gamedistribution.com) | You register the game; Yes2Games injects the ID at bundle time via `platformGameId` in `sdk-injector.ts` | `api/src/utils/sdk-injector.ts` line 10, `docs/quickstart-gamedistribution.md` |
| **YouTube Playables** | None — no integrator-supplied credential | Dashboard injects the CDN script `https://www.youtube.com/game_api/v1` at the top of `<head>` automatically | `api/src/utils/sdk-injector.ts` `PLATFORM_CDN_SCRIPTS` (line 204–206) |

### GameDistribution `gameId` in detail

When the Yes2Games team bundles your build for GameDistribution, the pipeline sets `window.GD_OPTIONS.gameId` to your GD game UUID before the GD SDK script loads — this is a hard GD requirement. If you have already registered your game on the GD Developer Portal and have an existing listing, provide the UUID to the Yes2Games team in your publish request notes so they can reuse it. If you have not registered yet, the Yes2Games team can register a new listing on your behalf.

Missing or wrong `gameId` is the most common GD rejection reason. See `docs/quickstart-gamedistribution.md` for the full rejection checklist.

---

## Dashboard submission flow

Every game moves through four onboarding stages in the Dashboard. You advance through them in order; the **Onboarding** tab on your game page shows current stage and unlocks the next when requirements are met.

### Stage 1 — Upload build

Upload a validated build zip (`index.html` at the zip root, max 500 MB). The Dashboard checks that the Yes2SDK is integrated and detects your engine automatically. A build that fails the SDK check is rejected immediately.

### Stage 2 — Game profile

Fill in the public details: icon (512×512 PNG recommended), description, category, and up to 20 tags (each up to 50 characters). These appear in store listings and are checked by reviewers.

### Stage 3 — QA Inspector

Open the **Inspector** and run a live test. The Inspector intercepts every SDK call, runs integration checks, and saves the results. The Onboarding tab shows passes, warnings, and failures. Stage 4 is locked until Stage 3 is green.

See the [Dashboard Guide](/docs/dashboard-guide) for the full Inspector walkthrough, including Mock Controls and Scaling Tests.

### Stage 4 — Request publish

When Stage 3 is green:

1. Pick the build to submit (it must have a saved Inspector session)
2. Select the target platform(s)
3. Describe your game — gameplay, target audience, what makes it unique
4. Submit the request

The Yes2Games team reviews the submission, runs platform-specific checks, bundles the build for the target portal (injecting any required keys), and submits to the platform on your behalf. You receive status updates (`pending_review` → `reviewing` → `approved` / `needs_changes` / `rejected`) and can exchange feedback messages on the game page.

If reviewers request changes, upload a new build and submit that build for review.

---

## When do you need keys and a Dashboard account?

You do **not** need portal keys or a Dashboard account while writing and testing integration code. The SDK runs in the Unity Editor or Defold preview without any platform credential.

| What you're doing | What you need |
|---|---|
| Writing integration code | Nothing — SDK stubs work locally |
| Testing in Unity Editor / Defold preview | Nothing |
| Running the QA Inspector | Dashboard account (any role) |
| Requesting publish to GameDistribution | GD game UUID (if you have an existing listing; otherwise Yes2Games can register one) |
| Requesting publish to Poki / CrazyGames / Yandex / YouTube | Dashboard account only — no portal credential required from you |

Gather any required portal credentials before your first publish request, not before you start coding.
