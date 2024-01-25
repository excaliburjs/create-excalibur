import { alert, log } from './console.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
export function getFileExtension(filePath) {
  return path.extname(filePath).slice(1);
}
export function isMediaFile(fileExtension) {
  const mediaExtensions = ['png', 'mp3', 'wav', 'ogg', 'ico'];
  const result = mediaExtensions.some(
    (extension) => extension === fileExtension.toLowerCase()
  );
  return result;
}
export function mkdir(path) {
  fs.mkdirSync(path);
}
export function readFile(path, encoding = 'utf-8') {
  return fs.readFileSync(path, encoding);
}
export function writeFile(path, content, encoding = 'utf-8') {
  fs.writeFileSync(path, content, encoding);
}
export function copy(from, to) {
  const sourceStream = fs.createReadStream(from);
  const destinationStream = fs.createWriteStream(to);

  sourceStream.pipe(destinationStream);
}
