import {
  Actor,
  Animation,
  CollisionType,
  SpriteSheet,
  range,
  vec,
} from 'excalibur';

import { assetManager } from '../managers/asset.manager.js';

export class Brick extends Actor {
  constructor(x, y, width, height, type) {
    super({ x, y, width, height });
    this.type = type;
    this.spriteStatus = 32 * 8;
    switch (this.type) {
      case '1':
        this.life = 1;
        this.spriteType = 1;
        this.hitScore = 100;
        this.destroyScore = this.life * 200;

        break;
      case '2':
        this.life = 2;
        this.spriteType = 2;
        this.hitScore = 250;
        this.destroyScore = this.life * 200;

        break;
      case '3':
        this.life = 3;
        this.spriteType = 3;
        this.hitScore = 250;
        this.destroyScore = this.life * 200;

        break;
      case '4':
        this.life = 4;
        this.spriteType = 4;
        this.hitScore = 350;
        this.destroyScore = this.life * 200;

        break;
      case '5':
        this.life = 5;
        this.spriteType = 5;
        this.hitScore = 350;
        this.destroyScore = this.life * 200;

        break;
      case '6':
        this.life = 6;
        this.spriteType = 6;
        this.hitScore = 350;
        this.destroyScore = this.life * 200;

        break;
    }
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
        rows: 1,
        columns: 1,
        spriteWidth: 32,
        spriteHeight: 16,
      },
      spacing: {
        originOffset: { x: this.spriteStatus, y: this.spriteType * 16 },
      },
    });
    const frames = range(0, 0);
    const animationMs = 100;
    const brickAnim = Animation.fromSpriteSheet(sprite, frames, animationMs);
    this.graphics.use(brickAnim);
  }
  updateSprite() {
    switch (this.life) {
      case 3:
        this.spriteStatus = 32 * 8;
        break;
      case 2:
        this.spriteStatus = 32 * 9;
        break;
      case 1:
        this.spriteStatus = 32 * 10;
        break;
    }

    this.setSprite();
  }
}
