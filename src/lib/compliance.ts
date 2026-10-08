// ─────────────────────────────────────────────────────────────────────
// GENERATED / COPIED FILE — DO NOT EDIT.
// Copied from Experimental/Dashboard/web/src/lib/compliance-rules.ts
// Source of truth lives in the dashboard repo.
// Re-sync with `npm run sync-compliance`.
// ─────────────────────────────────────────────────────────────────────

import type {
  LogEntry,
  ComplianceRule,
  ComplianceResult,
  InspectorPlatform,
} from "./inspector-types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function findCall(logs: LogEntry[], methodPrefix: string): LogEntry | undefined {
  return logs.find(
    (l) => l.type === "call" && l.method.startsWith(methodPrefix)
  );
}

function findEvent(logs: LogEntry[], eventName: string): LogEntry | undefined {
  return logs.find(
    (l) => l.type === "event" && l.method === eventName
  );
}

function findResult(logs: LogEntry[], methodPrefix: string, success: boolean): LogEntry | undefined {
  return logs.find(
    (l) =>
      l.type === "result" &&
      l.method.startsWith(methodPrefix) &&
      l.success === success
  );
}

function allCalls(logs: LogEntry[], methodPrefix: string): LogEntry[] {
  return logs.filter(
    (l) => l.type === "call" && l.method.startsWith(methodPrefix)
  );
}

function allEvents(logs: LogEntry[], eventName: string): LogEntry[] {
  return logs.filter(
    (l) => l.type === "event" && l.method === eventName
  );
}

/**
 * Marker every rule puts in its message when the log holds nothing it can
 * judge yet. The Inspector rail reads it to show "not checked" instead of a
 * pass, so keep the wording exact.
 */
export const NOT_APPLICABLE_MARKER = "(rule not applicable)";

/** True when a rule result only means "nothing to judge in this log yet". */
export function isNotApplicable(result: ComplianceResult): boolean {
  return result.passed && result.message.includes(NOT_APPLICABLE_MARKER);
}

// ── Jest helpers ──────────────────────────────────────────────────────

/** Calls that write player progress through Yes2SDK (data module or player store). */
const DATA_WRITE_PREFIXES = ["data.set", "data.flush", "data.save", "player.setData", "player.flushData"];

function isDataWrite(entry: LogEntry): boolean {
  return entry.type === "call" && DATA_WRITE_PREFIXES.some((p) => entry.method.startsWith(p));
}

function byTime(a: LogEntry, b: LogEntry): number {
  return a.timestamp - b.timestamp;
}

/** Calls whose method is exactly one of `methods`, oldest first. */
function callsTo(logs: LogEntry[], ...methods: string[]): LogEntry[] {
  return logs.filter((l) => l.type === "call" && methods.includes(l.method)).sort(byTime);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The first argument of a logged call. The Inspector spy posts the call's
 * arguments as an array; the debug adapter posts a params object instead.
 */
function firstArg(entry: LogEntry): unknown {
  const params: unknown = entry.params;
  return Array.isArray(params) ? params[0] : params;
}

/** The first argument as an options object (a JSON string is parsed), or undefined. */
function optionsArg(entry: LogEntry): Record<string, unknown> | undefined {
  let arg = firstArg(entry);
  if (typeof arg === "string") {
    try {
      arg = JSON.parse(arg);
    } catch {
      return undefined;
    }
  }
  return isRecord(arg) ? arg : undefined;
}

/** The result row a call produced: paired by correlationId, else the next result of the same method. */
function resultOf(logs: LogEntry[], call: LogEntry): LogEntry | undefined {
  if (call.correlationId) {
    const paired = logs.find((l) => l.type === "result" && l.correlationId === call.correlationId);
    if (paired) return paired;
  }
  return logs
    .filter((l) => l.type === "result" && l.method === call.method && l.timestamp >= call.timestamp)
    .sort(byTime)[0];
}

function failedWith(result: LogEntry | undefined, code: string): boolean {
  return !!result && result.success === false && result.error?.code === code;
}

/**
 * What the log says about the player being registered, from every signal that
 * reports it: `auth.isAuthenticated()`, `player.getMode()` ("authorized" or
 * "lite") and a successful `auth.signInAsync()`.
 */
function authSignals(logs: LogEntry[]): Array<{ timestamp: number; registered: boolean }> {
  const out: Array<{ timestamp: number; registered: boolean }> = [];
  for (const l of logs) {
    if (l.type !== "result" || l.success === false) continue;
    if (l.method === "auth.isAuthenticated" && typeof l.result === "boolean") {
      out.push({ timestamp: l.timestamp, registered: l.result });
    } else if (l.method === "player.getMode" && (l.result === "authorized" || l.result === "lite")) {
      out.push({ timestamp: l.timestamp, registered: l.result === "authorized" });
    } else if (l.method === "auth.signInAsync") {
      out.push({ timestamp: l.timestamp, registered: true });
    }
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}

/** The latest known registration state at `timestamp`, or undefined when nothing reported it yet. */
function registeredAt(logs: LogEntry[], timestamp: number): boolean | undefined {
  const before = authSignals(logs).filter((s) => s.timestamp <= timestamp);
  return before.length > 0 ? before[before.length - 1].registered : undefined;
}

/** The day (1 to 7, or 0) a scheduled notification lands on, when its options say. */
function notificationDay(options: Record<string, unknown> | undefined): number | undefined {
  if (!options) return undefined;
  if (typeof options.scheduledInDays === "number") return options.scheduledInDays;
  if (typeof options.delaySeconds === "number") return Math.ceil(options.delaySeconds / 86400);
  return undefined;
}

/** Purchase tokens carried by a purchase result (one Purchase or a list of them). */
function purchaseTokens(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map((p) => (isRecord(p) && typeof p.purchaseToken === "string" ? p.purchaseToken : undefined))
    .filter((t): t is string => !!t);
}

function makeResult(
  rule: Pick<ComplianceRule, "id" | "platform" | "severity" | "description">,
  passed: boolean,
  message: string,
  opts?: { details?: string; autoFix?: string }
): ComplianceResult {
  return {
    ruleId: rule.id,
    platform: rule.platform,
    severity: rule.severity,
    description: rule.description,
    passed,
    message,
    ...opts,
  };
}

// ── Universal Rules ───────────────────────────────────────────────────

const U001: ComplianceRule = {
  id: "U-001",
  platform: "universal",
  severity: "FAIL",
  description: "SDK initialized (initializeAsync called)",
  check: (logs) => {
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    return makeResult(U001, !!init,
      init ? "initializeAsync() was called" : "initializeAsync() was never called",
      { autoFix: "Call Yes2SDK.initializeAsync() before any other SDK method" }
    );
  },
};

const U002: ComplianceRule = {
  id: "U-002",
  platform: "universal",
  severity: "WARN",
  description: "Loading progress reported before game start",
  check: (logs) => {
    const progress = findCall(logs, "setLoadingProgress");
    return makeResult(U002, !!progress,
      progress
        ? "setLoadingProgress() was called"
        : "setLoadingProgress() was never called — some platforms need this for their loading UI",
      { autoFix: "Call Yes2SDK.setLoadingProgress(0-100) during asset loading, ending with setLoadingProgress(100) before startGameAsync()" }
    );
  },
};

const U003: ComplianceRule = {
  id: "U-003",
  platform: "universal",
  severity: "WARN",
  description: "No uncaught SDK errors in call log",
  check: (logs) => {
    const errors = logs.filter(
      (l) => l.type === "result" && l.success === false && l.error
    );
    const passed = errors.length === 0;
    return makeResult(U003, passed,
      passed
        ? "No SDK errors found in call log"
        : `${errors.length} unhandled SDK error(s) found`,
      {
        details: passed ? undefined : errors.map((e) => `${e.method}: ${e.error?.message ?? "unknown"}`).join("; "),
        autoFix: "Wrap SDK calls in try/catch and handle errors gracefully",
      }
    );
  },
};

const U004: ComplianceRule = {
  id: "U-004",
  platform: "universal",
  severity: "FAIL",
  description: "Game pauses before ads and resumes after",
  check: (logs) => {
    const adCalls = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ];
    if (adCalls.length === 0) {
      return makeResult(U004, true, "No ad calls found (rule not applicable)");
    }
    for (const ad of adCalls) {
      const precedingPause = logs.find(
        (l) =>
          l.timestamp < ad.timestamp &&
          ((l.type === "call" && l.method === "game.gameplayStop") ||
            (l.type === "event" && l.method === "beforeAd"))
      );
      if (!precedingPause) {
        return makeResult(U004, false, "Ad shown without prior pause/gameplayStop", {
          details: `Ad call '${ad.method}' at ${ad.timestamp}ms had no preceding gameplayStop or beforeAd event`,
          autoFix: "Call gameplayStop() or handle beforeAd callback before showing ads",
        });
      }
    }
    return makeResult(U004, true, "All ad calls preceded by pause/gameplayStop");
  },
};

const U005: ComplianceRule = {
  id: "U-005",
  platform: "universal",
  severity: "FAIL",
  description: "gameplayStart and gameplayStop called at least once",
  check: (logs) => {
    const start = findCall(logs, "game.gameplayStart");
    const stop = findCall(logs, "game.gameplayStop");
    const passed = !!start && !!stop;
    return makeResult(U005, passed,
      passed
        ? "Both gameplayStart() and gameplayStop() were called"
        : `Missing: ${!start ? "gameplayStart()" : ""}${!start && !stop ? " and " : ""}${!stop ? "gameplayStop()" : ""}`,
      { autoFix: "Call game.gameplayStart() when gameplay begins and game.gameplayStop() when it ends (level complete, pause, etc.)" }
    );
  },
};

const U006: ComplianceRule = {
  id: "U-006",
  platform: "universal",
  severity: "FAIL",
  description: "Init completed before any ad call",
  check: (logs) => {
    const initResult =
      findResult(logs, "initializeAsync", true) ||
      findResult(logs, "initialize", true) ||
      findEvent(logs, "initialized");
    const firstAd = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ].sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!firstAd) {
      return makeResult(U006, true, "No ad calls found (rule not applicable)");
    }
    if (!initResult) {
      return makeResult(U006, false, "Ads called but init never completed", {
        autoFix: "Await initializeAsync() before calling any ad methods",
      });
    }
    const passed = initResult.timestamp < firstAd.timestamp;
    return makeResult(U006, passed,
      passed
        ? "Init completed before first ad call"
        : `First ad at ${firstAd.timestamp}ms but init completed at ${initResult.timestamp}ms`,
      { autoFix: "Await initializeAsync() before calling any ad methods" }
    );
  },
};

