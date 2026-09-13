import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectPackage, detectExcaliburVersion, type ExcaliburVersion, type PackageJsonLike } from "../docs/version.ts";
import { loadTypescript, type TsModule } from "./ts-loader.ts";
import { createTsEditor } from "./ts-edit.ts";
import type { SpriteSheetGrid, SpriteSheetSpacing } from "./ts-edit.ts";
import { GenerateError } from "./errors.ts";

const SCAN_CAP = 500;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

export interface ProjectScene {
  className: string;
  file: string;
  /** key in the engine's scenes map, when it could be matched */
  key?: string;
}

export interface ProjectActor {
  className: string;
  file: string;
}

export interface ProjectSpriteSheet {
  name: string;
  file: string;
  grid: SpriteSheetGrid | null;
  spacing: SpriteSheetSpacing | null;
  imageKey: string | null;
  /** image path from the Resources literal (best effort) */
  assetPath?: string | null;
}

export interface ProjectPlugin {
  name: string;
  range: string;
  version: string | null;
  dev: boolean;
}

/** Result of analyzeProject — the model every generate/doctor/upgrade consumer shares. */
export interface Project {
  projectDir: string;
  /** `<projectDir>/src` — the template layout generate writes into (may not exist for doctor/upgrade) */
  srcDir: string;
  /**
   * Directories the type-aware tools (doctor/upgrade) scan for .ts roots.
   * Generate always gets `[srcDir]`; doctor/upgrade also get the example dirs
   * (`example/`, `examples/`, `demo/`, `sample/`, `sandbox/`) that exist — the
   * v1 migration pass found every plugin's public-API breakage lived there —
   * or an explicit `scope`, or the package root when there is no src/ at all.
   */
  sourceRoots: string[];
  /** the parsed package.json — library-vs-game decisions (peerDependencies) and script checks read it */
  pkg: PackageJsonLike;
  viteShaped: boolean;
  publicDir: string;
  mainFile: string | null;
  resourcesFile: string | null;
  resourceKeys: string[];
  scenes: ProjectScene[];
  actors: ProjectActor[];
  spriteSheets: ProjectSpriteSheet[];
  resourceAssetPaths: Map<string, string>;
  plugins: ProjectPlugin[];
  excalibur: ExcaliburVersion;
  warnings: string[];
  ts: TsModule;
}

/** Extra top-level dirs skipped only when the scan root is the package root itself (no src/). */
const ROOT_SCAN_SKIP = new Set(["public", "test", "tests", "e2e", "coverage", "out", "app"]);

/** Dirs that hold a plugin's runnable demo — scanned by doctor/upgrade alongside src/. */
const EXAMPLE_DIRS = ["example", "examples", "demo", "sample", "sandbox"];

export function listTsFiles(dir: string, out: string[] = [], skip: ReadonlySet<string> = SKIP_DIRS): string[] {
  if (out.length >= SCAN_CAP || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= SCAN_CAP) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip.has(entry.name) && !entry.name.startsWith(".")) listTsFiles(full, out, SKIP_DIRS);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * listTsFiles over several roots sharing ONE cap and ONE output array, then
 * deduped — overlapping roots (`--scope src --scope src/scenes`) would
 * otherwise put the same SourceFile into the program twice and double every
 * finding. A root equal to the package dir also skips test/public/etc.
 */
export function listTsFilesMany(roots: readonly string[], projectDir: string): string[] {
  const out: string[] = [];
  for (const root of roots) {
    const skip = path.resolve(root) === path.resolve(projectDir) ? new Set([...SKIP_DIRS, ...ROOT_SCAN_SKIP]) : SKIP_DIRS;
    listTsFiles(root, out, skip);
  }
  return [...new Set(out)];
}

