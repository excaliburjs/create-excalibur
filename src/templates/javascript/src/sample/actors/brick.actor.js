import {
  Actor,
  Animation,
  CollisionType,
  SpriteSheet,
  range,
  vec,
} from 'excalibur';
import { BRICK_TYPE } from '../models.js';
import { assetManager } from '../managers/asset.manager.js';

export class Brick extends Actor {
  constructor(x, y, width, height, type) {
    super({ x, y, width, height });
    this.type = type;
    this.sprite_status = 32 * 8;
    switch (this.type) {
      case BRICK_TYPE.LEVEL_1:
        this.life = 1;
        this.sprite_type = 1;
        this.hit_score = 100;
        this.destroy_score = this.life * 200;

        break;
      case BRICK_TYPE.LEVEL_2:
        this.life = 2;
        this.sprite_type = 2;
        this.hit_score = 250;
        this.destroy_score = this.life * 200;

        break;
      case BRICK_TYPE.LEVEL_3:
        this.life = 3;
        this.sprite_type = 3;
        this.hit_score = 250;
        this.destroy_score = this.life * 200;

        break;
      case BRICK_TYPE.LEVEL_4:
        this.life = 4;
        this.sprite_type = 4;
        this.hit_score = 350;
        this.destroy_score = this.life * 200;

        break;
      case BRICK_TYPE.LEVEL_5:
        this.life = 5;
        this.sprite_type = 5;
        this.hit_score = 350;
        this.destroy_score = this.life * 200;

        break;
      case BRICK_TYPE.LEVEL_6:
        this.life = 6;
        this.sprite_type = 6;
        this.hit_score = 350;
        this.destroy_score = this.life * 200;

        break;
    }
  }
  onInitialize(engine) {
    //
    this.body.collisionType = CollisionType.Active;
    this.set_sprite();
    this.scale = vec(2, 2);
  }
  set_sprite() {
    const sprite = SpriteSheet.fromImageSource({
      image: assetManager.images.spritesheet,
      grid: {
        rows: 1,
        columns: 1,
        spriteWidth: 32,
        spriteHeight: 16,
      },
      spacing: {
        originOffset: { x: this.sprite_status, y: this.sprite_type * 16 },
      },
    });
    const frames = range(0, 0);
    const animation_ms = 100;
    const brick_anim = Animation.fromSpriteSheet(sprite, frames, animation_ms);
    this.graphics.use(brick_anim);
  }
  update_sprite() {
    switch (this.life) {
      case 3:
        this.sprite_status = 32 * 8;
        break;
      case 2:
        this.sprite_status = 32 * 9;
        break;
      case 1:
        this.sprite_status = 32 * 10;
        break;
    }

    this.set_sprite();
  }
}
