import {
  Actor,
  CollisionStartEvent,
  Color,
  Engine,
  Input,
  Scene,
  Sound,
  Vector,
} from 'excalibur';
import { Brick } from '../actors/brick.actor';
import { Paddle } from '../actors/paddle.actor';
import { Ball } from '../actors/ball.actor';
import {
  BrickSetup,
  SCENE_EVENTS,
  LevelSetup,
  SCENE_STATE,
  PLAYER_CONTROLS,
  BRICK_TYPE,
} from '../models';
import { eventBus, gameManager } from '../managers/game.manager';
import { assetManager } from '../managers/asset.manager';
import { create_galaxy } from '../particles/galaxy.particles';

export class LevelScene extends Scene {
  name: string;
  balls: number;
  ball_speed: Vector;
  bg_color: Color;
  bricks_setup!: any[];
  //
  level_music!: Sound;
  level_balls!: number;
  level_bricks: Actor[] = [];
  state!: SCENE_STATE;
  player_controls!: PLAYER_CONTROLS;

  constructor(setup: LevelSetup) {
    super();
    const {
      balls,
      name,
      ball_speed,
      bg_color,
      level: bricks_setup,
      music,
    } = setup;
    this.name = name;
    this.level_balls = balls;
    this.balls = this.level_balls;
    this.ball_speed = ball_speed;
    this.bg_color = bg_color;
    this.bricks_setup = bricks_setup;
    this.level_music =
      assetManager.sounds[music] || assetManager.sounds.level_music_default;
    this.level_music.volume = 0.1;

    this.player_controls = PLAYER_CONTROLS.BOTH;
  }
  onInitialize(engine: Engine): void {
    this.init(engine);
  }

