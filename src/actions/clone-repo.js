import { printLine, terminal, warn } from "../console.js";
import { runCommand } from "../utils.js";

export default async function cloneRepo(repoName, projectName) {
  const cloned = await runCommand(
    `git clone --depth 1 ${repoName} ${projectName}`
  );
  if (!cloned) {
    printLine();
    terminal.warning("Unable to clone repo.");
    printLine();
  }
  return cloned;
}
