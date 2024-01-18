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
  const project_name = await input({ message: 'Name your project:' });
  const selected_template = await select({
    message: 'Select your template',
    choices: PROJECTS,
  });
  const template_path = `${__dirname}/src/templates/${selected_template}`;
  mkdir(`${CURRENT_DIRECTORY}/${project_name}`);

  actions.create_resources(template_path, project_name);

  //
  const install_dependencies = await confirm({
    message: 'Install dependencies ?',
  });

  if (install_dependencies) {
    actions.install_dependencies(project_name);
  }

  const init_rep = await confirm({
    message: 'Initialize repository ?',
  });

  if (init_rep) {
    actions.init_repo(project_name);
  }

  actions.outro(project_name);
}

main();
