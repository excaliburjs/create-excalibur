import { alert, log } from './console.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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
export function get_file_extension(filePath) {
  return path.extname(filePath).slice(1);
}
export function is_media_file(file_extension) {
  const media_extensions = ['png', 'mp3', 'wav', 'ogg'];
  const result = media_extensions.some(
    (media_ext) => media_ext === file_extension.toLowerCase()
  );
  return result;
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
  // fs.copyFileSync(from, to);
  const sourceStream = fs.createReadStream(from);
  const destinationStream = fs.createWriteStream(to);

  sourceStream.pipe(destinationStream);
}
