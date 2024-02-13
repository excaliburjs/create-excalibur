import { confirm } from "@inquirer/prompts";
import { runCommand } from "../utils.js";
import { log, warn } from "../console.js";

export default async function installDependencies(projectName) {
  const installDependencies = await confirm({
    message: "Install dependencies ?",
  });
  if (installDependencies) {
    const installed = runCommand(`cd ${projectName} && npm i`);
    if (!installed) {
      log("-".repeat(55));
      warn("Unable to install dependencies.");
    }
  }
}
