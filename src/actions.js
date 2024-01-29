import { log, info, success, warn } from './console.js';
import { readFile, removeFolder, runCommand, writeFile } from './utils.js';
import * as fs from 'fs';

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
function cloneRepo(repoName, projectName) {
  return runCommand(`git clone --depth 1 ${repoName} ${projectName}`);
}
function cleanFiles(templatePath, projectName) {
  const resources = fs.readdirSync(templatePath);
  resources.forEach((resource) => {
    const resourcePath = `${templatePath}/${resource}`;
    const resourceStats = fs.statSync(resourcePath);
    if (resourceStats.isDirectory()) {
      switch (resource) {
        case '.github':
        case '.git':
          removeFolder(resourcePath);
          break;
      }
    } else if (resourceStats.isFile()) {
      switch (resource) {
        case 'package.json':
          const packageJSON = JSON.parse(readFile(resourcePath));
          packageJSON.name = projectName;
          packageJSON.version = '0.0.0';
          packageJSON.description = '';
          packageJSON.author = '';
          packageJSON.license = '';
          packageJSON.homepage = '';
          packageJSON.repository = {};
          packageJSON.bugs = {};
          writeFile(resourcePath, JSON.stringify(packageJSON, null, 2));
          break;
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
function outro(projectName, startCommand) {
  log('');
  success(' Ready! ');
  log(`- cd ${projectName}`);
  log(`- ${startCommand}`);
}

export const actions = {
  intro,
  cloneRepo,
  cleanFiles,
  installDependencies,
  initRepo,
  outro,
};
