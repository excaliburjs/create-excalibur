import { log, info, success, warn } from './console.js';
import { copy, mkdir, read_file, run_command, write_file } from './utils.js';
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

function create_resources(target_path, project_name) {
  const resources_to_create = fs.readdirSync(target_path);
  //
  resources_to_create.forEach((resource) => {
    const resource_path = `${target_path}/${resource}`;
    const resource_stats = fs.statSync(resource_path);

    if (resource_stats.isDirectory()) {
      mkdir(`${CURRENT_DIRECTORY}/${project_name}/${resource}`);
      create_resources(
        `${target_path}/${resource}`,
        `${project_name}/${resource}`
      );
    } else if (resource_stats.isFile()) {
      if (resource === 'breakout_sprite.png') {
        copy(resource_path, `${CURRENT_DIRECTORY}/${project_name}/${resource}`);
      } else {
        //
        if (resource === 'package.json') {
          const package_json = JSON.parse(
            read_file(`${target_path}/package.json`)
          );
          package_json.name = project_name;
          write_file(
            `${CURRENT_DIRECTORY}/${project_name}/package.json`,
            JSON.stringify(package_json, null, 2)
          );
        }
        if (resource === 'gitignore') {
          resource = '.gitignore';
        }
        const file_content = read_file(resource_path);
        const write_path = `${CURRENT_DIRECTORY}/${project_name}/${resource}`;
        write_file(write_path, file_content);
      }
    }
  });
}
function install_dependencies(project_name) {
  const installed = run_command(`cd ${project_name} && npm i`);
  if (!installed) warn('Unable to install dependencies');
}
function init_repo(project_name) {
  const installed = run_command(`cd ${project_name} && git init`);
  if (!installed) warn('Unable to init repo');
}
function outro(project_name) {
  log('');
  success(' Ready! ');
  log(`- cd ${project_name}`);
  log(`- npm run dev`);
}

export const actions = {
  intro,
  create_resources,
  init_repo,
  install_dependencies,
  outro,
};