const U007: ComplianceRule = {
  id: "U-007",
  platform: "universal",
  severity: "FAIL",
  description: "Reward granted after rewarded ad viewed",
  check: (logs) => {
    const adViewedEvents = allEvents(logs, "adViewed");
    if (adViewedEvents.length === 0) {
      return makeResult(U007, true, "No adViewed events found (rule not applicable)");
    }
    // Check that after each adViewed event, there's evidence of reward granting
    // In practice, we check that adViewed events exist and are not followed by errors
    // The actual reward granting happens in game code — we just verify the callback fires
    for (const viewed of adViewedEvents) {
      const errorAfter = logs.find(
        (l) =>
          l.type === "result" &&
          l.success === false &&
          l.timestamp > viewed.timestamp &&
          l.timestamp < viewed.timestamp + 1000 &&
          l.method.startsWith("ads.")
      );
      if (errorAfter) {
        return makeResult(U007, false,
          "Error occurred after adViewed callback — reward may not have been granted",
          {
            details: `adViewed at ${viewed.timestamp}ms followed by error at ${errorAfter.timestamp}ms`,
            autoFix: "In the adViewed callback, immediately grant the reward before any async operations",
          }
        );
      }
    }
    return makeResult(U007, true, "adViewed callbacks fired — rewards should be granted");
  },
};

const U008: ComplianceRule = {
  id: "U-008",
  platform: "universal",
  severity: "FAIL",
  description: "No ads before startGameAsync",
  check: (logs) => {
    const startGame = findCall(logs, "startGameAsync") || findCall(logs, "startGame");
    const firstAd = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ].sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!firstAd) {
      return makeResult(U008, true, "No ad calls found (rule not applicable)");
    }
    if (!startGame) {
      return makeResult(U008, false, "Ads called but startGameAsync() was never called", {
        autoFix: "Call startGameAsync() after loading completes, before showing any ads",
      });
    }
    const passed = startGame.timestamp < firstAd.timestamp;
    return makeResult(U008, passed,
      passed
        ? "startGameAsync() called before first ad"
        : `First ad at ${firstAd.timestamp}ms but startGameAsync at ${startGame.timestamp}ms`,
      { autoFix: "Call startGameAsync() after loading completes, before showing any ads" }
    );
  },
};

// ── Poki Rules ────────────────────────────────────────────────────────

const P001: ComplianceRule = {
  id: "P-001",
  platform: "poki",
  severity: "FAIL",
  description: "gameLoadingFinished signaled",
  check: (logs) => {
    // Poki platform auto-handles this, but we verify startGameAsync was called
    // which signals loading is complete
    const startGame = findCall(logs, "startGameAsync") || findCall(logs, "startGame");
    return makeResult(P001, !!startGame,
      startGame
        ? "Loading sequence completed (startGameAsync called)"
        : "startGameAsync() never called — Poki loading sequence incomplete",
      { autoFix: "Call startGameAsync() after loading completes — Poki uses this to signal gameLoadingFinished" }
    );
  },
};

const P002: ComplianceRule = {
  id: "P-002",
  platform: "poki",
  severity: "FAIL",
  description: "gameplayStart called before ads",
  check: (logs) => {
    const adCalls = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ];
    if (adCalls.length === 0) {
      return makeResult(P002, true, "No ad calls found (rule not applicable)");
    }
    const firstAd = adCalls.sort((a, b) => a.timestamp - b.timestamp)[0];
    const gpStart = findCall(logs, "game.gameplayStart");
    if (!gpStart) {
      return makeResult(P002, false, "Ads shown but gameplayStart() never called", {
        autoFix: "Call game.gameplayStart() before showing any ads — Poki Inspector flags this",
      });
    }
    const passed = gpStart.timestamp < firstAd.timestamp;
    return makeResult(P002, passed,
      passed
        ? "gameplayStart() called before first ad"
        : `First ad at ${firstAd.timestamp}ms but gameplayStart at ${gpStart.timestamp}ms`,
      { autoFix: "Call game.gameplayStart() before any ad requests" }
    );
  },
};

const P003: ComplianceRule = {
  id: "P-003",
  platform: "poki",
  severity: "FAIL",
  description: "gameplayStop called before interstitial",
  check: (logs) => {
    const interstitials = allCalls(logs, "ads.showInterstitial");
    if (interstitials.length === 0) {
      return makeResult(P003, true, "No interstitial calls found (rule not applicable)");
    }
    for (const ad of interstitials) {
      // Find the most recent gameplayStop before this ad
      const precedingStops = logs.filter(
        (l) => l.type === "call" && l.method === "game.gameplayStop" && l.timestamp < ad.timestamp
      );
      if (precedingStops.length === 0) {
        return makeResult(P003, false, "Interstitial shown without prior gameplayStop()", {
          details: `Ad at ${ad.timestamp}ms had no preceding gameplayStop`,
          autoFix: "Call game.gameplayStop() before every commercialBreak/interstitial call",
        });
      }
    }
    return makeResult(P003, true, "All interstitials preceded by gameplayStop()");
  },
};

const P004: ComplianceRule = {
  id: "P-004",
  platform: "poki",
  severity: "WARN",
  description: "No ads in first 30 seconds",
  check: (logs) => {
    const adCalls = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ];
    const earlyAds = adCalls.filter((a) => a.timestamp < 30000);
    const passed = earlyAds.length === 0;
    return makeResult(P004, passed,
      passed
        ? "No ads shown in first 30 seconds"
        : `${earlyAds.length} ad(s) shown within first 30 seconds`,
      {
        details: passed ? undefined : earlyAds.map((a) => `${a.method} at ${a.timestamp}ms`).join("; "),
        autoFix: "Wait at least 30 seconds after game start before showing the first ad",
      }
    );
  },
};

const P005: ComplianceRule = {
  id: "P-005",
  platform: "poki",
  severity: "WARN",
  description: "Interstitial frequency ≤1 per 60 seconds",
  check: (logs) => {
    const interstitials = allCalls(logs, "ads.showInterstitial").sort(
      (a, b) => a.timestamp - b.timestamp
    );
    if (interstitials.length < 2) {
      return makeResult(P005, true, "Fewer than 2 interstitials — frequency OK");
    }
    for (let i = 1; i < interstitials.length; i++) {
      const gap = interstitials[i].timestamp - interstitials[i - 1].timestamp;
      if (gap < 60000) {
        return makeResult(P005, false,
          `Interstitials too frequent: ${Math.round(gap / 1000)}s gap (minimum 60s)`,
          {
            details: `Ads at ${interstitials[i - 1].timestamp}ms and ${interstitials[i].timestamp}ms (${Math.round(gap / 1000)}s apart)`,
            autoFix: "Space interstitial ads at least 60 seconds apart",
          }
        );
      }
    }
    return makeResult(P005, true, "All interstitials spaced ≥60 seconds apart");
  },
};

const P006: ComplianceRule = {
  id: "P-006",
  platform: "poki",
  severity: "FAIL",
  description: "commercialBreak has beforeAd callback",
  check: (logs) => {
    const interstitials = allCalls(logs, "ads.showInterstitial");
    if (interstitials.length === 0) {
      return makeResult(P006, true, "No interstitial calls found (rule not applicable)");
    }
    // Check that beforeAd event fires before each interstitial completes
    for (const ad of interstitials) {
      const beforeAd = logs.find(
        (l) =>
          l.type === "event" &&
          l.method === "beforeAd" &&
          l.timestamp >= ad.timestamp - 100 && // Allow slight timing difference
          l.timestamp <= ad.timestamp + 5000
      );
      if (!beforeAd) {
        return makeResult(P006, false,
          "Interstitial missing beforeAd callback — game must pause during ads",
          {
            details: `Ad at ${ad.timestamp}ms had no beforeAd event`,
            autoFix: "Provide a beforeAd callback that pauses game logic and mutes audio",
          }
        );
      }
    }
    return makeResult(P006, true, "All interstitials have beforeAd callback");
  },
};

const P007: ComplianceRule = {
  id: "P-007",
  platform: "poki",
  severity: "FAIL",
  description: "No external scripts loaded",
  check: (logs) => {
    // Cannot fully verify from SDK call log alone — check for any script loading events
    const scriptLoads = logs.filter(
      (l) => l.type === "event" && l.method === "externalScriptLoaded"
    );
    if (scriptLoads.length > 0) {
      return makeResult(P007, false,
        `${scriptLoads.length} external script(s) detected — Poki CSP blocks these`,
        {
          details: scriptLoads.map((s) => String(s.params?.url ?? "unknown")).join("; "),
          autoFix: "Remove all external script tags — Poki CSP blocks them. Inline all code or bundle it.",
        }
      );
    }
    return makeResult(P007, true,
      "No external script loading detected (note: full check requires build analysis)",
      { autoFix: "Ensure no <script src='http...'> tags except Poki's own SDK" }
    );
  },
};

const P008: ComplianceRule = {
  id: "P-008",
  platform: "poki",
  severity: "WARN",
  description: "Responsive canvas (100% width/height)",
  check: (logs) => {
    // Cannot verify from SDK call log — this is a build/HTML check
    return makeResult(P008, true,
      "Cannot verify from call log — requires build HTML analysis",
      { autoFix: "Set canvas to width:100%; height:100% with overflow:hidden on body" }
    );
  },
};

const P009: ComplianceRule = {
  id: "P-009",
  platform: "poki",
  severity: "FAIL",
  description: "index.json matches index.html",
  check: (logs) => {
    // Cannot verify from SDK call log — this is a build check
    return makeResult(P009, true,
      "Cannot verify from call log — requires build file analysis",
      { autoFix: "Keep index.json and index.html in sync — Poki production uses index.json" }
    );
  },
};

const P010: ComplianceRule = {
  id: "P-010",
  platform: "poki",
  severity: "WARN",
  description: "No direct PokiSDK.init() call",
  check: (logs) => {
    // Check if there's a direct PokiSDK.init call in the log
    const pokiInit = findCall(logs, "PokiSDK.init");
    if (pokiInit) {
      return makeResult(P010, false,
        "Direct PokiSDK.init() detected — Poki platform handles init automatically",
        { autoFix: "Remove PokiSDK.init() call — the platform handles initialization" }
      );
    }
    return makeResult(P010, true, "No direct PokiSDK.init() call found");
  },
};

const P011: ComplianceRule = {
  id: "P-011",
  platform: "poki",
  severity: "FAIL",
  description: "Ad no-fill uses noFill callback (not onError)",
  check: (logs) => {
    // Check for onError events that should be noFill
    const onErrors = allEvents(logs, "onError").filter(
      (e) => e.params?.context === "ad" || e.params?.type === "ad"
    );
    if (onErrors.length > 0) {
      return makeResult(P011, false,
        "Ad failures using onError instead of noFill callback",
        {
          details: `${onErrors.length} onError event(s) for ads — should use noFill`,
          autoFix: "Use callbacks.noFill() for ad rejection/no-fill, not onError",
        }
      );
    }
    return makeResult(P011, true, "No incorrect onError usage for ads detected");
  },
};

