import { LevelScene } from '../scenes/level.scene.js';
import { BRICK_TYPE, LEVEL_MUSIC } from '../models.js';
import { Color, vec } from 'excalibur';

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
// LEVELS
const level001 = {
  name: 'level001',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_2,
  ball_speed: vec(240, -240),
  // bg_color: Color.fromHex('#33383891'),
  bg_color: Color.Transparent,
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level002 = {
  name: 'level002',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_1,
  ball_speed: vec(250, -250),
  bg_color: Color.fromHex('#ff383891'),
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level003 = {
  name: 'level003',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_3,
  ball_speed: vec(300, -300),
  bg_color: Color.fromHex('#26619a5e'),
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_2, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level004 = {
  name: 'level004',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_4,
  ball_speed: vec(280, -280),
  bg_color: Color.fromHex('#44223891'),
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 1, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 3, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 5, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level005 = {
  name: 'level005',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_5,
  ball_speed: vec(280, -280),
  bg_color: Color.fromHex('#ff223891'),
  bricks_setup: [
    { type: BRICK_TYPE.LEVEL_5, life: 1, cols: 8, width: 32, height: 12 },
    { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 12 },
    { type: BRICK_TYPE.LEVEL_5, life: 1, cols: 8, width: 32, height: 12 },
  ],
};
const level006 = {
  name: 'level006',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_1,
  ball_speed: vec(280, -280),
  bg_color: Color.Transparent,
  bricks_setup: [
    // { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 16 },
    // { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_5, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_6, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
const level007 = {
  name: 'level007',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_5,
  ball_speed: vec(280, -280),
  bg_color: Color.Transparent,
  bricks_setup: [
    // { type: BRICK_TYPE.LEVEL_2, life: 2, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_3, life: 3, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_4, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_1, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_5, life: 1, cols: 8, width: 32, height: 16 },
    { type: BRICK_TYPE.LEVEL_6, life: 1, cols: 8, width: 32, height: 16 },
  ],
};
// LIST
const levels_setup = [
  level001,
  level002,
  level003,
  level004,
  level005,
  level006,
  level007,
];

export const levelManager = new LevelManager(levels_setup);
