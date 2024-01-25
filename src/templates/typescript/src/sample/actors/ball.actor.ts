import {
  Actor,
  Animation,
  CollisionType,
  SpriteSheet,
  Vector,
  range,
} from 'excalibur';
import { assetManager } from '../managers/asset.manager';

export class Ball extends Actor {
  ballSpeed!: Vector;
  isColliding = false;

  constructor(x: number, y: number, radius: number, vel: Vector) {
    super({ x, y, radius, vel });
    this.ballSpeed = vel;
  }

  onInitialize(): void {
    this.body.collisionType = CollisionType.Passive;
    this.setSprite();
  }

  setSprite() {
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
    const animationMs = 0;
    const ballAnim = Animation.fromSpriteSheet(sprite, frames, animationMs);
    //
    this.graphics.use(ballAnim);
  }
}
