import { ImageSource, Loader, Sound } from 'excalibur';

class AssetManager {
  constructor() {}
  init() {
    this.loader = new Loader();
    this.loader.suppressPlayButton = true;
    this.loader.backgroundColor = 'black';
    //
    this.images = {
      spritesheet: new ImageSource('/sample/sprites/breakout_sprite.png'),
    };

    this.sounds = {
      levelMusicDefault: new Sound('/sample/music/HarmonicMinor.wav'),
      levelMusic1: new Sound('/sample/music/HarmonicMinor.wav'),
      levelMusic2: new Sound('/sample/music/Cyberpunk Moonlight Sonata.mp3'),
      levelMusic3: new Sound('/sample/music/cubedcanada+invaderloop.mp3'),
      levelMusic4: new Sound('/sample/music/S31-Futuristic-Resources.ogg'),
      levelMusic5: new Sound('/sample/music/ruskerdax_-_open_warfare.mp3'),
      //
      levelCompleted: new Sound('/sample/sounds/win.wav'),
      levelGameover: new Sound('/sample/sounds/vgdeathsound.wav'),
      brickDestroy: new Sound('/sample/sounds/explosion.wav'),
      brickHit: new Sound('/sample/sounds/hit2.wav'),
      ballDrop: new Sound('/sample/sounds/ball_drop.mp3'),
      paddleHit: new Sound('/sample/sounds/hit.wav'),
    };
    //
    for (const key in this.images) {
      this.loader.addResource(this.images[key]);
    }
    for (const key in this.sounds) {
      const sound = this.sounds[key];
      this.loader.addResource(sound);
      sound.volume = 0.2;
    }
  }
}

export const assetManager = new AssetManager();
