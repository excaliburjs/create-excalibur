import { input, select } from "@inquirer/prompts";
import { simpleGit } from "simple-git";
import cleanTemplate from "../actions/clean-template.ts";
import {
  printDependencyStatus,
  printProjectDirectory,
  printRepoStatus,
  printSupport,
  slugify,
  validateProjectName,
} from "../utils.ts";
import { success, terminal } from "../console.ts";
import type { ScaffoldActions } from "../utils.ts";
import initRepo from "../actions/initialize-repository.ts";
import installDependencies from "../actions/install-dependencies.ts";
import { SAMPLES } from "../constants.ts";

function outro(actions: ScaffoldActions): void {
  const { projectDirectory, startCommand, dependencies, repoInit } = actions;
  terminal.line();
  terminal.title(" Project configured. ", success);
  terminal.blank();
  printProjectDirectory(projectDirectory);

  terminal.listItem({
    text: "Run your project:",
    textRelevant: startCommand ?? "",
  });
  printDependencyStatus(dependencies);
  printRepoStatus(repoInit ?? false);
  terminal.blank();
  printSupport();
  terminal.blank();
  terminal.line();
  terminal.blank();
}
export async function createSample(): Promise<void> {
  const projectName = slugify(
    await input({
      message: "Name your project:",
      transformer: slugify,
      validate: validateProjectName,
    })
  );
  const fullPath = `${process.cwd()}/${projectName}`;
  const templateValue = await select({
    message: "Choose your sample:",
    choices: SAMPLES,
  });
  const template = SAMPLES.find((item) => item.value === templateValue)!;
  const git = simpleGit();
  const spinner = terminal.spinner("Preparing files...");
// simple-git still supports the legacy trailing-callback form at runtime,
  // but v3's types dropped it — keep the existing behavior through a cast.
  type CloneWithCallback = (repo: string, local: string, cb: (err: Error | null) => void) => unknown;
  (git as unknown as { clone: CloneWithCallback }).clone(template.repo, projectName, async (err) => {
    if (err) {
      terminal.blank();
      terminal.warning("Error:");
      terminal.print(err.message);
      spinner.fail("Failed prepare files.");
      process.exit(1);
    }

    // clean files
    try {
      cleanTemplate(fullPath, projectName);
      spinner.succeed("Files configured.");
    } catch (error) {
      spinner.fail("Unable to config files.");
      process.exit(1);
    }

    const actions: ScaffoldActions = {
      projectDirectory: projectName,
      startCommand: template.startCommand,
      dependencies: false,
      repoInit: false,
    };

    await installDependencies(projectName, actions);
    await initRepo(projectName, git, actions);

    setTimeout(() => {
      outro(actions);
    }, 0.6 * 1000);
  });
}
