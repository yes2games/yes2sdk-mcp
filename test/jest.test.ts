import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { SUPPORTED_PLATFORMS } from "../src/lib/platforms.js";
import { parseCapabilityMatrix } from "../src/tools/capabilities.js";
import { readDocBySlug } from "../src/lib/docs.js";
import { evaluateBuild } from "../src/lib/build-checks.js";
import { getLaunchChecklist, hasPlatformRules } from "../src/lib/launch-checklists.js";
import { getRuleById, getRulesForPlatform } from "../src/lib/compliance.js";

const JEST_RULE_IDS = Array.from({ length: 14 }, (_, i) => `J-${String(i + 1).padStart(3, "0")}`);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOODBUILD = path.join(HERE, "fixtures", "goodbuild");

let client: Client;

function textOf(res: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");
}

function isError(res: Awaited<ReturnType<Client["callTool"]>>): boolean {
  return (res as { isError?: boolean }).isError === true;
}

beforeAll(async () => {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  client = new Client({ name: "test", version: "0" });
  await server.connect(serverT);
  await client.connect(clientT);
});

afterAll(async () => {
  await client.close();
});

describe("jest platform id", () => {
  it("is a supported platform, appended last", () => {
    expect(SUPPORTED_PLATFORMS[SUPPORTED_PLATFORMS.length - 1]).toBe("jest");
  });

  it("is accepted by every tool that takes a platform", async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [
      { name: "get_platform_capabilities", arguments: { platform: "jest" } },
      { name: "get_platform_requirements", arguments: { platform: "jest" } },
      { name: "get_quickstart", arguments: { platform: "jest" } },
      { name: "validate_integration", arguments: { platform: "jest", eventLogJson: "[]" } },
    ];
    for (const call of calls) {
      const res = await client.callTool(call);
      expect(isError(res), `${call.name} rejected jest: ${textOf(res)}`).toBe(false);
    }
  });

  it("is named in the tool descriptions that enumerate platforms", async () => {
    const { tools } = await client.listTools();
    for (const name of ["get_platform_capabilities", "get_platform_requirements", "get_quickstart"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool?.description, name).toContain("jest");
    }
  });
});

