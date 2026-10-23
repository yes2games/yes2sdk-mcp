import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { SDK_META } from "../src/lib/sdk-meta.js";
import {
  detectBuildEngine,
  runBuildChecks,
  runBuildChecksInline,
  type BuildFinding,
} from "../src/lib/build-checks.js";
import { findRootAbsoluteJsLiterals, findRootAbsoluteRefs } from "../src/lib/root-absolute-paths.js";
import { analyzeJsProject, versionFromLockfiles, type ProjectFiles } from "../src/lib/js-project.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures");
const JS_VERSION = SDK_META.js.version;

let client: Client;

function textOf(res: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = (res as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

const call = async (name: string, args: Record<string, unknown>): Promise<string> =>
  textOf(await client.callTool({ name, arguments: args }));

const detectFiles = (files: Record<string, string>): Promise<string> => call("detect_sdk", { files });

const byCheck = (findings: BuildFinding[], check: string): BuildFinding[] => findings.filter((f) => f.check === check);

/** In-memory ProjectFiles for the pure analyzer. */
function filesOf(map: Record<string, string>): ProjectFiles {
  return {
    read: (p) => map[p] ?? null,
    exists: (p) => p in map || Object.keys(map).some((k) => k.startsWith(`${p}/`)),
    list: () => Object.keys(map),
  };
}

const PKG = (deps: Record<string, string>, devDeps: Record<string, string> = {}, scripts: Record<string, string> = {}): string =>
  JSON.stringify({ name: "game", scripts, dependencies: deps, devDependencies: devDeps });

/** A fully integrated Vite + Phaser project, shaped like the phaser-ts template. */
const COMPLETE_PHASER: Record<string, string> = {
  "package.json": PKG({ phaser: "3.90.0" }, { "@yes2games/js": "0.1.0", vite: "8.3.5" }, { build: "vite build" }),
  "vite.config.ts": 'import { defineConfig } from "vite";\nexport default defineConfig({ base: "./" });',
  "index.html": '<canvas id="game-canvas" data-yes2-canvas></canvas><script type="module" src="./src/main.ts"></script>',
  "src/sdk.ts":
    'import { requireSdk } from "@yes2games/js";\nexport async function loadSdk() {\n  if (import.meta.env.DEV) {\n    const { installYes2SDKMock } = await import("@yes2games/js/mock");\n    installYes2SDKMock();\n  }\n  return requireSdk();\n}',
  "src/main.ts":
    'import { createLoadingProgressReporter } from "@yes2games/js";\nimport { createPhaserLifecycle } from "@yes2games/js/phaser";\nconst progress = createLoadingProgressReporter();',
};

beforeAll(async () => {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test", version: "0" });
  await createServer().connect(serverT);
  await client.connect(clientT);
});

afterAll(async () => {
  await client.close();
});

// ── sdk-meta ─────────────────────────────────────────────────────────

describe("sdk-meta: js", () => {
  it("pins the published @yes2games/js package", () => {
    expect(SDK_META.js.packageName).toBe("@yes2games/js");
    expect(JS_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(SDK_META.js.repoUrl).toBe("https://github.com/yes2games/yes2sdk-js");
    expect(SDK_META.js.docsUrl).toBe("https://developer.yes2games.com/docs/javascript");
  });

  it("keeps Unity and Defold free of JS-only sections", () => {
    expect(SDK_META.unity.extraSections).toEqual([]);
    expect(SDK_META.defold.extraSections).toEqual([]);
  });
});

// ── get_install_instructions ─────────────────────────────────────────

describe("get_install_instructions: js", () => {
  let text: string;
  beforeAll(async () => {
    text = await call("get_install_instructions", { engine: "js" });
  });

  it("pins the npm install to the meta version", () => {
    expect(text).toContain(`Package: @yes2games/js (v${JS_VERSION})`);
    expect(text).toContain(`npm i @yes2games/js@${JS_VERSION}`);
  });

  it("covers the dev-only mock, the engine helpers and the no-build path", () => {
    expect(text).toContain('import("@yes2games/js/mock")');
    expect(text).toContain("import.meta.env.DEV");
    expect(text).toContain("## Phaser");
    expect(text).toContain("createPhaserLifecycle");
    expect(text).toContain("@yes2games/js/phaser");
    expect(text).toContain("## three.js");
    expect(text).toContain("createThreeLifecycle");
    expect(text).toContain("@yes2games/js/three");
    expect(text).toContain("## No build step");
    expect(text).toContain("yes2-runtime.js");
    expect(text).toContain("yes2sdk-mock.js");
  });

  it("covers Vite base, the canvas marker, loading progress, the SDK rule and verification", () => {
    expect(text).toContain("base: './'");
    expect(text).toContain("data-yes2-canvas");
    expect(text).toContain("setLoadingProgress");
    expect(text).toMatch(/Never bundle or add a <script> for yes2sdk\.umd\.js/);
    expect(text).toContain("HTML5 / JavaScript");
    expect(text).toContain("## Verify the SDK is available");
    expect(text).toContain("window.Yes2SDK.isMock === true");
    expect(text).toContain("Docs: https://developer.yes2games.com/docs/javascript");
  });

  it("no longer says there is no package", () => {
    expect(text).not.toMatch(/no (separately )?published (npm )?package/i);
  });

  it("describes the js engine as the @yes2games/js package in the tool schema", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "get_install_instructions");
    expect(JSON.stringify(tool?.inputSchema)).toContain("@yes2games/js");
  });
});

// ── detect_sdk ───────────────────────────────────────────────────────

describe("detect_sdk: js", () => {
  it("does not treat an unrelated Node project as an installed SDK", async () => {
    const text = await detectFiles({ "package.json": PKG({ express: "^4.21.0" }) });
    expect(text).toMatch(/Engine: js/);
    expect(text).toMatch(/SDK installed: no/);
    expect(text).toContain("Yes2SDK JS package not installed");
    expect(text).toContain("may not be a game project");
    expect(text).toContain(`npm i @yes2games/js@${JS_VERSION}`);
    expect(text).not.toContain("## Remaining integration steps");
  });

  it("reports the version from package-lock.json and tailors the steps (disk fixture)", async () => {
    const text = await call("detect_sdk", { projectPath: path.join(FIXTURES, "projects", "js-phaser") });
    expect(text).toMatch(/Engine: js/);
    expect(text).toMatch(/SDK installed: yes/);
    expect(text).toContain("Installed version: 0.1.0");
    expect(text).toContain("Package evidence: package-lock.json");
    expect(text).toContain("Detected: Phaser, Vite.");
    expect(text).toContain("## Remaining integration steps for this project");
    expect(text).toContain("Set base: './' in vite.config.ts");
    expect(text).toContain('import("@yes2games/js/mock")');
    expect(text).toContain("data-yes2-canvas");
    expect(text).toContain("setLoadingProgress");
    expect(text).toContain("createPhaserLifecycle");
  });

  it("reports nothing missing for a complete Phaser project", async () => {
    const text = await detectFiles(COMPLETE_PHASER);
    expect(text).toMatch(/SDK installed: yes/);
    expect(text).toContain("Installed version: 0.1.0");
    expect(text).toContain("package.json (exact pin)");
    expect(text).not.toContain("## Remaining integration steps");
    expect(text).toContain("No missing integration steps found");
  });

  it("flags a static mock import, which would ship the mock", async () => {
    const text = await detectFiles({
      ...COMPLETE_PHASER,
      "src/sdk.ts": 'import { installYes2SDKMock } from "@yes2games/js/mock";\ninstallYes2SDKMock();',
    });
    expect(text).toContain("The mock is imported statically");
  });

  it("asks for a vite.config when the project builds with Vite but has none", async () => {
    const files = { ...COMPLETE_PHASER };
    delete files["vite.config.ts"];
    const text = await detectFiles(files);
    expect(text).toContain("Add a vite.config with base: './'");
  });

  it("does not ask for Vite base when Vite only serves files (no build)", () => {
    const report = analyzeJsProject(
      filesOf({
        "package.json": PKG({}, { "@yes2games/js": "0.1.0", vite: "8.3.5" }, { dev: "vite --open" }),
        "index.html": '<canvas data-yes2-canvas></canvas><script src="yes2sdk-mock.js"></script><script src="yes2-runtime.js"></script><script src="main.js"></script>',
        "main.js": "Yes2SDK.setLoadingProgress(50);",
        "yes2-runtime.js": "/* runtime */",
        "yes2sdk-mock.js": "/* mock */",
      })
    );
    expect(report.frameworks.vite).toBe(true);
    expect(report.remainingSteps).toEqual([]);
  });

  it("asks three.js projects for the three helper", async () => {
    const text = await detectFiles({
      ...COMPLETE_PHASER,
      "package.json": PKG({ three: "0.186.1" }, { "@yes2games/js": "0.1.0", vite: "8.3.5" }, { build: "vite build" }),
    });
    expect(text).toContain("Detected: three.js, Vite.");
    expect(text).toContain("createThreeLifecycle");
  });

  it("flags a project that carries yes2sdk.umd.js", async () => {
    const text = await detectFiles({
      ...COMPLETE_PHASER,
      "index.html": `${COMPLETE_PHASER["index.html"]}<script src="yes2sdk.umd.js"></script>`,
    });
    expect(text).toContain("Remove yes2sdk.umd.js");
  });

  it("detects a no-build game without package.json from its classic scripts", async () => {
    const text = await detectFiles({
      "index.html": '<canvas data-yes2-canvas></canvas><script src="yes2sdk-mock.js"></script><script src="yes2-runtime.js"></script>',
      "yes2-runtime.js": "/* @yes2games/js runtime */",
      "main.js": "Yes2SDK.setLoadingProgress(10);",
    });
    expect(text).toMatch(/Engine: js/);
    expect(text).toMatch(/SDK installed: yes/);
    expect(text).toContain("yes2-runtime.js (no-build classic script)");
  });

  it("notes a range with no lockfile entry", async () => {
    const text = await detectFiles({ ...COMPLETE_PHASER, "package.json": PKG({}, { "@yes2games/js": "^0.1.0" }) });
    expect(text).toMatch(/SDK installed: yes/);
    expect(text).toContain('declared as "^0.1.0"');
  });
});

describe("versionFromLockfiles", () => {
  it("reads pnpm, yarn and bun lockfiles", () => {
    expect(versionFromLockfiles(filesOf({ "pnpm-lock.yaml": "packages:\n\n  '@yes2games/js@0.1.0':\n    resolution: {}\n" }))).toEqual({
      version: "0.1.0",
      source: "pnpm-lock.yaml",
    });
    expect(versionFromLockfiles(filesOf({ "pnpm-lock.yaml": "packages:\n  /@yes2games/js@0.2.0:\n    dev: true\n" }))?.version).toBe("0.2.0");
    expect(
      versionFromLockfiles(filesOf({ "yarn.lock": '"@yes2games/js@^0.1.0":\n  version "0.1.0"\n  resolved "x"\n' }))
    ).toEqual({ version: "0.1.0", source: "yarn.lock" });
    expect(versionFromLockfiles(filesOf({ "bun.lock": '{ "packages": { "@yes2games/js": ["@yes2games/js@0.1.0", "", {}] } }' }))?.version).toBe("0.1.0");
  });

  it("reads lockfile v1 dependencies and ignores missing entries", () => {
    expect(versionFromLockfiles(filesOf({ "package-lock.json": '{"dependencies":{"@yes2games/js":{"version":"0.1.0"}}}' }))?.version).toBe("0.1.0");
    expect(versionFromLockfiles(filesOf({ "package-lock.json": '{"packages":{}}' }))).toBeNull();
    expect(versionFromLockfiles(filesOf({}))).toBeNull();
  });
});

// ── validate_integration: JS builds ──────────────────────────────────

describe("build checks: JS builds", () => {
  it("flags every JS-build issue in a bad Vite build (disk)", async () => {
    const findings = await runBuildChecks(path.join(FIXTURES, "jsbuild-bad"), "poki");
    expect(byCheck(findings, "engine")[0]?.message).toContain("vanilla (HTML5 / JavaScript)");

    const paths = byCheck(findings, "relative-paths");
    expect(paths.some((f) => f.severity === "WARN" && f.message.includes('src="/assets/index-abc123.js"'))).toBe(true);
    expect(paths.some((f) => f.severity === "WARN" && f.message.includes('"/assets/hero.png" in assets/index-abc123.js'))).toBe(true);
    expect(paths.every((f) => f.fix?.includes("base: './'"))).toBe(true);

    const copy = byCheck(findings, "sdk-copy");
    expect(copy).toHaveLength(1);
    expect(copy[0]?.severity).toBe("WARN");
    expect(copy[0]?.message).toContain("yes2sdk.umd.js");

    const mock = byCheck(findings, "mock-in-build");
    expect(mock.map((f) => f.severity)).toEqual(["WARN", "WARN"]);
    expect(mock[0]?.message).toContain("removes the mock's <script> tag and deletes the file");
    expect(mock[1]?.message).toContain("compiled into the game's JavaScript (assets/index-abc123.js)");

    expect(byCheck(findings, "canvas-marker")[0]?.severity).toBe("WARN");
    // None of these are new rejections.
    expect(findings.filter((f) => f.severity === "FAIL")).toEqual([]);
  });

  it("blocks root-absolute index.html paths for Jest only, as the dashboard's Jest gate", async () => {
    const findings = await runBuildChecks(path.join(FIXTURES, "jsbuild-bad"), "jest");
    const paths = byCheck(findings, "relative-paths");
    expect(paths.find((f) => f.message.includes("index.html"))?.severity).toBe("FAIL");
    expect(paths.find((f) => f.message.includes("in scripts"))?.severity).toBe("WARN");
  });

  it("passes a clean Vite build (disk)", async () => {
    const findings = await runBuildChecks(path.join(FIXTURES, "jsbuild-good"), "jest");
    expect(findings.filter((f) => f.severity !== "INFO")).toEqual([]);
    expect(byCheck(findings, "canvas-marker")[0]?.severity).toBe("INFO");
    expect(byCheck(findings, "relative-paths")[0]?.severity).toBe("INFO");
    expect(byCheck(findings, "sdk-bundled")[0]?.message).toContain("dashboard injects the SDK");
  });

  it("runs the same JS checks on inline input", () => {
    const findings = runBuildChecksInline(
      {
        indexHtml: '<script src="/assets/a.js"></script><canvas></canvas>',
        fileList: ["index.html", "assets/a.js", "assets/hero.png"],
        jsContents: ['window.Yes2SDK.initializeAsync(); img.src = "/assets/hero.png"; localStorage.getItem("yes2sdk-mock-settings");'],
      },
      "crazygames"
    );
    expect(byCheck(findings, "engine")[0]?.message).toContain("vanilla");
    expect(byCheck(findings, "relative-paths").map((f) => f.message).join(" ")).toContain('"/assets/hero.png" in jsContents[0]');
    expect(byCheck(findings, "mock-in-build")[0]?.message).toContain("jsContents[0]");
    expect(byCheck(findings, "canvas-marker")[0]?.severity).toBe("WARN");
  });

  it("recognises an inline Core SDK copy and the classic mock by content", () => {
    const umd = '!function(t,e){"object"==typeof exports?exports.Yes2SDK=e():t.Yes2SDK=e()}(this,()=>({}));';
    const mockIife = "(function(){var o=window.__yes2sdkMockOptions;window.Yes2SDK={};})();";
    const findings = runBuildChecksInline(
      { indexHtml: "<canvas data-yes2-canvas></canvas><script src=\"game.js\"></script>", jsContents: [umd, mockIife] },
      "poki"
    );
    expect(byCheck(findings, "sdk-copy")[0]?.message).toContain("jsContents[0]");
    expect(byCheck(findings, "mock-in-build")[0]?.message).toContain("jsContents[1] (yes2sdk-mock.js)");
    // Neither a copy of the SDK nor the mock is the game integrating it.
    expect(byCheck(findings, "sdk-bundled")[0]?.severity).toBe("FAIL");
  });

  it("does not count the yes2-runtime.js layer as integration", () => {
    const runtime = "/* @yes2games/js runtime (window.Yes2Runtime). MIT License. */ window.Yes2SDK.ads;";
    const findings = runBuildChecksInline({ indexHtml: "<canvas data-yes2-canvas></canvas>", jsContents: [runtime] }, "poki");
    expect(byCheck(findings, "sdk-bundled")[0]?.severity).toBe("FAIL");
    expect(byCheck(findings, "sdk-bundled")[0]?.message).toContain("yes2-runtime.js and the mock do not count");
  });

  it("counts game code that calls Yes2Runtime", () => {
    const findings = runBuildChecksInline(
      { indexHtml: "<canvas data-yes2-canvas></canvas>", jsContents: ["Yes2Runtime.ads.showInterstitial('x');"] },
      "poki"
    );
    expect(byCheck(findings, "sdk-bundled")[0]?.severity).toBe("INFO");
  });

  it("leaves Unity builds out of the JS-only checks", () => {
    const findings = runBuildChecksInline(
      {
        indexHtml: '<canvas id="unity-canvas"></canvas><script src="yes2sdk.umd.js"></script>',
        fileList: ["index.html", "Build/g.loader.js", "Build/g.framework.js.br", "Build/g.wasm.br", "Build/g.data.br"],
        jsContents: ["Yes2SDK_Ads_ShowInterstitialJS();"],
      },
      "poki"
    );
    expect(byCheck(findings, "engine")[0]?.message).toContain("unity");
    expect(byCheck(findings, "sdk-copy")).toEqual([]);
    expect(byCheck(findings, "canvas-marker")).toEqual([]);
  });

  it("does not count the dashboard's injected capture script as a canvas marker", () => {
    const findings = runBuildChecksInline(
      {
        indexHtml: '<canvas></canvas><script>var m=document.querySelector("[data-yes2-canvas]");window.__yes2sdkConfig={};</script>',
        jsContents: ["window.Yes2SDK.initializeAsync();"],
        fileList: ["index.html", "game.js"],
      },
      "poki"
    );
    expect(byCheck(findings, "canvas-marker")[0]?.severity).toBe("WARN");
  });
});

describe("detectBuildEngine", () => {
  it("matches the dashboard's order", () => {
    const e = (basenames: string[], hasInlineScript = false): string =>
      detectBuildEngine({ basenames, hasIndexHtml: basenames.includes("index.html"), hasInlineScript });
    expect(e(["index.html", "g.loader.js", "g.framework.js", "g.wasm"])).toBe("unity");
    // A three.js build with Draco (.wasm + *.loader.js) and no Unity .data file is vanilla.
    expect(e(["index.html", "draco.loader.js", "draco_decoder.wasm", "index-abc.js"])).toBe("vanilla");
    expect(e(["index.html", "dmloader.js"])).toBe("defold");
    expect(e(["index.html", "main.mjs"])).toBe("vanilla");
    expect(e(["index.html"], true)).toBe("vanilla");
    expect(e(["index.html"])).toBe("other");
  });
});

describe("root-absolute path scanner (dashboard port)", () => {
  it("flags src/href/srcset/url() that start with one slash, and nothing else", () => {
    const refs = findRootAbsoluteRefs(
      '<link href="/style.css"><img srcset="/a.png 1x, ./b.png 2x"><div style="background:url(/bg.png)"></div>' +
        '<script src="//cdn.example.com/x.js"></script><script src="./ok.js"></script><a href="/home">home</a>' +
        '<script>var s = "<img src=\\"/not-a-tag.png\\">";</script><!-- <img src="/commented.png"> -->'
    );
    expect(refs).toEqual([
      { attr: "href", value: "/style.css" },
      { attr: "srcset", value: "/a.png" },
      { attr: "url()", value: "/bg.png" },
    ]);
  });

  it("only reports JS literals that name a file in the build", () => {
    const files = new Set(["assets/hero.png", "index.html"]);
    expect(findRootAbsoluteJsLiterals('a="/assets/hero.png";b="/api/score";c="/index.html"', files)).toEqual(["/assets/hero.png"]);
  });
});

describe("validate_integration tool: JS build", () => {
  it("documents the JS-build checks", async () => {
    const { tools } = await client.listTools();
    const desc = tools.find((t) => t.name === "validate_integration")?.description ?? "";
    expect(desc).toContain("yes2sdk.umd.js");
    expect(desc).toContain("data-yes2-canvas");
    expect(desc).toContain("root-absolute");
  });

  it("keeps the verdict non-blocking for a bad JS build on poki", async () => {
    const text = await call("validate_integration", { platform: "poki", buildPath: path.join(FIXTURES, "jsbuild-bad") });
    expect(text).toContain("[static:sdk-copy]");
    expect(text).toContain("[static:mock-in-build]");
    expect(text).toContain("[static:canvas-marker]");
    expect(text).toContain("[static:relative-paths]");
    expect(text).toContain("VERDICT: no blocking FAILs");
  });
});

// ── troubleshoot / docs / server instructions ────────────────────────

describe("troubleshoot: JS symptoms", () => {
  it("maps /assets 404s to Vite base", async () => {
    const text = await call("troubleshoot", { symptom: "after upload /assets/index.js returns 404 and the screen is blank" });
    expect(text).toContain("host root");
    expect(text).toContain("base: './'");
  });

  it("maps mock logs in a built game to the dev-only import", async () => {
    const text = await call("troubleshoot", { symptom: "[Yes2SDK] Mock: logs show up in my production build" });
    expect(text).toContain("import.meta.env.DEV");
  });

  it("maps window.Yes2SDK undefined to the mock, not 'there is no package'", async () => {
    const text = await call("troubleshoot", { symptom: "window.Yes2SDK is undefined in npm run dev" });
    expect(text).toContain("installYes2SDKMock");
    expect(text).not.toContain("there is none");
  });

  it("maps silent audio after an ad in Phaser to the helper", async () => {
    const text = await call("troubleshoot", { symptom: "phaser sound stays muted, no sound after ad" });
    expect(text).toContain("createPhaserLifecycle");
  });

  it("maps the wrong screenshot canvas to data-yes2-canvas", async () => {
    const text = await call("troubleshoot", { symptom: "dashboard screenshot shows the wrong canvas" });
    expect(text).toContain("data-yes2-canvas");
  });
});

describe("docs tools: JS pointers", () => {
  it("points Phaser/three/Vite searches at the JS setup", async () => {
    const text = await call("search_docs", { query: "phaser pause on ad" });
    expect(text).toContain('get_install_instructions("js")');
    expect(text).toContain("https://developer.yes2games.com/docs/javascript");
  });

  it("leaves unrelated searches alone", async () => {
    const text = await call("search_docs", { query: "rewarded ad reward callback" });
    expect(text).not.toContain('get_install_instructions("js")');
  });

  it("ends every quickstart with the JS engine pointer", async () => {
    const text = await call("get_quickstart", { platform: "poki" });
    expect(text).toMatch(/^# Yes2SDK for Poki/);
    expect(text).toContain(`@yes2games/js@${JS_VERSION}`);
  });
});

describe("server instructions", () => {
  it("names the JS package and its rules", () => {
    const instructions = client.getInstructions() ?? "";
    expect(instructions).toContain("@yes2games/js");
    expect(instructions).toContain("never bundle yes2sdk.umd.js");
    expect(instructions).toContain("data-yes2-canvas");
  });
});
