import { Color, vec } from 'excalibur';
import { LEVEL_MUSIC } from '../models.js';

const BALL_SPEED = {
  NORMAL: vec(250, -250),
  MEDIUM: vec(280, -280),
  HARD: vec(300, -300),
};
const LEVEL_BG = {
  BLUE: {
    LIGHT: '#3f45f881',
    DARK: '#15188581',
  },
  GREEN: {
    LIGHT: '#43e517ae',
    DARK: '#2a880fae',
  },
  PINK: {
    LIGHT: '#dd0b9391',
    DARK: '#44223891',
  },
  PURPLE: {
    LIGHT: '#9617f05e',
    DARK: '#250c6f5e',
  },
  YELLOW: {
    LIGHT: '#f5f903ae',
    DARK: '#86880eae',
  },
  ORANGE: {
    LIGHT: '#f57f0991',
    DARK: '#7f470f91',
  },
  RED: {
    LIGHT: '#f41313ad',
    DARK: '#7b141e91',
  },
};
const EMPTY_ROW = ['', '', '', '', '', '', '', ''];
const ROW_1 = ['1', '1', '1', '1', '1', '1', '1', '1'];
const ROW_2 = ['2', '2', '2', '2', '2', '2', '2', '2'];
const ROW_3 = ['3', '3', '3', '3', '3', '3', '3', '3'];
const ROW_4 = ['4', '4', '4', '4', '4', '4', '4', '4'];
const ROW_5 = ['5', '5', '5', '5', '5', '5', '5', '5'];
const ROW_6 = ['6', '6', '6', '6', '6', '6', '6', '6'];
// LEVELS
const level001 = {
  name: 'level001',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_2,
  ball_speed: BALL_SPEED.NORMAL,
  bg_color: Color.Transparent,
  level: [EMPTY_ROW, ROW_1, ROW_2, ROW_1, EMPTY_ROW],
};
const level002 = {
  name: 'level002',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_1,
  ball_speed: BALL_SPEED.NORMAL,
  bg_color: Color.fromHex(LEVEL_BG.BLUE.LIGHT),
  level: [
    ['3', '', '3', '', '', '3', '', '3'],
    ['3', '', '3', '', '', '3', '', '3'],
    ['3', '', '3', '', '', '3', '', '3'],
    ['1', '1', '1', '1', '1', '1', '1', '1'],
  ],
};
const level003 = {
  name: 'level003',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_3,
  ball_speed: BALL_SPEED.NORMAL,
  bg_color: Color.fromHex(LEVEL_BG.BLUE.DARK),
  level: [
    ['3', '', '3', '', '3', '', '3', ''],
    ['', '3', '', '3', '', '3', '', '3'],
    ['', '2', '', '2', '', '2', '', '2'],
    ['', '2', '', '2', '', '2', '', '2'],
    ['', '1', '', '1', '', '1', '', '1'],
  ],
};
const level004 = {
  name: 'level004',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_4,
  ball_speed: BALL_SPEED.MEDIUM,
  bg_color: Color.fromHex(LEVEL_BG.GREEN.DARK),
  level: [
    ['6', '', '', '', '', '', '', '6'],
    ROW_3,
    ROW_3,
    ['6', '', '', '', '', '', '', '6'],
  ],
};
const level005 = {
  name: 'level005',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_5,
  ball_speed: BALL_SPEED.MEDIUM,
  bg_color: Color.fromHex(LEVEL_BG.GREEN.LIGHT),
  level: [
    ['1', '', '2', '3', '3', '2', '', '1'],
    ['1', '', '2', '3', '3', '2', '', '1'],
    ['1', '', '2', '3', '3', '2', '', '1'],
    EMPTY_ROW,
  ],
};
const level006 = {
  name: 'level006',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_1,
  ball_speed: BALL_SPEED.MEDIUM,
  bg_color: Color.fromHex(LEVEL_BG.PINK.DARK),

  level: [
    ['', '3', '3', '3', '3', '3', '3', ''],
    ['2', '', '', '4', '4', '', '', '2'],
    ['3', '', '', '4', '4', '', '', '3'],
    ['', '1', '1', '1', '1', '1', '1', ''],
  ],
};
const level007 = {
  name: 'level007',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_5,
  ball_speed: BALL_SPEED.MEDIUM,
  bg_color: Color.fromHex(LEVEL_BG.PURPLE.LIGHT),
  level: [
    ROW_5,
    ['5', '', '', '4', '4', '', '', '5'],
    ['5', '', '4', '4', '4', '4', '', '5'],
    ['5', '4', '4', '4', '4', '4', '4', '5'],
  ],
};
const level008 = {
  name: 'level008',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_1,
  ball_speed: BALL_SPEED.HARD,
  bg_color: Color.fromHex(LEVEL_BG.PURPLE.DARK),
  level: [
    ['', '1', '6', '6', '6', '1', '', ''],
    ['', '', '1', '6', '1', '', '', ''],
    ['3', '3', '', '1', '', '', '3', '3'],
    ['', '', '1', '', '1', '', '', ''],
  ],
};
const level009 = {
  name: 'level009',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_2,
  ball_speed: BALL_SPEED.HARD,
  bg_color: Color.fromHex(LEVEL_BG.YELLOW.DARK),
  level: [
    ['', '', '', '5', '', '5', '', '5'],
    ['', '', '5', '', '5', '', '5', ''],
    ['', '5', '', '5', '', '5', '', ''],
    ['5', '', '5', '', '5', '', '', ''],
  ],
};
const level010 = {
  name: 'level010',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_2,
  ball_speed: BALL_SPEED.HARD,
  bg_color: Color.fromHex(LEVEL_BG.ORANGE.DARK),

  level: [
    ['3', '3', '3', '5', '', '', '', '3'],
    ['3', '3', '5', '', '', '', '5', '3'],
    ['3', '5', '', '', '', '5', '3', '3'],
    ['5', '', '', '', '5', '3', '3', '3'],
  ],
};
const level011 = {
  name: 'level011',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_3,
  ball_speed: BALL_SPEED.HARD,
  bg_color: Color.fromHex(LEVEL_BG.ORANGE.LIGHT),
  level: [
    ['5', '', '6', '6', '6', '', '4', '4'],
    ['5', '', '1', '', '3', '', '4', ''],
    ['5', '', '1', '', '3', '', '3', ''],
    ['5', '5', '1', '', '3', '5', '4', ''],
  ],
};
const level012 = {
  name: 'level012',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_4,
  ball_speed: BALL_SPEED.HARD,
  bg_color: Color.fromHex(LEVEL_BG.RED.DARK),
  level: [
    ['5', '5', '', '', '', '', '5', '5'],
    ['', '', '6', '6', '6', '6', '', ''],
    ['5', '5', '', '', '', '', '5', '5'],
    ['', '1', '1', '1', '1', '1', '1', ''],
  ],
};
const level013 = {
  name: 'level013',
  balls: 3,
  music: LEVEL_MUSIC.LEVEL_5,
  ball_speed: BALL_SPEED.HARD,
  bg_color: Color.fromHex(LEVEL_BG.RED.LIGHT),
  level: [
    ['5', '5', '5', '5', '6', '6', '6', '6'],
    ['5', '6', '6', '5', '6', '5', '5', '6'],
    ['5', '6', '6', '5', '6', '5', '5', '6'],
    ['5', '5', '5', '5', '6', '6', '6', '6'],
  ],
};

export const levels_setup = [
  level001,
  level002,
  level003,
  level004,
  level005,
  level006,
  level007,
  level008,
  level009,
  level010,
  level011,
  level012,
  level013,
];
