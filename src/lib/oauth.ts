/**
 * Opt-in OAuth sign-in for the dashboard tools (phase 2, yes2sdk-mcp#108,
 * design in yes2dashboard#881 §7).
 *
 * Not signing in behaves like the original server: every tool answers with a
 * normal result, and a dashboard tool without a credential returns the sign-in
 * steps as text. Sign-in is opt-in through the `sign_in` tool: only `sign_in`
 * without a valid credential gets the HTTP 401 + `WWW-Authenticate` challenge.
 * No client opens a browser on that 401 by itself: claude.ai shows a Connect
 * card; Claude Code marks the server "needs sign-in" and pauses its tools
 * until the user runs /mcp → the server → Authenticate; Codex signs in through
 * `codex mcp login yes2sdk`. A 401 on an ordinary dashboard tool made
 * Claude Code mark the whole connector as needing auth, docs included, so that
 * is reserved for a `y2a_` token the user presented and the dashboard rejected.
 * `initialize`, `tools/list` and the docs tools are never gated.
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

/** The nine dashboard tools, each with the scope its v1 routes require. */
export const TOOL_SCOPES: Readonly<Record<string, Scope>> = {
  list_games: "games:read",
  get_build_status: "games:read",
  create_game: "games:write",
  update_game: "games:write",
  set_game_image: "games:write",
  finalize_image_upload: "games:write",
  rename_build: "games:write",
  prepare_upload: "builds:write",
  finalize_upload: "builds:write",
};

/**
 * The opt-in sign-in tool. It is the only call that answers "not signed in"
 * with an HTTP 401 challenge, which is what makes a client open the browser
 * sign-in. Dashboard tools without a credential get a normal tool result
 * instead, so a client never treats the whole connector as needing auth.
 */
export const SIGN_IN_TOOL = "sign_in";

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
function calledTools(body: unknown): string[] {
  const messages = Array.isArray(body) ? body : [body];
  const names: string[] = [];
  for (const msg of messages) {
    if (msg === null || typeof msg !== "object") continue;
    const { method, params } = msg as { method?: unknown; params?: unknown };
    if (method !== "tools/call" || params === null || typeof params !== "object") continue;
    const name = (params as { name?: unknown }).name;
    if (typeof name === "string") names.push(name);
  }
  return names;
}

export function requiredScopes(body: unknown): Scope[] {
  const needed = new Set<Scope>();
  for (const name of calledTools(body)) {
    if (Object.prototype.hasOwnProperty.call(TOOL_SCOPES, name)) needed.add(TOOL_SCOPES[name]);
  }
  return [...needed];
}

/** Whether the body (or any element of a batch) is a `tools/call` for sign_in. */
export function callsSignIn(body: unknown): boolean {
  return calledTools(body).includes(SIGN_IN_TOOL);
}

/**
 * How each client finishes signing in. Verified live: calling sign_in does not
 * open a browser in any client by itself.
 */
export const SIGN_IN_CLIENT_STEPS =
  "In Claude Code, after sign_in run /mcp, pick the Yes2SDK server and choose Authenticate (the dashboard opens in the browser); " +
  "in claude.ai, a Connect card appears; in Codex, run `codex mcp login yes2sdk`.";

export const SIGN_IN_HOWTO =
  `${SIGN_IN_CLIENT_STEPS} ` +
  "Or set YES2_API_KEY to a personal dashboard API key (y2g_…, from Dashboard → Settings → Personal API keys) and send it as X-Yes2-Api-Key.";

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

/** sign_in with no valid credential, or a `y2a_` token the dashboard rejected. */
export function challenge401(): Challenge {
  const short = "Sign in to Yes2 to use dashboard tools";
  return challenge(401, "invalid_token", short, `${short}. ${SIGN_IN_HOWTO}`);
}

/** Who a credential belongs to, from the dashboard's whoami. Every field is optional: only what was sent. */
export interface WhoamiIdentity {
  principal?: { kind: "team"; teamId?: string; teamName?: string } | { kind: "personal" };
  user?: { id?: string; email?: string; name?: string };
  credentialKind?: "key" | "oauth";
  scopes?: string[];
}

export type WhoamiResult =
  | { kind: "ok"; scopes: string[] | undefined; identity: WhoamiIdentity }
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
  const identity = identityOf(envelope);
  return { kind: "ok", scopes: identity.scopes, identity };
}

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

