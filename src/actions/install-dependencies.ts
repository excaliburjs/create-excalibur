import { confirm } from "@inquirer/prompts";
import { byeWithActions, runCommand, transformerConfirm, type ScaffoldActions } from "../utils.ts";
import { terminal } from "../console.ts";

export default async function installDependencies(
  projectName: string,
  actions: ScaffoldActions
): Promise<void> {
  const confirmInstallDependencies = await confirm({
    message: "Install dependencies?",
    transformer: transformerConfirm,
  }).catch(() => {
    byeWithActions(actions);
  });

  if (confirmInstallDependencies) {
    const spinner = terminal.spinner("Installing dependencies...");
    try {
      await runCommand("npm install", projectName);
      actions.dependencies = true;
      spinner.succeed("Dependencies installed.");
    } catch (error) {
      spinner.fail("Unable to install dependencies.");
      const printLog = await confirm({
        message: "print logs?",
        transformer: transformerConfirm,
      }).catch(() => {
        byeWithActions(actions);
      });
      if (printLog) {
        setTimeout(() => {
          terminal.print(String(error));
        }, 0.5 * 1000);
      }
    }
  }
}
