#!/usr/bin/env node
import { input, select, confirm } from '@inquirer/prompts';
import { actions } from './src/actions.js';

const starters = [
  {
    name: 'Typescript + Vite',
    value: 'typescript_vite',
    description: '',
    repo: 'https://github.com/excaliburjs/template-ts-vite.git',
    startCommand: 'npm run dev',
  },
  {
    name: 'Typescript + Webpack',
    value: 'typescript_webpack',
    description: '',
    repo: 'https://github.com/excaliburjs/template-ts-webpack.git',
    startCommand: 'npm run dev',
  },
  {
    name: 'Typescript + Rollup',
    value: 'typescript_rollup',
    description: '',
    repo: 'https://github.com/excaliburjs/template-ts-rollup.git',
    startCommand: 'npm run start',
  },
  {
    name: 'Typescript + Parcel',
    value: 'typescript_parcel',
    description: '',
    repo: 'https://github.com/excaliburjs/template-ts-parcel-v2.git',
    startCommand: 'npm run start',
  },
  {
    name: 'Javascript + Electron',
    value: 'javascript_electron',
    description: '',
    repo: 'https://github.com/excaliburjs/template-electron.git',
    startCommand: 'npm run start',
  },
  {
    name: 'Javascript + Browserify',
    value: 'javascript_browserify',
    description: '',
    repo: 'https://github.com/excaliburjs/template-ts-browserify.git',
    startCommand: '',
  },
];
async function main() {
  actions.intro();
  const projectName = await input({ message: 'Name your project:' });
  const fullPath = `${process.cwd()}/${projectName}`;

  const starter_value = await select({
    message: 'Select your stack',
    choices: starters,
  });
  const starter = starters.find((starter) => starter.value === starter_value);
  const repoCloned = actions.cloneRepo(starter.repo, projectName);
  if (!repoCloned) {
    console.error('unable to clone repo.');
    return;
  }

  actions.cleanFiles(fullPath, projectName);

  const installDependencies = await confirm({
    message: 'Install dependencies ?',
  });
  if (installDependencies) {
    actions.installDependencies(projectName);
  }

  const initRepo = await confirm({
    message: 'Initialize repository ?',
  });
  if (initRepo) {
    actions.initRepo(projectName);
  }
  actions.outro(projectName, starter.startCommand);
}

main();
