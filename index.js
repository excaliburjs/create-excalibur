#!/usr/bin/env node
import * as path from "node:path";
import { select } from "@inquirer/prompts";
import intro from "./src/actions/intro.js";
import { terminal } from "./src/console.js";
import { bye } from "./src/utils.js";
import { FLOW_CHOICES, FLOWS } from "./src/constants.js";
import { resolveInvocation } from "./src/dispatch.js";
import { maybeNotifyUpdate } from "./src/docs/update-check.js";

const USAGE = `
Usage: ex [command] [options]

Commands:
  (none)      interactive menu
  create      create a new Excalibur game from a template (ex create my-game)
  sample      create a sample project
  inspect     download and inspect a showcase game
  docs        search the Excalibur docs & API (try: ex docs --help)
  generate    generate an actor, label, scene, resource, engine, material, spritesheet, or animation (alias: g)
  doctor      check your game for common mistakes (actors never added, unnamed actors)
  mcp         start an MCP server over stdio (docs + codegen tools for AI agents)

Options:
  -h, --help  show this help
`.trimStart();

function isPromptExit(error) {
  return error?.name === "ExitPromptError" || error?.message?.includes("User force closed");
}

async function main() {
  const argv = process.argv.slice(2);
  if (process.stdout.isTTY && process.stderr.isTTY) {
    process.once("beforeExit", () => maybeNotifyUpdate());
  }
  const invocation = resolveInvocation({
    binName: path.basename(process.argv[1] ?? ""),
    argv,
  });

  if (invocation.kind === "help") {
    process.stdout.write(USAGE);
    return;
  }

  try {
    if (invocation.kind === "flow") {
      const { flow, rest } = invocation;
      if (flow !== "docs" && flow !== "mcp" && flow !== "doctor") intro();
      await FLOWS[flow](rest);
      return;
    }
    if (invocation.kind === "create") {
      // create-* convention: `npm create excalibur my-game` forwards the positional.
      intro();
      await FLOWS.create([invocation.name]);
      return;
    }
    if (invocation.kind === "unknown") {
      process.stderr.write(`Unknown command "${invocation.command}".\n\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
    intro();
    const flow = await select({
      message: "Want do you want do?",
      choices: FLOW_CHOICES,
    });
    await FLOWS[flow]();
  } catch (error) {
    if (isPromptExit(error)) {
      terminal.line();
      bye();
      return;
    }
    terminal.blank();
    terminal.warning(" Unexpected error ");
    terminal.print(` ${error?.stack ?? error}`);
    process.exitCode = 1;
  }
}

main();