const P012: ComplianceRule = {
  id: "P-012",
  platform: "poki",
  severity: "INFO",
  description: "Data stored via localStorage only",
  check: (logs) => {
    // Check for cloud data calls that would fail on Poki
    const cloudCalls = [
      ...allCalls(logs, "data.getDataAsync"),
      ...allCalls(logs, "data.setDataAsync"),
    ];
    const cloudErrors = cloudCalls.filter((c) => {
      const result = logs.find(
        (l) => l.type === "result" && l.method === c.method && l.timestamp > c.timestamp
      );
      return result && !result.success;
    });
    return makeResult(P012, true,
      cloudCalls.length === 0
        ? "No cloud data calls — Poki uses localStorage with yes2sdk_ prefix"
        : `${cloudCalls.length} data call(s) detected — Poki returns FeatureNotSupported for cloud data`,
      { autoFix: "On Poki, use localStorage only. Cloud data methods return FeatureNotSupported." }
    );
  },
};

// ── CrazyGames Rules ──────────────────────────────────────────────────

const CG001: ComplianceRule = {
  id: "CG-001",
  platform: "crazygames",
  severity: "FAIL",
  description: "SDK init called with wrapper options",
  check: (logs) => {
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    if (!init) {
      return makeResult(CG001, false, "initializeAsync() never called", {
        autoFix: "Call initializeAsync() — CG adapter passes wrapper options automatically",
      });
    }
    // Check if init params include wrapper info (the adapter should set this)
    const hasWrapper = init.params?.wrapper || init.params?.engine;
    return makeResult(CG001, true,
      "SDK initialized (CG adapter passes wrapper options internally)",
      { autoFix: "Ensure CG adapter passes { wrapper: { engine, sdkVersion } } to SDK.init()" }
    );
  },
};

const CG002: ComplianceRule = {
  id: "CG-002",
  platform: "crazygames",
  severity: "FAIL",
  description: "gameplayStart/gameplayStop called",
  check: (logs) => {
    const start = findCall(logs, "game.gameplayStart");
    const stop = findCall(logs, "game.gameplayStop");
    const passed = !!start && !!stop;
    return makeResult(CG002, passed,
      passed
        ? "Both gameplayStart() and gameplayStop() were called"
        : `Missing: ${!start ? "gameplayStart()" : ""}${!start && !stop ? " and " : ""}${!stop ? "gameplayStop()" : ""}`,
      { autoFix: "Call game.gameplayStart() and game.gameplayStop() — CG QA tool checks for this" }
    );
  },
};

const CG003: ComplianceRule = {
  id: "CG-003",
  platform: "crazygames",
  severity: "FAIL",
  description: "Audio muted during ads",
  check: (logs) => {
    const adCalls = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ];
    if (adCalls.length === 0) {
      return makeResult(CG003, true, "No ad calls found (rule not applicable)");
    }
    // Check that beforeAd or adStarted event fires for each ad (indicates pause/mute)
    for (const ad of adCalls) {
      const pauseEvent = logs.find(
        (l) =>
          l.type === "event" &&
          (l.method === "beforeAd" || l.method === "adStarted") &&
          l.timestamp >= ad.timestamp - 100 &&
          l.timestamp <= ad.timestamp + 5000
      );
      if (!pauseEvent) {
        return makeResult(CG003, false,
          "Ad shown without audio mute — CG QA tool checks audio state",
          {
            details: `Ad at ${ad.timestamp}ms had no beforeAd/adStarted event`,
            autoFix: "Mute audio when adStarted fires, restore on adFinished/adError",
          }
        );
      }
    }
    return makeResult(CG003, true, "All ads have beforeAd/adStarted events (audio should be muted)");
  },
};

const CG004: ComplianceRule = {
  id: "CG-004",
  platform: "crazygames",
  severity: "WARN",
  description: "happytime() called on positive moments",
  check: (logs) => {
    const happytime = findCall(logs, "game.happytime") || findCall(logs, "happytime");
    return makeResult(CG004, !!happytime,
      happytime
        ? "happytime() was called"
        : "happytime() never called — recommended for CG promotion algorithm",
      { autoFix: "Call sdk.game.happytime() on positive moments (level complete, high score)" }
    );
  },
};

const CG005: ComplianceRule = {
  id: "CG-005",
  platform: "crazygames",
  severity: "FAIL",
  description: "No ads during active gameplay",
  check: (logs) => {
    const interstitials = allCalls(logs, "ads.showInterstitial");
    if (interstitials.length === 0) {
      return makeResult(CG005, true, "No interstitial calls found (rule not applicable)");
    }
    for (const ad of interstitials) {
      // Check if gameplayStop was called before this ad (and no gameplayStart after)
      const lastStopBefore = [...logs]
        .filter((l) => l.type === "call" && l.method === "game.gameplayStop" && l.timestamp < ad.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)[0];
      const lastStartBefore = [...logs]
        .filter((l) => l.type === "call" && l.method === "game.gameplayStart" && l.timestamp < ad.timestamp)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (!lastStopBefore) {
        return makeResult(CG005, false,
          "Interstitial requested during active gameplay (no gameplayStop before ad)",
          {
            details: `Ad at ${ad.timestamp}ms — no gameplayStop called before it`,
            autoFix: "Call gameplayStop() before requesting midgame ads — CG rejects ads during active gameplay",
          }
        );
      }
      if (lastStartBefore && lastStartBefore.timestamp > lastStopBefore.timestamp) {
        return makeResult(CG005, false,
          "Interstitial requested during active gameplay",
          {
            details: `Ad at ${ad.timestamp}ms — gameplayStart at ${lastStartBefore.timestamp}ms came after gameplayStop at ${lastStopBefore.timestamp}ms`,
            autoFix: "Call gameplayStop() before requesting midgame ads — CG rejects ads during active gameplay",
          }
        );
      }
    }
    return makeResult(CG005, true, "All interstitials requested when gameplay was stopped");
  },
};

const CG006: ComplianceRule = {
  id: "CG-006",
  platform: "crazygames",
  severity: "WARN",
  description: "Ad frequency cap (3 min between interstitials)",
  check: (logs) => {
    const interstitials = allCalls(logs, "ads.showInterstitial").sort(
      (a, b) => a.timestamp - b.timestamp
    );
    if (interstitials.length < 2) {
      return makeResult(CG006, true, "Fewer than 2 interstitials — frequency OK");
    }
    for (let i = 1; i < interstitials.length; i++) {
      const gap = interstitials[i].timestamp - interstitials[i - 1].timestamp;
      if (gap < 180000) {
        return makeResult(CG006, false,
          `Interstitials too frequent: ${Math.round(gap / 1000)}s gap (CG enforces 3 min minimum)`,
          {
            details: `Ads at ${interstitials[i - 1].timestamp}ms and ${interstitials[i].timestamp}ms (${Math.round(gap / 1000)}s apart)`,
            autoFix: "Space interstitial ads at least 3 minutes apart — CG enforces this server-side",
          }
        );
      }
    }
    return makeResult(CG006, true, "All interstitials spaced ≥3 minutes apart");
  },
};

const CG007: ComplianceRule = {
  id: "CG-007",
  platform: "crazygames",
  severity: "WARN",
  description: "Settings change listener registered",
  check: (logs) => {
    const settingsListener = logs.find(
      (l) =>
        (l.type === "call" && l.method.includes("settingsChange")) ||
        (l.type === "event" && l.method === "settingsChange") ||
        (l.type === "call" && l.method.includes("addEventListener") && l.params?.event === "settingsChange")
    );
    return makeResult(CG007, !!settingsListener,
      settingsListener
        ? "Settings change listener registered"
        : "No settingsChange listener detected — CG player may send mute/unmute commands",
      { autoFix: "Register sdk.game.addEventListener('settingsChange', handler) to handle mute/unmute from CG player" }
    );
  },
};

const CG008: ComplianceRule = {
  id: "CG-008",
  platform: "crazygames",
  severity: "FAIL",
  description: "Loading progress reported (loadingStart/loadingStop)",
  check: (logs) => {
    const progress = findCall(logs, "setLoadingProgress");
    const startGame = findCall(logs, "startGameAsync") || findCall(logs, "startGame");
    // CG needs loadingStart (triggered on first setLoadingProgress) and loadingStop (on startGameAsync)
    const passed = !!startGame;
    return makeResult(CG008, passed,
      passed
        ? `Loading sequence complete${progress ? " (progress reported)" : " (startGameAsync called)"}`
        : "startGameAsync() never called — CG requires loadingStart/loadingStop",
      { autoFix: "Call setLoadingProgress() during loading and startGameAsync() when ready — these map to CG loadingStart/loadingStop" }
    );
  },
};

const CG009: ComplianceRule = {
  id: "CG-009",
  platform: "crazygames",
  severity: "FAIL",
  description: "Postset wrapper created (production)",
  check: (logs) => {
    // Cannot verify from SDK call log — this is a build/platform check
    return makeResult(CG009, true,
      "Cannot verify from call log — requires build analysis (CG replaces HTML on upload)",
      { autoFix: "Ensure Yes2SDKPlatformInit.jslib postset creates the wrapper — CG replaces HTML on upload" }
    );
  },
};

const CG010: ComplianceRule = {
  id: "CG-010",
  platform: "crazygames",
  severity: "FAIL",
  description: "SDK polling with timeout for async init",
  check: (logs) => {
    // Check that init succeeded (which implies polling worked)
    const initResult = findResult(logs, "initializeAsync", true) || findResult(logs, "initialize", true);
    const initError = findResult(logs, "initializeAsync", false) || findResult(logs, "initialize", false);
    if (initError) {
      return makeResult(CG010, false,
        "SDK initialization failed — may indicate polling timeout",
        {
          details: initError.error?.message ?? "Init failed",
          autoFix: "Poll for window.CrazyGames.SDK with 100ms intervals, 15s timeout, then CDN fallback",
        }
      );
    }
    return makeResult(CG010, true,
      initResult
        ? "SDK initialized successfully (polling worked)"
        : "Cannot verify polling — init result not in log",
      { autoFix: "Poll for window.CrazyGames.SDK with 100ms intervals, 15s timeout" }
    );
  },
};

const CG011: ComplianceRule = {
  id: "CG-011",
  platform: "crazygames",
  severity: "WARN",
  description: "CDN fallback for SDK loading",
  check: (logs) => {
    // Cannot fully verify from call log — informational
    return makeResult(CG011, true,
      "Cannot verify from call log — ensure CDN fallback is implemented",
      { autoFix: "If SDK polling fails, load from https://sdk.crazygames.com/crazygames-sdk-v3.js as fallback" }
    );
  },
};

