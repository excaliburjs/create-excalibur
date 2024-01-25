import { DevTool } from '@excaliburjs/dev-tools';
import { Color, Engine } from 'excalibur';

import { GAME_STATES, SCENE_EVENTS, SCENE_STATE } from '../models.js';
import { uiManager } from './ui.manager.js';
import { levelManager } from './level.manager.js';
import { assetManager } from './asset.manager.js';
import { audioManager } from './audio.manager.js';
import { Subject } from '../utils.js';

class GameManager {
  constructor(engine) {
    this.game = engine;
    this.scoreGlobal = 0;
    this.scoreLevel = 0;
    this.highscore = 0;

    this.gameState = new Subject();
    this.sceneState = new Subject();
  }

  init() {
    this.setupListeners();
    // start engine
    this.gameState.next(GAME_STATES.LOADING);
  }
  setupListeners() {
    eventBus.on(SCENE_EVENTS.UPDATE_BALL, (balls) => {
      uiManager.printBalls(balls);
    });
    eventBus.on(SCENE_EVENTS.UPDATE_SCORE, (score) => {
      this.scoreLevel += score;
      uiManager.printScore(this.scoreLevel);
    });

    this.gameState.onChange((newGameState) => {
      console.log(`[${newGameState}]`);
      switch (newGameState) {
        case GAME_STATES.LOADING:
          assetManager.init();
          levelManager.init();
          audioManager.init();
          uiManager.init();
          this.loadLevels();
          this.activateDebugMode();
          this.game.start(assetManager.loader).then(() => {
            this.gameState.next(GAME_STATES.READY);
            eventBus.emit(SCENE_STATE.READY);
          });
          break;
        case GAME_STATES.READY:
          uiManager.updateState(SCENE_STATE.READY);
          break;
        case GAME_STATES.PLAYING:
          break;
        case GAME_STATES.COMPLETED:
          uiManager.updateState('DONE');
          break;
        case GAME_STATES.ERROR:
          break;
      }
    });
    this.sceneState.onChange((newSceneState) => {
      console.log(
        `GAME_STATE [${this.gameState.current()}]/[${newSceneState}]`
      );
      switch (newSceneState) {
        case SCENE_STATE.LOADING:
          break;
        case SCENE_STATE.READY:
          this.scoreLevel = this.scoreGlobal;
          break;
        case SCENE_STATE.PLAYING:
          break;
        case SCENE_STATE.PAUSED:
          break;
        case SCENE_STATE.COMPLETED:
          this.scoreGlobal = this.scoreLevel;
          const newHighscore = this.scoreGlobal > this.highscore;
          if (newHighscore) this.highscore = this.scoreGlobal;

          if (levelManager.levelsCompleted()) {
            this.gameState.next(GAME_STATES.COMPLETED);
            return;
          }

          break;
        case SCENE_STATE.GAMEOVER:
          this.scoreLevel = this.scoreGlobal;
          break;
        case SCENE_STATE.ERROR:
          break;
      }

      uiManager.updateState(newSceneState);
    });
  }
  loadLevels() {
    levelManager.levels.forEach((lvl) => this.game.add(lvl.name, lvl));
  }
  activateDebugMode() {
    new DevTool(this.game);
  }

  // actions
  loadLevel(level) {
    this.sceneState.next(SCENE_STATE.LOADING);

    this.game.goToScene(level.name);
    this.game.currentScene.onInitialize(this.game);
    uiManager.printUI(
      level.name,
      level.balls,
      this.scoreGlobal,
      this.highscore
    );
  }
  startGame() {
    const initialLevel = levelManager.initial();
    this.loadLevel(initialLevel);
  }
  retryLevel() {
    const sameLevel = levelManager.current();
    this.loadLevel(sameLevel);
  }
  nextLevel() {
    const nextLevel = levelManager.next();
    if (!nextLevel) {
      console.warn('No more levels');
      return;
    }

    this.loadLevel(nextLevel);
  }
  resetGame() {
    this.scoreGlobal = 0;
    this.startGame();
  }
}

class EventBus {
  constructor() {
    this.events = {};
  }
  on(event, callback) {
    this.events[event] = this.events[event] || [];
    this.events[event].push(callback);
  }
  emit(event, data = {}) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => {
        callback(data);
      });
    }
  }
}

//
const game = new Engine({
  width: 600,
  height: 400,
  canvasElementId: 'main-canvas',
  backgroundColor: Color.Black,
  antialiasing: false,
  fixedUpdateFps: 30,
});
const gameManager = new GameManager(game);
const eventBus = new EventBus();

export { eventBus, gameManager };
