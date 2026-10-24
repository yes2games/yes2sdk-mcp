/**
 * The caller's Yes2 dashboard credential, as seen by ONE server instance.
 *
 * The credential is never stored by this process. Over HTTP it is read from the
 * incoming request's headers and handed to the per-request server built by
 * createServer(), so it lives exactly as long as that request. Over stdio it
 * comes from the `YES2_API_KEY` env var of the local process the user started
 * themselves. It must never reach module state, logs, errors or tool output.
 *
 * Two kinds exist:
 * - `key`: a `y2g_` personal or team API key (phase 1);
 * - `oauth`: a `y2a_` access token the dashboard minted for this MCP through
 *   OAuth sign-in (phase 2, HTTP only, and only with MCP_OAUTH_ENABLED=1).
 *
 * Validation is deliberately loose (prefix plus URL-safe characters): the
 * dashboard is the authority on whether a credential is real, this only filters
 * out something that is plainly not a Yes2 credential, such as an OAuth token
 * another connector attached.
 */
export type CredentialKind = "key" | "oauth";

export type ApiKeyAuth =
  | { status: "missing" }
  | { status: "malformed"; source: "header" | "env" }
  | { status: "ok"; kind: CredentialKind; credential: string }
  /** OAuth mode only: an Authorization header that carries no Yes2 credential. */
  | { status: "foreign" };

const BEARER_KEY = /^Bearer (y2g_[A-Za-z0-9_-]+)$/;
const BEARER_OAUTH = /^Bearer (y2a_[A-Za-z0-9_-]+)$/;
const RAW_KEY = /^y2g_[A-Za-z0-9_-]+$/;

export const NO_KEY: ApiKeyAuth = { status: "missing" };

export interface HeaderAuthOptions {
  /**
   * MCP_OAUTH_ENABLED. Off (the default) parses exactly as phase 1 did: only
   * `y2g_` keys, and anything else in Authorization is "malformed". On, a
   * `Bearer y2a_…` token is accepted too and any other Authorization value is
   * "foreign".
   */
  oauth?: boolean;
}

/**
 * Auth for one HTTP request, from its `Authorization` header or, failing that,
 * its `X-Yes2-Api-Key` header (the bare key). The second exists for clients
 * that can map an env var straight onto a header but cannot add the `Bearer `
 * prefix (Codex's `env_http_headers`, which also skips an unset variable rather
 * than failing to start). A bare `Bearer` with no token, which is what
 * `Bearer ${YES2_API_KEY:-}` expands to when the variable is unset, counts as
 * no key rather than a malformed one.
 *
 * Authorization wins whenever it carries anything: X-Yes2-Api-Key is only read
 * when Authorization is absent or a bare `Bearer`.
 */
export function authFromHeaders(
  authorization: string | string[] | undefined,
  apiKeyHeader?: string | string[] | undefined,
  options: HeaderAuthOptions = {},
): ApiKeyAuth {
  const value = (Array.isArray(authorization) ? authorization[0] : authorization)?.trim() ?? "";
  if (value !== "" && value !== "Bearer") {
    const key = BEARER_KEY.exec(value);
    if (key) return { status: "ok", kind: "key", credential: key[1] };
    if (!options.oauth) return { status: "malformed", source: "header" };
    const token = BEARER_OAUTH.exec(value);
    return token ? { status: "ok", kind: "oauth", credential: token[1] } : { status: "foreign" };
  }
  const raw = (Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader)?.trim() ?? "";
  if (raw === "") return NO_KEY;
  return RAW_KEY.test(raw) ? { status: "ok", kind: "key", credential: raw } : { status: "malformed", source: "header" };
}

/**
 * Auth for a stdio process, from `YES2_API_KEY`. Accepts the bare key and,
 * forgivingly, a value pasted with its `Bearer ` prefix. stdio never takes an
 * OAuth token: the MCP spec says stdio SHOULD NOT use OAuth.
 */
export function authFromEnv(value: string | undefined): ApiKeyAuth {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return NO_KEY;
  const bare = trimmed.startsWith("Bearer ") ? trimmed.slice("Bearer ".length).trim() : trimmed;
  return RAW_KEY.test(bare) ? { status: "ok", kind: "key", credential: bare } : { status: "malformed", source: "env" };
}

/**
 * Replace anything shaped like a Yes2 credential (a `y2g_` key, a `y2a_` access
 * token or a `y2r_` refresh token) with a fixed marker. Applied to every string
 * a dashboard tool returns, so a credential cannot leak through an upstream
 * error message that happens to quote it.
 */
export function redactKeys(text: string): string {
  return text.replace(/(y2[gar])_[A-Za-z0-9_-]+/g, "$1_[redacted]");
}
