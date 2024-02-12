import { input, select } from "@inquirer/prompts";
import cleanTemplate from "../actions/clean-template.js";
import installDependencies from "../actions/install-dependencies.js";
import initRepo from "../actions/initialize-repository.js";
import cloneRepo from "../actions/clone-repo.js";
import { printDiscord, printDocs, slugify } from "../utils.js";
import { log, success, textBlue, textGray, textWhite } from "../console.js";

const TEMPLATES = [
  {
    name: "Typescript with Browserify",
    value: "javascript_browserify",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-browserify.git",
    startCommand: "npm run all",
  },
  {
    name: "Typescript with Parcel",
    value: "typescript_parcel",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-parcel-v2.git",
    startCommand: "npm run start",
  },
  {
    name: "Typescript with Rollup",
    value: "typescript_rollup",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-rollup.git",
    startCommand: "npm run start",
  },

  {
    name: "Typescript with Vite",
    value: "typescript_vite",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-vite.git",
    startCommand: "npm run dev",
  },
  {
    name: "Typescript with Webpack",
    value: "typescript_webpack",
    description: "",
    repo: "https://github.com/excaliburjs/template-ts-webpack.git",
    startCommand: "npm run dev",
  },

  {
    name: "Javascript + Electron",
    value: "javascript_electron",
    description: "",
    repo: "https://github.com/excaliburjs/template-electron.git",
    startCommand: "npm run start",
  },
];
async function validateProjectName(name) {
  if (name === "") return false;
  return true;
}
function outro(projectName, startCommand) {
  log("-".repeat(55));
  success("Project successfully configured.");
  log(
    `${textGray("Enter your directory:")} ${textBlue(`cd ./${projectName}`)}`
  );
  log(`${textGray("and run your project:")} ${textBlue(`${startCommand}`)}`);
  log("");
  log(textWhite("If stuck:"));
  printDiscord();
  printDocs();
  log("-".repeat(55));
  log("");
}
export async function createNewGame() {
  const projectName = slugify(
    await input({
      message: "Name your project:",
      transformer: slugify,
      validate: validateProjectName,
    })
  );
  const fullPath = `${process.cwd()}/${projectName}`;

  const template_value = await select({
    message: "Choose your stack:",
    choices: TEMPLATES,
  });
  const template = TEMPLATES.find((item) => item.value === template_value);
  const repoCloned = cloneRepo(template.repo, projectName);
  if (!repoCloned) {
    console.error("Unable to clone repo.");
    return;
  }
  cleanTemplate(fullPath, projectName);
  await installDependencies(projectName);
  await initRepo(projectName);

  outro(projectName, template.startCommand);
}
