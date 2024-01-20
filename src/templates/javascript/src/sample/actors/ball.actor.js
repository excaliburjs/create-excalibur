import { Actor, Animation, CollisionType, SpriteSheet, range } from 'excalibur';
import { assetManager } from '../managers/asset.manager.js';

export class Ball extends Actor {
  constructor(x, y, radius, vel) {
    super({ x, y, radius, vel });
    this.ball_speed = vel;
    this.is_colliding = false;
  }

  onInitialize(engine) {
    //
    this.body.collisionType = CollisionType.Passive;
    this.set_sprite();
  }

  set_sprite() {
    const sprite = SpriteSheet.fromImageSource({
      image: assetManager.images.spritesheet,
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
    const frames = range(0, 0);
    const animation_ms = 0;
    const ball_anim = Animation.fromSpriteSheet(sprite, frames, animation_ms);
    //
    this.graphics.use(ball_anim);
  }
}
