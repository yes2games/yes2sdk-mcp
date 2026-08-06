import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface Symptom {
  /** Short id for the problem. */
  id: string;
  /** One-line description of what the developer sees. */
  title: string;
  /** Lowercase match terms; any substring hit in the reported symptom scores. */
  keywords: string[];
  /** The root cause, then the ordered fix. */
  cause: string;
  fix: string[];
}

/**
 * Curated common-failure catalog. These map observed errors to the tool/step
 * that resolves them; they reference other tools (never pinned versions), so
 * they do not drift with SDK releases.
 */
export const SYMPTOMS: Symptom[] = [
  {
    id: "unity-namespace-missing",
    title: "Unity: \"The type or namespace name 'Yes2SDK' could not be found\"",
    keywords: ["namespace", "yes2sdk could not be found", "type or namespace", "using yes2sdk", "cs0246", "namespace not found"],
    cause: "The UPM package is not installed (or the project never imported it), so the Yes2SDK namespace does not exist at compile time.",
    fix: [
      "Run detect_sdk(projectPath) to confirm the package is missing.",
      "Run get_install_instructions('unity') and add the package via Package Manager > Add package from git URL.",
      "Complete the post-install step: Yes2SDK > Build Window > Install Template (builds fail without it).",
    ],
  },
  {
    id: "defold-require-fails",
    title: "Defold: require \"yes2sdk.yes2sdk\" fails / module not found",
    keywords: ["require", "yes2sdk.yes2sdk", "module not found", "could not load", "defold dependency"],
    cause: "The native extension dependency is not declared in game.project, or Fetch Libraries has not run.",
    fix: [
      "Run get_install_instructions('defold') for the exact dependency URL.",
      "Add dependencies#0 = the tagged release archive under [project] in game.project.",
      "Run Project > Fetch Libraries in the Defold editor.",
    ],
  },
  {
    id: "js-window-undefined",
    title: "JS/HTML5: window.Yes2SDK is undefined",
    keywords: ["window.yes2sdk", "undefined", "is not defined", "cannot read", "runtime not loaded", "sdk undefined"],
    cause: "The web runtime is injected by the Yes2Games dashboard at upload time. It is not present when running the build locally or before upload.",
    fix: [
      "Do not import a package at build time — there is none. See get_install_instructions('js').",
      "Upload the build to the dashboard; the runtime is injected before your game scripts.",
      "Guard calls behind a feature check (e.g. if (window.Yes2SDK) { ... }) so local runs do not crash.",
    ],
  },
  {
    id: "unity-build-guard",
    title: "Unity: build fails with Yes2SDKBuildGuard / template not installed",
    keywords: ["buildguard", "build guard", "install template", "setup pending", "template not", "build fails"],
    cause: "The Yes2SDK WebGL template was never copied into the project; Yes2SDKBuildGuard blocks builds without it.",
    fix: [
      "Open Yes2SDK > Build Window and click Install Template.",
      "Confirm the Build Window status reads 'Ready' (not 'Setup Pending'), then rebuild.",
    ],
  },
  {
    id: "defold-noop-editor",
    title: "Defold: SDK functions do nothing / warn in the editor",
    keywords: ["no-op", "noop", "nothing happens", "editor", "stub", "console warning", "not running"],
    cause: "The native extension only compiles in Defold's cloud build for HTML5. A plain desktop Build produces no-op stubs.",
    fix: [
      "Bundle for HTML5 (Project > Bundle > HTML5 Application) to exercise the real native functions.",
      "Editor/desktop builds intentionally no-op with a console warning — this is expected, not a bug.",
    ],
  },
  {
    id: "reward-not-granted",
    title: "Rewarded ad finished but the player got no reward",
    keywords: ["reward", "not granted", "rewarded", "adviewed", "no reward", "reward missing"],
    cause: "The reward must be granted in the adViewed callback. Granting elsewhere (e.g. after an await) drops it.",
    fix: [
      "Grant the reward immediately inside the adViewed callback, before any async work.",
      "See get_compliance_rule('U-007') for the exact rule and fix.",
    ],
  },
  {
    id: "ads-before-gameplaystop",
    title: "Platform rejects the build: ads shown without gameplayStop/gameplayStart",
    keywords: ["gameplaystop", "gameplaystart", "ad without", "rejected", "interstitial rejected", "commercial break"],
    cause: "Platforms require the game to pause gameplay around ads via gameplayStart()/gameplayStop().",
    fix: [
      "Call game.gameplayStart() when play begins and game.gameplayStop() before showing an ad.",
      "See get_compliance_rule('P-002') and get_compliance_rule('P-003') for Poki specifics.",
      "Validate with validate_integration(platform, eventLogJson) using an exported Inspector log.",
    ],
  },
  {
    id: "sdk-not-bundled",
    title: "Build rejected: Yes2SDK not bundled / external <script> tags",
    keywords: ["not bundled", "external script", "script src", "cdn", "http script", "build rejected"],
    cause: "Platforms block builds that load external scripts or do not bundle the SDK into the JS.",
    fix: [
      "Run validate_integration(platform, buildPath) on the extracted build to list the offending files.",
      "Ensure the SDK and all dependencies are bundled; remove <script src=\"http...\"> tags.",
    ],
  },
  {
    id: "init-missing",
    title: "Nothing works / first SDK call throws — initializeAsync never called",
    keywords: ["initialize", "initializeasync", "not initialized", "before init", "init missing", "first call fails"],
    cause: "initializeAsync() must complete before any other SDK method.",
    fix: [
      "Await initializeAsync() once at startup before any ads/data/player calls.",
      "See get_compliance_rule('U-001').",
    ],
  },
];

