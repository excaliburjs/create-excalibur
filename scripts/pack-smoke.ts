/**
 * Pack-and-install smoke test: proves the published artifact works.
 * `npm pack` (prepack builds dist/), install the tarball into a scratch
 * project, then exercise exactly the things only an installed copy can
 * break: bin wiring + shebang + exec bits, the compiled module graph with
 * rewritten specifiers, and the MCP stdout-JSON + self-version handshake
 * (the dist-layout-sensitive package.json walk-up).
 */
import { execFileSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): string {
  return execFileSync(cmd, args, { encoding: "utf8", cwd: opts.cwd ?? root });
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ex-pack-smoke-"));
let tarball = "";
try {
  console.log("packing…");
  tarball = path.join(root, run("npm", ["pack", "--silent"]).trim().split("\n").pop()!);

  // The tarball must contain no TypeScript sources.
  const listing = run("tar", ["-tzf", tarball]);
  const tsFiles = listing.split("\n").filter((f) => f.endsWith(".ts"));
  if (tsFiles.length > 0) fail(`tarball ships TypeScript sources:\n${tsFiles.join("\n")}`);
  if (!listing.includes("package/dist/index.js")) fail("tarball is missing dist/index.js");

  console.log("installing into a scratch project…");
  fs.writeFileSync(path.join(scratch, "package.json"), JSON.stringify({ name: "smoke", private: true }));
  run("npm", ["install", "--no-save", "--no-audit", "--no-fund", tarball], { cwd: scratch });

  const bin = (name: string) => path.join(scratch, "node_modules", ".bin", name);
  for (const name of ["create-excalibur", "ex", "excalibur"]) {
    const out = run(bin(name), ["--help"], { cwd: scratch });
    if (!out.includes("Usage: ex [command]")) fail(`${name} --help printed something unexpected`);
  }
  // Deep module graph (docs stack) through rewritten specifiers.
  const docsHelp = run(bin("ex"), ["docs", "--help"], { cwd: scratch });
  if (!docsHelp.includes("Search the Excalibur docs")) fail("ex docs --help failed");

  console.log("mcp handshake…");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin("ex"), ["mcp"], { cwd: scratch, stdio: ["pipe", "pipe", "inherit"] });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("timed out waiting for the initialize response"));
    }, 20_000);
    let buffer = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (!line.trim()) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          clearTimeout(timer);
          child.kill();
          reject(new Error(`non-JSON on MCP stdout: ${JSON.stringify(line)}`));
          return;
        }
        if (msg.id === 1) {
          clearTimeout(timer);
          child.kill();
          const version = msg.result?.serverInfo?.version;
          if (version !== pkg.version) {
            reject(new Error(`serverInfo.version is ${JSON.stringify(version)}, expected ${pkg.version} — the package.json walk-up broke under dist/`));
            return;
          }
          resolve();
        }
      }
    });
    child.on("error", reject);
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "pack-smoke", version: "0" } },
      }) + "\n"
    );
  });

  console.log(`✓ pack smoke passed (${path.basename(tarball)})`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
  if (tarball) fs.rmSync(tarball, { force: true });
}
