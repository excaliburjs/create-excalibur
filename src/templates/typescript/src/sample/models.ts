import { Color, ImageSource, Vector } from 'excalibur';

export enum BRICK_TYPE {
  LEVEL_1 = 'LEVEL_1',
  LEVEL_2 = 'LEVEL_2',
  LEVEL_3 = 'LEVEL_3',
  LEVEL_4 = 'LEVEL_4',
  LEVEL_5 = 'LEVEL_5',
  LEVEL_6 = 'LEVEL_6',
}
export enum GAME_STATES {
  LOADING = 'LOADING',
  READY = 'READY',
  PLAYING = 'PLAYING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}
export enum SCENE_STATE {
  LOADING = 'SCENE_STATE__LOADING',
  READY = 'SCENE_STATE__READY',
  PLAYING = 'SCENE_STATE__PLAYING',
  PAUSED = 'SCENE_STATE__PAUSED',
  COMPLETED = 'SCENE_STATE__COMPLETED',
  GAMEOVER = 'SCENE_STATE__GAMEOVER',
  ERROR = 'SCENE_STATE__ERROR',
}
export enum SCENES_EVENTS {
  UPDATE_BALL = 'GAME_EVENTS__UPDATE_BALL',
  UPDATE_SCORE = 'GAME_EVENTS__UPDATE_SCORE',
}
export interface BrickSetup {
  type: BRICK_TYPE;
  life: number;
  cols: number;
  width: number;
  height: number;
}
export interface LevelSetup {
  balls: number;
  name: string;
  ball_speed: Vector;
  bg_color: Color;
  bricks_setup: BrickSetup[];
}
export type ImageResource = Record<string, ImageSource>;
