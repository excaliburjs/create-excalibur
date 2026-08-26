import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectPackage, detectExcaliburVersion } from "../docs/version.js";
import { loadTypescript } from "./ts-loader.js";
import { createTsEditor } from "./ts-edit.js";
import { GenerateError } from "./errors.js";

const SCAN_CAP = 500;
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git"]);

export function listTsFiles(dir, out = []) {
  if (out.length >= SCAN_CAP || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (out.length >= SCAN_CAP) break;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) listTsFiles(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Installed/declared @excaliburjs/* plugin dependencies of the project.
 * @returns {{ name: string, range: string, version: string | null, dev: boolean }[]}
 */
function detectPlugins(projectDir, pkg) {
  const plugins = [];
  for (const [depsKey, dev] of [["dependencies", false], ["devDependencies", true]]) {
    for (const [name, range] of Object.entries(pkg[depsKey] ?? {})) {
      if (!name.startsWith("@excaliburjs/")) continue;
      let version = null;
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
export function relativeSpecifier(fromFile, toFile) {
  const rel = path.relative(path.dirname(fromFile), toFile).replace(/\.ts$/, "");
  const posix = rel.split(path.sep).join("/");
  return posix.startsWith(".") ? posix : `./${posix}`;
}

/**
 * Analyze the Excalibur project around `cwd`.
 * @param {string} [cwd]
 * @param {{ ts?: object }} [opts] inject a TypeScript module (tests)
 */
export async function analyzeProject(cwd = process.cwd(), opts = {}) {
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
  if (!fs.existsSync(srcDir)) {
    throw new GenerateError("no src/ directory found", {
      hint: "ex generate expects the official template layout (src/main.ts etc.).",
    });
  }

  const viteShaped =
    ["vite.config.js", "vite.config.ts", "vite.config.mjs"].some((f) =>
      fs.existsSync(path.join(projectDir, f))
    ) || fs.existsSync(path.join(projectDir, "public"));
  const publicDir = path.join(projectDir, "public");

  const files = listTsFiles(srcDir);
  let mainFile = null;
  let mainCandidates = [];
  let resourcesFile = null;
  let resourceKeys = [];
  const scenes = [];
  const actors = [];
  const spriteSheets = [];
  const resourceAssetPaths = new Map();

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

  const warnings = [];
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
      const optsLit = editor.engineOptionsLiteral(sf, engine);
      const scenesProp = editor.findProperty(optsLit, "scenes");
      const scenesLit = scenesProp?.initializer
        ? editor.unwrapExpression(scenesProp.initializer)
        : null;
      if (scenesLit && scenesLit.properties) {
        for (const prop of scenesLit.properties) {
          const key = editor.propertyName(prop);
          const init = prop.initializer ? editor.unwrapExpression(prop.initializer) : null;
          const className = init && init.getText ? init.getText(sf) : null;
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