  init(engine: Engine) {
    this.reset();
    this.backgroundColor = this.bg_color;
    //create game objects
    // const galaxy_particle = this.create_galaxy_particles(engine);
    this.level_bricks = this.create_bricks();

    const paddle = this.create_paddle(engine);
    paddle.on('postupdate', () => {
      const offset_x = 10;
      const hit_limits = {
        screen_left: paddle.pos.x - paddle.width / 2 < 0 + offset_x,
        screen_right: paddle.pos.x + paddle.width / 2 > engine.drawWidth,
      };

      if (hit_limits.screen_left) {
        paddle.pos.x = 0 + paddle.width / 2 + offset_x;
      }
      if (hit_limits.screen_right) {
        paddle.pos.x = engine.drawWidth - paddle.width / 2 - offset_x;
      }
    });

    const ball = this.create_ball(engine);
    ball.on('postupdate', () => {
      const hit_limits = {
        screen_top: ball.pos.y - ball.height / 2 < 0,
        screen_left: ball.pos.x - ball.width / 2 < 0,
        screen_right: ball.pos.x + ball.width / 2 > engine.drawWidth,
      };

      if (hit_limits.screen_top) {
        // send to bottom
        ball.vel.y = ball.vel.y = ball.ball_speed.y * -1 + Math.random();
      } else if (hit_limits.screen_left) {
        // send to the right
        ball.vel.x = ball.ball_speed.x + Math.random();
      } else if (hit_limits.screen_right) {
        // send to the left
        ball.vel.x = ball.ball_speed.x * -1 + Math.random();
      }
    });
    // destroy bricks
    ball.on('collisionstart', (e: CollisionStartEvent) => {
      const collide_with_brick = this.level_bricks.indexOf(e.other) > -1;
      const collide_with_paddle = e.other.name === 'paddle';
      if (collide_with_brick) {
        let brick: any = e.other;
        brick.life--;

        eventBus.emit(SCENE_EVENTS.UPDATE_SCORE, brick.hit_score);

        if (brick.life <= 0) {
          assetManager.sounds.brick_destroy.play(0.1);
          brick.kill();
          eventBus.emit(SCENE_EVENTS.UPDATE_SCORE, brick.destroy_score);
        } else {
          assetManager.sounds.brick_hit.play(0.1);
          brick.update_sprite();
        }

        if (this.level_completed()) {
          this.level_music.stop();
          assetManager.sounds.level_completed.play();

          ball.kill();
          this.set_state(SCENE_STATE.COMPLETED);
          return;
        }
      }
      if (collide_with_paddle) {
        assetManager.sounds.paddle_hit.play();
      }

      if (!ball.is_colliding) {
        ball.is_colliding = true;
        const intersection = e.contact.mtv.normalize();
        const hit_x = Math.abs(intersection.x) > Math.abs(intersection.y);

        if (hit_x) {
          // reverse x
          ball.vel.x *= -1;
        } else {
          // reverse y
          ball.vel.y *= -1;
        }
      }
    });
    ball.on('collisionend', () => {
      ball.is_colliding = false;
    });
    // lose ball
    ball.on('exitviewport', () => {
      this.balls--;
      assetManager.sounds.ball_drop.play();
      eventBus.emit(SCENE_EVENTS.UPDATE_BALL, this.balls);

      if (this.gameover()) {
        this.level_music.stop();
        assetManager.sounds.level_gameover.play();
        ball.kill();
        this.set_state(SCENE_STATE.GAMEOVER);
      } else {
        ball.pos.x = Math.random() * engine.drawWidth;
        ball.pos.y = -10;
      }
    });

    // setup player controls

    if (
      this.player_controls === PLAYER_CONTROLS.MOUSE ||
      this.player_controls === PLAYER_CONTROLS.BOTH
    ) {
      // MOUSE CONTROLS
      engine.input.pointers.primary.on('move', (e) => {
        const can_move = this.state === SCENE_STATE.PLAYING;
        if (can_move) {
          paddle.pos.x = e.worldPos.x;
        }
      });
    }
    if (
      this.player_controls === PLAYER_CONTROLS.KEYBOARD ||
      this.player_controls === PLAYER_CONTROLS.BOTH
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
    this.add(paddle);
    this.add(ball);
    // this.add(galaxy_particle);
    this.level_bricks.forEach((brick) => this.add(brick));
    //
    this.level_music.stop();
    this.level_music.play();
    this.set_state(SCENE_STATE.PLAYING);
  }
  create_galaxy_particles(engine: Engine) {
    return create_galaxy({
      width: engine.drawWidth,
      height: engine.drawHeight,
      x: engine.drawWidth / 2,
      y: -50,
    });
  }
  reset() {
    this.clear();
    this.balls = this.level_balls;
  }

  set_state(new_state: SCENE_STATE) {
    if (this.state === new_state) return;
    this.state = new_state;
    gameManager.scene_state.next(new_state);
  }
  // game objects
  create_bricks() {
    const padding = 32 + 24 / 6;
    const offset_x = 32 * 2;
    const offset_y = 32 + 48;
    const brick_width = 32;
    const brick_height = 16;
    const bricks: Actor[] = [];

    this.bricks_setup.forEach((row: any[], row_index: number) => {
      for (let pos = 0; pos < row.length; pos++) {
        if (row[pos] === '') {
          continue;
        }

        const x = offset_x + pos * (brick_width + padding);
        const y = offset_y + row_index * (brick_height + padding);
        const brick = new Brick(x, y, brick_width, brick_height, row[pos]);
        brick.z = 1;
        bricks.push(brick);
      }
    });

    return bricks;
  }

  create_ball(engine: Engine) {
    const x = engine.drawWidth / 2;
    const y = -10;
    const radius = 8;
    const vel = this.ball_speed;
    const ball = new Ball(x, y, radius, vel);
    ball.z = 1;
    return ball;
  }
  create_paddle(engine: Engine) {
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
  level_completed() {
    return this.level_bricks.every((b) => b.isKilled());
  }
  gameover() {
    return this.balls <= 0;
  }
}
