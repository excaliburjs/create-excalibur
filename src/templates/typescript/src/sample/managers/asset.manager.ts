import { ImageSource, Loader, Sound } from 'excalibur';
import { ImageResource, SoundResource } from '../models';

class AssetManager {
  loader!: Loader;
  images!: ImageResource;
  sounds!: SoundResource;

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
      level_music_default: new Sound('/sample/music/HarmonicMinor.wav'),
      level_music_1: new Sound('/sample/music/HarmonicMinor.wav'),
      level_music_2: new Sound('/sample/music/Cyberpunk Moonlight Sonata.mp3'),
      level_music_3: new Sound('/sample/music/cubedcanada+invaderloop.mp3'),
      level_music_4: new Sound('/sample/music/S31-Futuristic-Resources.ogg'),
      level_music_5: new Sound('/sample/music/ruskerdax_-_open_warfare.mp3'),
      //
      level_completed: new Sound('/sample/sounds/win.wav'),
      level_gameover: new Sound('/sample/sounds/vgdeathsound.wav'),
      brick_destroy: new Sound('/sample/sounds/explosion.wav'),
      brick_hit: new Sound('/sample/sounds/hit2.wav'),
      ball_drop: new Sound('/sample/sounds/ball_drop.mp3'),
      paddle_hit: new Sound('/sample/sounds/hit.wav'),
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
