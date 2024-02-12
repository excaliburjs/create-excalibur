import { confirm } from "@inquirer/prompts";
import { runCommand } from "../utils.js";

export default async function initRepo(projectName) {
  const initRepo = await confirm({
    message: "Initialize a new git repository?",
  });
  if (initRepo) {
    const installed = runCommand(`cd ${projectName} && git init`);
    if (!installed) warn("Unable to initialize git repository.");
  }
}
