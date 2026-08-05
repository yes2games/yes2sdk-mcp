/**
 * The canonical product sentence. Every surface that describes this product
 * opens with CANONICAL, then appends its own role clause.
 *
 * To change the sentence:
 *   1. Edit this file.
 *   2. Run `npm test` — test/positioning.test.ts names each stale copy.
 *   3. Update the copies it names: package.json `description`, and the
 *      opening paragraph of README.md.
 * src/server.ts imports DESCRIPTION, so it needs no manual update.
 *
 * There is deliberately no bless script — two literal copies do not earn one.
 *
 * Three in-repo consumers are wired to this constant: this module's importer
 * (src/server.ts) plus the two literal copies above. A registry server
 * manifest (smithery.yaml / server.json) is a prospective fourth — no such
 * file exists in this repo today, so nothing checks one.
 *
 * One more shipped surface is deliberately NOT wired here: docs/mcp-server.md
 * opens with its own product sentence and ships in both the npm package
 * (package.json `files`) and the container (Containerfile). It is generated —
 * `npm run sync-docs` overwrites it — so it is owned upstream in
 * yes2sdk-www/content/docs/ and must be changed there, then re-synced.
 *
 * The 160-character ceiling is a search-snippet convention, self-imposed. No
 * consumer enforces a cap. It applies to the rendered string (CANONICAL + a
 * role clause), which is why this repo's composition sits exactly on it.
 */
export const CANONICAL =
  "One integration ships your HTML5 game to Poki, CrazyGames, Yandex, GameDistribution, and YouTube Playables.";

/** This repo's role clause. Leading space is intentional — it joins to CANONICAL. */
export const ROLE = " Docs and compliance checks for AI coding assistants.";

/** What every surface in THIS repo carries verbatim. 160 chars. */
export const DESCRIPTION = CANONICAL + ROLE;
