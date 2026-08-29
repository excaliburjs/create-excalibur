import { input, select } from "@inquirer/prompts";
import { success, terminal } from "../console.ts";
import {
  printDependencyStatus,
  printProjectDirectory,
  printSupport,
  slugify,
  sortByProp,
} from "../utils.ts";
import { simpleGit } from "simple-git";
import installDependencies from "../actions/install-dependencies.ts";
import { SHOWCASES, type ShowcaseDefinition } from "../constants.ts";
import type { ScaffoldActions } from "../utils.ts";

function getGames(): ShowcaseDefinition[] {
  const sorted = SHOWCASES.sort((a, b) => sortByProp(a, b, "title"));
  const indexed = sorted.map((game, i) => {
    game.name = `${i + 1}. ${game.title} `;
    return game;
  });
  return indexed;
}
function outro(actions: ScaffoldActions & { gameURL: string }): void {
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
export async function inspectGame(): Promise<void> {
  const GAMES = getGames();
  const gameValue = await select({
    message: `${GAMES.length} games:`,
    choices: GAMES,
  });
  const game = GAMES.find((g) => g.value === gameValue)!;
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
// simple-git still supports the legacy trailing-callback form at runtime,
  // but v3's types dropped it — keep the existing behavior through a cast.
  type CloneWithCallback = (repo: string, local: string, cb: (err: Error | null) => void) => unknown;
  (git as unknown as { clone: CloneWithCallback }).clone(game.source, targetFolder, async (err) => {
    if (err) {
      terminal.blank();
      terminal.warning("Error:");
      terminal.print(err.message);
      spinner.fail("Unable to clone repository");
      process.exit(1);
    }
    spinner.succeed("Game downloaded.");
    const actions: ScaffoldActions & { gameURL: string } = {
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
