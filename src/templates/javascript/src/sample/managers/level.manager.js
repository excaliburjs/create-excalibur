import { levels_setup } from '../levels/levels.js';
import { LevelScene } from '../scenes/level.scene.js';

class LevelManager {
  constructor(level_setup) {
    this.current_level_index = 0;
    this.levels_setup = level_setup;
    this.levels = [];
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
