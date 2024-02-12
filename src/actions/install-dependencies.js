import { confirm } from "@inquirer/prompts";
import { runCommand } from "../utils.js";
import { warn } from "../console.js";

export default async function installDependencies(projectName) {
  const installDependencies = await confirm({
    message: "Install dependencies ?",
  });
  if (installDependencies) {
    const installed = runCommand(`cd ${projectName} && npm i`);
    if (!installed) warn("Unable to install dependencies.");
  }
}
