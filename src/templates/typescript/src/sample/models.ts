import { Color, ImageSource, Sound, Vector } from 'excalibur';

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
export enum SCENE_EVENTS {
  UPDATE_BALL = 'GAME_EVENTS__UPDATE_BALL',
  UPDATE_SCORE = 'GAME_EVENTS__UPDATE_SCORE',
}
export enum LEVEL_MUSIC {
  LEVEL_1 = 'level_music_1',
  LEVEL_2 = 'level_music_2',
  LEVEL_3 = 'level_music_3',
  LEVEL_4 = 'level_music_4',
  LEVEL_5 = 'level_music_5',
}
export enum PLAYER_CONTROLS {
  KEYBOARD = 'KEYBOARD',
  MOUSE = 'MOUSE',
  BOTH = 'BOTH',
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
  music: LEVEL_MUSIC;
}
export interface ParticleSetup {
  width: number;
  height: number;
  x: number;
  y: number;
}

export type ImageResource = Record<string, ImageSource>;
export type SoundResource = Record<string, Sound>;
