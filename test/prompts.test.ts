import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { PromptCancelled, isPromptCancelled, isPromptExit, select } from "../src/prompts.ts";

const ESC = "\u001b";
const CTRL_N = "\u000e";

function fakeTerminal() {
  const input = new PassThrough();
  const output = new Writable({ write: (_chunk, _enc, cb) => cb() }) as Writable & { columns?: number };
  output.columns = 80;
  return { input, output };
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function type(input: PassThrough, ...chunks: string[]): Promise<void> {
  for (const chunk of chunks) {
    input.write(chunk);
    await tick();
  }
}

const CHOICES = [
  { name: "alpha", value: "alpha" },
  { name: "bravo", value: "bravo" },
  { name: "charlie", value: "charlie" },
];

function pick(theme?: object) {
  const { input, output } = fakeTerminal();
  const before = input.listenerCount("keypress");
  const promise = select({ message: "Pick:", choices: CHOICES, ...(theme ? { theme } : {}) }, { input, output });
  return { input, promise, listenersAdded: () => input.listenerCount("keypress") - before };
}

test("Esc rejects with PromptCancelled and removes its keypress listener", async () => {
  const { input, promise, listenersAdded } = pick();
  await tick();
  await type(input, ESC); // lone ESC → readline emits `escape` after its escape-code timeout
  await assert.rejects(promise, (err: unknown) => err instanceof PromptCancelled && isPromptCancelled(err) && isPromptExit(err));
  assert.equal(listenersAdded(), 0);
});

test("vim j/k navigation is on by default", async () => {
  const { input, promise } = pick();
  await tick();
  await type(input, "j", "j", "k", "\r");
  assert.equal(await promise, "bravo");
});

test("emacs Ctrl-N navigation is on by default", async () => {
  const { input, promise } = pick();
  await tick();
  await type(input, CTRL_N, "\r");
  assert.equal(await promise, "bravo");
});

test("a per-call theme still overrides the default keybindings", async () => {
  // With vim off, inquirer re-enables type-to-search, so `b` matches "bravo" instead of moving.
  const { input, promise } = pick({ keybindings: [] });
  await tick();
  await type(input, "b", "\r");
  assert.equal(await promise, "bravo");
});

test("arrow keys (ESC-prefixed sequences) do not trigger the Esc cancel", async () => {
  const { input, promise } = pick();
  await tick();
  await type(input, `${ESC}[B`, "\r");
  assert.equal(await promise, "bravo");
});

test("a caller-supplied abort signal still surfaces inquirer's AbortPromptError", async () => {
  const { input, output } = fakeTerminal();
  const controller = new AbortController();
  const promise = select({ message: "Pick:", choices: CHOICES }, { input, output, signal: controller.signal });
  await tick();
  controller.abort(new Error("caller"));
  await assert.rejects(promise, (err: unknown) => err instanceof Error && err.name === "AbortPromptError" && !isPromptCancelled(err));
});

test("isPromptExit covers Ctrl-C style exits and plain errors are not exits", () => {
  const exit = new Error("boom");
  exit.name = "ExitPromptError";
  assert.equal(isPromptExit(exit), true);
  assert.equal(isPromptExit(new Error("User force closed the prompt with SIGINT")), true);
  assert.equal(isPromptExit(new Error("nope")), false);
  assert.equal(isPromptExit("string"), false);
});