describe("get_platform_capabilities: jest column", () => {
  const expected: Record<string, string> = {
    "Ads: interstitial & rewarded": "None",
    "Ads: banner": "None",
    Analytics: "Partial",
    Session: "Partial",
    Data: "Ready",
    "Player: identity": "Ready",
    "Player: saved data": "Ready",
    Auth: "Ready",
    "Game: lifecycle": "Partial",
    "Game: invite links": "None",
    Banners: "None",
    Friends: "None",
    Score: "None",
    Leaderboard: "None",
    Stats: "None",
    IAP: "Ready",
    Referrals: "Ready",
    Notifications: "Ready",
    "Context: image sharing": "Partial",
    "Config: feature flags": "Partial",
    "Review: rating prompt": "None",
  };

  it("matches the Jest adapter's behaviour, row by row", () => {
    const matrix = parseCapabilityMatrix(readDocBySlug("api/overview") as string);
    expect(matrix.platforms).toContain("jest");
    const actual = Object.fromEntries(matrix.rows.map((r) => [r.module, r.support.jest]));
    expect(actual).toEqual(expected);
  });

  it("has a Context: image sharing row, Partial on Jest only", () => {
    const matrix = parseCapabilityMatrix(readDocBySlug("api/overview") as string);
    const row = matrix.rows.find((r) => r.module === "Context: image sharing");
    for (const p of SUPPORTED_PLATFORMS) {
      expect(row?.support[p], p).toBe(p === "jest" ? "Partial" : "None");
    }
  });

  it("offers notifications on Jest only", () => {
    const matrix = parseCapabilityMatrix(readDocBySlug("api/overview") as string);
    const row = matrix.rows.find((r) => r.module === "Notifications");
    for (const p of SUPPORTED_PLATFORMS) {
      expect(row?.support[p], p).toBe(p === "jest" ? "Ready" : "None");
    }
  });

  it("carries the Jest notes the rows cannot express", async () => {
    const text = textOf(
      await client.callTool({ name: "get_platform_capabilities", arguments: { platform: "jest" } })
    );
    expect(text).toContain("noFill");
    expect(text).toContain("exitRequested");
    expect(text).toContain("1 MB");
    expect(text).toContain("getEntryPointData");
    expect(text).toMatch(/signed player/i);
    expect(text).toMatch(/sharing an image/i);
    expect(text).toMatch(/isSubscriptionSupported\(\)` is `true` on Jest/);
  });
});

describe("launch checklists", () => {
  it("has a 6-item manual Jest checklist and none invented for other platforms", () => {
    expect(getLaunchChecklist("jest")?.items).toHaveLength(6);
    for (const p of SUPPORTED_PLATFORMS.filter((x) => x !== "jest")) {
      expect(getLaunchChecklist(p), p).toBeUndefined();
    }
  });

  it("knows Jest has automated platform rules J-001 to J-014, like Poki", () => {
    expect(hasPlatformRules("jest")).toBe(true);
    expect(hasPlatformRules("poki")).toBe(true);
    const jestOnly = getRulesForPlatform("jest").filter((r) => r.platform === "jest");
    expect(jestOnly.map((r) => r.id)).toEqual(JEST_RULE_IDS);
  });

  it("every rule id the Jest checklist points at exists and is a Jest rule", () => {
    const cited = new Set(
      (getLaunchChecklist("jest")?.items ?? []).flatMap((item) => item.match(/J-\d{3}/g) ?? [])
    );
    expect(cited.size).toBeGreaterThan(0);
    for (const id of cited) {
      expect(getRuleById(id)?.platform, id).toBe("jest");
    }
  });

  it("drops the checklist items the J- rules now automate", () => {
    const items = (getLaunchChecklist("jest")?.items ?? []).join("\n");
    expect(items).not.toMatch(/notifications\.scheduleAsync/);
    expect(items).not.toMatch(/getSubscriptionsAsync/);
    expect(items).not.toMatch(/Yes2SDK\.on\(\\?"exitRequested/);
    expect(items).not.toMatch(/Do not rely on ads/);
  });
});

describe("get_platform_requirements: jest", () => {
  it("lists the automated universal and J- rules, then the manual checklist", async () => {
    const text = textOf(
      await client.callTool({ name: "get_platform_requirements", arguments: { platform: "jest" } })
    );
    expect(text).not.toMatch(/pending/i);
    expect(text).toMatch(/Automated rules \(universal and Jest-specific, run by validate_integration\)/);
    expect(text).toMatch(/U-001 \[/);
    for (const id of JEST_RULE_IDS) {
      expect(text, id).toMatch(new RegExp(`^- ${id} \\[(FAIL|WARN)\\]: `, "m"));
    }
    for (let i = 1; i <= 6; i++) {
      expect(text, `checklist item ${i}`).toMatch(new RegExp(`^${i}\\. \\[manual\\] `, "m"));
    }
    expect(text).not.toMatch(/^7\. \[manual\] /m);
    expect(text).toMatch(/under 10 seconds/);
    expect(text).toContain("exitRequested");
    expect(text).toContain("getEntryPointData");
    expect(text).toContain("getPurchasesAsync");
    expect(text).toMatch(/tell the Yes2Games team so they turn off Jest's Automatic login reminders/);
    expect(text).not.toMatch(/Overview settings on the Yes2Games Dashboard/);
    expect(text).toMatch(/15 s/);
  });

  it("leaves other platforms' output unchanged (no pending notice)", async () => {
    const text = textOf(
      await client.callTool({ name: "get_platform_requirements", arguments: { platform: "poki" } })
    );
    expect(text).not.toMatch(/pending/i);
    expect(text).not.toMatch(/\[manual\]/);
  });
});

describe("validate_integration: jest runs its J- rules", () => {
  it("behavioral mode runs the J- rules and points at the manual checklist", async () => {
    const text = textOf(
      await client.callTool({
        name: "validate_integration",
        arguments: { platform: "jest", eventLogJson: "[]" },
      })
    );
    expect(text).not.toMatch(/PENDING/);
    expect(text).not.toMatch(/not a platform pass/i);
    const rulesRan = Number(text.match(/COMPLIANCE CHECKS \((\d+) rules/)?.[1]);
    expect(rulesRan).toBe(getRulesForPlatform("jest").length);
    // An empty log never called startGameAsync().
    expect(text).toMatch(/\[J-001\]/);
    expect(text).toMatch(/VERDICT: \d+ blocking FAIL\(s\)/);
    expect(text).toContain('get_platform_requirements(platform: "jest")');
  });

  it("static-only mode gives a normal verdict plus the checklist pointer", async () => {
    const text = textOf(
      await client.callTool({
        name: "validate_integration",
        arguments: { platform: "jest", buildPath: GOODBUILD },
      })
    );
    expect(text).toContain("Static build checks for platform: Jest.");
    expect(text).not.toMatch(/not a platform pass/i);
    expect(text).toContain("VERDICT: no blocking FAILs. Review any WARNs above.");
    expect(text).toContain('get_platform_requirements(platform: "jest")');
  });

  it("other platforms get no checklist pointer", async () => {
    const text = textOf(
      await client.callTool({
        name: "validate_integration",
        arguments: { platform: "poki", buildPath: GOODBUILD },
      })
    );
    expect(text).not.toContain("get_platform_requirements(");
  });

  it("flags a rewarded ad on jest as J-003", async () => {
    const text = textOf(
      await client.callTool({
        name: "validate_integration",
        arguments: {
          platform: "jest",
          eventLogJson: JSON.stringify([
            { id: "1", timestamp: 1000, type: "call", method: "ads.showRewarded" },
          ]),
        },
      })
    );
    expect(text).toMatch(/FAIL[\s\S]*\[J-003\]/);
    expect(text).toMatch(/VERDICT: \d+ blocking FAIL\(s\)/);
  });

  it("get_compliance_rule serves a Jest rule by id", async () => {
    const res = await client.callTool({ name: "get_compliance_rule", arguments: { ruleId: "j-001" } });
    expect(isError(res), textOf(res)).toBe(false);
    expect(textOf(res)).toMatch(/J-001/);
    expect(textOf(res)).toMatch(/startGameAsync/);
  });

  it("labels jest in the static checks", () => {
    const findings = evaluateBuild({ indexHtmlContent: null, fileBasenames: [], sdkBundled: true }, "jest");
    expect(findings[0]?.message).toBe("Static build checks for platform: Jest.");
  });
});

describe("get_quickstart / search_docs: jest", () => {
  it("returns the Jest guide", async () => {
    const text = textOf(await client.callTool({ name: "get_quickstart", arguments: { platform: "jest" } }));
    expect(text).toMatch(/^# Yes2SDK for Jest/m);
    expect(text).toContain("exitRequested");
    expect(text).toContain("OnExitRequested");
    expect(text).toContain("on_exit_requested");
    expect(text).toMatch(/Common Rejection Reasons/);
  });

  it("is indexed by search_docs", async () => {
    const text = textOf(
      await client.callTool({ name: "search_docs", arguments: { query: "jest exitRequested" } })
    );
    expect(text).toContain("quickstart-jest");
  });
});

describe("troubleshoot: jest symptoms", () => {
  const cases: Array<[string, RegExp]> = [
    ["rewarded ad always returns noFill on jest", /Jest has no in-game ads/],
    ["player progress lost when the player exits the game on jest", /exitRequested/],
    ["jest loading screen stuck, game exits to home after 15 seconds", /Auto loading-screen mode/],
    ["url params are empty on jest, cannot read query string", /getEntryPointData/],
    ["showRegistrationPrompt throws INVALID_OPERATION", /already registered/],
  ];
  for (const [symptom, pattern] of cases) {
    it(`maps "${symptom}"`, async () => {
      const text = textOf(await client.callTool({ name: "troubleshoot", arguments: { symptom } }));
      expect(text).toMatch(pattern);
    });
  }
});

describe("jest ads: engine-specific no-fill behaviour", () => {
  it("the quickstart gives Unity its onError(NoFill) form and Defold its no_fill/after_ad form", () => {
    const doc = readDocBySlug("quickstart-jest") as string;
    expect(doc).toMatch(/Unity: `onError` with `error\.Code == "NoFill"`/);
    expect(doc).toMatch(/`no_fill`.*`after_ad`/);
    expect(doc).not.toMatch(/continue in `afterAd`\.\s*\|/);
  });

  it("ads are automated by J-003 and J-004, not a manual checklist item", () => {
    expect(getRuleById("J-003")?.severity).toBe("FAIL");
    expect(getRuleById("J-004")?.severity).toBe("WARN");
  });

  it("troubleshoot maps a Unity onError NoFill symptom and tells Unity to resume in onError", async () => {
    const text = textOf(
      await client.callTool({
        name: "troubleshoot",
        arguments: { symptom: "rewarded ad never shows on jest, onError NoFill" },
      })
    );
    expect(text).toMatch(/Jest has no in-game ads/);
    expect(text).toMatch(/Unity.*onError.*NoFill/);
  });

  it("overview footnote 9 carries the Unity clause", () => {
    const doc = readDocBySlug("api/overview") as string;
    const fn9 = doc.split("\n").find((l) => l.startsWith("⁹")) ?? "";
    expect(fn9).toMatch(/Unity.*`onError`.*`NoFill`/);
  });
});

describe("vendored module docs agree with the Jest column", () => {
  const stale: Array<[string, RegExp]> = [
    ["api/iap", /no current platform offers subscriptions/],
    ["api/iap", /Subscriptions are not offered anywhere yet/],
    ["api/lifecycle", /Not emitted on the current platforms/],
    ["api/auth", /not offered on any current platform/],
    ["api/referrals", /Not offered on the current platforms/],
  ];
  for (const [slug, pattern] of stale) {
    it(`${slug} no longer says ${pattern}`, () => {
      const doc = readDocBySlug(slug) as string;
      expect(doc).not.toMatch(pattern);
      expect(doc).toMatch(/Jest/);
    });
  }

  it("overview no longer lists Notifications or Referrals as upcoming", () => {
    const doc = readDocBySlug("api/overview") as string;
    expect(doc).not.toContain("**Achievements · Context · Notifications · Tournament**");
    expect(doc).not.toMatch(/Notifications · Referrals · Tournament \| Built in \(Core\) \| Coming soon/);
  });

  it("upcoming.md marks Notifications live on Jest", () => {
    const doc = readDocBySlug("api/upcoming") as string;
    const section = doc.split("## Notifications")[1]?.split("\n## ")[0] ?? "";
    expect(section).toMatch(/\*\*Status:\*\*.*Jest/);
  });
});

describe("round 2 review fixes", () => {
  it("inspector-types carries no dashboard issue reference", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(path.join(HERE, "..", "src", "lib", "inspector-types.ts"), "utf8");
    expect(src).not.toMatch(/#\d{3}/);
  });

  it("the Unity example schedules notifications inside the init callback", () => {
    const doc = readDocBySlug("quickstart-jest") as string;
    const unity = doc.split("```csharp")[1]?.split("```")[0] ?? "";
    const initClose = unity.indexOf("\n});");
    expect(initClose).toBeGreaterThan(0);
    expect(unity.indexOf("Notifications.ScheduleAsync")).toBeLessThan(initClose);
  });

  it("an unparseable event log never reads as a pass", async () => {
    for (const platform of ["jest", "poki"]) {
      const text = textOf(
        await client.callTool({ name: "validate_integration", arguments: { platform, eventLogJson: "not json" } })
      );
      expect(text, platform).toMatch(/VERDICT: no checks ran/);
      expect(text, platform).not.toMatch(/no blocking FAILs/);
    }
  });

  it("validate_integration's description names the Jest rules", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "validate_integration");
    expect(tool?.description).toMatch(/Jest runs its automated rules J-001 to J-014/);
    expect(tool?.description).not.toMatch(/no automated rules yet \(Jest\)/);
  });

  it("get_api_reference serves referrals", async () => {
    const res = await client.callTool({ name: "get_api_reference", arguments: { module: "referrals" } });
    expect(isError(res)).toBe(false);
    expect(textOf(res)).toMatch(/^# Referrals/m);
  });

  it("leaves the login reminder setting to the Yes2Games team", async () => {
    const doc = readDocBySlug("quickstart-jest") as string;
    expect(doc).toMatch(/tell the Yes2Games team so Jest's Automatic login reminders are turned off/);
    const text = textOf(
      await client.callTool({ name: "troubleshoot", arguments: { symptom: "showRegistrationPrompt throws INVALID_OPERATION" } })
    );
    expect(text).toMatch(/tell the Yes2Games team so they turn off Jest's Automatic login reminders/);
    expect(text).not.toMatch(/Overview settings on the Yes2Games Dashboard/);
  });

  it("the quickstart explains that gameplayStart/gameplayStop are still expected", () => {
    const doc = readDocBySlug("quickstart-jest") as string;
    expect(doc).toMatch(/keep calling `game\.gameplayStart\(\)` and `game\.gameplayStop\(\)`/);
  });
});
