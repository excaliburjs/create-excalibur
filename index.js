#!/usr/bin/env node
import { select } from "@inquirer/prompts";
import intro from "./src/actions/intro.js";
import { terminal } from "./src/console.js";
import { bye } from "./src/utils.js";
import { FLOW_CHOICES, FLOWS } from "./src/constants.js";
import { maybeNotifyUpdate } from "./src/docs/update-check.js";

const USAGE = `
Usage: ex [command] [options]

Commands:
  (none)      interactive menu
  create      create a new Excalibur game from a template
  sample      create a sample project
  inspect     download and inspect a showcase game
  docs        search the Excalibur docs & API (try: ex docs --help)

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
  const [command, ...rest] = argv;

  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(USAGE);
    return;
  }

  try {
    if (command && FLOWS[command]) {
      if (command !== "docs") intro();
      await FLOWS[command](rest);
      return;
    }
    if (command && command.startsWith("-") === false) {
      process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
      process.exitCode = 1;
      return;
    }
    intro();
    const flow = await select({
      message: "Want do you want do?",
      choices: FLOW_CHOICES,
    });
    await FLOWS[flow](rest);
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
