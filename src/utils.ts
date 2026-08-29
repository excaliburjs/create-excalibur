import * as child from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import { textMagenta, textYellow, terminal, type ColorFn } from "./console.ts";

// prompts transformers
export function transformerConfirm(value: boolean): string {
  return value ? "Yes" : "No";
}
// prompts validators
export function validateProjectName(name: string): boolean {
  if (name === "") return false;
  // if dir exists  =>false
  return true;
}
// prints
export function printDocs(): void {
  terminal.listItem({
    text: "Explore our Docs:",
    textRelevant: "https://excaliburjs.com/docs/",
  });
}
export function printProjectDirectory(projectDirectory: string): void {
  terminal.listItem({
    text: "Enter your directory:",
    textRelevant: `cd ./${projectDirectory}`,
  });
}
export function printDependencyStatus(status: boolean): void {
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
export function printRepoStatus(status: boolean): void {
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
export function printDiscord(): void {
  terminal.listItem({
    text: "Join our Discord:",
    textRelevant: "https://discord.com/invite/W6zUd4tTY3",
    colorRelevant: textMagenta,
  });
}
export function printSupport(): void {
  terminal.subtitle("If you find yourself stuck:");
  printDiscord();
  printDocs();
}

export interface ScaffoldActions {
  projectDirectory: string;
  startCommand?: string | null;
  dependencies: boolean;
  repoInit?: boolean;
}

export function printActions(actions: ScaffoldActions): void {
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
export function bye(): never {
  terminal.print("👋 See u soon.");
  terminal.line();
  process.exit(1);
}
export function byeWithActions(actions: ScaffoldActions): never {
  printActions(actions);
  bye();
}
// Filesystem
export function isWindows(): boolean {
  return os.platform() === "win32";
}
// Known wart (see CLAUDE.md): resolves even after reject. Typed as-is; don't build on it.
export function runCommand(command: string, directory?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.exec(command, { cwd: directory }, (error) => {
      if (error) {
        reject(error);
      }
      resolve();
    });
  });
}
export function readFile(path: string, encoding: BufferEncoding = "utf-8"): string {
  return fs.readFileSync(path, encoding);
}
export function readDirectory(path: string): string[] {
  return fs.readdirSync(path);
}
export function getResourceStats(path: string): fs.Stats {
  return fs.statSync(path);
}
export function writeFile(path: string, content: string, encoding: BufferEncoding = "utf-8"): void {
  fs.writeFileSync(path, content, encoding);
}
export function removeFile(path: string): void {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
  }
}
export function removeFolder(path: string): void {
  try {
    fs.rmSync(path, { recursive: true, force: true });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
  }
}

// formatter
export function slugify(str: string): string {
  str = str.replace(/^\s+|\s+$/g, "");
  str = str.toLowerCase();
  str = str
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return str;
}

// arrays
export function sortByProp<T>(a: T, b: T, prop: keyof T): number {
  if (a[prop] < b[prop]) return -1;
  if (a[prop] > b[prop]) return 1;
  return 0;
}
