import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { simpleGit } from "simple-git";
import cleanTemplate from "../actions/clean-template.js";
import { slugify } from "../utils.js";

const execAsync = promisify(exec);

export class ScaffoldError extends Error {
  constructor(message, { hint, cause } = {}) {
    super(message, { cause });
    this.name = "ScaffoldError";
    this.hint = hint;
  }
}

/**
 * Promptless project scaffolding core: clone a template repo into a new
 * directory and clean it up. No TUI, no process.exit — throws ScaffoldError.
 *
 * @param {object} opts
 * @param {string} opts.name project name (slugified into the directory name)
 * @param {{value: string, repo: string, startCommand?: string}} opts.template resolved template entry
 * @param {string} [opts.cwd] parent directory the project folder is created in
 * @param {boolean} [opts.install] run `npm install` (failure → warning, not error)
 * @param {boolean} [opts.initGit] run `git init` (failure → warning, not error)
 * @param {(repo: string, dir: string) => Promise<unknown>} [opts.clone] injectable clone (tests)
 * @returns {Promise<{projectDir: string, projectName: string, template: string, startCommand: string|null, installed: boolean, gitInitialized: boolean, warnings: string[]}>}
 */
export async function scaffoldProject({ name, template, cwd = process.cwd(), install = false, initGit = false, clone }) {
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

  const doClone = clone ?? ((repo, dir) => simpleGit().clone(repo, dir));
  try {
    await doClone(template.repo, projectDir);
  } catch (error) {
    throw new ScaffoldError(`cloning ${template.repo} failed: ${error?.message ?? error}`, {
      hint: "check your network connection and that git is installed.",
      cause: error,
    });
  }

  cleanTemplate(projectDir, projectName);

  const warnings = [];
  let installed = false;
  if (install) {
    try {
      await execAsync("npm install", { cwd: projectDir });
      installed = true;
    } catch (error) {
      warnings.push(`npm install failed: ${error?.message ?? error} — run it manually in ${projectDir}.`);
    }
  }

  let gitInitialized = false;
  if (initGit) {
    try {
      await simpleGit(projectDir).init();
      gitInitialized = true;
    } catch (error) {
      warnings.push(`git init failed: ${error?.message ?? error}`);
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
