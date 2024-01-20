import { SCENE_STATE } from '../models';
import { gameManager } from './game.manager';

class UIManager {
  game_container: any;
  btn_play: any;
  btn_retry: any;
  btn_next_level: any;
  btn_done: any;
  label_level: any;
  label_score: any;
  label_balls: any;
  label_high_score: any;

  constructor() {
    this.game_container = document.getElementById('game');
    this.btn_play = document.getElementById('btn-play');
    this.btn_retry = document.getElementById('btn-retry');
    this.btn_next_level = document.getElementById('btn-next-level');
    this.btn_done = document.getElementById('btn-done');
    this.label_level = document.getElementById('label-level');
    this.label_score = document.getElementById('label-score');
    this.label_balls = document.getElementById('label-balls');
    this.label_high_score = document.getElementById('label-high-score');
  }

  init() {
    this.btn_play.onclick = () => gameManager.start_game();
    this.btn_retry.onclick = () => gameManager.retry_level();
    this.btn_next_level.onclick = () => gameManager.next_level();
    this.btn_done.onclick = () => gameManager.reset_game();
  }
  print_UI(level: string, balls: number, score: number, high_score: number) {
    this.print_level(level);
    this.print_balls(balls);
    this.print_score(score);
    this.print_high_score(high_score);
  }
  update_state(state: SCENE_STATE | 'DONE') {
    this.game_container.className = state;
  }

  //
  print_balls(amount: number) {
    this.label_balls.innerText = '🪩'.repeat(amount);
  }

  print_score(score: number) {
    this.label_score.innerText = `${score}`;
  }
  print_high_score(score: number) {
    this.label_high_score.innerText = `${score}`;
  }
  print_level(lvl: string) {
    this.label_level.innerText = `${lvl}`;
  }
}

export const uiManager = new UIManager();
