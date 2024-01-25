import { SCENE_STATE } from '../models';
import { gameManager } from './game.manager';

class UIManager {
  gameContainer: any;
  btnPlay: any;
  btnRetry: any;
  btnNextLevel: any;
  btnDone: any;
  labelLevel: any;
  labelScore: any;
  labelBalls: any;
  labelHighscore: any;

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
  printUI(level: string, balls: number, score: number, highscore: number) {
    this.printLevel(level);
    this.printBalls(balls);
    this.printScore(score);
    this.printHighscore(highscore);
  }
  updateState(state: SCENE_STATE | 'DONE') {
    this.gameContainer.className = state;
  }

  //
  printBalls(amount: number) {
    this.labelBalls.innerText = '🪩'.repeat(amount);
  }

  printScore(score: number) {
    this.labelScore.innerText = `${score}`;
  }
  printHighscore(score: number) {
    this.labelHighscore.innerText = `${score}`;
  }
  printLevel(lvl: string) {
    this.labelLevel.innerText = `${lvl}`;
  }
}

export const uiManager = new UIManager();
