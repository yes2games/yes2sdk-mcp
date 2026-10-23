/**
 * Read-only analysis of a JavaScript/TypeScript game project for detect_sdk:
 * is the @yes2games/js package installed (and at which version), which
 * frameworks it uses (Phaser, three.js, Vite), and which of the integration
 * steps the developer still has to do.
 *
 * Pure over a file view, so the same code runs against disk (`projectPath`,
 * local stdio) and against an inline file map (`files`, hosted server).
 */

/** Package name of the JS wrapper on npm. Kept here, not read from sdk-meta, so a rename shows up as a test failure. */
export const JS_PACKAGE = "@yes2games/js";

/** Read-only view of a project's files, keyed by repo-relative posix paths. */
export interface ProjectFiles {
  /** Contents of a repo-relative file, or null when it does not exist. */
  read(relPath: string): string | null;
  /** Whether a file or directory exists at the repo-relative path. */
  exists(relPath: string): boolean;
  /** Repo-relative paths of the project's own files (dependency and build output folders excluded). */
  list(): string[];
}

export interface JsProjectReport {
  /** True when the @yes2games/js package (or its no-build classic scripts) is present. */
  installed: boolean;
  /** Version found, when it could be determined. */
  installedVersion: string | null;
  /** Where the version (or install) evidence came from. */
  evidence: string | null;
  frameworks: { phaser: boolean; three: boolean; vite: boolean };
  /** True when the project looks like a browser game (index.html, Vite, Phaser or three). */
  looksLikeWebGame: boolean;
  /** Tailored setup steps that are still missing. */
  remainingSteps: string[];
  notes: string[];
}

type DepMap = Record<string, string>;

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: DepMap;
  devDependencies?: DepMap;
  optionalDependencies?: DepMap;
  peerDependencies?: DepMap;
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|html?|vue|svelte)$/i;
/** Where a web game keeps its entry page; deeper index.html files (fixtures, docs) do not make a project a game. */
const ENTRY_PAGES = ["index.html", "src/index.html", "public/index.html", "www/index.html"];
const VITE_CONFIGS = ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.mts", "vite.config.cjs", "vite.config.cts"];
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_SCAN_BYTES = 8 * 1024 * 1024;

