import { input, select } from "@inquirer/prompts";
import cleanTemplate from "../actions/clean-template.js";
import installDependencies from "../actions/install-dependencies.js";
import initRepo from "../actions/initialize-repository.js";
import cloneRepo from "../actions/clone-repo.js";
import { printSupport, slugify } from "../utils.js";
import { log, printLine, success, textBlue, textGray } from "../console.js";

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
    name: "Javascript with Electron",
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
  printLine();
  success("Project successfully configured.");
  log(
    `${textGray("Enter your directory:")} ${textBlue(`cd ./${projectName}`)}`
  );
  log(`${textGray("Run your project:")} ${textBlue(`${startCommand}`)}`);
  log("");
  printSupport();
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

  const templateValue = await select({
    message: "Choose your stack:",
    choices: TEMPLATES,
  });
  const template = TEMPLATES.find((item) => item.value === templateValue);
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
