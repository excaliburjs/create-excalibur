#!/usr/bin/env node
import select from "@inquirer/select";
import { createNewGame } from "./src/flows/create-new-game.js";
import { inspectGame } from "./src/flows/inspect-game.js";
import intro from "./src/actions/intro.js";
import { log } from "./src/console.js";

const FLOW_LIST = [
  {
    name: "Create a new game",
    value: "create",
    description: "[ Start a new project ]",
  },
  {
    name: "Inspect a game",
    value: "inspect",
    description: "[ Check games already build with Excalibur ]",
  },
];
const flows = {
  create: createNewGame,
  inspect: inspectGame,
};

async function main() {
  try {
    intro();
    const flow = await select({
      message: "Want do you want do?",
      choices: FLOW_LIST,
    });
    await flows[flow]();
  } catch (error) {
    switch (error.message) {
      case "User force closed the prompt with 0 null":
        log("");
        log("👋 See u soon.");
        log("");
        break;
      default:
        log(error);
        break;
    }
  }
}
//
main();
