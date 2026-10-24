/**
 * Minimal client for the dashboard's machine API (`/api/v1`), used by the
 * upload tools. One client per tool call, built from the per-request key; it
 * holds nothing between calls.
 *
 * Every response uses the envelope `{ success, data | error, code? }`. A
 * failure becomes a DashboardError whose message is safe to show the user: it
 * carries the dashboard's own error text and code, never the key or the
 * request headers.
 */
export const DEFAULT_DASHBOARD_API_URL = "https://dashboard.yes2games.com/api/v1";
export const DASHBOARD_TIMEOUT_MS = 15_000;

/** Identifies these calls on the dashboard's `build.uploaded` activity event. */
export const CLIENT_HEADER = { name: "X-Yes2-Client", value: "mcp" } as const;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class DashboardError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "DashboardError";
    this.status = status;
    this.code = code;
  }
}

export interface DashboardClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export interface DashboardClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

interface Envelope {
  success?: unknown;
  data?: unknown;
  error?: unknown;
  code?: unknown;
}

/** Normalise `DASHBOARD_API_URL`: no trailing slash, so paths join with one. */
export function resolveDashboardUrl(value: string | undefined): string {
  const raw = value?.trim() || DEFAULT_DASHBOARD_API_URL;
  return raw.replace(/\/+$/, "");
}

/** One path segment, encoded so an id cannot climb out of its route. */
export function seg(value: string): string {
  return encodeURIComponent(value);
}

export const INVALID_KEY_HELP =
  "The dashboard rejected the API key (INVALID_API_KEY). It is missing, revoked or unknown, or its holder left the studio or lost upload rights. " +
  "Create a personal key in the dashboard (avatar → Settings → Personal API keys → Create personal key), set it as YES2_API_KEY in this MCP server's config, and restart the client.";

function describeFailure(status: number, code: string | undefined, error: string | undefined, retryAfter: string | null): string {
  if (status === 401 || code === "INVALID_API_KEY") return INVALID_KEY_HELP;

  // The dashboard's own messages often end in a period, and every template
  // below follows `detail` with its own punctuation: drop the trailing one so
  // the result never reads "finalize.." or "finalize.. Run".
  const trimmed = error?.trim().replace(/[.\s]+$/, "");
  const detail = trimmed ? `: ${trimmed}` : "";
  const tag = code ? ` (${code})` : "";
  switch (code) {
    case "VERSION_EXISTS":
      return `This game already has a build at that version${tag}${detail}. Pick a new version string and prepare the upload again.`;
    case "FILE_TOO_LARGE":
      return `The build is too large${tag}${detail}. The dashboard accepts zips up to 500 MB.`;
    case "MISSING_VERSION":
      return `The version was rejected${tag}${detail}. It must be a non-blank string of at most 100 characters.`;
    case "RATE_LIMITED":
      return `The dashboard is rate limiting this key${tag}${detail}. Retry ${retryAfter ? `after ${retryAfter} seconds` : "in a minute"}.`;
    case "SDK_NOT_INTEGRATED":
      return `Yes2SDK was not detected in the build${tag}${detail}. Retrying the same zip fails the same way; check the integration with validate_integration first.`;
    case "UPLOAD_NOT_RECEIVED":
      return `The dashboard has not received the zip yet${tag}${detail}. Run (or finish) the curl PUT from prepare_upload, then call finalize_upload again with the same uploadId.`;
    case "IDEMPOTENCY_CONFLICT":
      return `That idempotency key was already used with different details${tag}${detail}. Prepare the upload again without reusing it.`;
    case "UPLOAD_NOT_PENDING":
      return `That upload was already finalized${tag}${detail}. Use get_build_status with its uploadId to follow it.`;
    case "R2_NOT_ENABLED":
      return `This dashboard is not set up for direct uploads${tag}${detail}. Upload through the dashboard instead.`;
    case "INVALID_NAME":
      return `The build name was rejected${tag}${detail}. It must be a string, or null to clear it.`;
    case "NAME_TOO_LONG":
      return `The build name is too long${tag}${detail}. It must be at most 100 characters after trimming.`;
    case "BUILD_NOT_FOUND":
      return `No build with that id belongs to this game${tag}${detail}. A buildId comes from get_build_status once an upload is ready, and belongs to the game it was uploaded to.`;
    case "DISPLAY_NAME_COLUMN_MISSING":
      return `This dashboard cannot rename builds yet${tag}${detail}. Retrying will not help until the dashboard is updated; rename the build in the dashboard UI or ask a Yes2 admin.`;
    default:
      break;
  }
  if (status === 403) return `This key's studio does not own that game (HTTP 403${tag})${detail}. list_games shows the games the key can reach.`;
  if (status === 404) return `Not found (HTTP 404${tag})${detail}. list_games shows the games the key can reach; an upload id belongs to the game it was prepared for.`;
  if (status === 413) return `The request was too large for the dashboard (HTTP 413${tag})${detail}. A JSON body is capped at 20 MB.`;
  if (status === 429) return `The dashboard is rate limiting this key (HTTP 429)${detail}. Retry ${retryAfter ? `after ${retryAfter} seconds` : "in a minute"}.`;
  if (status >= 500) return `The dashboard had a server error (HTTP ${status}${tag})${detail}. It is safe to retry.`;
  return `The dashboard rejected the request (HTTP ${status}${tag})${detail}.`;
}

export function createDashboardClient(options: DashboardClientOptions): DashboardClient {
  const doFetch: FetchLike = options.fetch ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? DASHBOARD_TIMEOUT_MS;

  async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.apiKey}`,
      Accept: "application/json",
      [CLIENT_HEADER.name]: CLIENT_HEADER.value,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      // Only the base URL is named: the error object itself may carry request
      // details, so it is never stringified into the message.
      throw new DashboardError(
        timedOut
          ? `The dashboard at ${options.baseUrl} did not answer within ${Math.round(timeoutMs / 1000)} s. It is safe to retry.`
          : `Could not reach the dashboard at ${options.baseUrl}. Check the network, or DASHBOARD_API_URL if it was overridden.`,
      );
    }

    let envelope: Envelope | undefined;
    try {
      envelope = (await res.json()) as Envelope;
    } catch {
      envelope = undefined;
    }

    const ok = res.ok && envelope !== undefined && envelope.success !== false;
    if (!ok) {
      const code = typeof envelope?.code === "string" ? envelope.code : undefined;
      const error = typeof envelope?.error === "string" ? envelope.error : undefined;
      const status = res.ok ? 502 : res.status;
      const message =
        res.ok && envelope === undefined
          ? `The dashboard answered HTTP ${res.status} with a body that is not JSON.`
          : describeFailure(status, code, error, res.headers.get("retry-after"));
      throw new DashboardError(message, status, code);
    }
    return envelope?.data as T;
  }

  return {
    get: <T>(path: string) => request<T>("GET", path),
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
    patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
    delete: <T>(path: string) => request<T>("DELETE", path),
  };
}
