import { gameManager } from './game.manager.js';

class UIManager {
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
  print_UI(level, balls, score, high_score) {
    this.print_level(level);
    this.print_balls(balls);
    this.print_score(score);
    this.print_high_score(high_score);
  }
  update_state(state) {
    this.game_container.className = state;
  }

  //
  print_balls(amount) {
    this.label_balls.innerText = '🪩'.repeat(amount);
  }

  print_score(score) {
    this.label_score.innerText = `${score}`;
  }
  print_high_score(score) {
    this.label_high_score.innerText = `${score}`;
  }
  print_level(lvl) {
    this.label_level.innerText = `${lvl}`;
  }
}

export const uiManager = new UIManager();
