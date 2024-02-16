import { confirm } from "@inquirer/prompts";
import { byeWithActions, transformerConfirm } from "../utils.js";
import { terminal } from "../console.js";

export default async function initRepo(projectName, git, actions) {
  const confirmInitRepo = await confirm({
    message: "Initialize a new git repository?",
    transformer: transformerConfirm,
  }).catch((e) => {
    byeWithActions(actions);
  });

  if (confirmInitRepo) {
    try {
      const spinner = terminal.spinner("Initializing...");
      git.cwd(projectName);
      await git.init();
      actions.repoInit = true;
      spinner.succeed("Repository initialized.");
    } catch (error) {
      spinner.fail("Unable to initialize repository.");
    }
  }
}
