import { Actor, Engine, Scene, Timer, Animation, TileMap, PauseComponent, Particle, Screen, Future, PolygonCollider, Transition, PointerEvent, WheelEvent } from "excalibur";

export class Enemy extends Actor {
  override onPostUpdate(engine: Engine): void {
    if (this.isOffScreen) this.kill();
    this.graphics.forceOnScreen = true; // "on screen" stays two words on v1
    if (engine.loadingComplete && engine.ready && engine.isHiDpi) this.paused.canPause = false;
    engine.input.keyboard.toggleEnabled(false);
    engine.toggleInputEnabled(engine.input.keyboard.enabled);
    engine.input.gamepads.enabled = true;
    const pc: PauseComponent = this.pauseComponent;
    if (pc.paused) return;
  }
}

export class Level extends Scene {
  timer = new Timer({ interval: 100 });
  override onInitialize(engine: Engine): void {
    this.physics.config.integration.onScreenOnly = true; // unchanged on v1
    if (this.timer.complete || this.timer.isRunning) return;
    const map = new TileMap({});
    for (const tile of map.getOnScreenTiles()) tile.solid = true; // getOnScreenTiles keeps its name
    map.getTile(0, 0).solid = false;
    const screen: Screen = engine.screen;
    if (screen.isHiDpi) return;
    const poly = new PolygonCollider();
    if (!poly.isConvex()) return;
    const f = new Future<void>();
    if (f.isCompleted) return;
    const p = new Particle();
    p.visible = false;
    p.paused.canPause = true;
    const anim = new Animation();
    if (anim.done) return;
    engine.debug.collider.z.solid = 1; // DebugConfig's z-index key keeps its name
  }
  override onTransition(): Transition { const t = new Transition(); return t.started ? t : t; }
  onPointer(evt: PointerEvent, wheel: WheelEvent): boolean { return evt.active && wheel.active; }
}

export class Toast {
  complete = false;
  visible = true;
  solid = false;
  tick(): void {
    if (this.complete || this.visible || this.solid) return; // a user class: untouched
  }
}