const CG012: ComplianceRule = {
  id: "CG-012",
  platform: "crazygames",
  severity: "FAIL",
  description: "window.__y2 used (not bare __y2) in jslib",
  check: (logs) => {
    // Cannot verify from SDK call log — this is a code review check
    return makeResult(CG012, true,
      "Cannot verify from call log — requires code review of jslib files",
      { autoFix: "In jslib files, always use window.__y2, never bare __y2 (Emscripten resolves bare __y2 to empty object)" }
    );
  },
};

const CG013: ComplianceRule = {
  id: "CG-013",
  platform: "crazygames",
  severity: "INFO",
  description: "Banner size mapping available",
  check: (logs) => {
    const bannerCalls = allCalls(logs, "banners.");
    return makeResult(CG013, true,
      bannerCalls.length === 0
        ? "No banner calls — CG supports 5 banner sizes (728x90, 300x250, 320x50, 468x60, 320x100)"
        : `${bannerCalls.length} banner call(s) found`,
      { autoFix: "CG banner sizes: Leaderboard_728x90, Medium_300x250, Mobile_320x50, Main_468x60, Large_Mobile_320x100" }
    );
  },
};

const CG014: ComplianceRule = {
  id: "CG-014",
  platform: "crazygames",
  severity: "FAIL",
  description: "adError code mapped correctly (unfilled→noFill, other→adDismissed)",
  check: (logs) => {
    // Check for any adError events and verify they map correctly
    const adErrors = allEvents(logs, "adError");
    if (adErrors.length === 0) {
      return makeResult(CG014, true, "No adError events found (rule not applicable)");
    }
    // Verify that adError events with unfilled/adblock codes map to noFill
    for (const err of adErrors) {
      const code = err.params?.code as string | undefined;
      if (code === "unfilled" || code === "adblock") {
        // Should be followed by noFill
        const noFill = logs.find(
          (l) => l.type === "event" && l.method === "noFill" &&
            l.timestamp > err.timestamp && l.timestamp < err.timestamp + 1000
        );
        if (!noFill) {
          return makeResult(CG014, false,
            `adError with code '${code}' not mapped to noFill callback`,
            { autoFix: "Map CG adError codes: 'unfilled'/'adblock' → noFill, others → adDismissed" }
          );
        }
      }
    }
    return makeResult(CG014, true, "adError codes mapped correctly");
  },
};

// ── Yandex Rules ──────────────────────────────────────────────────────

const Y001: ComplianceRule = {
  id: "Y-001",
  platform: "yandex",
  severity: "FAIL",
  description: "YaGames.init() called",
  check: (logs) => {
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    return makeResult(Y001, !!init,
      init
        ? "SDK initialized (YaGames.init() called internally)"
        : "initializeAsync() never called — YaGames.init() required",
      { autoFix: "Call initializeAsync() — the Yandex adapter calls YaGames.init() internally" }
    );
  },
};

const Y002: ComplianceRule = {
  id: "Y-002",
  platform: "yandex",
  severity: "FAIL",
  description: "Fullscreen ad callbacks complete (onOpen + onClose)",
  check: (logs) => {
    const interstitials = allCalls(logs, "ads.showInterstitial");
    if (interstitials.length === 0) {
      return makeResult(Y002, true, "No fullscreen ad calls found (rule not applicable)");
    }
    for (const ad of interstitials) {
      const hasBeforeAd = logs.find(
        (l) => l.type === "event" &&
          (l.method === "beforeAd" || l.method === "onOpen") &&
          l.timestamp >= ad.timestamp && l.timestamp <= ad.timestamp + 10000
      );
      const hasAfterAd = logs.find(
        (l) => l.type === "event" &&
          (l.method === "afterAd" || l.method === "onClose") &&
          l.timestamp >= ad.timestamp && l.timestamp <= ad.timestamp + 60000
      );
      if (!hasAfterAd) {
        return makeResult(Y002, false,
          "Fullscreen ad missing onClose callback — game may never resume",
          {
            details: `Ad at ${ad.timestamp}ms — no afterAd/onClose event found`,
            autoFix: "Provide onOpen and onClose callbacks for showFullscreenAdv — missing onClose means game never resumes",
          }
        );
      }
    }
    return makeResult(Y002, true, "All fullscreen ads have complete callback chains");
  },
};

const Y003: ComplianceRule = {
  id: "Y-003",
  platform: "yandex",
  severity: "FAIL",
  description: "Rewarded ad onRewarded callback handled",
  check: (logs) => {
    const rewardedCalls = allCalls(logs, "ads.showRewarded");
    if (rewardedCalls.length === 0) {
      return makeResult(Y003, true, "No rewarded ad calls found (rule not applicable)");
    }
    // Check for adViewed events (maps to onRewarded)
    const adViewed = allEvents(logs, "adViewed");
    const adResults = logs.filter(
      (l) => l.type === "result" && l.method.startsWith("ads.showRewarded") && l.success === true
    );
    if (adResults.length > 0 && adViewed.length === 0) {
      return makeResult(Y003, false,
        "Rewarded ads completed but no adViewed/onRewarded callback detected",
        { autoFix: "Handle the onRewarded callback in showRewardedVideo — it fires BEFORE onClose" }
      );
    }
    return makeResult(Y003, true, "Rewarded ad onRewarded/adViewed callbacks present");
  },
};

const Y004: ComplianceRule = {
  id: "Y-004",
  platform: "yandex",
  severity: "INFO",
  description: "Sticky banner support (optional, recommended)",
  check: (logs) => {
    const bannerCalls = allCalls(logs, "banners.");
    return makeResult(Y004, true,
      bannerCalls.length > 0
        ? "Banner ad calls detected"
        : "No banner ads — ysdk.adv.showBannerAdv() is optional but recommended for revenue",
      { autoFix: "Consider adding ysdk.adv.showBannerAdv() for additional sticky banner revenue" }
    );
  },
};

const Y005: ComplianceRule = {
  id: "Y-005",
  platform: "yandex",
  severity: "WARN",
  description: "Language from SDK (not navigator.language)",
  check: (logs) => {
    // Cannot fully verify from SDK call log — informational
    return makeResult(Y005, true,
      "Cannot verify from call log — ensure ysdk.environment.i18n.lang is used for localization",
      { autoFix: "Use ysdk.environment.i18n.lang for localization, not navigator.language" }
    );
  },
};

const Y006: ComplianceRule = {
  id: "Y-006",
  platform: "yandex",
  severity: "WARN",
  description: "Player data scope control",
  check: (logs) => {
    // Check for auth-related calls with scope info
    const playerCalls = allCalls(logs, "player.");
    return makeResult(Y006, true,
      "Cannot verify scope from call log — ensure getPlayer({ scopes: false }) for anonymous access",
      { autoFix: "Use getPlayer({ scopes: false }) initially, only request scopes when auth is needed" }
    );
  },
};

const Y007: ComplianceRule = {
  id: "Y-007",
  platform: "yandex",
  severity: "FAIL",
  description: "No ads during loading (before LoadingAPI.ready)",
  check: (logs) => {
    const startGame = findCall(logs, "startGameAsync") || findCall(logs, "startGame");
    const firstAd = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ].sort((a, b) => a.timestamp - b.timestamp)[0];

    if (!firstAd) {
      return makeResult(Y007, true, "No ad calls found (rule not applicable)");
    }
    if (!startGame) {
      return makeResult(Y007, false,
        "Ads called but startGameAsync() never called — Yandex rejects ads during loading",
        { autoFix: "Call startGameAsync() (triggers LoadingAPI.ready()) before any ad calls" }
      );
    }
    const passed = startGame.timestamp < firstAd.timestamp;
    return makeResult(Y007, passed,
      passed
        ? "Ads only shown after LoadingAPI.ready()"
        : `Ad at ${firstAd.timestamp}ms before startGameAsync at ${startGame.timestamp}ms — Yandex rejects this`,
      { autoFix: "Call startGameAsync() (triggers LoadingAPI.ready()) before any ad calls" }
    );
  },
};

const Y008: ComplianceRule = {
  id: "Y-008",
  platform: "yandex",
  severity: "FAIL",
  description: "onClose(wasShown) boolean checked for fullscreen ads",
  check: (logs) => {
    // Check for afterAd events that include wasShown parameter
    const afterAds = allEvents(logs, "afterAd").filter(
      (e) => e.params?.adType === "interstitial" || e.params?.adType === "fullscreen"
    );
    if (afterAds.length === 0) {
      // Also check for interstitial results
      const interstitialResults = logs.filter(
        (l) => l.type === "result" && l.method.startsWith("ads.showInterstitial")
      );
      if (interstitialResults.length === 0) {
        return makeResult(Y008, true, "No fullscreen ad completions found (rule not applicable)");
      }
    }
    return makeResult(Y008, true,
      "Cannot fully verify wasShown check from call log — ensure adapter checks onClose(wasShown) parameter",
      { autoFix: "In onClose(wasShown), when wasShown=false treat as no-fill (ad was not shown)" }
    );
  },
};

const Y009: ComplianceRule = {
  id: "Y-009",
  platform: "yandex",
  severity: "WARN",
  description: "Cloud data preloaded during init",
  check: (logs) => {
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    const dataCall = findCall(logs, "data.");
    if (!init) {
      return makeResult(Y009, false, "Init never called — cloud data cannot be preloaded", {
        autoFix: "Call initializeAsync() — Yandex adapter preloads player.getData() during init",
      });
    }
    return makeResult(Y009, true,
      "SDK initialized — Yandex adapter preloads cloud data during init",
      { autoFix: "Yandex adapter calls player.getData() during init to enable synchronous reads" }
    );
  },
};

const Y010: ComplianceRule = {
  id: "Y-010",
  platform: "yandex",
  severity: "WARN",
  description: "Data save deduplication",
  check: (logs) => {
    const dataSaves = allCalls(logs, "data.setDataAsync").concat(allCalls(logs, "data.save"));
    if (dataSaves.length < 2) {
      return makeResult(Y010, true, "Fewer than 2 data saves — dedup not needed");
    }
    // Check for rapid consecutive saves
    const sorted = dataSaves.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
      if (gap < 200) {
        return makeResult(Y010, false,
          `Rapid data saves detected: ${gap}ms apart — Yandex may reject identical saves`,
          {
            details: `Saves at ${sorted[i - 1].timestamp}ms and ${sorted[i].timestamp}ms`,
            autoFix: "Debounce data saves (500ms recommended) and skip if data hasn't changed (JSON snapshot comparison)",
          }
        );
      }
    }
    return makeResult(Y010, true, "Data saves appear properly spaced");
  },
};

