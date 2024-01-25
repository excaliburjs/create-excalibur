import { Input, Scene } from 'excalibur';
import { Brick } from '../actors/brick.actor.js';
import { Paddle } from '../actors/paddle.actor.js';
import { Ball } from '../actors/ball.actor.js';
import { SCENE_EVENTS, SCENE_STATE, PLAYER_CONTROLS } from '../models.js';
import { eventBus, gameManager } from '../managers/game.manager.js';
import { assetManager } from '../managers/asset.manager.js';
import { createGalaxy } from '../particles/galaxy.particles.js';

export class LevelScene extends Scene {
  constructor(setup) {
    super();
    const { balls, name, ballSpeed, bgColor, bricksSetup, music } = setup;
    this.name = name;
    this.balls = this.levelBalls;
    this.ballSpeed = ballSpeed;
    this.bgColor = bgColor;
    this.bricksSetup = bricksSetup;
    this.levelMusic =
      assetManager.sounds[music] || assetManager.sounds.levelMusicDefault;
    this.levelMusic.volume = 0.1;
    this.levelBalls = balls;
    this.levelBricks = [];

    this.state = null;
    this.PLAYER_CONTROLS = null;

    this.playerControls = PLAYER_CONTROLS.BOTH;
  }
  onInitialize(engine) {
    this.init(engine);
  }

  init(engine) {
    this.reset();
    this.backgroundColor = this.bgColor;
    //create game objects
    const galaxyParticle = this.createGalaxyParticles(engine);
    this.levelBricks = this.createBricks();

    const paddle = this.createPaddle(engine);
    paddle.on('postupdate', () => {
      const offsetX = 10;
      const hitLimits = {
        screenLeft: paddle.pos.x - paddle.width / 2 < 0 + offsetX,
        screenRight: paddle.pos.x + paddle.width / 2 > engine.drawWidth,
      };

      if (hitLimits.screenLeft) {
        paddle.pos.x = 0 + paddle.width / 2 + offsetX;
      }
      if (hitLimits.screenRight) {
        paddle.pos.x = engine.drawWidth - paddle.width / 2 - offsetX;
      }
    });

    const ball = this.createBall(engine);
    ball.on('postupdate', () => {
      const hitLimits = {
        screenTop: ball.pos.y - ball.height / 2 < 0,
        screenLeft: ball.pos.x - ball.width / 2 < 0,
        screenRight: ball.pos.x + ball.width / 2 > engine.drawWidth,
      };

      if (hitLimits.screenTop) {
        // send to bottom
        ball.vel.y = ball.vel.y = ball.ballSpeed.y * -1 + Math.random();
      } else if (hitLimits.screenLeft) {
        // send to the right
        ball.vel.x = ball.ballSpeed.x + Math.random();
      } else if (hitLimits.screenRight) {
        // send to the left
        ball.vel.x = ball.ballSpeed.x * -1 + Math.random();
      }
    });
    // destroy bricks
    ball.on('collisionstart', (e) => {
      const collideWithBrick = this.levelBricks.indexOf(e.other) > -1;
      const collideWithPaddle = e.other.name === 'paddle';
      if (collideWithBrick) {
        let brick = e.other;
        brick.life--;

        eventBus.emit(SCENE_EVENTS.UPDATE_SCORE, brick.hitScore);

        if (brick.life <= 0) {
          assetManager.sounds.brickDestroy.play(0.1);
          brick.kill();
          eventBus.emit(SCENE_EVENTS.UPDATE_SCORE, brick.destroyScore);
        } else {
          assetManager.sounds.brickHit.play(0.1);
          brick.updateSprite();
        }

        if (this.levelCompleted()) {
          this.levelMusic.stop();
          assetManager.sounds.levelCompleted.play();

          ball.kill();
          this.setState(SCENE_STATE.COMPLETED);
          return;
        }
      }
      if (collideWithPaddle) {
        assetManager.sounds.paddleHit.play();
      }

      if (!ball.isColliding) {
        ball.isColliding = true;
        const intersection = e.contact.mtv.normalize();
        const hitX = Math.abs(intersection.x) > Math.abs(intersection.y);

        if (hitX) {
          // reverse x
          ball.vel.x *= -1;
        } else {
          // reverse y
          ball.vel.y *= -1;
        }
      }
    });
    ball.on('collisionend', () => {
      ball.isColliding = false;
    });
    // lose ball
    ball.on('exitviewport', () => {
      this.balls--;
      assetManager.sounds.ballDrop.play();
      eventBus.emit(SCENE_EVENTS.UPDATE_BALL, this.balls);

      if (this.gameover()) {
        this.levelMusic.stop();
        assetManager.sounds.levelGameover.play();
        ball.kill();
        this.setState(SCENE_STATE.GAMEOVER);
      } else {
        ball.pos.x = Math.random() * engine.drawWidth;
        ball.pos.y = -10;
      }
    });

    // setup player controls

    if (
      this.playerControls === PLAYER_CONTROLS.MOUSE ||
      this.playerControls === PLAYER_CONTROLS.BOTH
    ) {
      // MOUSE CONTROLS
      engine.input.pointers.primary.on('move', (e) => {
        const canMove = this.state === SCENE_STATE.PLAYING;
        if (canMove) {
          paddle.pos.x = e.worldPos.x;
        }
      });
    }
    if (
      this.playerControls === PLAYER_CONTROLS.KEYBOARD ||
      this.playerControls === PLAYER_CONTROLS.BOTH
    ) {
      // KEYBOARD CONTROLS
      paddle.on('preupdate', () => {
        paddle.vel.x = 0;
        const KEYBOARD_LEFT_PRESSED =
          engine.input.keyboard.isHeld(Input.Keys.Left) ||
          engine.input.keyboard.isHeld(Input.Keys.A);
        const KEYBOARD_RIGHT_PRESSED =
          engine.input.keyboard.isHeld(Input.Keys.Right) ||
          engine.input.keyboard.isHeld(Input.Keys.D);

        if (KEYBOARD_LEFT_PRESSED) {
          paddle.vel.x = -1;
        }
        if (KEYBOARD_RIGHT_PRESSED) {
          paddle.vel.x = 1;
        }
        if (paddle.vel.x !== 0) {
          paddle.vel.x = paddle.vel.x * paddle.speed;
        }
      });
    }

    // add game objects to the scene
    this.add(galaxyParticle);
    this.add(paddle);
    this.add(ball);
    this.levelBricks.forEach((brick) => this.add(brick));
    //
    this.levelMusic.stop();
    this.levelMusic.play();
    this.setState(SCENE_STATE.PLAYING);
  }
  createGalaxyParticles(engine) {
    return createGalaxy({
      width: engine.drawWidth,
      height: engine.drawHeight,
      x: engine.drawWidth / 2,
      y: -50,
    });
  }
  reset() {
    this.clear();
    this.balls = this.levelBalls;
  }

