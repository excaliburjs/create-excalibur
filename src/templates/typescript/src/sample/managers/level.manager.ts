import { LevelScene } from '../scenes/level.scene';
import { LevelSetup } from '../models';
import { levelsSeed } from '../levels/levels';

class LevelManager {
  currentLevelIndex = 0;
  levels: LevelScene[] = [];
  levelsSetup!: LevelSetup[];

  constructor(seeds: LevelSetup[]) {
    this.levelsSetup = seeds;
  }

  init() {
    this.levelsSetup.forEach((lvl) => this.levels.push(new LevelScene(lvl)));
  }
  initial() {
    this.currentLevelIndex = 0;
    return this.levels[this.currentLevelIndex];
  }
  next() {
    const levelExist = this.levels[this.currentLevelIndex + 1];
    if (!levelExist) return false;
    this.currentLevelIndex++;
    return levelExist;
  }
  current() {
    return this.levels[this.currentLevelIndex];
  }

  levelsCompleted() {
    return this.currentLevelIndex >= this.levels.length - 1;
  }
}

export const levelManager = new LevelManager(levelsSeed);