/** Installed/declared @excaliburjs/* plugin dependencies of the project. */
function detectPlugins(projectDir: string, pkg: PackageJsonLike): ProjectPlugin[] {
  const plugins: ProjectPlugin[] = [];
  for (const [depsKey, dev] of [["dependencies", false], ["devDependencies", true]] as const) {
    for (const [name, range] of Object.entries(pkg[depsKey] ?? {})) {
      if (!name.startsWith("@excaliburjs/")) continue;
      let version: string | null = null;
      try {
        const installed = JSON.parse(
          fs.readFileSync(path.join(projectDir, "node_modules", name, "package.json"), "utf8")
        );
        version = installed.version ?? null;
      } catch {
        // not installed — report the declared range only
      }
      plugins.push({ name, range: String(range), version, dev });
    }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name));
}

/** Extensionless POSIX relative import specifier from one file to another. */
export function relativeSpecifier(fromFile: string, toFile: string): string {
  const rel = path.relative(path.dirname(fromFile), toFile).replace(/\.ts$/, "");
  const posix = rel.split(path.sep).join("/");
  return posix.startsWith(".") ? posix : `./${posix}`;
}

/**
 * Analyze the Excalibur project around `cwd`.
 * `opts.ts` injects a TypeScript module (tests).
 */
export interface AnalyzeProjectOptions {
  ts?: TsModule;
  /**
   * Generate needs the template layout and keeps throwing without src/;
   * doctor/upgrade pass false and fall back to scanning the package root
   * (plugin repos like excalibur-jasmine keep their sources at the root).
   */
  requireSrc?: boolean;
  /** Also scan example/examples/demo/sample/sandbox when they exist (doctor/upgrade). */
  includeExampleDirs?: boolean;
  /** Explicit scan roots (projectDir-relative or absolute); overrides the defaults. */
  scope?: string[];
}

