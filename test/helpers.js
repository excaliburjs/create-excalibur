import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

export function readFixture(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel), "utf8");
}

/** Create a temp dir and point EXCALIBUR_HOME at it for the duration of `fn`. */
export async function withTempHome(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ex-docs-test-"));
  const previous = process.env.EXCALIBUR_HOME;
  process.env.EXCALIBUR_HOME = dir;
  try {
    return await fn(dir);
  } finally {
    if (previous === undefined) delete process.env.EXCALIBUR_HOME;
    else process.env.EXCALIBUR_HOME = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ex-docs-test-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
