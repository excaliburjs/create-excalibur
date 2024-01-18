import { alert, log } from './console.js';
import { execSync } from 'child_process';
import * as fs from 'fs';

export function run_command(command) {
  try {
    execSync(`${command}`, { stdio: 'inherit' });
  } catch (e) {
    alert(`Failed to execute ${command}.`);
    log(e);
    return false;
  }
  return true;
}

export function mkdir(path) {
  fs.mkdirSync(path);
}
export function read_file(path, encoding = 'utf-8') {
  return fs.readFileSync(path, encoding);
}
export function write_file(path, content, encoding = 'utf-8') {
  fs.writeFileSync(path, content, encoding);
}
export function copy(from, to) {
  fs.copyFileSync(from, to);
}
