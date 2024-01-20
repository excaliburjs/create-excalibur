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
    this.score_global = 0;
    this.score_level = 0;
    this.high_score = 0;

    this.game_state = new Subject();
    this.scene_state = new Subject();
  }

  init() {
    eventBus.on(SCENE_EVENTS.UPDATE_BALL, (balls) => {
      uiManager.print_balls(balls);
    });
    eventBus.on(SCENE_EVENTS.UPDATE_SCORE, (score) => {
      this.score_level += score;
      uiManager.print_score(this.score_level);
    });

    this.game_state.subscribe((new_game_state) => {
      console.log(`GAME_STATE [${new_game_state}]`);
      switch (new_game_state) {
        case GAME_STATES.LOADING:
          assetManager.init();
          levelManager.init();
          audioManager.init();
          uiManager.init();
          this.load_levels();
          this.activate_debug_mode(true);
          this.game.start(assetManager.loader).then(() => {
            this.game_state.next(GAME_STATES.READY);
            eventBus.emit(SCENE_STATE.READY);
          });
          break;
        case GAME_STATES.READY:
          uiManager.update_state(SCENE_STATE.READY);
          break;
        case GAME_STATES.PLAYING:
          break;
        case GAME_STATES.COMPLETED:
          uiManager.update_state('DONE');
          break;
        case GAME_STATES.ERROR:
          break;
      }
    });
    this.scene_state.subscribe((new_scene_state) => {
      console.log(
        `GAME_STATE [${this.game_state.current()}]/[${new_scene_state}]`
      );
      switch (new_scene_state) {
        case SCENE_STATE.LOADING:
          break;
        case SCENE_STATE.READY:
          this.score_level = this.score_global;
          break;
        case SCENE_STATE.PLAYING:
          break;
        case SCENE_STATE.PAUSED:
          break;
        case SCENE_STATE.COMPLETED:
          this.score_global = this.score_level;
          const new_high_core = this.score_global > this.high_score;
          if (new_high_core) this.high_score = this.score_global;

          if (levelManager.levels_completed()) {
            this.game_state.next(GAME_STATES.COMPLETED);
            return;
          }

          break;
        case SCENE_STATE.GAMEOVER:
          this.score_level = this.score_global;
          break;
        case SCENE_STATE.ERROR:
          break;
      }

      uiManager.update_state(new_scene_state);
    });

    // start
    this.game_state.next(GAME_STATES.LOADING);
  }

  load_levels() {
    levelManager.levels.forEach((lvl) => this.game.add(lvl.name, lvl));
  }
  activate_debug_mode(activate = true) {
    if (activate) new DevTool(this.game);
  }

  // actions
  load_level(level) {
    this.scene_state.next(SCENE_STATE.LOADING);

    this.game.goToScene(level.name);
    this.game.currentScene.onInitialize(this.game);
    uiManager.print_UI(
      level.name,
      level.balls,
      this.score_global,
      this.high_score
    );
  }
  start_game() {
    const initial_level = levelManager.initial();
    this.load_level(initial_level);
  }
  retry_level() {
    const same_level = levelManager.current();
    this.load_level(same_level);
  }
  next_level() {
    const next_level = levelManager.next();
    if (!next_level) {
      console.warn('No more levels');
      return;
    }

    this.load_level(next_level);
  }
  reset_game() {
    this.score_global = 0;
    this.start_game();
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
});
const gameManager = new GameManager(game);
const eventBus = new EventBus();

export { eventBus, gameManager };
