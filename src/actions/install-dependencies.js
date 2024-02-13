import { confirm } from "@inquirer/prompts";
import { runCommand } from "../utils.js";
import { printLine, warn } from "../console.js";

export default async function installDependencies(projectName) {
  const installDependencies = await confirm({
    message: "Install dependencies ?",
  });
  if (installDependencies) {
    const installed = runCommand(`cd ${projectName} && npm i`);
    if (!installed) {
      printLine();
      warn("Unable to install dependencies.");
    }
  }
}
