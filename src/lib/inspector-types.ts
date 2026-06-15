// ─────────────────────────────────────────────────────────────────────
// GENERATED / COPIED FILE — DO NOT EDIT.
// Copied from Experimental/Dashboard/web/src/types/inspector.ts (subset)
// Source of truth lives in the dashboard repo.
// Re-sync with `npm run sync-compliance`.
// ─────────────────────────────────────────────────────────────────────

/**
 * Where a captured error originated.
 * Mirrors `ErrorSource` from the Core SDK debug types.
 *
 * - `sdk`      — thrown inside Yes2SDK's own code paths
 * - `platform` — platform SDK failed to load / init (PokiSDK, YaGames, etc.)
 * - `game`     — runtime error from window.onerror / unhandledrejection
 * - `console`  — error logged via console.error() (Unity C# exceptions,
 *                Cocos/PlayCanvas critical failures, third-party libs)
 */
export type ErrorSource = "sdk" | "platform" | "game" | "console";

export interface LogEntry {
  id: string;
  timestamp: number;
  type: "call" | "result" | "event" | "error";
  method: string;
  params?: Record<string, unknown>;
  success?: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  // ── Error-row-specific fields (type === "error") ─────────────────────
  /** Origin of the error: SDK internals, platform SDK, or game code. */
  source?: ErrorSource;
  /** Full stack trace from the error, when available. */
  stack?: string;
  /** Machine-readable error code posted by the bridge or spy script. */
  errorCode?: string;
  /** Script URL from window.onerror (game-side errors only). */
  filename?: string;
  /** Line number from window.onerror (game-side errors only). */
  lineno?: number;
  /** True when the spy tagged this call/result as an internal SDK helper
   *  (e.g. underscore-prefixed methods like `_setStrategy`, or known TS
   *  private helpers like `getStrategyOrFallback`). Hidden by default in
   *  the event log unless Verbose mode is on. */
  internal?: boolean;
  /** Links a `call` entry to its `result` entry. Both carry the same value —
   *  the originating spy/iframe message `id` — so the event log can pair a
   *  call with the result it produced and render them as one transaction row. */
  correlationId?: string;
  /** Round-trip latency in milliseconds, set on RESULT entries only
   *  (`result.timestamp - call.timestamp`). Drives the latency badge and
   *  color thresholds in the event log. */
  durationMs?: number;
}

export type ComplianceSeverity = "FAIL" | "WARN" | "INFO";

export interface ComplianceResult {
  ruleId: string;
  platform: string;
  severity: ComplianceSeverity;
  description: string;
  passed: boolean;
  message: string;
  details?: string;
  autoFix?: string;
}

export interface ComplianceRule {
  id: string;
  platform: string;
  severity: ComplianceSeverity;
  description: string;
  check: (callLog: LogEntry[]) => ComplianceResult;
}

export const INSPECTOR_PLATFORMS = [
  "debug",
  "poki",
  "crazygames",
  "yandex",
  "gamedistribution",
  "youtube",
] as const;

export type InspectorPlatform = (typeof INSPECTOR_PLATFORMS)[number];
