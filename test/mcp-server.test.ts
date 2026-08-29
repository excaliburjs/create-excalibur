import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.ts");

/**
 * Smoke test: drive `ex mcp` over stdio with raw newline-delimited JSON-RPC.
 * Also asserts protocol purity — every stdout line must parse as JSON, which
 * catches any future stray console.log/terminal.* in the server path.
 */
test("ex mcp speaks MCP over stdio and keeps stdout protocol-only", { timeout: 30_000 }, async () => {
  const child = spawn(process.execPath, [CLI, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
  interface RpcMessage {
    id?: number | string | null;
    // protocol smoke test — the payload shapes are asserted dynamically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any;
  }
  const responses = new Map<number | string, RpcMessage>();
  let buffer = "";
  const resolveWaiters: Array<() => void> = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: RpcMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        child.kill();
        throw new Error(`non-JSON on stdout: ${JSON.stringify(line)}`);
      }
      if (msg.id != null) responses.set(msg.id, msg);
      resolveWaiters.splice(0).forEach((fn) => fn());
    }
  });

  const send = (msg: object) => child.stdin.write(JSON.stringify(msg) + "\n");
  const waitFor = async (id: number | string): Promise<RpcMessage> => {
    const deadline = Date.now() + 20_000;
    while (!responses.has(id)) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for response ${id}`);
      await new Promise<void>((resolve) => {
        resolveWaiters.push(resolve);
        setTimeout(resolve, 250);
      });
    }
    return responses.get(id)!;
  };

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    const init = await waitFor(1);
    assert.equal(init.result.serverInfo.name, "create-excalibur");
    // Pins the walk-up package.json lookup (src/pkg-info.js): a wrong relative
    // hop degrades to "0.0.0" silently, so assert the real version end-to-end.
    const rootPkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(init.result.serverInfo.version, rootPkg.version);
    assert.ok(init.result.capabilities.tools);

    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const list = await waitFor(2);
    const names = list.result.tools.map((t: { name: string }) => t.name);
    assert.equal(names.length, 17);
    for (const expected of ["docs_search", "docs_get_page", "docs_sync", "analyze_project", "generate_actor", "generate_label", "generate_scene", "generate_resource", "generate_spritesheet", "generate_animation", "update_engine", "list_templates", "create_project", "doctor", "upgrade"]) {
      assert.ok(names.includes(expected), `missing tool ${expected}`);
    }

    // A tool that needs no project or network, end-to-end through the SDK.
    send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "list_templates", arguments: { kind: "template" } } });
    const call = await waitFor(3);
    const parsed = JSON.parse(call.result.content[0].text);
    assert.ok(parsed.templates.some((t: { id: string }) => t.id === "typescript_vite"));

    // Execution failures surface as isError results, not protocol errors.
    send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "docs_search", arguments: {} } });
    const bad = await waitFor(4);
    assert.equal(bad.result.isError, true);
    assert.match(bad.result.content[0].text, /query is required/);
  } finally {
    child.kill();
  }
});
