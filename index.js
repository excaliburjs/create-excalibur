#!/usr/bin/env node
import select from "@inquirer/select";
import intro from "./src/actions/intro.js";
import { terminal } from "./src/console.js";
import { bye } from "./src/utils.js";
import { FLOW_CHOICES, FLOWS } from "./src/constants.js";

async function main() {
  try {
    intro();
    const flow = await select({
      message: "Want do you want do?",
      choices: FLOW_CHOICES,
    });
    await FLOWS[flow]();
  } catch (error) {
    terminal.line();
    bye();
  }
}
//
main();
