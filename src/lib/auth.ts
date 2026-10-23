/**
 * The caller's Yes2 dashboard API key, as seen by ONE server instance.
 *
 * The key is never stored by this process. Over HTTP it is read from the
 * incoming request's `Authorization` header and handed to the per-request
 * server built by createServer(), so it lives exactly as long as that request.
 * Over stdio it comes from the `YES2_API_KEY` env var of the local process the
 * user started themselves. It must never reach module state, logs, errors or
 * tool output.
 *
 * Validation is deliberately loose (`y2g_` plus URL-safe characters): the
 * dashboard is the authority on whether a key is real, this only filters out
 * something that is plainly not a Yes2 key, such as an OAuth token another
 * connector attached.
 */
export type ApiKeyAuth =
  | { status: "missing" }
  | { status: "malformed"; source: "header" | "env" }
  | { status: "ok"; apiKey: string };

const BEARER_KEY = /^Bearer (y2g_[A-Za-z0-9_-]+)$/;
const RAW_KEY = /^y2g_[A-Za-z0-9_-]+$/;

export const NO_KEY: ApiKeyAuth = { status: "missing" };

/** Auth for one HTTP request, from its `Authorization` header. */
export function authFromHeader(header: string | string[] | undefined): ApiKeyAuth {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === "") return NO_KEY;
  const match = BEARER_KEY.exec(value.trim());
  return match ? { status: "ok", apiKey: match[1] } : { status: "malformed", source: "header" };
}

/**
 * Auth for a stdio process, from `YES2_API_KEY`. Accepts the bare key and,
 * forgivingly, a value pasted with its `Bearer ` prefix.
 */
export function authFromEnv(value: string | undefined): ApiKeyAuth {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return NO_KEY;
  const bare = trimmed.startsWith("Bearer ") ? trimmed.slice("Bearer ".length).trim() : trimmed;
  return RAW_KEY.test(bare) ? { status: "ok", apiKey: bare } : { status: "malformed", source: "env" };
}

/**
 * Replace anything shaped like a Yes2 key with a fixed marker. Applied to every
 * string a dashboard tool returns, so a key cannot leak through an upstream
 * error message that happens to quote it.
 */
export function redactKeys(text: string): string {
  return text.replace(/y2g_[A-Za-z0-9_-]+/g, "y2g_[redacted]");
}
