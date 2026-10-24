/**
 * Lazy OAuth sign-in for the dashboard tools (phase 2, yes2sdk-mcp#108,
 * design in yes2dashboard#881 §7).
 *
 * Only the eight dashboard tools ever need a sign-in. `initialize`,
 * `tools/list` and every other `tools/call` stay anonymous: the gate never
 * answers them with 401 or 403, and ignores any token they carry. A protected
 * call without a usable credential is refused at the HTTP layer with a 401 and
 * a `WWW-Authenticate` challenge, which is the only signal Claude, Claude Code
 * and Codex treat as "start sign-in" (a 200 tool error is just text).
 *
 * Everything here is behind MCP_OAUTH_ENABLED (default off). Off, the server is
 * phase 1 byte for byte: no gate, no metadata routes.
 *
 * The MCP does no crypto. A `y2a_` token is checked by self-introspection: it
 * is presented to the dashboard's `GET /api/v1/whoami`, the same issuer that
 * minted it for this resource and that serves the API the tools call.
 */
import type { ApiKeyAuth } from "./auth.js";
import type { FetchLike } from "./dashboard.js";

export const RESOURCE = "https://mcp.yes2games.com/mcp";
export const AUTHORIZATION_SERVER = "https://dashboard.yes2games.com";
export const PRM_PATH = "/.well-known/oauth-protected-resource/mcp";
export const PRM_ROOT_PATH = "/.well-known/oauth-protected-resource";
export const RESOURCE_METADATA_URL = `https://mcp.yes2games.com${PRM_PATH}`;

export const SCOPES = ["games:read", "games:write", "builds:write"] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * Every challenge asks for all three scopes: one consent covers the whole
 * "upload builds, edit games" story and avoids step-up loops.
 */
export const CHALLENGE_SCOPE = SCOPES.join(" ");

/** RFC 9728 protected resource metadata. */
export const PRM = {
  resource: RESOURCE,
  authorization_servers: [AUTHORIZATION_SERVER],
  scopes_supported: [...SCOPES],
  bearer_methods_supported: ["header"],
  resource_name: "Yes2 dashboard",
} as const;

/** The dashboard tools, each with the scope its v1 routes require. */
export const TOOL_SCOPES: Readonly<Record<string, Scope>> = {
  list_games: "games:read",
  get_build_status: "games:read",
  create_game: "games:write",
  update_game: "games:write",
  set_game_image: "games:write",
  rename_build: "games:write",
  prepare_upload: "builds:write",
  finalize_upload: "builds:write",
};

export const WHOAMI_TIMEOUT_MS = 5_000;

/** MCP_OAUTH_ENABLED: on for "1" or "true", off for anything else or unset. */
export function oauthEnabled(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "1" || v === "true";
}

/**
 * The scopes a JSON-RPC body needs: one per dashboard `tools/call` in it (the
 * body may be a single message or a batch). Empty means the body is not gated.
 */
export function requiredScopes(body: unknown): Scope[] {
  const messages = Array.isArray(body) ? body : [body];
  const needed = new Set<Scope>();
  for (const msg of messages) {
    if (msg === null || typeof msg !== "object") continue;
    const { method, params } = msg as { method?: unknown; params?: unknown };
    if (method !== "tools/call" || params === null || typeof params !== "object") continue;
    const name = (params as { name?: unknown }).name;
    if (typeof name === "string" && Object.prototype.hasOwnProperty.call(TOOL_SCOPES, name)) {
      needed.add(TOOL_SCOPES[name]);
    }
  }
  return [...needed];
}

export const SIGN_IN_HOWTO =
  "Sign in to Yes2: Claude Code, run /mcp and choose Authenticate; Codex, run `codex mcp login yes2sdk`; claude.ai, use the Connect card; " +
  "or set YES2_API_KEY to a personal dashboard API key (y2g_…, from Dashboard → Settings → Personal API keys) and send it as X-Yes2-Api-Key.";

export interface Challenge {
  status: 401 | 403;
  headers: Record<string, string>;
  body: string;
}

