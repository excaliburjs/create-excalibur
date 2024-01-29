import { alert, log } from './console.js';
import { execSync } from 'child_process';
import * as fs from 'fs';

export function runCommand(command) {
  try {
    execSync(`${command}`, { stdio: 'inherit' });
  } catch (e) {
    alert(`Failed to execute ${command}.`);
    log(e);
    return false;
  }
  return true;
}
export function readFile(path, encoding = 'utf-8') {
  return fs.readFileSync(path, encoding);
}
export function writeFile(path, content, encoding = 'utf-8') {
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