const Y011: ComplianceRule = {
  id: "Y-011",
  platform: "yandex",
  severity: "FAIL",
  description: "game_api_pause/resume listeners registered",
  check: (logs) => {
    // Check for pause/resume event handling
    const pauseEvent = logs.find(
      (l) =>
        (l.type === "event" && (l.method === "game_api_pause" || l.method === "pause")) ||
        (l.type === "call" && l.method.includes("addEventListener") && l.params?.event === "game_api_pause")
    );
    const resumeEvent = logs.find(
      (l) =>
        (l.type === "event" && (l.method === "game_api_resume" || l.method === "resume")) ||
        (l.type === "call" && l.method.includes("addEventListener") && l.params?.event === "game_api_resume")
    );

    // If we see pause/resume events, the listeners are working
    if (pauseEvent || resumeEvent) {
      return makeResult(Y011, true, "game_api_pause/resume events detected — listeners registered");
    }

    // Can't fully verify from log alone; adapter should register these
    return makeResult(Y011, true,
      "Cannot verify listeners from call log — Yandex adapter should register these internally",
      { autoFix: "Register ysdk.on('game_api_pause') and ysdk.on('game_api_resume') to handle tab focus changes and ad overlays" }
    );
  },
};

const Y012: ComplianceRule = {
  id: "Y-012",
  platform: "yandex",
  severity: "FAIL",
  description: "LoadingAPI.ready() called",
  check: (logs) => {
    const startGame = findCall(logs, "startGameAsync") || findCall(logs, "startGame");
    return makeResult(Y012, !!startGame,
      startGame
        ? "startGameAsync() called (triggers LoadingAPI.ready())"
        : "startGameAsync() never called — Yandex shows infinite loading screen without LoadingAPI.ready()",
      { autoFix: "Call startGameAsync() after loading — Yandex adapter calls LoadingAPI.ready() internally" }
    );
  },
};

const Y013: ComplianceRule = {
  id: "Y-013",
  platform: "yandex",
  severity: "FAIL",
  description: "GameplayAPI.start()/stop() used",
  check: (logs) => {
    const start = findCall(logs, "game.gameplayStart");
    const stop = findCall(logs, "game.gameplayStop");
    const passed = !!start && !!stop;
    return makeResult(Y013, passed,
      passed
        ? "GameplayAPI.start() and .stop() called (via gameplayStart/gameplayStop)"
        : `Missing: ${!start ? "gameplayStart()" : ""}${!start && !stop ? " and " : ""}${!stop ? "gameplayStop()" : ""}`,
      { autoFix: "Call game.gameplayStart() and game.gameplayStop() — Yandex uses these for analytics and ad timing" }
    );
  },
};

const Y014: ComplianceRule = {
  id: "Y-014",
  platform: "yandex",
  severity: "INFO",
  description: "Auth via openAuthDialog",
  check: (logs) => {
    const authCalls = allCalls(logs, "auth.");
    return makeResult(Y014, true,
      authCalls.length > 0
        ? "Auth calls detected — ensure openAuthDialog() is used and player is re-fetched after auth"
        : "No auth calls — ysdk.auth.openAuthDialog() is available if authentication is needed",
      { autoFix: "Use ysdk.auth.openAuthDialog() for auth, then re-fetch player via ysdk.getPlayer() after" }
    );
  },
};

const Y015: ComplianceRule = {
  id: "Y-015",
  platform: "yandex",
  severity: "WARN",
  description: "Data write debounce (500ms recommended)",
  check: (logs) => {
    const saves = allCalls(logs, "data.setDataAsync").concat(allCalls(logs, "data.save"));
    if (saves.length < 2) {
      return makeResult(Y015, true, "Fewer than 2 data saves — debounce not applicable");
    }
    const sorted = saves.sort((a, b) => a.timestamp - b.timestamp);
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
      if (gap < 500) {
        return makeResult(Y015, false,
          `Data saves too rapid: ${gap}ms apart (recommend 500ms debounce)`,
          {
            details: `Saves at ${sorted[i - 1].timestamp}ms and ${sorted[i].timestamp}ms`,
            autoFix: "Debounce cloud saves with at least 500ms delay to avoid Yandex rate limits",
          }
        );
      }
    }
    return makeResult(Y015, true, "Data saves properly debounced (≥500ms apart)");
  },
};

const Y016: ComplianceRule = {
  id: "Y-016",
  platform: "yandex",
  severity: "FAIL",
  description: "SDK loaded from /sdk.js (relative path)",
  check: (logs) => {
    // Cannot verify from call log — build check
    return makeResult(Y016, true,
      "Cannot verify from call log — ensure Yandex SDK is loaded from /sdk.js (relative path)",
      { autoFix: "Load Yandex SDK from /sdk.js (relative path) — on Yandex Games this resolves to their CDN" }
    );
  },
};

// ── GameDistribution Rules ────────────────────────────────────────────

const GD001: ComplianceRule = {
  id: "GD-001",
  platform: "gamedistribution",
  severity: "FAIL",
  description: "GD_OPTIONS set before SDK load",
  check: (logs) => {
    // Verify init was called (adapter sets GD_OPTIONS internally)
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    return makeResult(GD001, !!init,
      init
        ? "SDK initialized (GD adapter sets GD_OPTIONS before SDK load)"
        : "initializeAsync() never called — GD_OPTIONS must be set before SDK loads",
      { autoFix: "Call initializeAsync() — GD adapter sets window.GD_OPTIONS before loading the SDK script" }
    );
  },
};

const GD002: ComplianceRule = {
  id: "GD-002",
  platform: "gamedistribution",
  severity: "FAIL",
  description: "gameId provided in options",
  check: (logs) => {
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    if (!init) {
      return makeResult(GD002, false, "initializeAsync() never called — gameId cannot be set", {
        autoFix: "Call initializeAsync() with a valid GD gameId configured",
      });
    }
    // The adapter should include gameId — we trust the adapter handles this
    return makeResult(GD002, true,
      "SDK initialized — GD adapter should include gameId in GD_OPTIONS",
      { autoFix: "Ensure GD adapter includes a valid gameId in GD_OPTIONS — without it, ads won't serve" }
    );
  },
};

const GD003: ComplianceRule = {
  id: "GD-003",
  platform: "gamedistribution",
  severity: "FAIL",
  description: "SDK_GAME_PAUSE event handled",
  check: (logs) => {
    const adCalls = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ];
    if (adCalls.length === 0) {
      return makeResult(GD003, true, "No ad calls found (rule not applicable)");
    }
    // Check that beforeAd events fire (maps to SDK_GAME_PAUSE)
    for (const ad of adCalls) {
      const pauseEvent = logs.find(
        (l) =>
          l.type === "event" &&
          (l.method === "beforeAd" || l.method === "SDK_GAME_PAUSE") &&
          l.timestamp >= ad.timestamp - 100 &&
          l.timestamp <= ad.timestamp + 5000
      );
      if (!pauseEvent) {
        return makeResult(GD003, false,
          "Ad shown without SDK_GAME_PAUSE handling — game must pause during ads",
          {
            details: `Ad at ${ad.timestamp}ms — no pause event detected`,
            autoFix: "Handle SDK_GAME_PAUSE event: mute audio and stop game logic when ads are shown",
          }
        );
      }
    }
    return makeResult(GD003, true, "SDK_GAME_PAUSE handled for all ad calls");
  },
};

const GD004: ComplianceRule = {
  id: "GD-004",
  platform: "gamedistribution",
  severity: "FAIL",
  description: "SDK_GAME_START event handled",
  check: (logs) => {
    const adCalls = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showRewarded"),
    ];
    if (adCalls.length === 0) {
      return makeResult(GD004, true, "No ad calls found (rule not applicable)");
    }
    // Check for afterAd events (maps to SDK_GAME_START)
    const afterAdEvents = allEvents(logs, "afterAd").concat(
      allEvents(logs, "SDK_GAME_START")
    );
    if (afterAdEvents.length === 0 && adCalls.length > 0) {
      return makeResult(GD004, false,
        "Ads shown but no SDK_GAME_START/afterAd events detected — game may not resume",
        { autoFix: "Handle SDK_GAME_START event: resume game logic and restore audio after ads finish" }
      );
    }
    return makeResult(GD004, true, "SDK_GAME_START/afterAd events detected after ads");
  },
};

const GD005: ComplianceRule = {
  id: "GD-005",
  platform: "gamedistribution",
  severity: "WARN",
  description: "SDK_REWARDED_WATCH_COMPLETE handled",
  check: (logs) => {
    const rewardedCalls = allCalls(logs, "ads.showRewarded");
    if (rewardedCalls.length === 0) {
      return makeResult(GD005, true, "No rewarded ad calls found (rule not applicable)");
    }
    const rewardEvents = allEvents(logs, "adViewed").concat(
      allEvents(logs, "SDK_REWARDED_WATCH_COMPLETE")
    );
    const rewardResults = logs.filter(
      (l) => l.type === "result" && l.method.startsWith("ads.showRewarded") && l.success === true
    );
    if (rewardResults.length > 0 && rewardEvents.length === 0) {
      return makeResult(GD005, false,
        "Rewarded ads completed but no reward callback detected",
        { autoFix: "Handle SDK_REWARDED_WATCH_COMPLETE event to grant rewards after rewarded ad view" }
      );
    }
    return makeResult(GD005, true, "Rewarded ad completion events present");
  },
};

const GD006: ComplianceRule = {
  id: "GD-006",
  platform: "gamedistribution",
  severity: "INFO",
  description: "Event-based ad flow used",
  check: (logs) => {
    return makeResult(GD006, true,
      "GD uses events (onEvent callback in GD_OPTIONS) rather than promises for ad flow",
      { autoFix: "GD ad flow is event-based via GD_OPTIONS.onEvent — dispatch to correct game logic based on event.name" }
    );
  },
};

// ── YouTube Rules ─────────────────────────────────────────────────────

const YT001: ComplianceRule = {
  id: "YT-001",
  platform: "youtube",
  severity: "FAIL",
  description: "YouTube Playables SDK initialized",
  check: (logs) => {
    const init = findCall(logs, "initializeAsync") || findCall(logs, "initialize");
    return makeResult(YT001, !!init,
      init
        ? "SDK initialized"
        : "initializeAsync() never called — YouTube Playables SDK must be initialized",
      { autoFix: "Call initializeAsync() to initialize the YouTube Playables SDK" }
    );
  },
};

const YT002: ComplianceRule = {
  id: "YT-002",
  platform: "youtube",
  severity: "FAIL",
  description: "Lifecycle events handled (play/pause/stop)",
  check: (logs) => {
    const start = findCall(logs, "game.gameplayStart");
    const stop = findCall(logs, "game.gameplayStop");
    const passed = !!start && !!stop;
    return makeResult(YT002, passed,
      passed
        ? "Gameplay lifecycle events (start/stop) handled"
        : "Must respond to play/pause/stop events from YouTube player",
      { autoFix: "Handle play/pause/stop lifecycle events from the YouTube player" }
    );
  },
};

