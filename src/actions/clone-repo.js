import { printLine, warn } from "../console.js";
import { runCommand } from "../utils.js";

export default function cloneRepo(repoName, projectName) {
  const cloned = runCommand(`git clone --depth 1 ${repoName} ${projectName}`);
  if (!cloned) {
    printLine();
    warn("Unable to clone repo.");
    printLine();
  }
  return cloned;
}
