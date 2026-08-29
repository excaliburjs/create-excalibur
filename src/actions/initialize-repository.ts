import { confirm } from "@inquirer/prompts";
import type { SimpleGit } from "simple-git";
import { byeWithActions, transformerConfirm, type ScaffoldActions } from "../utils.ts";
import { terminal } from "../console.ts";

export default async function initRepo(
  projectName: string,
  git: SimpleGit,
  actions: ScaffoldActions
): Promise<void> {
  const confirmInitRepo = await confirm({
    message: "Initialize a new git repository?",
    transformer: transformerConfirm,
  }).catch(() => {
    byeWithActions(actions);
  });

  if (confirmInitRepo) {
    // Declared before try so the catch can reach it (the old code referenced
    // an out-of-scope `spinner` in the catch — a latent ReferenceError).
    const spinner = terminal.spinner("Initializing...");
    try {
      git.cwd(projectName);
      await git.init();
      actions.repoInit = true;
      spinner.succeed("Repository initialized.");
    } catch {
      spinner.fail("Unable to initialize repository.");
    }
  }
}