const YT003: ComplianceRule = {
  id: "YT-003",
  platform: "youtube",
  severity: "FAIL",
  description: "Sandbox compatible (no blocked APIs)",
  check: (logs) => {
    // Check for API calls that might be blocked in YouTube sandbox
    const blockedPatterns = ["window.open", "document.cookie", "localStorage"];
    const suspicious = logs.filter(
      (l) => l.type === "call" && blockedPatterns.some((p) => l.method.includes(p))
    );
    if (suspicious.length > 0) {
      return makeResult(YT003, false,
        `${suspicious.length} potentially sandbox-blocked API call(s) detected`,
        {
          details: suspicious.map((s) => s.method).join(", "),
          autoFix: "Remove calls to APIs blocked by YouTube's sandbox (window.open, document.cookie, etc.)",
        }
      );
    }
    return makeResult(YT003, true,
      "No obviously sandbox-blocked API calls detected",
      { autoFix: "Avoid APIs blocked by YouTube's sandbox (window.open, document.cookie, localStorage, etc.)" }
    );
  },
};

// ── Jest Rules ────────────────────────────────────────────────────────
//
// Only what an Inspector event log can prove. Jest's launch checklist items
// that need a person (load time on a real phone, entry payload instead of URL
// parameters, links that lead outside Jest, haptics, server verification,
// Jest's own login reminders) stay manual. Root-absolute asset paths are a
// static check: the dashboard's Jest packaging gate refuses those bundles.

const J001: ComplianceRule = {
  id: "J-001",
  platform: "jest",
  severity: "FAIL",
  description: "Game marked loaded (startGameAsync calls Jest markGameLoaded)",
  check: (logs) => {
    const startGame = findCall(logs, "startGameAsync") || findCall(logs, "startGame");
    return makeResult(J001, !!startGame,
      startGame
        ? "startGameAsync() was called, so Jest's markGameLoaded ran"
        : "startGameAsync() never called: Jest keeps its loading screen up and the player never reaches the game",
      { autoFix: "Call startGameAsync() the moment the game is interactive. On Jest it calls markGameLoaded" }
    );
  },
};

/** Longest silence Jest's Manual loading mode allows before it sends the player home. */
const JEST_PROGRESS_GAP_MS = 15000;

const J002: ComplianceRule = {
  id: "J-002",
  platform: "jest",
  severity: "WARN",
  description: "Loading progress reported at least every 15 seconds until startGameAsync",
  check: (logs) => {
    const startGame = [...allCalls(logs, "startGameAsync"), ...allCalls(logs, "startGame")].sort(byTime)[0];
    if (!startGame) {
      return makeResult(J002, true, `startGameAsync() not seen yet ${NOT_APPLICABLE_MARKER}`);
    }
    const sessionStart = Math.min(...logs.map((l) => l.timestamp));
    const marks = [
      sessionStart,
      ...allCalls(logs, "setLoadingProgress")
        .filter((p) => p.timestamp <= startGame.timestamp)
        .map((p) => p.timestamp),
      startGame.timestamp,
    ].sort((a, b) => a - b);
    let worstGap = 0;
    let worstFrom = sessionStart;
    for (let i = 1; i < marks.length; i++) {
      const gap = marks[i] - marks[i - 1];
      if (gap > worstGap) {
        worstGap = gap;
        worstFrom = marks[i - 1];
      }
    }
    const passed = worstGap <= JEST_PROGRESS_GAP_MS;
    return makeResult(J002, passed,
      passed
        ? `Loading progress never went quiet for more than 15s (longest gap ${Math.round(worstGap / 1000)}s)`
        : `No loading progress for ${Math.round(worstGap / 1000)}s before startGameAsync(): in Jest's Manual loading mode the player is sent home after 15s`,
      {
        details: passed ? undefined : `Gap starts at ${worstFrom}ms; startGameAsync() at ${startGame.timestamp}ms`,
        autoFix: "Call setLoadingProgress(n) at least every 15 seconds until startGameAsync(), and load the rest of the game after it",
      }
    );
  },
};

const J003: ComplianceRule = {
  id: "J-003",
  platform: "jest",
  severity: "FAIL",
  description: "No rewarded ad requested (Jest disallows rewarded-ad mechanics)",
  check: (logs) => {
    const rewarded = allCalls(logs, "ads.showRewarded");
    const passed = rewarded.length === 0;
    return makeResult(J003, passed,
      passed
        ? "No rewarded ad requested"
        : `${rewarded.length} rewarded ad request(s): Jest has no ads, so each one ends in noFill and whatever it unlocks is unreachable`,
      {
        details: passed ? undefined : rewarded.map((a) => `${a.method} at ${a.timestamp}ms`).join("; "),
        autoFix: "Hide rewarded-ad offers on Jest (ads.isRewardedSupported() is false there) and never gate progression on a rewarded ad",
      }
    );
  },
};

const J004: ComplianceRule = {
  id: "J-004",
  platform: "jest",
  severity: "WARN",
  description: "No interstitial or banner requested (Jest has no in-game ads)",
  check: (logs) => {
    const ads = [
      ...allCalls(logs, "ads.showInterstitial"),
      ...allCalls(logs, "ads.showBanner"),
      ...allCalls(logs, "banners.show"),
    ].sort(byTime);
    const passed = ads.length === 0;
    return makeResult(J004, passed,
      passed
        ? "No interstitial or banner requested"
        : `${ads.length} ad request(s): they are safe on Jest (no ad is shown) but are dead code there`,
      {
        details: passed ? undefined : ads.map((a) => `${a.method} at ${a.timestamp}ms`).join("; "),
        autoFix: "Skip ad requests on Jest: check ads.isInterstitialSupported() and ads.isBannerSupported() first",
      }
    );
  },
};

const J005: ComplianceRule = {
  id: "J-005",
  platform: "jest",
  severity: "FAIL",
  description: "Guest progress saved before any registration or sign-in prompt",
  check: (logs) => {
    const prompt = callsTo(logs, "auth.showRegistrationPrompt", "auth.signInAsync")[0];
    if (!prompt) {
      return makeResult(J005, true, `No registration or sign-in prompt seen ${NOT_APPLICABLE_MARKER}`);
    }
    const save = logs.filter((l) => isDataWrite(l) && l.timestamp <= prompt.timestamp).sort(byTime)[0];
    return makeResult(J005, !!save,
      save
        ? `Progress was saved (${save.method}) before the first ${prompt.method}()`
        : `${prompt.method}() at ${prompt.timestamp}ms came before any save: registration reloads the game, so a guest loses progress`,
      { autoFix: "Save the guest's progress through Yes2SDK.data (and confirm it with flushAsync or setStringAsync) before showRegistrationPrompt() or signInAsync()" }
    );
  },
};

const J006: ComplianceRule = {
  id: "J-006",
  platform: "jest",
  severity: "FAIL",
  description: "Registration prompt shown to guests only",
  check: (logs) => {
    const prompts = allCalls(logs, "auth.showRegistrationPrompt").sort(byTime);
    if (prompts.length === 0) {
      return makeResult(J006, true, `No registration prompt seen ${NOT_APPLICABLE_MARKER}`);
    }
    let unchecked = 0;
    for (const prompt of prompts) {
      const result = resultOf(logs, prompt);
      const rejectedAsRegistered =
        failedWith(result, "INVALID_OPERATION") ||
        (!!result && result.success === false &&
          (result.error?.message ?? "").toLowerCase().includes("already registered"));
      const state = registeredAt(logs, prompt.timestamp);
      if (rejectedAsRegistered || state === true) {
        return makeResult(J006, false, "Registration prompt shown to a player who is already registered", {
          details: `showRegistrationPrompt() at ${prompt.timestamp}ms${rejectedAsRegistered ? " was rejected with INVALID_OPERATION" : " after the player was reported as registered"}`,
          autoFix: "Check auth.isAuthenticated() first and only show the registration prompt while it is false",
        });
      }
      if (state === undefined) unchecked++;
    }
    return makeResult(J006, true,
      unchecked === 0
        ? "Every registration prompt was shown to a guest"
        : `No prompt reached a registered player, but ${unchecked} prompt(s) had no auth.isAuthenticated() check before them`,
      { autoFix: "Check auth.isAuthenticated() first and only show the registration prompt while it is false" }
    );
  },
};

const J007: ComplianceRule = {
  id: "J-007",
  platform: "jest",
  severity: "WARN",
  description: "No notification scheduled while the player is a guest",
  check: (logs) => {
    const calls = allCalls(logs, "notifications.scheduleAsync").sort(byTime);
    if (calls.length === 0) {
      return makeResult(J007, true, `No notification scheduled ${NOT_APPLICABLE_MARKER}`);
    }
    const guestCalls = calls.filter((c) =>
      failedWith(resultOf(logs, c), "PLAYER_NOT_AUTHENTICATED") || registeredAt(logs, c.timestamp) === false
    );
    const passed = guestCalls.length === 0;
    return makeResult(J007, passed,
      passed
        ? "Notifications were only scheduled for a registered player"
        : `${guestCalls.length} notification(s) scheduled for a guest: Jest only notifies registered players`,
      {
        details: passed ? undefined : guestCalls.map((c) => `scheduleAsync at ${c.timestamp}ms`).join("; "),
        autoFix: "Schedule notifications only when auth.isAuthenticated() is true; a guest gets PLAYER_NOT_AUTHENTICATED",
      }
    );
  },
};

const J008: ComplianceRule = {
  id: "J-008",
  platform: "jest",
  severity: "WARN",
  description: "No subscription started while the player is a guest",
  check: (logs) => {
    const calls = allCalls(logs, "iap.subscribeAsync").sort(byTime);
    if (calls.length === 0) {
      return makeResult(J008, true, `No subscription started ${NOT_APPLICABLE_MARKER}`);
    }
    const guestCalls = calls.filter((c) =>
      failedWith(resultOf(logs, c), "PLAYER_NOT_AUTHENTICATED") || registeredAt(logs, c.timestamp) === false
    );
    const passed = guestCalls.length === 0;
    return makeResult(J008, passed,
      passed
        ? "Subscriptions were only offered to a registered player"
        : `${guestCalls.length} subscription(s) started for a guest: Jest subscriptions need a registered player`,
      {
        details: passed ? undefined : guestCalls.map((c) => `subscribeAsync at ${c.timestamp}ms`).join("; "),
        autoFix: "Offer subscriptions only when auth.isAuthenticated() is true; prompt a guest to register first",
      }
    );
  },
};

const J009: ComplianceRule = {
  id: "J-009",
  platform: "jest",
  severity: "WARN",
  description: "D1 to D7 notification sequence scheduled for a registered player",
  check: (logs) => {
    const sawRegistered = authSignals(logs).some((s) => s.registered);
    const scheduled = allCalls(logs, "notifications.scheduleAsync").filter(
      (c) => resultOf(logs, c)?.success !== false
    );
    if (!sawRegistered && scheduled.length === 0) {
      return makeResult(J009, true, `No registered player seen in this session ${NOT_APPLICABLE_MARKER}`);
    }
    const days = new Set(scheduled.map((c) => notificationDay(optionsArg(c))));
    const missing = [1, 2, 3, 4, 5, 6, 7].filter((d) => !days.has(d));
    const passed = missing.length === 0;
    return makeResult(J009, passed,
      passed
        ? "Notifications scheduled for every day from D1 to D7"
        : scheduled.length === 0
          ? "A registered player was seen but no notification was scheduled"
          : `Notification sequence is missing day(s) ${missing.join(", ")}`,
      { autoFix: "When the player is registered, schedule one notification per day with scheduledInDays 1 to 7 and a stable id per day" }
    );
  },
};

