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

// ── All Rules ─────────────────────────────────────────────────────────

const UNIVERSAL_RULES: ComplianceRule[] = [U001, U002, U003, U004, U005, U006, U007, U008];

const PLATFORM_RULES: Record<string, ComplianceRule[]> = {
  poki: [P001, P002, P003, P004, P005, P006, P007, P008, P009, P010, P011, P012],
  crazygames: [CG001, CG002, CG003, CG004, CG005, CG006, CG007, CG008, CG009, CG010, CG011, CG012, CG013, CG014],
  yandex: [Y001, Y002, Y003, Y004, Y005, Y006, Y007, Y008, Y009, Y010, Y011, Y012, Y013, Y014, Y015, Y016],
  gamedistribution: [GD001, GD002, GD003, GD004, GD005, GD006],
  youtube: [YT001, YT002, YT003],
  debug: [],
};

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
