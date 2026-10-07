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
  summary: "Each item is checked by hand: an Inspector event log cannot prove it.",
  items: [
    "Save as a guest before any login prompt: write progress through `Yes2SDK.data` and confirm it (`setStringAsync` or `flushAsync`) before `auth.signInAsync()` or `auth.showRegistrationPrompt()`. Registration can reload the game.",
    "Schedule D1 to D7 notifications with images for registered players: one `notifications.scheduleAsync` per day with `scheduledInDays` 1 to 7, a stable `id` per day, and an image through `imageAssetId` or `imageDataUrl`. Guests get `PLAYER_NOT_AUTHENTICATED`, so schedule after the player registers.",
    "Recover and complete incomplete purchases at startup: after `initializeAsync`, call `iap.getPurchasesAsync()`, grant and save each item, then `iap.consumePurchaseAsync(purchaseToken)`; repeat until the list is empty (Jest returns at most 50 per call). Verify `signedRequest` on your server before granting anything of value.",
    "Never re-offer a subscription the player already holds: read `iap.getSubscriptionsAsync()` at launch, grant access when `isActive` is true and hide that offer. A repeat `subscribeAsync` fails with `IAP_ALREADY_PURCHASED`.",
    "Show the registration prompt to guests only (`auth.isAuthenticated()` is false; a registered player gets `INVALID_OPERATION`). When the game shows its own prompt, tell the Yes2Games team so they turn off Jest's Automatic login reminders for the game, so the player does not get two prompts.",
    "Save in `exitRequested`: `Yes2SDK.on(\"exitRequested\", ...)` (Unity `OnExitRequested`, Defold `on_exit_requested`) and write synchronously inside the handler. Yes2SDK flushes player data right after it returns; async work started there is not awaited.",
    "Report loading progress with `setLoadingProgress` and call `startGameAsync()` (Jest's `markGameLoaded`) only when the game is playable. In Jest's Manual loading-screen mode Jest sends the player home after 15 s without a progress update, and nothing can report progress while the engine is still downloading, so use Jest's Auto loading-screen mode (the default, recommended for now).",
    "Load every asset by a relative path: no root-relative (`/assets/...`) or absolute host URLs.",
    "Read launch data from the entry payload (`session.getEntryPointData()`), never from URL query parameters: Jest does not pass game data through the page URL.",
    "Do not rely on ads: Jest has no in-game ads. Every interstitial and rewarded request ends at once without showing an ad: JS gets `noFill` then `afterAd` (Unity: `onError` with `NoFill`; Defold: `no_fill` then `after_ad`). No progression may depend on a rewarded ad.",
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