const J010: ComplianceRule = {
  id: "J-010",
  platform: "jest",
  severity: "WARN",
  description: "Every scheduled notification carries an image",
  check: (logs) => {
    const calls = allCalls(logs, "notifications.scheduleAsync").sort(byTime);
    if (calls.length === 0) {
      return makeResult(J010, true, `No notification scheduled ${NOT_APPLICABLE_MARKER}`);
    }
    const missing = calls.filter((c) => {
      const options = optionsArg(c);
      if (!options) return false; // options not readable from the log: nothing to judge
      const hasImage =
        (typeof options.imageAssetId === "string" && options.imageAssetId.length > 0) ||
        (typeof options.imageDataUrl === "string" && options.imageDataUrl.length > 0);
      return !hasImage;
    });
    const passed = missing.length === 0;
    return makeResult(J010, passed,
      passed
        ? "Every scheduled notification has an image"
        : `${missing.length} notification(s) scheduled without an image`,
      {
        details: passed ? undefined : missing.map((c) => `scheduleAsync at ${c.timestamp}ms`).join("; "),
        autoFix: "Give every notification an image: imageAssetId (approved on Jest) or imageDataUrl, not both",
      }
    );
  },
};

/** IAP calls that mean the game sells items (subscriptions are judged by J-008 and J-013). */
const JEST_ITEM_IAP_METHODS = [
  "iap.getCatalogAsync",
  "iap.getProductAsync",
  "iap.purchaseAsync",
  "iap.getPurchasesAsync",
  "iap.consumePurchaseAsync",
];

const J011: ComplianceRule = {
  id: "J-011",
  platform: "jest",
  severity: "FAIL",
  description: "Incomplete purchases checked at startup (getPurchasesAsync before any purchase)",
  check: (logs) => {
    if (callsTo(logs, ...JEST_ITEM_IAP_METHODS).length === 0) {
      return makeResult(J011, true, `No in-app purchase calls seen ${NOT_APPLICABLE_MARKER}`);
    }
    const firstRecover = callsTo(logs, "iap.getPurchasesAsync")[0];
    const firstBuy = callsTo(logs, "iap.purchaseAsync")[0];
    if (!firstRecover) {
      return makeResult(J011, false, "The game uses in-app purchases but never called iap.getPurchasesAsync(): an interrupted purchase is never granted", {
        autoFix: "After startGameAsync(), call iap.getPurchasesAsync(), grant and save each item, then consumePurchaseAsync(purchaseToken)",
      });
    }
    const passed = !firstBuy || firstRecover.timestamp <= firstBuy.timestamp;
    return makeResult(J011, passed,
      passed
        ? "iap.getPurchasesAsync() ran before any new purchase"
        : `First purchase at ${firstBuy.timestamp}ms came before iap.getPurchasesAsync() at ${firstRecover.timestamp}ms`,
      { autoFix: "After startGameAsync(), call iap.getPurchasesAsync(), grant and save each item, then consumePurchaseAsync(purchaseToken)" }
    );
  },
};

const J012: ComplianceRule = {
  id: "J-012",
  platform: "jest",
  severity: "FAIL",
  description: "Every recovered or completed purchase is consumed",
  check: (logs) => {
    const owed = new Set<string>();
    for (const l of logs) {
      if (l.type !== "result" || l.success !== true) continue;
      if (l.method === "iap.getPurchasesAsync" || l.method === "iap.purchaseAsync") {
        for (const token of purchaseTokens(l.result)) owed.add(token);
      }
    }
    if (owed.size === 0) {
      return makeResult(J012, true, `No purchase to consume in this session ${NOT_APPLICABLE_MARKER}`);
    }
    const consumed = new Set(
      allCalls(logs, "iap.consumePurchaseAsync")
        .map((c) => {
          const arg = firstArg(c);
          if (typeof arg === "string") return arg;
          return isRecord(arg) && typeof arg.purchaseToken === "string" ? arg.purchaseToken : undefined;
        })
        .filter((t): t is string => !!t)
    );
    const unconsumed = [...owed].filter((t) => !consumed.has(t));
    const passed = unconsumed.length === 0;
    return makeResult(J012, passed,
      passed
        ? `All ${owed.size} purchase(s) were consumed`
        : `${unconsumed.length} of ${owed.size} purchase(s) never consumed: Jest keeps returning them and the player can be granted twice`,
      {
        details: passed ? undefined : `Unconsumed purchase token(s): ${unconsumed.join(", ")}`,
        autoFix: "Grant and save the item, then call iap.consumePurchaseAsync(purchaseToken) for every purchase",
      }
    );
  },
};

const J013: ComplianceRule = {
  id: "J-013",
  platform: "jest",
  severity: "FAIL",
  description: "A subscription the player holds is never offered again",
  check: (logs) => {
    const subscribes = allCalls(logs, "iap.subscribeAsync").sort(byTime);
    if (subscribes.length === 0) {
      return makeResult(J013, true, `No subscription offered ${NOT_APPLICABLE_MARKER}`);
    }
    for (const sub of subscribes) {
      const productId = firstArg(sub);
      if (failedWith(resultOf(logs, sub), "IAP_ALREADY_PURCHASED")) {
        return makeResult(J013, false, "subscribeAsync() was called for a plan the player already holds", {
          details: `subscribeAsync(${String(productId)}) at ${sub.timestamp}ms was rejected with IAP_ALREADY_PURCHASED`,
          autoFix: "Read iap.getSubscriptionsAsync() at launch and hide the offer for any plan whose isActive is true",
        });
      }
      const reads = logs
        .filter((l) =>
          l.type === "result" && l.success === true && l.timestamp <= sub.timestamp &&
          (l.method === "iap.getSubscriptionsAsync" || l.method === "iap.getSubscriptionStatusAsync")
        )
        .sort(byTime);
      if (reads.length === 0) {
        return makeResult(J013, false, "A subscription was offered before the game read which plans the player holds", {
          details: `subscribeAsync(${String(productId)}) at ${sub.timestamp}ms had no getSubscriptionsAsync() result before it`,
          autoFix: "Read iap.getSubscriptionsAsync() at launch and hide the offer for any plan whose isActive is true",
        });
      }
      const latest = reads[reads.length - 1];
      const held = Array.isArray(latest.result) && latest.result.some(
        (s) => isRecord(s) && s.productId === productId && s.isActive === true
      );
      if (held) {
        return makeResult(J013, false, "subscribeAsync() was called for a plan the player already holds", {
          details: `getSubscriptionsAsync() reported ${String(productId)} active before subscribeAsync at ${sub.timestamp}ms`,
          autoFix: "Read iap.getSubscriptionsAsync() at launch and hide the offer for any plan whose isActive is true",
        });
      }
    }
    return makeResult(J013, true, "Subscriptions were only offered after checking which plans the player holds");
  },
};

/** How long after exitRequested a save still counts as made by the handler. */
const JEST_EXIT_SAVE_WINDOW_MS = 1000;

const J014: ComplianceRule = {
  id: "J-014",
  platform: "jest",
  severity: "WARN",
  description: "Progress saved in the exitRequested handler",
  check: (logs) => {
    const exits = allEvents(logs, "exitRequested").sort(byTime);
    if (exits.length > 0) {
      const unsaved = exits.filter((e) => !logs.some(
        (l) => isDataWrite(l) && l.timestamp >= e.timestamp && l.timestamp <= e.timestamp + JEST_EXIT_SAVE_WINDOW_MS
      ));
      const passed = unsaved.length === 0;
      return makeResult(J014, passed,
        passed
          ? "The game saved progress when exitRequested fired"
          : `exitRequested fired ${unsaved.length} time(s) with no save after it: progress is lost when the player leaves`,
        {
          details: passed ? undefined : unsaved.map((e) => `exitRequested at ${e.timestamp}ms`).join("; "),
          autoFix: "In Yes2SDK.on('exitRequested', ...) write progress synchronously (data.setString); async work started there is not awaited",
        }
      );
    }
    const handler = logs.some((l) =>
      l.type === "call" && (l.method === "on" || l.method === "once") && firstArg(l) === "exitRequested"
    );
    if (handler) {
      return makeResult(J014, true,
        `exitRequested handler registered; fire Exit Request from the Inspector Tools panel to prove it saves ${NOT_APPLICABLE_MARKER}`
      );
    }
    if (!findCall(logs, "startGameAsync")) {
      return makeResult(J014, true, `startGameAsync() not seen yet ${NOT_APPLICABLE_MARKER}`);
    }
    return makeResult(J014, false, "No exitRequested handler registered: nothing saves progress when the player leaves", {
      autoFix: "Register Yes2SDK.on('exitRequested', ...) (Unity OnExitRequested, Defold on_exit_requested) and save synchronously inside it",
    });
  },
};

// ── All Rules ─────────────────────────────────────────────────────────

const UNIVERSAL_RULES: ComplianceRule[] = [U001, U002, U003, U004, U005, U006, U007, U008];

const PLATFORM_RULES: Record<string, ComplianceRule[]> = {
  poki: [P001, P002, P003, P004, P005, P006, P007, P008, P009, P010, P011, P012],
  crazygames: [CG001, CG002, CG003, CG004, CG005, CG006, CG007, CG008, CG009, CG010, CG011, CG012, CG013, CG014],
  yandex: [Y001, Y002, Y003, Y004, Y005, Y006, Y007, Y008, Y009, Y010, Y011, Y012, Y013, Y014, Y015, Y016],
  gamedistribution: [GD001, GD002, GD003, GD004, GD005, GD006],
  youtube: [YT001, YT002, YT003],
  jest: [J001, J002, J003, J004, J005, J006, J007, J008, J009, J010, J011, J012, J013, J014],
  debug: [],
};

/** The rules specific to `platform` (universal rules excluded), in rule order. */
export function platformComplianceRules(platform: string): ComplianceRule[] {
  return PLATFORM_RULES[platform] ?? [];
}

// ── Runner ────────────────────────────────────────────────────────────

export function runComplianceChecks(
  logs: LogEntry[],
  platform: InspectorPlatform
): ComplianceResult[] {
  const rules = [
    ...UNIVERSAL_RULES,
    ...(PLATFORM_RULES[platform] ?? []),
  ];
  return rules.map((rule) => rule.check(logs));
}

// ── MCP accessors (generated by sync-compliance.mjs, not in upstream) ──

