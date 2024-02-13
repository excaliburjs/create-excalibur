import { confirm } from "@inquirer/prompts";
import { byeWithActions, runCommand, transformerConfirm } from "../utils.js";
import { terminal } from "../console.js";

export default async function installDependencies(projectName, actions) {
  const confirmInstallDependencies = await confirm({
    message: "Install dependencies?",
    transformer: transformerConfirm,
  }).catch((e) => {
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
      }).catch((e) => {
        byeWithActions(actions);
      });
      if (printLog) {
        setTimeout(() => {
          terminal.print(error);
        }, 0.5 * 1000);
      }
    }
  }
}
