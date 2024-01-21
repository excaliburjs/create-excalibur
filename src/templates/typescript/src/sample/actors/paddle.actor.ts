import {
  Actor,
  Animation,
  CollisionType,
  Engine,
  SpriteSheet,
  range,
  vec,
} from 'excalibur';
import { assetManager } from '../managers/asset.manager';

export class Paddle extends Actor {
  speed!: number;
  constructor(
    x: number,
    y: number,
    width: number,
    height: number,
    speed: number
  ) {
    super({ x, y, width, height });
    this.speed = speed;
    this.name = 'paddle';
  }
  onInitialize(engine: Engine): void {
    //
    this.body.collisionType = CollisionType.Passive;
    this.set_sprite();
    this.scale = vec(2, 2);
  }

  set_sprite() {
    const sprite = SpriteSheet.fromImageSource({
      image: assetManager.images.spritesheet,
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
    const frames = range(0, 0);
    const animation_ms = 0;
    const paddle_anim = Animation.fromSpriteSheet(sprite, frames, animation_ms);
    //
    this.graphics.use(paddle_anim);
  }
}