export async function analyzeProject(cwd: string = process.cwd(), opts: AnalyzeProjectOptions = {}): Promise<Project> {
  const { requireSrc = true, includeExampleDirs = false, scope } = opts;
  const found = findProjectPackage(cwd);
  if (!found) {
    throw new GenerateError("no package.json found — are you inside a project?", {
      hint: "run this inside an Excalibur game project (try `ex create` to make one).",
    });
  }
  const { dir: projectDir, pkg } = found;
  const excalibur = detectExcaliburVersion(projectDir);
  const hasExcaliburDep = Boolean(
    excalibur.version ||
      excalibur.range ||
      pkg.dependencies?.excalibur ||
      pkg.devDependencies?.excalibur
  );
  if (!hasExcaliburDep) {
    throw new GenerateError("this project does not depend on excalibur", {
      hint: "ex generate scaffolds code for Excalibur games — `npm install excalibur` or start from `ex create`.",
    });
  }

  const plugins = detectPlugins(projectDir, pkg);

  const ts = opts.ts ?? (await loadTypescript(projectDir));
  const editor = createTsEditor(ts);

  const srcDir = path.join(projectDir, "src");
  const hasSrc = fs.existsSync(srcDir);
  if (!hasSrc && requireSrc) {
    throw new GenerateError("no src/ directory found", {
      hint: "ex generate expects the official template layout (src/main.ts etc.).",
    });
  }

  let sourceRoots: string[];
  if (scope && scope.length > 0) {
    sourceRoots = scope.map((s) => path.resolve(projectDir, s));
    const missing = sourceRoots.find((r) => !fs.existsSync(r));
    if (missing) {
      throw new GenerateError(`scope directory not found: ${path.relative(projectDir, missing) || "."}`, {
        hint: "pass --scope <dir> for each directory to scan, relative to the project root.",
      });
    }
  } else if (hasSrc) {
    sourceRoots = [srcDir];
    if (includeExampleDirs) {
      for (const d of EXAMPLE_DIRS) {
        const full = path.join(projectDir, d);
        if (fs.existsSync(full) && fs.statSync(full).isDirectory()) sourceRoots.push(full);
      }
    }
  } else {
    // No template layout at all — scan the package itself (node_modules/dist/test/public skipped).
    sourceRoots = [projectDir];
  }

  const viteShaped =
    ["vite.config.js", "vite.config.ts", "vite.config.mjs"].some((f) =>
      fs.existsSync(path.join(projectDir, f))
    ) || fs.existsSync(path.join(projectDir, "public"));
  const publicDir = path.join(projectDir, "public");

  // Generate's scene/actor/resources discovery is template-layout only — never
  // the example dirs (their Engine/scenes would leak into pickScene and wiring).
  const files = hasSrc ? listTsFiles(srcDir) : [];
  let mainFile: string | null = null;
  const mainCandidates: string[] = [];
  let resourcesFile: string | null = null;
  let resourceKeys: string[] = [];
  const scenes: ProjectScene[] = [];
  const actors: ProjectActor[] = [];
  const spriteSheets: ProjectSpriteSheet[] = [];
  const resourceAssetPaths = new Map<string, string>();

  for (const file of files) {
    let sf;
    try {
      sf = editor.parse(file, fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (editor.findEngineNews(sf).length > 0) mainCandidates.push(file);
    try {
      const lit = editor.findResourcesLiteral(sf);
      if (!resourcesFile) {
        resourcesFile = file;
        resourceKeys = editor.objectPropertyNames(lit);
        for (const prop of lit.properties) {
          const key = editor.propertyName(prop);
          if (!key || !ts.isPropertyAssignment(prop)) continue;
          const init = editor.unwrapExpression(prop.initializer);
          const arg = init && ts.isNewExpression(init) ? init.arguments?.[0] : null;
          if (arg && ts.isStringLiteral(arg)) resourceAssetPaths.set(key, arg.text);
        }
      }
    } catch {
      // no Resources literal in this file
    }
    for (const { className } of editor.findSceneClasses(sf)) {
      scenes.push({ className, file });
    }
    for (const { className } of editor.findActorClasses(sf)) {
      actors.push({ className, file });
    }
    for (const s of editor.findSpriteSheetConsts(sf)) {
      spriteSheets.push({ name: s.name, file, grid: s.grid, spacing: s.spacing, imageKey: s.imageKey });
    }
  }

  // Resolve each sheet's image path from the Resources literal (best effort).
  for (const s of spriteSheets) {
    s.assetPath = s.imageKey ? (resourceAssetPaths.get(s.imageKey) ?? null) : null;
  }

  const warnings: string[] = [];
  if (mainCandidates.length > 0) {
    mainFile =
      mainCandidates.find((f) => path.basename(f) === "main.ts") ?? mainCandidates[0];
    if (mainCandidates.length > 1) {
      warnings.push(
        `multiple files construct an Engine — using ${path.relative(projectDir, mainFile)}`
      );
    }
  }

  // Match scenes to their key in the engine's scenes map (best effort).
  if (mainFile) {
    try {
      const text = fs.readFileSync(mainFile, "utf8");
      const sf = editor.parse(mainFile, text);
      const engine = editor.findEngineNews(sf)[0];
      const optsLit = editor.engineOptionsLiteral(sf, engine!);
      const scenesProp = editor.findProperty(optsLit, "scenes");
      const scenesLit =
        scenesProp && ts.isPropertyAssignment(scenesProp)
          ? editor.unwrapExpression(scenesProp.initializer)
          : null;
      if (scenesLit && ts.isObjectLiteralExpression(scenesLit)) {
        for (const prop of scenesLit.properties) {
          const key = editor.propertyName(prop);
          const init = ts.isPropertyAssignment(prop) ? editor.unwrapExpression(prop.initializer) : null;
          const className = init ? init.getText(sf) : null;
          const scene = scenes.find((s) => s.className === className);
          if (scene && key) scene.key = key;
        }
      }
    } catch {
      // seam not parseable — keys stay unknown
    }
  }

  return {
    projectDir,
    srcDir,
    sourceRoots,
    pkg,
    viteShaped,
    publicDir,
    mainFile,
    resourcesFile,
    resourceKeys,
    scenes,
    actors,
    spriteSheets,
    resourceAssetPaths,
    plugins,
    excalibur,
    warnings,
    ts,
  };
}
