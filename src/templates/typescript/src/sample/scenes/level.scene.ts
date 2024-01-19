import { Actor, Color, Engine, Scene, Vector } from 'excalibur';
import { Brick } from '../actors/brick.actor';
import { Paddle } from '../actors/paddle.actor';
import { Ball } from '../actors/ball.actor';
import { BrickSetup, SCENES_EVENTS, LevelSetup, SCENE_STATE } from '../models';
import { eventBus, gameManager } from '../managers/game.manager';

export class LevelScene extends Scene {
  name: string;
  balls: number;
  ball_speed: Vector;
  bg_color: Color;
  bricks_setup!: BrickSetup[];
  //
  level_balls!: number;
  level_bricks: Actor[] = [];
  state!: SCENE_STATE;

  constructor(setup: LevelSetup) {
    super();
    const { balls, name, ball_speed, bg_color, bricks_setup } = setup;
    this.name = name;
    this.level_balls = balls;
    this.balls = this.level_balls;
    this.ball_speed = ball_speed;
    this.bg_color = bg_color;
    this.bricks_setup = bricks_setup;
  }
  onInitialize(engine: Engine): void {
    this.init(engine);
  }

  init(engine: Engine) {
    this.reset();

    //create game objects
    this.backgroundColor = this.bg_color;
    const paddle = this.create_paddle(engine);

    const ball = this.create_ball(engine);
    this.level_bricks = this.create_bricks();
    // add game objects to the scene
    this.add(paddle);
    this.add(ball);
    this.level_bricks.forEach((brick) => this.add(brick));
    // setup player controls
    engine.input.pointers.primary.on('move', (e) => {
      const can_move = this.state === SCENE_STATE.PLAYING;
      if (can_move) {
        paddle.pos.x = e.worldPos.x;
      }
    });

    // setup interactions
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
    let colliding = false;
    // destroy bricks
    ball.on('collisionstart', (e) => {
      const collide_with_brick = this.level_bricks.indexOf(e.other) > -1;
      if (collide_with_brick) {
        let brick: any = e.other;
        brick.life--;

        eventBus.emit(SCENES_EVENTS.UPDATE_SCORE, brick.hit_score);

        if (brick.life <= 0) {
          brick.kill();
          eventBus.emit(SCENES_EVENTS.UPDATE_SCORE, brick.destroy_score);
        } else {
          brick.update_sprite();
        }

        if (this.level_completed()) {
          ball.kill();
          this.set_state(SCENE_STATE.COMPLETED);
          return;
        }
      }

      if (!colliding) {
        colliding = true;
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
      colliding = false;
    });
    // lose ball
    ball.on('exitviewport', () => {
      this.balls--;
      eventBus.emit(SCENES_EVENTS.UPDATE_BALL, this.balls);

      if (this.gameover()) {
        ball.kill();
        this.set_state(SCENE_STATE.GAMEOVER);
      } else {
        ball.pos.x = Math.random() * engine.drawWidth;
        ball.pos.y = -10;
      }
    });

    this.set_state(SCENE_STATE.PLAYING);
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
    const offset_y = 32 + 32;

    const bricks: Actor[] = [];

    this.bricks_setup.forEach((b, row) => {
      for (let col = 0; col < b.cols; col++) {
        const x = offset_x + col * (b.width + padding);
        const y = offset_y + row * (b.height + padding);
        const brick = new Brick(x, y, b.width, b.height, b.type);
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
    return ball;
  }
  create_paddle(engine: Engine) {
    const x = 100;
    const y = engine.drawHeight - 64;
    const width = 32;
    const height = 4;
    const paddle = new Paddle(x, y, width, height);
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
