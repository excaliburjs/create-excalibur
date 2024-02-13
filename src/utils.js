import {
  alert,
  log,
  textBlue,
  textGray,
  textMagenta,
  textWhite,
} from "./console.js";
import { execSync } from "child_process";
import * as fs from "fs";

export function printDocs() {
  const LINK_DOCS = "https://excaliburjs.com/docs/";
  log(`${textGray("Explore our Docs:")} ${textBlue(LINK_DOCS)}`);
}
export function printDiscord() {
  const LINK_DISCORD = "https://discord.com/invite/W6zUd4tTY3";
  log(`${textGray("Join our Discord:")} ${textMagenta(LINK_DISCORD)}`);
}
export function printSupport() {
  log(textWhite("If you find yourself stuck:"));
  printDiscord();
  printDocs();
  log("-".repeat(55));
}

export function runCommand(command) {
  try {
    execSync(`${command}`, { stdio: "inherit" });
  } catch (e) {
    alert(`Failed to execute ${command}.`);
    log(e);
    return false;
  }
  return true;
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
export function slugify(str) {
  str = str.replace(/^\s+|\s+$/g, "");
  str = str.toLowerCase();
  str = str
    .replace(/[^a-z0-9 -]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return str;
}
