import { input, select } from "@inquirer/prompts";
import { success, terminal } from "../console.js";
import {
  printDependencyStatus,
  printProjectDirectory,
  printSupport,
  slugify,
  sortByProp,
} from "../utils.js";
import simpleGit from "simple-git";
import installDependencies from "../actions/install-dependencies.js";
import { SHOWCASES } from "../constants.js";

function getGames() {
  const sorted = SHOWCASES.sort((a, b) => sortByProp(a, b, "title"));
  const indexed = sorted.map((game, i) => {
    game.name = `${i + 1}. ${game.title} `;
    return game;
  });
  return indexed;
}
function outro(actions) {
  const { projectDirectory, dependencies, gameURL } = actions;
  terminal.line();
  terminal.title(" Project downloaded.", success);
  terminal.blank();
  printProjectDirectory(projectDirectory);
  printDependencyStatus(dependencies);
  terminal.listItem({ text: "Game:", textRelevant: gameURL });
  terminal.blank();
  printSupport();
  terminal.blank();
  terminal.line();
  terminal.blank();
}
export async function inspectGame() {
  const GAMES = getGames();
  const gameValue = await select({
    message: `${GAMES.length} games:`,
    choices: GAMES,
  });
  const game = GAMES.find((game) => game.value === gameValue);
  let targetFolder = slugify(
    await input({
      message: "Target folder:",
      transformer: slugify,
    })
  );
  if (!targetFolder) targetFolder = slugify(game.title);
  console.log(targetFolder);

  const git = simpleGit();
  const spinner = terminal.spinner("Cloning repository...");
  git.clone(game.source, targetFolder, async (err) => {
    if (err) {
      terminal.blank();
      terminal.warning("Error:");
      terminal.print(err.message);
      spinner.fail("Unable to clone repository");
      process.exit(1);
    }
    spinner.succeed("Game downloaded.");
    let actions = {
      projectDirectory: targetFolder,
      dependencies: false,
      gameURL: game.url,
    };

    await installDependencies(targetFolder, actions);
    //
    setTimeout(() => {
      outro(actions);
    }, 0.6 * 1000);
  });
}
