#!/usr/bin/env node
import { input, select, confirm } from '@inquirer/prompts';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { actions } from './src/actions.js';
import { mkdir } from './src/utils.js';

const PROJECTS = [
  {
    name: 'Typescript',
    value: 'typescript',
    description: '[ TS starter template ]',
  },
  {
    name: 'Javascript',
    value: 'javascript',
    description: '[ JS starter template ]',
  },
];

async function main() {
  const CURRENT_DIRECTORY = process.cwd();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  actions.intro();
  //
  const projectName = await input({ message: 'Name your project:' });
  const selectedTemplate = await select({
    message: 'Select your template',
    choices: PROJECTS,
  });
  const templatePath = `${__dirname}/src/templates/${selectedTemplate}`;
  mkdir(`${CURRENT_DIRECTORY}/${projectName}`);

  actions.createResources(templatePath, projectName);

  //
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

  actions.outro(projectName);
}

main();
