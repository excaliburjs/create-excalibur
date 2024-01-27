#!/usr/bin/env node
import { input, select, confirm } from '@inquirer/prompts';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { actions } from './src/actions.js';

const stacks = [
  {
    name: 'Typescript',
    value: 'typescript',
    description: '[ TS starter template ]',
  },
  // {
  //   name: 'Javascript',
  //   value: 'javascript',
  //   description: '[ JS starter template ]',
  // },
];
const bundlers = [
  {
    name: 'Vite',
    value: 'vite',
    description: '',
  },
  // {
  //   name: 'Webpack',
  //   value: 'webpack',
  //   description: '',
  // },
  // {
  //   name: 'Parcel',
  //   value: 'parcel',
  //   description: '',
  // },
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
  javascript: {
    vite: {
      web: {
        repo: 'js-vite-web',
      },
      pwa: {
        repo: 'js-vite-pwa',
      },
      mobile: {
        repo: 'js-vite-capacitor',
      },
      desktop: {
        repo: 'js-vite-electron',
      },
    },
    webpack: {
      web: {
        repo: 'js-webpack-web',
      },
      pwa: {
        repo: 'js-webpack-pwa',
      },
      mobile: {
        repo: 'js-webpack-mobile',
      },
      desktop: {
        repo: 'js-webpack-electron',
      },
    },
    parcel: {
      web: {
        repo: 'js-parcel-web',
      },
      pwa: {
        repo: 'js-parcel-pwa',
      },
      mobile: {
        repo: 'js-parcel-mobile',
      },
      desktop: {
        repo: 'js-parcel-capacitor',
      },
    },
  },
  typescript: {
    vite: {
      web: {
        repo: 'https://github.com/excaliburjs/template-ts-vite.git',
      },
      pwa: {
        repo: 'ts-vite-pwa',
      },
      mobile: {
        repo: 'ts-vite-capacitor',
      },
      desktop: {
        repo: 'ts-vite-electron',
      },
    },
    webpack: {
      web: {
        repo: 'ts-webpack-web',
      },
      pwa: {
        repo: 'ts-webpack-pwa',
      },
      mobile: {
        repo: 'ts-webpack-mobile',
      },
      desktop: {
        repo: 'ts-webpack-electron',
      },
    },
    parcel: {
      web: {
        repo: 'ts-parcel-web',
      },
      pwa: {
        repo: 'ts-parcel-pwa',
      },
      mobile: {
        repo: 'ts-parcel-mobile',
      },
      desktop: {
        repo: 'ts-parcel-capacitor',
      },
    },
  },
};

async function main() {
  actions.intro();
  const projectName = await input({ message: 'Name your project:' });
  const stack = await select({
    message: 'Select your stack',
    choices: stacks,
  });
  const bundler = await select({
    message: 'Select your bundler',
    choices: bundlers,
  });
  const platform = await select({
    message: 'Select your platform',
    choices: platforms,
  });
  const repoName = respositories[stack][bundler][platform].repo;
  const repoCloned = actions.cloneRepo(repoName, projectName);
  if (!repoCloned) {
    console.error('unable to clone repo');
    return;
  }
  //
  const fullPath = `${process.cwd()}/${projectName}`;
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
  actions.outro(projectName);
}

main();
