import { log, info, success, warn } from './console.js';
import {
  copy,
  getFileExtension,
  isMediaFile,
  mkdir,
  readFile,
  runCommand,
  writeFile,
} from './utils.js';
import * as fs from 'fs';

const CURRENT_DIRECTORY = process.cwd();

function intro() {
  log(`
      /|   ________________
  O|===|* >________________>
      \\|
  `);
  info(' Welcome to Excalibur JS! ');
  log('Your friendly TypeScript 2D game engine for the web.');
  log('');
}

function createResources(targetPath, projectName) {
  const resourcesToCreate = fs.readdirSync(targetPath);
  //
  resourcesToCreate.forEach((resource) => {
    const resourcePath = `${targetPath}/${resource}`;
    const resourceStats = fs.statSync(resourcePath);

    if (resourceStats.isDirectory()) {
      mkdir(`${CURRENT_DIRECTORY}/${projectName}/${resource}`);
      createResources(
        `${targetPath}/${resource}`,
        `${projectName}/${resource}`
      );
    } else if (resourceStats.isFile()) {
      const fileExtension = getFileExtension(resourcePath);

      if (isMediaFile(fileExtension)) {
        copy(resourcePath, `${CURRENT_DIRECTORY}/${projectName}/${resource}`);
      } else {
        //
        if (resource === 'package.json') {
          const packageJSON = JSON.parse(
            readFile(`${targetPath}/package.json`)
          );
          packageJSON.name = projectName;
          writeFile(
            `${CURRENT_DIRECTORY}/${projectName}/package.json`,
            JSON.stringify(packageJSON, null, 2)
          );
        } else {
          if (resource === 'gitignore') {
            resource = '.gitignore';
          }
          const fileContent = readFile(resourcePath);
          const writePath = `${CURRENT_DIRECTORY}/${projectName}/${resource}`;
          writeFile(writePath, fileContent);
        }
      }
    }
  });
}
function installDependencies(projectName) {
  const installed = runCommand(`cd ${projectName} && npm i`);
  if (!installed) warn('Unable to install dependencies');
}
function initRepo(projectName) {
  const installed = runCommand(`cd ${projectName} && git init`);
  if (!installed) warn('Unable to init repo');
}
function outro(projectName) {
  log('');
  success(' Ready! ');
  log(`- cd ${projectName}`);
  log(`- npm run dev`);
}

export const actions = {
  intro,
  createResources,
  initRepo,
  installDependencies,
  outro,
};
