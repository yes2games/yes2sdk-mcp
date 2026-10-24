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
  /** A `y2g_` API key or, with MCP_OAUTH_ENABLED, a `y2a_` OAuth access token. */
  credential: string;
  /**
   * MCP_OAUTH_ENABLED: a 401 also explains how to sign in again. Off keeps the
   * phase 1 text.
   */
  signInHelp?: boolean;
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
  /** The cap on a `game_limit_reached` / `build_limit_reached` answer. */
  limit?: unknown;
}

/** What a failure needs besides its status and code. */
interface FailureContext {
  error: string | undefined;
  retryAfter: string | null;
  signInHelp: boolean;
  /** The cap from a 409 `*_limit_reached`, when the dashboard sent one. */
  limit: number | undefined;
  /** The request path: the icon/banner upload codes overlap the build ones. */
  path: string;
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

export const SIGN_IN_AGAIN_HELP =
  "Sign in again: Claude Code `/mcp` → Authenticate; Codex `codex mcp login yes2sdk`; claude.ai reconnects automatically.";

/** INVALID_KEY_HELP plus how to sign in again, used when MCP_OAUTH_ENABLED is on. */
export const INVALID_CREDENTIAL_HELP =
  "The dashboard rejected the sign-in or API key (INVALID_API_KEY). It expired, was revoked or is unknown, or its holder left the studio or lost upload rights. " +
  `${SIGN_IN_AGAIN_HELP} ` +
  "With an API key instead: create a personal key in the dashboard (avatar → Settings → Personal API keys → Create personal key), set it as YES2_API_KEY in this MCP server's config, and restart the client.";

/** The icon/banner presigned upload (`/games/:id/image-uploads…`) has its own texts for shared codes. */
function describeImageUploadFailure(code: string | undefined, tag: string, detail: string): string | undefined {
  switch (code) {
    case "INVALID_BODY":
    case "INVALID_KIND":
      return `The image upload request was rejected${tag}${detail}. kind must be icon or banner, with the image's contentType and its exact size in bytes.`;
    case "UNSUPPORTED_IMAGE_TYPE":
      return `That image type is not accepted${tag}${detail}. Use a PNG, JPEG or WebP (image/png, image/jpeg or image/webp).`;
    case "INVALID_SIZE":
      return `The image size was rejected${tag}${detail}. Give the file's exact size in bytes, between 1 and 15728640 (15 MB): \`stat -f%z <file>\` on macOS, \`stat -c%s <file>\` on Linux.`;
    case "IMAGE_TOO_LARGE":
      return `The image is too large${tag}${detail}. Icons and banners are capped at 15 MB (15728640 bytes); shrink or recompress it and call set_game_image again.`;
    case "UPLOAD_NOT_RECEIVED":
      return `The dashboard has not received the image yet${tag}${detail}. Run (or finish) the curl PUT from set_game_image, then call finalize_image_upload again with the same uploadId.`;
    case "UPLOAD_IN_PROGRESS":
      return `That image upload is already being finalized${tag}${detail}. Wait a few seconds and call finalize_image_upload again with the same uploadId.`;
    case "SIZE_MISMATCH":
      return `The uploaded image is not the size that was declared${tag}${detail}. This upload cannot be finalized; call set_game_image again with the file's exact size and run the new curl command.`;
    case "INVALID_IMAGE":
      return `The uploaded file is not a valid image of the declared type${tag}${detail}. This upload cannot be finalized; check the file, then call set_game_image again.`;
    case "UPLOAD_EXPIRED":
      return `That image upload expired${tag}${detail}. Uploads must be finalized within 60 minutes (the PUT URL lasts 15); call set_game_image again.`;
    case "UPLOAD_NOT_FOUND":
      return `No image upload with that id belongs to this game${tag}${detail}. The uploadId comes from set_game_image for the same gameId.`;
    case "GAME_NOT_FOUND":
      return `No game with that id is reachable${tag}${detail}. list_games shows the games this sign-in or key can reach.`;
    case "R2_NOT_ENABLED":
      return `This dashboard is not set up for direct image uploads${tag}${detail}. Set the image in the dashboard UI instead.`;
    default:
      return undefined;
  }
}

function describeFailure(status: number, code: string | undefined, context: FailureContext): string {
  const { error, retryAfter, signInHelp, limit, path } = context;
  if (status === 401 || code === "INVALID_API_KEY") return signInHelp ? INVALID_CREDENTIAL_HELP : INVALID_KEY_HELP;

  // The dashboard's own messages often end in a period, and every template
  // below follows `detail` with its own punctuation: drop the trailing one so
  // the result never reads "finalize.." or "finalize.. Run".
  const trimmed = error?.trim().replace(/[.\s]+$/, "");
  const detail = trimmed ? `: ${trimmed}` : "";
  const tag = code ? ` (${code})` : "";
  if (path.includes("/image-uploads")) {
    const image = describeImageUploadFailure(code, tag, detail);
    if (image !== undefined) return image;
  }
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
    case "game_limit_reached":
      return `This account has reached its game limit${limit !== undefined ? ` of ${limit}` : ""}${tag}${detail}. Preview accounts are capped; use an existing game from list_games, delete one in the dashboard, or ask to join a studio.`;
    case "build_limit_reached":
      return `This game has reached its build limit${limit !== undefined ? ` of ${limit}` : ""}${tag}${detail}. Preview accounts are capped per game; remove the existing build in the dashboard, or ask to join a studio.`;
    case "INSUFFICIENT_SCOPE":
      return `This credential is not allowed to do that${tag}${detail}. Sign in again and allow every requested permission (games:read, games:write, builds:write), or use a personal API key that carries the scope.`;
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
      Authorization: `Bearer ${options.credential}`,
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
          : describeFailure(status, code, {
              error,
              retryAfter: res.headers.get("retry-after"),
              signInHelp: options.signInHelp === true,
              limit: typeof envelope?.limit === "number" ? envelope.limit : undefined,
              path,
            });
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
