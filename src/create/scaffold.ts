import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import cleanTemplate from "../actions/clean-template.ts";
import { HintedError, type HintedErrorOptions } from "../errors.ts";
import { slugify } from "../utils.ts";

const execAsync = promisify(exec);

export class ScaffoldError extends HintedError {
  constructor(message: string, opts?: HintedErrorOptions) {
    super(message, opts);
    this.name = "ScaffoldError";
  }
}

/** The subset of a template/sample registry entry that scaffolding needs. */
export interface ScaffoldTemplate {
  value: string;
  repo: string;
  startCommand?: string | null;
}

export interface ScaffoldOptions {
  /** project name (slugified into the directory name) */
  name: string;
  /** resolved template entry */
  template: ScaffoldTemplate;
  /** parent directory the project folder is created in */
  cwd?: string;
  /** run `npm install` (failure → warning, not error) */
  install?: boolean;
  /** run `git init` (failure → warning, not error) */
  initGit?: boolean;
  /** injectable clone (tests) */
  clone?: (repo: string, dir: string) => Promise<unknown>;
}

export interface ScaffoldResult {
  projectDir: string;
  projectName: string;
  template: string;
  startCommand: string | null;
  installed: boolean;
  gitInitialized: boolean;
  warnings: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Promptless project scaffolding core: clone a template repo into a new
 * directory and clean it up. No TUI, no process.exit — throws ScaffoldError.
 */
export async function scaffoldProject({
  name,
  template,
  cwd = process.cwd(),
  install = false,
  initGit = false,
  clone,
}: ScaffoldOptions): Promise<ScaffoldResult> {
  const projectName = slugify(name ?? "");
  if (!projectName) {
    throw new ScaffoldError(`"${name}" does not slugify to a usable directory name.`, {
      hint: "use letters and numbers, e.g. \"my-game\".",
    });
  }
  if (!template?.repo) {
    throw new ScaffoldError("no template repository given.");
  }
  const projectDir = path.join(path.resolve(cwd), projectName);
  if (fs.existsSync(projectDir)) {
    throw new ScaffoldError(`${projectDir} already exists.`, { hint: "pick a different name or remove the directory." });
  }

  const doClone = clone ?? ((repo: string, dir: string) => simpleGit().clone(repo, dir));
  try {
    await doClone(template.repo, projectDir);
  } catch (error) {
    throw new ScaffoldError(`cloning ${template.repo} failed: ${errorMessage(error)}`, {
      hint: "check your network connection and that git is installed.",
      cause: error,
    });
  }

  cleanTemplate(projectDir, projectName);

  const warnings: string[] = [];
  let installed = false;
  if (install) {
    try {
      await execAsync("npm install", { cwd: projectDir });
      installed = true;
    } catch (error) {
      warnings.push(`npm install failed: ${errorMessage(error)} — run it manually in ${projectDir}.`);
    }
  }

  let gitInitialized = false;
  if (initGit) {
    try {
      await simpleGit(projectDir).init();
      gitInitialized = true;
    } catch (error) {
      warnings.push(`git init failed: ${errorMessage(error)}`);
    }
  }

  return {
    projectDir,
    projectName,
    template: template.value,
    startCommand: template.startCommand ?? null,
    installed,
    gitInitialized,
    warnings,
  };
}
