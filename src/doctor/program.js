import * as fs from "node:fs";
import * as path from "node:path";
import { GenerateError } from "../generate/errors.js";
import { listTsFiles } from "../generate/project.js";

/**
 * Build a ts.Program + TypeChecker over the project's src/ files.
 *
 * This is the ONLY place the repo relaxes the "syntactic API only" invariant
 * documented in ts-loader.js/ts-edit.js: doctor's rules are type-aware
 * (transitive Actor subclasses need checker.getBaseTypes). Two rules ride on
 * that relaxation:
 *  - never call program.getSemanticDiagnostics()/emit — the checker is lazy,
 *    rules only pay for the nodes they touch, and unresolved imports degrade
 *    to `any` (false negatives) instead of crashing;
 *  - root files always come from our own listTsFiles(srcDir) scan, never the
 *    tsconfig's include/exclude (imports pull in the rest; solution-style
 *    configs with `files: []` are a non-issue).
 *
 * @param {{ projectDir: string, srcDir: string, ts: object }} project result of analyzeProject
 * @returns {{ ts: object, program: object, checker: object, sourceFiles: object[], projectDir: string }}
 */
export function createProgramContext(project) {
  const { ts, projectDir, srcDir } = project;
  if (typeof ts.createProgram !== "function" || typeof ts.getParsedCommandLineOfConfigFile !== "function") {
    throw new GenerateError(
      `Your project's TypeScript (${ts.version ?? "unknown version"}) does not expose the full compiler API ex doctor needs`,
      {
        hint: "Install typescript 5.x or 6.x as a devDependency (e.g. `npm i -D typescript@6`).",
      }
    );
  }

  const options = resolveCompilerOptions(ts, projectDir);
  const rootFiles = listTsFiles(srcDir);
  const host = ts.createCompilerHost(options);

  // Fail fast when excalibur's declarations can't resolve (missing/typeless
  // node_modules): every actor type would silently be `any` and every rule
  // would pass. resolveModuleName is direct — no dependence on user imports.
  const probe = ts.resolveModuleName("excalibur", path.join(srcDir, "__doctor_probe__.ts"), options, host);
  if (!probe.resolvedModule) {
    throw new GenerateError("could not resolve excalibur's type declarations", {
      hint: "ex doctor type-checks against excalibur's .d.ts — run `npm install` in your project first.",
    });
  }

  const program = ts.createProgram({ rootNames: rootFiles, options, host });
  const checker = program.getTypeChecker();
  const sourceFiles = rootFiles.map((f) => program.getSourceFile(f)).filter(Boolean);
  return { ts, program, checker, sourceFiles, projectDir };
}

/**
 * Read <projectDir>/tsconfig.json if present (extends chains and paths/baseUrl
 * are resolved by TS itself), else vite-flavored defaults. Deliberately no
 * ts.findConfigFile — it walks up parent dirs, and a monorepo/HOME tsconfig
 * must not hijack the run. Emit-related options are neutralized either way.
 */
function resolveCompilerOptions(ts, projectDir) {
  let options = null;
  const configPath = path.join(projectDir, "tsconfig.json");
  if (fs.existsSync(configPath)) {
    const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new GenerateError(
          `could not read tsconfig.json: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
          { hint: "fix the tsconfig error or delete tsconfig.json to let ex doctor use defaults." }
        );
      },
    });
    options = parsed?.options ?? null;
  }
  if (!options) {
    options = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      // Bundler resolution is TS >=5.0; every supported TS has it, but guard anyway.
      moduleResolution: ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeJs,
      strict: false,
      esModuleInterop: true,
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      types: [],
    };
  }
  return {
    ...options,
    noEmit: true,
    skipLibCheck: true,
    incremental: false,
    composite: false,
    declaration: false,
  };
}
