import { LevelScene } from '../scenes/level.scene';
import { BRICK_TYPE, LevelSetup } from '../models';
import { Color, vec } from 'excalibur';

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
// LEVELS
const level001: LevelSetup = {
  name: 'level001',
  balls: 3,
  ball_speed: vec(200, -200),
  bg_color: Color.Black,
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 3, width: 32, height: 16 },
    // { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level002: LevelSetup = {
  name: 'level002',
  balls: 3,
  ball_speed: vec(250, -250),
  bg_color: Color.LightGray,
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 2, width: 32, height: 16 },
    // { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 16 },
  ],
};
const level003: LevelSetup = {
  name: 'level003',
  balls: 3,
  ball_speed: vec(300, -300),
  bg_color: Color.Rose,
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 16 },
  ],
};
const level004: LevelSetup = {
  name: 'level004',
  balls: 3,
  ball_speed: vec(280, -280),
  bg_color: Color.Viridian,
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level005: LevelSetup = {
  name: 'level005',
  balls: 3,
  ball_speed: vec(280, -280),
  bg_color: Color.Violet,
  bricks_setup: [
    // { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 12 },
    // { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 12 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 12 },
    { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 12 },
    { type: BRICK_TYPE.LEVEL_5, life: 1, cols: 8, width: 32, height: 12 },
  ],
};
const level006: LevelSetup = {
  name: 'level006',
  balls: 3,
  ball_speed: vec(280, -280),
  bg_color: Color.Vermilion,
  bricks_setup: [
    // { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
    // { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_5, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_6, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
// LIST
const levels_setup: LevelSetup[] = [
  level001,
  level002,
  level003,
  level004,
  level005,
  level006,
];

export const levelManager = new LevelManager(levels_setup);
