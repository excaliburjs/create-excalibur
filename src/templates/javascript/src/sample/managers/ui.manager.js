import { gameManager } from './game.manager.js';

class UIManager {
  constructor() {
    this.gameContainer = document.getElementById('game');
    this.btnPlay = document.getElementById('btn-play');
    this.btnRetry = document.getElementById('btn-retry');
    this.btnNextLevel = document.getElementById('btn-next-level');
    this.btnDone = document.getElementById('btn-done');
    this.labelLevel = document.getElementById('label-level');
    this.labelScore = document.getElementById('label-score');
    this.labelBalls = document.getElementById('label-balls');
    this.labelHighscore = document.getElementById('label-high-score');
  }

  init() {
    this.btnPlay.onclick = () => gameManager.startGame();
    this.btnRetry.onclick = () => gameManager.retryLevel();
    this.btnNextLevel.onclick = () => gameManager.nextLevel();
    this.btnDone.onclick = () => gameManager.resetGame();
  }
  printUI(level, balls, score, highscore) {
    this.printLevel(level);
    this.printBalls(balls);
    this.printScore(score);
    this.printHighscore(highscore);
  }
  updateState(state) {
    this.gameContainer.className = state;
  }

  //
  printBalls(amount) {
    this.labelBalls.innerText = '🪩'.repeat(amount);
  }

  printScore(score) {
    this.labelScore.innerText = `${score}`;
  }
  printHighscore(score) {
    this.labelHighscore.innerText = `${score}`;
  }
  printLevel(lvl) {
    this.labelLevel.innerText = `${lvl}`;
  }
}

export const uiManager = new UIManager();
