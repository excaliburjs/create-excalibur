import { input, select } from "@inquirer/prompts";
import simpleGit from "simple-git";
import cleanTemplate from "../actions/clean-template.js";
import {
  printDependencyStatus,
  printProjectDirectory,
  printRepoStatus,
  printSupport,
  slugify,
  validateProjectName,
} from "../utils.js";
import { success, terminal } from "../console.js";
import initRepo from "../actions/initialize-repository.js";
import installDependencies from "../actions/install-dependencies.js";
import { TEMPLATES } from "../constants.js";

function outro(actions) {
  const { projectDirectory, startCommand, dependencies, repoInit } = actions;
  terminal.line();
  terminal.title(" Project configured. ", success);
  terminal.blank();
  printProjectDirectory(projectDirectory);

  terminal.listItem({
    text: "Run your project:",
    textRelevant: startCommand,
  });
  printDependencyStatus(dependencies);
  printRepoStatus(repoInit);
  terminal.blank();
  printSupport();
  terminal.blank();
  terminal.line();
  terminal.blank();
}
export async function createNewGame() {
  const projectName = slugify(
    await input({
      message: "Name your project:",
      transformer: slugify,
      validate: validateProjectName,
    })
  );
  const fullPath = `${process.cwd()}/${projectName}`;
  const templateValue = await select({
    message: "Choose your stack:",
    choices: TEMPLATES,
  });
  const template = TEMPLATES.find((item) => item.value === templateValue);
  const git = simpleGit();
  const spinner = terminal.spinner("Preparing files...");
  git.clone(template.repo, projectName, async (err) => {
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

    let actions = {
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
