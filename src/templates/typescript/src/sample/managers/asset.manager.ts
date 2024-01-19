import { ImageSource, Loader } from 'excalibur';
import { ImageResource } from '../models';

class AssetManager {
  loader!: Loader;
  images!: ImageResource;
  sounds: any;

  constructor() {}
  init() {
    this.loader = new Loader();
    this.loader.suppressPlayButton = true;
    this.loader.backgroundColor = 'black';
    //
    this.images = {
      spritesheet: new ImageSource('/sample/breakout_sprite.png'),
    };
    //
    for (const key in this.images) {
      this.loader.addResource(this.images[key]);
    }
  }
}

export const assetManager = new AssetManager();
