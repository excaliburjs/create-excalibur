import { LevelScene } from '../scenes/level.scene';
import { LevelSetup } from '../models';
import { levels_setup } from '../levels/levels';

class LevelManager {
  current_level_index = 0;
  levels: LevelScene[] = [];
  levels_setup!: LevelSetup[];

  constructor(level_setup: LevelSetup[]) {
    this.levels_setup = level_setup;
  }

  init() {
    levels_setup.forEach((lvl) => this.levels.push(new LevelScene(lvl)));
  }
  initial() {
    this.current_level_index = 0;
    return this.levels[this.current_level_index];
  }
  next() {
    const exist_next = this.levels[this.current_level_index + 1];
    if (!exist_next) return false;
    this.current_level_index++;
    return exist_next;
  }
  current() {
    return this.levels[this.current_level_index];
  }

  levels_completed() {
    return this.current_level_index >= this.levels.length - 1;
  }
}

export const levelManager = new LevelManager(levels_setup);
