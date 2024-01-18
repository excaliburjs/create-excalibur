import {
  Actor,
  Animation,
  CollisionType,
  Color,
  Engine,
  ImageSource,
  Loader,
  SpriteSheet,
  range,
  vec,
} from 'excalibur';

// [CREATE_GAME]
const game = new Engine({
  width: 600,
  height: 400,
  canvasElementId: 'main-canvas',
  backgroundColor: Color.Black,
});

// LOAD RESOURCES
// assets from https://megacrash.itch.io/breakout-assets
const loader = new Loader();
loader.playButtonText = 'Play';
loader.backgroundColor = 'black';
const resources: any = {
  spritesheet: new ImageSource('/sample/breakout_sprite.png'),
};
for (const key in resources) {
  loader.addResource(resources[key]);
}

// [CREATE_GAME_ACTORS]
const paddle = create_paddle();
const ball = create_ball();
let game_bricks = create_bricks();

// [ADD_ACTORS_TO_GAME]
game.add(paddle);
game.add(ball);
game_bricks.forEach((brick) => game.add(brick));

// [SETUP_PLAYER_CONTROLS]
game.input.pointers.primary.on('move', (e) => {
  paddle.pos.x = e.worldPos.x;
});

//
function create_bricks() {
  const padding = 32 + 32 / 6;
  const offset_x = 32 * 2;
  const offset_y = 32 * 2;

  const columns = 7;
  const brick_width = 32;
  const brick_height = 16;
  const rows = 3;

  const brickColor = [Color.Viridian, Color.Orange, Color.Vermilion];

  // const brick_width = game.drawWidth / columns - padding - padding / columns;
  const bricks: Actor[] = [];

  // DYNAMIC BRICKS
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = offset_x + col * (brick_width + padding);
      const y = offset_y + row * (brick_height + padding);
      const width = brick_width;
      const height = brick_height;
      const color = brickColor[row];
      //
      const brick = new Actor({ x, y, width, height, color });
      brick.body.collisionType = CollisionType.Active;

      const brick_img = SpriteSheet.fromImageSource({
        image: resources.spritesheet,
        grid: {
          rows: 1,
          columns: 1,
          spriteWidth: 32,
          spriteHeight: 16,
        },
        spacing: {
          originOffset: { x: 32 * 8, y: row * 16 },
        },
      });
      const brick_anim = Animation.fromSpriteSheet(brick_img, range(0, 0), 100);
      brick.graphics.use(brick_anim);
      brick.scale = vec(2, 2);
      bricks.push(brick);
    }
  }

  return bricks;
}
function create_ball() {
  const ball = new Actor({
    x: 100,
    y: 100,
    radius: 8,
    color: Color.White,
  });
  const ball_speed = vec(200, -200);
  ball.vel = ball_speed;
  const ball_img = SpriteSheet.fromImageSource({
    image: resources.spritesheet,
    grid: {
      rows: 1,
      columns: 1,
      spriteWidth: 16,
      spriteHeight: 16,
    },
    spacing: {
      originOffset: { x: 32 * 6, y: 256 - 16 },
    },
  });
  const ball_anim = Animation.fromSpriteSheet(ball_img, range(0, 0), 100);
  ball.graphics.use(ball_anim);
  // ball.scale = vec(2, 2);
  // collision setup
  ball.body.collisionType = CollisionType.Passive;

  // EVENTS
  ball.on('postupdate', () => {
    const hit_limits = {
      screen_top: ball.pos.y - ball.height / 2 < 0,
      screen_left: ball.pos.x - ball.width / 2 < 0,
      screen_right: ball.pos.x + ball.width / 2 > game.drawWidth,
    };

    if (hit_limits.screen_top) {
      // send to bottom
      ball.vel.y = ball.vel.y = ball_speed.y * -1 + Math.random();
    } else if (hit_limits.screen_left) {
      // send to the right
      ball.vel.x = ball_speed.x + Math.random();
    } else if (hit_limits.screen_right) {
      // send to the left
      ball.vel.x = ball_speed.x * -1 + Math.random();
    }
  });
  ball.on('pointerdown', function () {
    ball.kill();
  });

  let colliding = false;

  // destroy bricks
  ball.on('collisionstart', (e) => {
    const collide_with_brick = game_bricks.indexOf(e.other) > -1;
    if (collide_with_brick) {
      e.other.kill();

      if (game_bricks.every((b) => b.isKilled())) {
        const bricks = create_bricks();
        game_bricks = bricks;
        game_bricks.forEach((b) => game.add(b));
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
  ball.on('exitviewport', () => {
    ball.pos.x = Math.random() * game.drawWidth;
    ball.pos.y = 10;
  });

  return ball;
}
function create_paddle() {
  const paddle = new Actor({
    x: 100,
    y: game.drawHeight - 64,
    width: 32,
    height: 16,
    color: Color.ExcaliburBlue,
  });

  const paddle_img = SpriteSheet.fromImageSource({
    image: resources.spritesheet,
    grid: {
      rows: 4,
      columns: 14,
      spriteWidth: 32,
      spriteHeight: 16,
    },
    spacing: {
      originOffset: { x: 48, y: 256 - 16 },
    },
  });
  const paddle_anim = Animation.fromSpriteSheet(paddle_img, range(0, 0), 200);
  paddle.graphics.use(paddle_anim);
  paddle.scale = vec(2, 2);
  // collision setup
  paddle.body.collisionType = CollisionType.Fixed;
  return paddle;
}

//
export const breakout_game = {
  game,
  start: () => game.start(loader),
};
