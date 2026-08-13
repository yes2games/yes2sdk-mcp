import { readFileSync } from "node:fs";

/**
 * The server's version, read from package.json at startup.
 *
 * Clients report whatever `new McpServer()` is handed, so a literal here would
 * be a second declaration of the same fact, kept in step by hand. It was, until
 * someone forgot: the failure is silent, and it surfaces as a client reporting a
 * version that was never published.
 *
 * `rootDir` is `src`, so this file compiles to `dist/lib/version.js` and the
 * relative hop is one level deeper than it is from source. Both are resolved
 * from `import.meta.url` rather than `process.cwd()`, which is the caller's
 * directory and has nothing to do with where the package lives. The first
 * candidate that parses wins, so the same code serves `tsx src/` and `node
 * dist/`.
 */
const CANDIDATES = ["../../package.json", "../../../package.json"];

function readVersion(): string {
  for (const relative of CANDIDATES) {
    try {
      const raw = readFileSync(new URL(relative, import.meta.url), "utf8");
      const parsed = JSON.parse(raw) as { name?: string; version?: string };
      // Name-check so a stray package.json further up a consumer's tree (an npm
      // workspace root, a monorepo) cannot silently supply someone else's
      // version.
      if (parsed.name === "@yes2games/yes2sdk-mcp" && typeof parsed.version === "string") {
        return parsed.version;
      }
    } catch {
      // Try the next candidate. A miss here is a layout question, not an error.
    }
  }
  throw new Error(
    "Could not read the server version: no @yes2games/yes2sdk-mcp package.json found next to the compiled output."
  );
}

export const VERSION = readVersion();
