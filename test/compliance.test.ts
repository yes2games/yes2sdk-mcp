import { describe, it, expect } from "vitest";
import { runComplianceChecks } from "../src/lib/compliance.js";
import type { LogEntry, ComplianceResult } from "../src/lib/inspector-types.js";

const result = (results: ComplianceResult[], ruleId: string): ComplianceResult => {
  const r = results.find((x) => x.ruleId === ruleId);
  if (!r) throw new Error(`rule ${ruleId} not present in results`);
  return r;
};

/** A lone interstitial call with no init / gameplayStart / gameplayStop. */
const BAD_LOG: LogEntry[] = [
  {
    id: "1",
    timestamp: 1000,
    type: "call",
    method: "ads.showInterstitial",
  },
];

/** init -> gameplayStart -> gameplayStop -> interstitial, properly ordered. */
const GOOD_LOG: LogEntry[] = [
  { id: "1", timestamp: 100, type: "call", method: "initializeAsync" },
  { id: "2", timestamp: 200, type: "call", method: "game.gameplayStart" },
  { id: "3", timestamp: 300, type: "call", method: "game.gameplayStop" },
  { id: "4", timestamp: 400, type: "call", method: "ads.showInterstitial" },
];

describe("runComplianceChecks — bad Poki log", () => {
  it("FAILs P-002, P-003 and U-001", () => {
    const results = runComplianceChecks(BAD_LOG, "poki");

    const p002 = result(results, "P-002");
    expect(p002.passed).toBe(false);
    expect(p002.severity).toBe("FAIL");

    const p003 = result(results, "P-003");
    expect(p003.passed).toBe(false);
    expect(p003.severity).toBe("FAIL");

    const u001 = result(results, "U-001");
    expect(u001.passed).toBe(false);
    expect(u001.severity).toBe("FAIL");
  });
});

describe("runComplianceChecks — gameplay-ordered Poki log", () => {
  it("PASSes P-002 and P-003", () => {
    const results = runComplianceChecks(GOOD_LOG, "poki");

    expect(result(results, "P-002").passed).toBe(true);
    expect(result(results, "P-003").passed).toBe(true);
    expect(result(results, "U-001").passed).toBe(true);
  });
});
