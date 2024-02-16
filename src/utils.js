import * as child from "child_process";
import * as fs from "fs";
import * as os from "os";
import { textMagenta, textYellow, terminal } from "./console.js";

// prompts transformers
export function transformerConfirm(value) {
  return value ? "Yes" : "No";
}
// prompts validators
export function validateProjectName(name) {
  if (name === "") return false;
  // if dir exists  =>false
  return true;
}
// prints
export function printDocs() {
  terminal.listItem({
    text: "Explore our Docs:",
    textRelevant: "https://excaliburjs.com/docs/",
  });
}
export function printProjectDirectory(projectDirectory) {
  terminal.listItem({
    text: "Enter your directory:",
    textRelevant: `cd ./${projectDirectory}`,
  });
}
export function printDependencyStatus(status) {
  const text = "Dependencies:";
  if (status) {
    terminal.listItem({ text, textRelevant: "Installed" });
  } else {
    terminal.listItem({
      text,
      textRelevant: "Not installed",
      colorRelevant: textYellow,
    });
  }
}
export function printRepoStatus(status) {
  const text = "Git Repository:";
  if (status) {
    terminal.listItem({
      text,
      textRelevant: "Initialized",
    });
  } else {
    terminal.listItem({
      text,
      textRelevant: "Not initialized",
      colorRelevant: textYellow,
    });
  }
}
//
export function printDiscord() {
  terminal.listItem({
    text: "Join our Discord:",
    textRelevant: "https://discord.com/invite/W6zUd4tTY3",
    colorRelevant: textMagenta,
  });
}
export function printSupport() {
  terminal.subtitle("If you find yourself stuck:");
  printDiscord();
  printDocs();
}
export function printActions(actions) {
  const { projectDirectory, dependencies } = actions;
  terminal.line();
  terminal.warning(" Remember: ");
  terminal.blank();
  terminal.listItem({
    text: "You can find your project in:",
    textRelevant: `./${projectDirectory}`,
  });
  if (dependencies) {
    terminal.listItem({ text: "Dependencies:", textRelevant: "Installed" });
  } else {
    terminal.listItem({
      text: "Dependencies:",
      textRelevant: "pending",
      colorRelevant: textYellow,
    });
  }
  terminal.blank();
}
export function bye() {
  terminal.print("👋 See u soon.");
  terminal.line();
  process.exit(1);
}
export function byeWithActions(actions) {
  printActions(actions);
  bye();
}
// Filesystem
export function isWindows() {
  return os.platform() === "win32";
}
export function runCommand(command, directory) {
  return new Promise((resolve, reject) => {
    child.exec(command, { cwd: directory }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      }
      resolve();
    });
  });
}
export function readFile(path, encoding = "utf-8") {
  return fs.readFileSync(path, encoding);
}
export function readDirectory(path) {
  return fs.readdirSync(path);
}
export function getResourceStats(path) {
  return fs.statSync(path);
}
export function writeFile(path, content, encoding = "utf-8") {
  fs.writeFileSync(path, content, encoding);
}
export function removeFile(path) {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error(err.message);
  }
}
export function removeFolder(path) {
  try {
    fs.rmSync(path, { recursive: true, force: true });
  } catch (err) {
    console.error(err.message);
  }
}

// formatter
export function slugify(str) {
  str = str.replace(/^\s+|\s+$/g, "");
  str = str.toLowerCase();
  str = str
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return str;
}

// arrays
export function sortByProp(a, b, prop) {
  if (a[prop] < b[prop]) return -1;
  if (a[prop] > b[prop]) return 1;
  return 0;
}
