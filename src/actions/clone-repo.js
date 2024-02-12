import { runCommand } from "../utils.js";

export default function cloneRepo(repoName, projectName) {
  return runCommand(`git clone --depth 1 ${repoName} ${projectName}`);
}
