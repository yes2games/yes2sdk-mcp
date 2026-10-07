/**
 * Hand-written platform launch checklists.
 *
 * The compliance engine in `compliance.ts` is generated from the dashboard and
 * holds only rules that can be checked automatically from an Inspector event
 * log. A platform can also publish launch requirements that no event log
 * proves (store setup, asset paths, what the game does before a login prompt).
 * Those live here, as manual checklist items, so they never mix with the
 * generated rules and survive every `npm run sync-compliance`.
 *
 * Only platforms with a published launch checklist get an entry. Do not add
 * one for a platform whose rules are already covered by the compliance engine
 * unless that platform publishes a separate checklist of its own.
 */

import { getRulesForPlatform } from "./compliance.js";
import type { SupportedPlatform } from "./platforms.js";

export interface LaunchChecklist {
  /** Display name, e.g. "Jest". */
  platformName: string;
  /** One line on where the checklist comes from and how to use it. */
  summary: string;
  /** Ordered items, each verified by hand before submitting. */
  items: string[];
}

const JEST: LaunchChecklist = {
  platformName: "Jest",
  summary:
    "Each item is checked by hand: an Inspector event log cannot prove it. Everything else on Jest's launch checklist is automated as rules J-001 to J-014 (run them with validate_integration and an Inspector event log).",
  items: [
    "Reach a playable state in under 10 seconds on a real phone: keep the first download small and load the rest after `startGameAsync()`. J-001 checks that `startGameAsync()` (Jest's `markGameLoaded`) is called and J-002 that loading progress never stops for more than 15 s (in Jest's Manual loading-screen mode Jest sends the player home after 15 s without a progress update); the load time itself is measured by hand. Keep the game on Jest's Auto loading-screen mode (the default, recommended for now): the Yes2Games team manages that setting.",
    "Read launch data from the entry payload (`session.getEntryPointData()`), never from URL query parameters: Jest does not pass game data through the page URL.",
    "Nothing points outside Jest: no external links, calls to action or outside sign-up prompts. No haptics either: `performHapticFeedback()` already does nothing on Jest, so remove any other vibration the game triggers.",
    "Verify each purchase's `signedRequest` on your server before granting anything of value. J-011 and J-012 check the order of the calls (`iap.getPurchasesAsync()` at startup, every purchase consumed), not that the grant was verified.",
    "When the game shows its own registration prompt, tell the Yes2Games team so they turn off Jest's Automatic login reminders for the game, so the player does not get two prompts. J-005 and J-006 check that guest progress is saved before the prompt and that only guests see it.",
    "Load every asset by a relative path: `index.html` at the zip root and no root-relative (`/assets/...`) or absolute host URLs, because Jest serves games from a sub-path. The dashboard refuses a Jest bundle with root-absolute paths at upload; check the rest by hand.",
  ],
};

const LAUNCH_CHECKLISTS: Partial<Record<SupportedPlatform, LaunchChecklist>> = {
  jest: JEST,
};

/** The hand-written launch checklist for `platform`, if it publishes one. */
export function getLaunchChecklist(platform: string): LaunchChecklist | undefined {
  return (LAUNCH_CHECKLISTS as Record<string, LaunchChecklist | undefined>)[platform];
}

/**
 * True when the generated compliance engine has at least one rule specific to
 * `platform` (universal rules do not count). Derived rather than flagged, so a
 * platform's "rules pending" notice disappears on the first sync that brings
 * its rules in.
 */
export function hasPlatformRules(platform: string): boolean {
  return getRulesForPlatform(platform).some((rule) => rule.platform === platform);
}
