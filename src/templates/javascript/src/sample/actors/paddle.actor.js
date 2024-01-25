import {
  Actor,
  Animation,
  CollisionType,
  SpriteSheet,
  range,
  vec,
} from 'excalibur';
import { assetManager } from '../managers/asset.manager.js';

export class Paddle extends Actor {
  constructor(x, y, width, height, speed) {
    super({ x, y, width, height });
    this.speed = speed;
    this.name = 'paddle';
  }
  onInitialize(engine) {
    this.body.collisionType = CollisionType.Passive;
    this.setSprite();
    this.scale = vec(2, 2);
  }
  setSprite() {
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
    const animationMs = 0;
    const paddleAnim = Animation.fromSpriteSheet(sprite, frames, animationMs);
    //
    this.graphics.use(paddleAnim);
  }
}
