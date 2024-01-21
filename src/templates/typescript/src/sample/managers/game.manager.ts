import { DevTool } from '@excaliburjs/dev-tools';
import { Color, Engine } from 'excalibur';

import { GAME_STATES, SCENE_EVENTS, SCENE_STATE } from '../models';
import { uiManager } from './ui.manager';
import { levelManager } from './level.manager';
import { assetManager } from './asset.manager';
import { audioManager } from './audio.manager';
import { LevelScene } from '../scenes/level.scene';
import { Subject } from '../utils';

class GameManager {
  game!: Engine;
  score_global = 0;
  score_level = 0;
  high_score = 0;
  //

  game_state = new Subject();
  scene_state = new Subject();

  constructor(engine: Engine) {
    this.game = engine;
  }

  init() {
    eventBus.on(SCENE_EVENTS.UPDATE_BALL, (balls: number) => {
      uiManager.print_balls(balls);
    });
    eventBus.on(SCENE_EVENTS.UPDATE_SCORE, (score: number) => {
      this.score_level += score;
      uiManager.print_score(this.score_level);
    });

    this.game_state.subscribe((new_game_state: GAME_STATES) => {
      console.log(`GAME_STATE [${new_game_state}]`);
      switch (new_game_state) {
        case GAME_STATES.LOADING:
          assetManager.init();
          levelManager.init();
          audioManager.init();
          uiManager.init();
          this.load_levels();
          // this.activate_debug_mode();
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
    this.scene_state.subscribe((new_scene_state: SCENE_STATE) => {
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

  private load_levels() {
    levelManager.levels.forEach((lvl) => this.game.add(lvl.name, lvl));
  }
  private activate_debug_mode() {
    new DevTool(this.game);
  }

  // actions
  private load_level(level: LevelScene) {
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
    const next_level: any = levelManager.next();
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
  events: Record<string, any> = {};

  constructor() {}
  on(event: string, callback: any) {
    this.events[event] = this.events[event] || [];
    this.events[event].push(callback);
  }
  emit(event: string, data: any = {}) {
    if (this.events[event]) {
      this.events[event].forEach((callback: any) => {
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