function parseJson<T>(text: string | null): T | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Every declared dependency, across all dependency groups. */
function allDeps(pkg: PackageJson): DepMap {
  return {
    ...pkg.peerDependencies,
    ...pkg.optionalDependencies,
    ...pkg.devDependencies,
    ...pkg.dependencies,
  };
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The resolved @yes2games/js version from whichever lockfile is present. */
export function versionFromLockfiles(files: Pick<ProjectFiles, "read">): { version: string; source: string } | null {
  const npmLock = parseJson<{
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string }>;
  }>(files.read("package-lock.json"));
  if (npmLock) {
    const v = npmLock.packages?.[`node_modules/${JS_PACKAGE}`]?.version ?? npmLock.dependencies?.[JS_PACKAGE]?.version;
    if (v && SEMVER.test(v)) return { version: v, source: "package-lock.json" };
  }

  const pnpm = files.read("pnpm-lock.yaml");
  if (pnpm) {
    // v6+: "/@yes2games/js@0.1.0:" or "'@yes2games/js@0.1.0':"
    const m = pnpm.match(/^\s+['"]?\/?@yes2games\/js@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/m);
    if (m) return { version: m[1], source: "pnpm-lock.yaml" };
  }

  const yarn = files.read("yarn.lock");
  if (yarn) {
    const m = yarn.match(/^"?@yes2games\/js@[^\n]*:\r?\n\s+version:?\s+"?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)"?/m);
    if (m) return { version: m[1], source: "yarn.lock" };
  }

  const bun = files.read("bun.lock");
  if (bun) {
    const m = bun.match(/"@yes2games\/js@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)"/);
    if (m) return { version: m[1], source: "bun.lock" };
  }
  return null;
}

/** Join a repo-relative base and a relative path, resolving "." and "..". Leading ".." segments are kept. */
function joinRel(base: string, rel: string): string {
  const out: string[] = [];
  for (const part of `${base}/${rel}`.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length > 0 && out[out.length - 1] !== "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** Version from an installed (or file:-linked) copy of the package, when readable. */
function versionFromInstalledCopy(files: Pick<ProjectFiles, "read">, spec: string | undefined): { version: string; source: string } | null {
  const candidates: Array<{ path: string; source: string }> = [
    { path: `node_modules/${JS_PACKAGE}/package.json`, source: `node_modules/${JS_PACKAGE}` },
  ];
  if (spec && spec.startsWith("file:")) {
    candidates.push({ path: joinRel(spec.slice("file:".length), "package.json"), source: `local link (${spec})` });
  }
  for (const c of candidates) {
    const pkg = parseJson<{ name?: string; version?: string }>(files.read(c.path));
    if (pkg?.name === JS_PACKAGE && pkg.version && SEMVER.test(pkg.version)) {
      return { version: pkg.version, source: c.source };
    }
  }
  return null;
}

/** Concatenated project sources worth searching (bounded), plus their paths. */
function gatherSources(files: ProjectFiles): { text: string; paths: string[] } {
  let budget = MAX_SCAN_BYTES;
  const parts: string[] = [];
  const paths: string[] = [];
  for (const rel of files.list()) {
    const base = rel.split("/").pop() ?? rel;
    if (!SOURCE_EXT.test(base) || VITE_CONFIGS.includes(base)) continue;
    const text = files.read(rel);
    if (text === null || text.length > MAX_SOURCE_BYTES || text.length > budget) continue;
    budget -= text.length;
    parts.push(text);
    paths.push(rel);
  }
  return { text: parts.join("\n"), paths };
}

/** A top-level static import of the mock, which would ship it in the production build. */
const STATIC_MOCK_IMPORT = /^\s*import\s+(?:[^;'"]*\s+from\s+)?["']@yes2games\/js\/mock["']/m;
/** Vite `base` set to a relative value: "./", "." or "". */
const RELATIVE_VITE_BASE = /\bbase\s*:\s*(["'`])(?:\.\/?)?\1/;

/**
 * Analyse a JS/TS project. The install steps themselves come from sdk-meta
 * (detect_sdk adds them when `installed` is false); `remainingSteps` holds only
 * the integration steps this project is still missing.
 */
export function analyzeJsProject(files: ProjectFiles): JsProjectReport {
  const pkg = parseJson<PackageJson>(files.read("package.json"));
  const deps = pkg ? allDeps(pkg) : {};
  const spec = deps[JS_PACKAGE];
  const notes: string[] = [];
  const remaining: string[] = [];

  const frameworks = {
    phaser: "phaser" in deps,
    three: "three" in deps,
    vite: "vite" in deps || VITE_CONFIGS.some((f) => files.exists(f)),
  };

  const projectFiles = files.list();
  const basenames = new Set(projectFiles.map((f) => (f.split("/").pop() ?? f).toLowerCase()));
  const hasIndexHtml = ENTRY_PAGES.some((f) => files.exists(f));
  const classicRuntime = basenames.has("yes2-runtime.js") || basenames.has("yes2-runtime.min.js");
  const looksLikeWebGame = hasIndexHtml || frameworks.vite || frameworks.phaser || frameworks.three;

  // ── Installed? ───────────────────────────────────────────────────────
  let installed = false;
  let installedVersion: string | null = null;
  let evidence: string | null = null;
  if (spec !== undefined) {
    installed = true;
    const resolved = versionFromLockfiles(files) ?? versionFromInstalledCopy(files, spec);
    if (resolved) {
      installedVersion = resolved.version;
      evidence = resolved.source;
    } else if (SEMVER.test(spec)) {
      installedVersion = spec;
      evidence = "package.json (exact pin)";
    } else {
      evidence = `package.json (declared "${spec}", no lockfile entry found)`;
      notes.push(`${JS_PACKAGE} is declared as "${spec}" but no lockfile entry resolves it; run npm install to pin the version.`);
    }
  } else if (classicRuntime) {
    installed = true;
    evidence = "yes2-runtime.js (no-build classic script)";
    notes.push(`${JS_PACKAGE} is used through its classic scripts (yes2-runtime.js); their version is not recorded in the files.`);
  } else {
    notes.push(
      pkg
        ? `Yes2SDK JS package not installed: package.json has no ${JS_PACKAGE} dependency.` +
            (looksLikeWebGame ? "" : " This may not be a game project at all; the engine is reported as js only because a package.json exists.")
        : `Yes2SDK JS package not installed: no package.json and no yes2-runtime.js.`
    );
  }

  if (!installed && !looksLikeWebGame) {
    return { installed, installedVersion, evidence, frameworks, looksLikeWebGame, remainingSteps: [], notes };
  }

  // ── Tailored steps ───────────────────────────────────────────────────
  const { text: src } = gatherSources(files);

  // Mock for local development.
  const usesMockModule = src.includes(`${JS_PACKAGE}/mock`);
  const usesMockScript = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*yes2sdk-mock(?:\.min)?\.js/i.test(src);
  if (STATIC_MOCK_IMPORT.test(src)) {
    remaining.push(
      `The mock is imported statically, so it ships in the production build. Import it only in dev: if (import.meta.env.DEV) { (await import("${JS_PACKAGE}/mock")).installYes2SDKMock(); }`
    );
  } else if (!usesMockModule && !usesMockScript) {
    remaining.push(
      frameworks.vite || !classicRuntime
        ? `Install the local-dev mock so window.Yes2SDK exists under the dev server: if (import.meta.env.DEV) { (await import("${JS_PACKAGE}/mock")).installYes2SDKMock(); }`
        : `Add <script src="yes2sdk-mock.js"></script> before yes2-runtime.js in index.html (copy it from node_modules/${JS_PACKAGE}/mock/dist/yes2sdk-mock.js) so window.Yes2SDK exists locally.`
    );
  }

  // Vite base. Only a Vite *build* emits paths; the no-build template runs Vite as a static dev server.
  const configName = VITE_CONFIGS.find((f) => files.exists(f));
  const buildsWithVite =
    configName !== undefined || Object.values(pkg?.scripts ?? {}).some((cmd) => /\bvite\s+build\b/.test(cmd));
  if (buildsWithVite) {
    const config = configName ? files.read(configName) : null;
    if (configName && config === null) {
      notes.push(`${configName} was not provided, so Vite's base could not be checked.`);
    } else if (config === null) {
      remaining.push("Add a vite.config with base: './' (Vite's default base is '/', which writes root-absolute /assets/… paths that 404 when a platform serves the game from a sub-path).");
    } else if (!RELATIVE_VITE_BASE.test(config)) {
      remaining.push(`Set base: './' in ${configName} so every emitted path is relative; root-absolute /assets/… paths 404 on platforms that serve games from a sub-path (the dashboard warns, Jest blocks).`);
    }
  }

  // Canvas marker.
  if (!/data-yes2-canvas|dataset\.yes2Canvas/.test(src)) {
    remaining.push("Mark the game canvas (or its wrapper) with data-yes2-canvas, e.g. <canvas data-yes2-canvas>, so the dashboard captures the right canvas.");
  }

  // Loading progress.
  if (!/setLoadingProgress|createLoadingProgressReporter/.test(src)) {
    remaining.push(`Report loading progress: Yes2SDK.setLoadingProgress(percent) while assets load (createLoadingProgressReporter() from "${JS_PACKAGE}" forwards only integer changes), then await Yes2SDK.startGameAsync() once playable.`);
  }

  // Engine helpers.
  if (frameworks.phaser && !src.includes(`${JS_PACKAGE}/phaser`)) {
    remaining.push(`Phaser: use createPhaserLifecycle(game).attach() from "${JS_PACKAGE}/phaser" (in callbacks.preBoot) to pause and mute around ads and platform pause events.`);
  }
  if (frameworks.three && !src.includes(`${JS_PACKAGE}/three`)) {
    remaining.push(`three.js: use createThreeLifecycle({ listener, onPauseChange }).attach() from "${JS_PACKAGE}/three" to mute the AudioListener and pause around ads.`);
  }

  // A bundled or hand-added copy of the SDK itself.
  if (/yes2sdk\.umd\.js/i.test(src) || basenames.has("yes2sdk.umd.js")) {
    remaining.push("Remove yes2sdk.umd.js (file or <script> tag) from the project: the dashboard injects the SDK at upload. Never bundle it.");
  }

  return { installed, installedVersion, evidence, frameworks, looksLikeWebGame, remainingSteps: remaining, notes };
}