/** Rules a build must satisfy for `platform` (universal + platform-specific). */
export function getRulesForPlatform(platform: string): ComplianceRule[] {
  return [...UNIVERSAL_RULES, ...(PLATFORM_RULES[platform] ?? [])];
}

/** Every rule once, deduped by id (universal first, then per-platform). */
export function getAllRules(): ComplianceRule[] {
  const seen = new Set<string>();
  const out: ComplianceRule[] = [];
  for (const rule of [...UNIVERSAL_RULES, ...Object.values(PLATFORM_RULES).flat()]) {
    if (seen.has(rule.id)) continue;
    seen.add(rule.id);
    out.push(rule);
  }
  return out;
}

/** A single rule by id (e.g. "P-002"), or undefined if unknown. */
export function getRuleById(id: string): ComplianceRule | undefined {
  return getAllRules().find((rule) => rule.id === id);
}

/** autoFix guidance authored in each rule's check(), keyed by rule id. */
export const RULE_FIXES: Record<string, string[]> = {
  "U-001": [
    "Call Yes2SDK.initializeAsync() before any other SDK method"
  ],
  "U-002": [
    "Call Yes2SDK.setLoadingProgress(0-100) during asset loading, ending with setLoadingProgress(100) before startGameAsync()"
  ],
  "U-003": [
    "Wrap SDK calls in try/catch and handle errors gracefully"
  ],
  "U-004": [
    "Call gameplayStop() or handle beforeAd callback before showing ads"
  ],
  "U-005": [
    "Call game.gameplayStart() when gameplay begins and game.gameplayStop() when it ends (level complete, pause, etc.)"
  ],
  "U-006": [
    "Await initializeAsync() before calling any ad methods"
  ],
  "U-007": [
    "In the adViewed callback, immediately grant the reward before any async operations"
  ],
  "U-008": [
    "Call startGameAsync() after loading completes, before showing any ads"
  ],
  "P-001": [
    "Call startGameAsync() after loading completes — Poki uses this to signal gameLoadingFinished"
  ],
  "P-002": [
    "Call game.gameplayStart() before showing any ads — Poki Inspector flags this",
    "Call game.gameplayStart() before any ad requests"
  ],
  "P-003": [
    "Call game.gameplayStop() before every commercialBreak/interstitial call"
  ],
  "P-004": [
    "Wait at least 30 seconds after game start before showing the first ad"
  ],
  "P-005": [
    "Space interstitial ads at least 60 seconds apart"
  ],
  "P-006": [
    "Provide a beforeAd callback that pauses game logic and mutes audio"
  ],
  "P-007": [
    "Remove all external script tags — Poki CSP blocks them. Inline all code or bundle it.",
    "Ensure no <script src='http...'> tags except Poki's own SDK"
  ],
  "P-008": [
    "Set canvas to width:100%; height:100% with overflow:hidden on body"
  ],
  "P-009": [
    "Keep index.json and index.html in sync — Poki production uses index.json"
  ],
  "P-010": [
    "Remove PokiSDK.init() call — the platform handles initialization"
  ],
  "P-011": [
    "Use callbacks.noFill() for ad rejection/no-fill, not onError"
  ],
  "P-012": [
    "On Poki, use localStorage only. Cloud data methods return FeatureNotSupported."
  ],
  "CG-001": [
    "Call initializeAsync() — CG adapter passes wrapper options automatically",
    "Ensure CG adapter passes { wrapper: { engine, sdkVersion } } to SDK.init()"
  ],
  "CG-002": [
    "Call game.gameplayStart() and game.gameplayStop() — CG QA tool checks for this"
  ],
  "CG-003": [
    "Mute audio when adStarted fires, restore on adFinished/adError"
  ],
  "CG-004": [
    "Call sdk.game.happytime() on positive moments (level complete, high score)"
  ],
  "CG-005": [
    "Call gameplayStop() before requesting midgame ads — CG rejects ads during active gameplay"
  ],
  "CG-006": [
    "Space interstitial ads at least 3 minutes apart — CG enforces this server-side"
  ],
  "CG-007": [
    "Register sdk.game.addEventListener('settingsChange', handler) to handle mute/unmute from CG player"
  ],
  "CG-008": [
    "Call setLoadingProgress() during loading and startGameAsync() when ready — these map to CG loadingStart/loadingStop"
  ],
  "CG-009": [
    "Ensure Yes2SDKPlatformInit.jslib postset creates the wrapper — CG replaces HTML on upload"
  ],
  "CG-010": [
    "Poll for window.CrazyGames.SDK with 100ms intervals, 15s timeout, then CDN fallback",
    "Poll for window.CrazyGames.SDK with 100ms intervals, 15s timeout"
  ],
  "CG-011": [
    "If SDK polling fails, load from https://sdk.crazygames.com/crazygames-sdk-v3.js as fallback"
  ],
  "CG-012": [
    "In jslib files, always use window.__y2, never bare __y2 (Emscripten resolves bare __y2 to empty object)"
  ],
  "CG-013": [
    "CG banner sizes: Leaderboard_728x90, Medium_300x250, Mobile_320x50, Main_468x60, Large_Mobile_320x100"
  ],
  "CG-014": [
    "Map CG adError codes: 'unfilled'/'adblock' → noFill, others → adDismissed"
  ],
  "Y-001": [
    "Call initializeAsync() — the Yandex adapter calls YaGames.init() internally"
  ],
  "Y-002": [
    "Provide onOpen and onClose callbacks for showFullscreenAdv — missing onClose means game never resumes"
  ],
  "Y-003": [
    "Handle the onRewarded callback in showRewardedVideo — it fires BEFORE onClose"
  ],
  "Y-004": [
    "Consider adding ysdk.adv.showBannerAdv() for additional sticky banner revenue"
  ],
  "Y-005": [
    "Use ysdk.environment.i18n.lang for localization, not navigator.language"
  ],
  "Y-006": [
    "Use getPlayer({ scopes: false }) initially, only request scopes when auth is needed"
  ],
  "Y-007": [
    "Call startGameAsync() (triggers LoadingAPI.ready()) before any ad calls"
  ],
  "Y-008": [
    "In onClose(wasShown), when wasShown=false treat as no-fill (ad was not shown)"
  ],
  "Y-009": [
    "Call initializeAsync() — Yandex adapter preloads player.getData() during init",
    "Yandex adapter calls player.getData() during init to enable synchronous reads"
  ],
  "Y-010": [
    "Debounce data saves (500ms recommended) and skip if data hasn't changed (JSON snapshot comparison)"
  ],
  "Y-011": [
    "Register ysdk.on('game_api_pause') and ysdk.on('game_api_resume') to handle tab focus changes and ad overlays"
  ],
  "Y-012": [
    "Call startGameAsync() after loading — Yandex adapter calls LoadingAPI.ready() internally"
  ],
  "Y-013": [
    "Call game.gameplayStart() and game.gameplayStop() — Yandex uses these for analytics and ad timing"
  ],
  "Y-014": [
    "Use ysdk.auth.openAuthDialog() for auth, then re-fetch player via ysdk.getPlayer() after"
  ],
  "Y-015": [
    "Debounce cloud saves with at least 500ms delay to avoid Yandex rate limits"
  ],
  "Y-016": [
    "Load Yandex SDK from /sdk.js (relative path) — on Yandex Games this resolves to their CDN"
  ],
  "GD-001": [
    "Call initializeAsync() — GD adapter sets window.GD_OPTIONS before loading the SDK script"
  ],
  "GD-002": [
    "Call initializeAsync() with a valid GD gameId configured",
    "Ensure GD adapter includes a valid gameId in GD_OPTIONS — without it, ads won't serve"
  ],
  "GD-003": [
    "Handle SDK_GAME_PAUSE event: mute audio and stop game logic when ads are shown"
  ],
  "GD-004": [
    "Handle SDK_GAME_START event: resume game logic and restore audio after ads finish"
  ],
  "GD-005": [
    "Handle SDK_REWARDED_WATCH_COMPLETE event to grant rewards after rewarded ad view"
  ],
  "GD-006": [
    "GD ad flow is event-based via GD_OPTIONS.onEvent — dispatch to correct game logic based on event.name"
  ],
  "YT-001": [
    "Call initializeAsync() to initialize the YouTube Playables SDK"
  ],
  "YT-002": [
    "Handle play/pause/stop lifecycle events from the YouTube player"
  ],
  "YT-003": [
    "Remove calls to APIs blocked by YouTube's sandbox (window.open, document.cookie, etc.)",
    "Avoid APIs blocked by YouTube's sandbox (window.open, document.cookie, localStorage, etc.)"
  ],
  "J-001": [
    "Call startGameAsync() the moment the game is interactive. On Jest it calls markGameLoaded"
  ],
  "J-002": [
    "Call setLoadingProgress(n) at least every 15 seconds until startGameAsync(), and load the rest of the game after it"
  ],
  "J-003": [
    "Hide rewarded-ad offers on Jest (ads.isRewardedSupported() is false there) and never gate progression on a rewarded ad"
  ],
  "J-004": [
    "Skip ad requests on Jest: check ads.isInterstitialSupported() and ads.isBannerSupported() first"
  ],
  "J-005": [
    "Save the guest's progress through Yes2SDK.data (and confirm it with flushAsync or setStringAsync) before showRegistrationPrompt() or signInAsync()"
  ],
  "J-006": [
    "Check auth.isAuthenticated() first and only show the registration prompt while it is false"
  ],
  "J-007": [
    "Schedule notifications only when auth.isAuthenticated() is true; a guest gets PLAYER_NOT_AUTHENTICATED"
  ],
  "J-008": [
    "Offer subscriptions only when auth.isAuthenticated() is true; prompt a guest to register first"
  ],
  "J-009": [
    "When the player is registered, schedule one notification per day with scheduledInDays 1 to 7 and a stable id per day"
  ],
  "J-010": [
    "Give every notification an image: imageAssetId (approved on Jest) or imageDataUrl, not both"
  ],
  "J-011": [
    "After startGameAsync(), call iap.getPurchasesAsync(), grant and save each item, then consumePurchaseAsync(purchaseToken)"
  ],
  "J-012": [
    "Grant and save the item, then call iap.consumePurchaseAsync(purchaseToken) for every purchase"
  ],
  "J-013": [
    "Read iap.getSubscriptionsAsync() at launch and hide the offer for any plan whose isActive is true"
  ],
  "J-014": [
    "In Yes2SDK.on('exitRequested', ...) write progress synchronously (data.setString); async work started there is not awaited",
    "Register Yes2SDK.on('exitRequested', ...) (Unity OnExitRequested, Defold on_exit_requested) and save synchronously inside it"
  ]
};

/** The fix guidance for a rule id (empty when the rule authored none). */
export function getRuleFixes(id: string): string[] {
  return RULE_FIXES[id] ?? [];
}