const FALLBACK = [
  "No catalogued symptom matched. Try these:",
  "- detect_sdk(projectPath) — confirm the SDK is installed and the version matches.",
  "- get_install_instructions(engine) — re-check the install + post-install steps.",
  "- search_docs(query) — search the quickstarts and API reference.",
  "- validate_integration(platform, buildPath | eventLogJson) — check against real platform rejection rules.",
].join("\n");

function score(symptom: Symptom, query: string): number {
  return symptom.keywords.reduce((n, kw) => (query.includes(kw) ? n + 1 : n), 0);
}

function renderSymptom(s: Symptom): string {
  return [
    `## ${s.title}`,
    `Cause: ${s.cause}`,
    "Fix:",
    ...s.fix.map((f, i) => `${i + 1}. ${f}`),
  ].join("\n");
}

/**
 * Register troubleshoot: map a reported symptom (error text or description) to
 * the likely cause and the ordered fix, pointing at the tool/step that resolves
 * it. Read-only; curated knowledge that references other tools, not versions.
 */
export function registerTroubleshootTool(server: McpServer): void {
  server.registerTool(
    "troubleshoot",
    {
      title: "Troubleshoot a Yes2SDK symptom",
      description:
        "The likely cause and ordered fix for a reported Yes2SDK integration symptom, given an error string or a plain-language description. " +
        "Covers the common failures: missing namespace or module (SDK not installed), window.Yes2SDK undefined, Unity build-guard and template problems, Defold editor no-ops, rewards not granted, and platform rejections such as ads without gameplayStop or an unbundled SDK. " +
        "Each answer points at the tool that resolves it (detect_sdk, get_install_instructions, get_compliance_rule, validate_integration), or at where to look next when nothing matches.",
      inputSchema: {
        symptom: z
          .string()
          .min(1)
          .describe("The error message or a short description of what is going wrong, e.g. \"namespace Yes2SDK could not be found\" or \"rewarded ad gave no reward\"."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ symptom }) => {
      const query = symptom.toLowerCase();
      const ranked = SYMPTOMS.map((s) => ({ s, n: score(s, query) }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3);

      if (ranked.length === 0) {
        return { content: [{ type: "text" as const, text: FALLBACK }] };
      }

      const header =
        ranked.length === 1 ? "# Likely cause and fix" : "# Likely causes and fixes (best match first)";
      const body = ranked.map((x) => renderSymptom(x.s)).join("\n\n");
      return { content: [{ type: "text" as const, text: `${header}\n\n${body}` }] };
    }
  );
}