function challenge(status: 401 | 403, error: string, headerDescription: string, bodyDescription: string): Challenge {
  return {
    status,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate":
        `Bearer error="${error}", error_description="${headerDescription}", ` +
        `resource_metadata="${RESOURCE_METADATA_URL}", scope="${CHALLENGE_SCOPE}"`,
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ error, error_description: bodyDescription }),
  };
}

/** No credential, a foreign bearer, or a `y2a_` token the dashboard rejected. */
export function challenge401(): Challenge {
  const short = "Sign in to Yes2 to use dashboard tools";
  return challenge(401, "invalid_token", short, `${short}. ${SIGN_IN_HOWTO}`);
}

/** A live `y2a_` token that lacks a scope the call needs. */
export function challenge403(): Challenge {
  const short = "Sign in again and allow every requested Yes2 permission";
  return challenge(
    403,
    "insufficient_scope",
    short,
    `${short} (${CHALLENGE_SCOPE}). Claude Code: /mcp → Authenticate; Codex: \`codex mcp login yes2sdk\`; claude.ai reconnects from the Connect card.`,
  );
}

export type WhoamiResult =
  | { kind: "ok"; scopes: string[] | undefined }
  | { kind: "unauthorized" }
  /** 5xx, timeout, unreachable or anything unexpected: the call falls through. */
  | { kind: "unavailable" };

/**
 * Ask the dashboard who a `y2a_` token belongs to. Only the status and the
 * scope list are read; the token is never logged and no error text is kept.
 */
export async function whoami(
  baseUrl: string,
  token: string,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  timeoutMs = WHOAMI_TIMEOUT_MS,
): Promise<WhoamiResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/whoami`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "X-Yes2-Client": "mcp" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { kind: "unavailable" };
  }
  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) return { kind: "unavailable" };
  let envelope: unknown;
  try {
    envelope = await res.json();
  } catch {
    return { kind: "unavailable" };
  }
  return { kind: "ok", scopes: scopesOf(envelope) };
}

/** `{ success, data: { scopes } }` (the v1 envelope), or a bare `{ scopes }`. */
function scopesOf(envelope: unknown): string[] | undefined {
  if (envelope === null || typeof envelope !== "object") return undefined;
  const e = envelope as { data?: unknown; scopes?: unknown };
  const holder = e.data !== null && typeof e.data === "object" ? (e.data as { scopes?: unknown }) : e;
  const scopes = holder.scopes;
  if (!Array.isArray(scopes) || !scopes.every((s) => typeof s === "string")) return undefined;
  return scopes;
}

export type GateDecision = { kind: "pass" } | { kind: "refuse"; challenge: Challenge };

/**
 * The gate for one POST /mcp body. Pass means: hand the request to the MCP SDK
 * unchanged. Only dashboard `tools/call` bodies are ever refused.
 */
export async function gate(
  body: unknown,
  auth: ApiKeyAuth,
  baseUrl: string,
  fetchImpl?: FetchLike,
): Promise<GateDecision> {
  const needed = requiredScopes(body);
  if (needed.length === 0) return { kind: "pass" };

  if (auth.status === "missing" || auth.status === "foreign") return { kind: "refuse", challenge: challenge401() };
  // A malformed X-Yes2-Api-Key is a key user's typo, not a sign-in case: the
  // tool answers with the setup steps, as in phase 1.
  if (auth.status === "malformed") return { kind: "pass" };
  // y2g_ keys: no pre-check, the dashboard answers as it always did.
  if (auth.kind === "key") return { kind: "pass" };

  const who = await whoami(baseUrl, auth.credential, fetchImpl);
  if (who.kind === "unauthorized") return { kind: "refuse", challenge: challenge401() };
  if (who.kind === "unavailable") return { kind: "pass" };
  // A whoami without a scope list cannot prove a scope is missing; the
  // dashboard still enforces scopes per route.
  if (who.scopes !== undefined && needed.some((scope) => !who.scopes?.includes(scope))) {
    return { kind: "refuse", challenge: challenge403() };
  }
  return { kind: "pass" };
}
