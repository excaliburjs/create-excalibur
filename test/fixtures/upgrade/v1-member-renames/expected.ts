import { Actor, Engine, Scene, Timer, Animation, TileMap, PauseComponent, Particle, Screen, Future, PolygonCollider, Transition, PointerEvent, WheelEvent } from "excalibur";

export class Enemy extends Actor {
  override onPostUpdate(engine: Engine): void {
    if (this.isOffscreen) this.kill();
    this.graphics.forceOnScreen = true; // "on screen" stays two words on v1
    if (engine.isLoaded && engine.isReady && engine.isHiDPI) this.pauseComponent.canPause = false;
    engine.input.keyboard.setEnabled(false);
    engine.setInputEnabled(engine.input.keyboard.enabled);
    engine.input.gamepads.pollingEnabled = true;
    const pc: PauseComponent = this.pauseComponent;
    if (pc.isPaused) return;
  }
}

export class Level extends Scene {
  timer = new Timer({ interval: 100 });
  override onInitialize(engine: Engine): void {
    this.physics.config.integration.onScreenOnly = true; // unchanged on v1
    if (this.timer.isComplete || this.timer.isRunning) return;
    const map = new TileMap({});
    for (const tile of map.getOnScreenTiles()) tile.isSolid = true; // getOnScreenTiles keeps its name
    map.getTile(0, 0).isSolid = false;
    const screen: Screen = engine.screen;
    if (screen.isHiDPI) return;
    const poly = new PolygonCollider();
    if (!poly.checkConvex()) return;
    const f = new Future<void>();
    if (f.isComplete) return;
    const p = new Particle();
    p.isVisible = false;
    p.pauseComponent.canPause = true;
    const anim = new Animation();
    if (anim.isComplete) return;
    engine.debug.collider.z.solid = 1; // DebugConfig's z-index key keeps its name
  }
  override onTransition(): Transition { const t = new Transition(); return t.hasStarted ? t : t; }
  onPointer(evt: PointerEvent, wheel: WheelEvent): boolean { return evt.isActive && wheel.isActive; }
}

export class Toast {
  complete = false;
  visible = true;
  solid = false;
  tick(): void {
    if (this.complete || this.visible || this.solid) return; // a user class: untouched
  }
}
