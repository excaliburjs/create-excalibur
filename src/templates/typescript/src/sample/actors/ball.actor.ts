import {
  Actor,
  Animation,
  CollisionType,
  Engine,
  SpriteSheet,
  Vector,
  range,
} from 'excalibur';
import { assetManager } from '../managers/asset.manager';

export class Ball extends Actor {
  ball_speed!: Vector;
  amount!: number;
  constructor(x: number, y: number, radius: number, vel: Vector) {
    super({ x, y, radius, vel });
    this.ball_speed = vel;
  }

  onInitialize(engine: Engine): void {
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