/**
 * The live dashboard whoami (A1) answers `{ success, data: { principal:
 * {kind:'team',teamId,teamName} | {kind:'personal',…}, user?: {id,email,name},
 * credential: {kind:'key'|'oauth'}, scopes } }`. A bare `{ scopes }` (no
 * envelope) is accepted too. Anything missing or malformed is left out.
 */
export function identityOf(envelope: unknown): WhoamiIdentity {
  const e = record(envelope);
  if (!e) return {};
  const data = record(e.data) ?? e;
  const identity: WhoamiIdentity = {};

  const principal = record(data.principal);
  if (principal?.kind === "team") {
    identity.principal = { kind: "team", teamId: text(principal.teamId), teamName: text(principal.teamName) };
  } else if (principal?.kind === "personal") {
    identity.principal = { kind: "personal" };
  }
  const user = record(data.user);
  if (user) identity.user = { id: text(user.id), email: text(user.email), name: text(user.name) };
  const credential = record(data.credential);
  if (credential?.kind === "key" || credential?.kind === "oauth") identity.credentialKind = credential.kind;
  if (Array.isArray(data.scopes) && data.scopes.every((s) => typeof s === "string")) identity.scopes = data.scopes as string[];
  return identity;
}

/**
 * "Signed in to Yes2 as <name/email> in <studio>, via sign-in|API key. Scopes: …"
 * `fallbackKind` names the credential when whoami did not.
 */
export function signedInSummary(identity: WhoamiIdentity, fallbackKind: "key" | "oauth"): string {
  const name = identity.user?.name;
  const email = identity.user?.email;
  const who = name && email ? `${name} (${email})` : (name ?? email);
  const p = identity.principal;
  const where =
    p?.kind === "personal"
      ? "your personal games (preview)"
      : p?.kind === "team"
        ? (p.teamName ?? p.teamId ?? "your studio")
        : "your studio";
  const via = (identity.credentialKind ?? fallbackKind) === "oauth" ? "sign-in" : "API key";
  const scopes = identity.scopes && identity.scopes.length > 0 ? identity.scopes.join(", ") : "none reported";
  return `Signed in to Yes2${who ? ` as ${who}` : ""} in ${where}, via ${via}. Scopes: ${scopes}.`;
}

export type GateDecision =
  /**
   * Hand the request to the MCP SDK. `identity` is set when a y2a_ token was
   * checked; `expired` when the dashboard rejected it on a dashboard tool, which
   * then answers with a "sign in again" result instead of an HTTP 401.
   */
  | { kind: "pass"; identity?: WhoamiIdentity; expired?: true }
  | { kind: "refuse"; challenge: Challenge };

/**
 * The gate for one POST /mcp body. Sign-in is opt-in:
 * - `sign_in` without a valid Yes2 credential gets the 401 challenge, the one
 *   signal that makes a client start the browser sign-in;
 * - a dashboard tool without a credential (or with a foreign bearer) passes,
 *   and the tool answers with a normal "not signed in" result, as in phase 1;
 * - a `y2a_` token the user did present is checked with whoami. On sign_in a
 *   rejected token gets the 401 (so the client refreshes or re-authenticates);
 *   on a dashboard tool it passes as `expired` and the tool answers with text.
 *   A missing scope is left to the dashboard's per-route check, which answers
 *   INSUFFICIENT_SCOPE as text. Only sign_in ever gets a non-200: a 401 or 403
 *   on any other call makes some clients (Claude Code) drop the whole
 *   connector, docs tools included, until the user signs in;
 * - everything else (initialize, tools/list, docs tools) is never touched.
 */
export async function gate(
  body: unknown,
  auth: ApiKeyAuth,
  baseUrl: string,
  fetchImpl?: FetchLike,
): Promise<GateDecision> {
  const signIn = callsSignIn(body);
  const needed = requiredScopes(body);
  if (!signIn && needed.length === 0) return { kind: "pass" };

  if (auth.status !== "ok") {
    // Only an explicit sign_in starts the sign-in flow. A dashboard tool
    // without a credential answers with text, so the connector stays usable.
    return signIn ? { kind: "refuse", challenge: challenge401() } : { kind: "pass" };
  }
  // y2g_ keys: no pre-check, the dashboard answers as it always did.
  if (auth.kind === "key") return { kind: "pass" };

  const who = await whoami(baseUrl, auth.credential, fetchImpl);
  if (who.kind === "unauthorized") {
    return signIn ? { kind: "refuse", challenge: challenge401() } : { kind: "pass", expired: true };
  }
  if (who.kind === "unavailable") return { kind: "pass" };
  return { kind: "pass", identity: who.identity };
}