  setState(newState) {
    if (this.state === newState) return;
    this.state = newState;
    gameManager.sceneState.next(newState);
  }
  // game objects
  createBricks() {
    const padding = 32 + 24 / 6;
    const offsetX = 32 * 2;
    const offsetY = 32 + 48;
    const brickWidth = 32;
    const brickHeight = 16;
    const bricks = [];

    this.bricksSetup.forEach((row, rowIndex) => {
      for (let pos = 0; pos < row.length; pos++) {
        if (row[pos] === '') {
          continue;
        }

        const x = offsetX + pos * (brickWidth + padding);
        const y = offsetY + rowIndex * (brickHeight + padding);
        const brick = new Brick(x, y, brickWidth, brickHeight, row[pos]);
        brick.z = 1;
        bricks.push(brick);
      }
    });

    return bricks;
  }
  createBall(engine) {
    const x = engine.drawWidth / 2;
    const y = -10;
    const radius = 8;
    const vel = this.ballSpeed;
    const ball = new Ball(x, y, radius, vel);
    ball.z = 1;
    return ball;
  }
  createPaddle(engine) {
    const x = 100;
    const y = engine.drawHeight - 64;
    const width = 32;
    const height = 4;
    const speed = 500;
    const paddle = new Paddle(x, y, width, height, speed);
    paddle.z = 1;
    return paddle;
  }
  // state
  levelCompleted() {
    return this.levelBricks.every((b) => b.isKilled());
  }
  gameover() {
    return this.balls <= 0;
  }
}
