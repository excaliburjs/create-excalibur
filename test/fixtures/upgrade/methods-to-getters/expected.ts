import { Actor, Engine, Scene, Sound, ImageSource, BoundingBox, Camera, coroutine, Loadable, Animation, WebAudio } from "excalibur";

export class Hero extends Actor {
  override get isKilled(): boolean {
    return super.isKilled || this.pos.x < 0;
  }
}

export class Level extends Scene {
  music = new Sound("./music.mp3");
  portrait = new ImageSource("./hero.png");

  override onActivate(): void {
    if (!this.music.isPlaying && this.music.isLoaded) {
      void this.music.play();
    }
    const running = this.engine.isRunning;
    const current = this.isCurrentScene;
    const box = new BoundingBox();
    if (box.hasZeroDimensions || this.camera.hasChanged) return;
    const co = coroutine(function* () { yield; });
    if (co.isComplete || !co.isRunning) return;
    const anim = new Animation();
    if (anim.isPlaying && anim.done) return; // already a getter at 0.32; `done` is another record's rename
    void running; void current;
  }

  async ready(engine: Engine): Promise<void> {
    await engine.ready; // the Promise moved to the `ready` getter
    if (!this.portrait.isLoaded && !WebAudio.isUnlocked) await this.portrait.load();
  }
}

export function pending(res: Loadable<unknown>, sound: Sound): () => boolean {
  const probe = sound.isPaused; // handed around as a function: a getter cannot be
  void probe;
  return () => res.isLoaded;
}

export class Toast {
  complete = false;
  isLoaded(): boolean { return this.complete; } // not a Loadable: untouched
}
export const done = new Toast().isLoaded();
