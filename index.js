#!/usr/bin/env node
import { input, select, confirm } from '@inquirer/prompts';
import { actions } from './src/actions.js';

const stacks = [
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
const bundlers = [
  {
    name: 'Vite',
    value: 'vite',
    description: '',
  },
  {
    name: 'Webpack',
    value: 'webpack',
    description: '',
  },
  {
    name: 'Rollup',
    value: 'rollup',
    description: '',
  },
  {
    name: 'Parcel',
    value: 'parcel',
    description: '',
  },
];
const platforms = [
  {
    name: 'web-app',
    value: 'web',
    description: '[ JS app ]',
  },
  // {
  //   name: 'pwa-app',
  //   value: 'pwa',
  //   description: '[ Web app with manifest.json ]',
  // },
  // {
  //   name: 'mobile-app',
  //   value: 'mobile',
  //   description: '[ with Capacitor ]',
  // },
  // {
  //   name: 'desktop-app',
  //   value: 'desktop',
  //   description: '[ with Electron ]',
  // },
];

const respositories = {
  // astro:{},
  // react:{},
  // solid:{},
  //plain + cdn
  javascript: {
    vite: { web: '' },
    webpack: { web: '' },
    rollup: { web: '' },
    parcel: { web: '' },
  },
  typescript: {
    vite: {
      web: {
        repo: 'https://github.com/excaliburjs/template-ts-vite.git',
        startCommand: 'npm run dev',
      },
      // pwa: {}
      // mobile: {}
      // desktop: {}
    },
    webpack: {
      web: {
        repo: 'https://github.com/excaliburjs/template-ts-webpack.git',
        startCommand: 'npm run dev',
      },
      // pwa: {},
      // mobile: {},
    },
    rollup: {
      web: {
        repo: 'https://github.com/excaliburjs/template-ts-rollup.git',
        startCommand: 'npm run start',
      },
      // pwa: {},
      // mobile: {},
    },
    parcel: {
      web: {
        repo: 'https://github.com/excaliburjs/template-ts-parcel-v2.git',
        startCommand: 'npm run start',
      },
      // pwa: {},
      // mobile: {},
    },
  },
};

async function main() {
  actions.intro();
  const projectName = await input({ message: 'Name your project:' });
  const fullPath = `${process.cwd()}/${projectName}`;

  const stack = await select({
    message: 'Select your stack:',
    choices: stacks,
  });
  const bundler = await select({
    message: 'Select your bundler:',
    choices: bundlers,
  });
  const platform = await select({
    message: 'Select your platform:',
    choices: platforms,
  });
  const respository = respositories[stack][bundler][platform];
  const repoCloned = actions.cloneRepo(respository.repo, projectName);
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
  actions.outro(projectName, respository.startCommand);
}

main();
