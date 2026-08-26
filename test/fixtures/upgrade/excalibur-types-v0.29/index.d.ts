// Minimal excalibur 0.29-era type surface for ex upgrade tests. Carries BOTH
// generations: the old members migrations rewrite (Input namespace, goto,
// delta, Vector.size, ...) AND the new members the byte-exact expected
// outputs must still resolve (Keys top-level, elapsedMs, magnitude, ...).
// Checks classify by symbol provenance, not uniqueness, so coexistence is fine.

export declare class Vector {
  x: number;
  y: number;
  constructor(x: number, y: number);
  size: number;        // old (deprecated 0.30)
  magnitude: number;   // new
  clone(): Vector;
  add(v: Vector): Vector;
  normalize(): Vector;
}
export declare function vec(x: number, y: number): Vector;

export declare class Color {
  static ExcaliburBlue: Color;
  static Red: Color;
}

// --- old Input namespace (removed in 0.30) + new top-level promotions ------
export declare namespace Input {
  export enum Keys {
    Space = "Space",
    Left = "ArrowLeft",
    Right = "ArrowRight",
  }
  export enum PointerButton {
    Left = "Left",
    Right = "Right",
  }
  export class Keyboard {
    wasPressed(key: Keys): boolean;
  }
  export class Gamepads {}
}
export declare enum Keys {
  Space = "Space",
  Left = "ArrowLeft",
  Right = "ArrowRight",
}
export declare enum PointerButton {
  Left = "Left",
  Right = "Right",
}
export declare class Keyboard {
  wasPressed(key: Keys): boolean;
  on(name: string, handler: (evt: any) => void): void;
}

export declare class EventDispatcher {
  emit(name: string, evt?: any): void;
  on(name: string, handler: (evt: any) => void): void;
}
export declare class EventEmitter<T = any> {
  emit(name: string, evt?: any): void;
  on(name: string, handler: (evt: T) => void): void;
}

export interface ActorArgs {
  name?: string;
  pos?: Vector;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export declare class Sprite {}
export declare class Graphic {}

export declare class GraphicsComponent {
  show(graphic: any, options?: any): any; // old
  use(graphic: any, options?: any): any;  // new
  add(graphic: any): any;
}

export declare class TransformComponent {
  pos: Vector;
}

export declare class Entity {
  name: string;
  events: EventEmitter;
  addChild(entity: Entity): Entity;
  kill(): void;
}

export declare class Actor extends Entity {
  constructor(config?: ActorArgs);
  graphics: GraphicsComponent;
  actions: ActionContext;
  pos: Vector;
  vel: Vector;
  getGlobalPos(): Vector;      // old
  getGlobalRotation(): number; // old
  getGlobalScale(): Vector;    // old
  globalPos: Vector;           // new
  globalRotation: number;      // new
  globalScale: Vector;         // new
  onPreUpdate(engine: Engine, elapsedMs: number): void;
  onPostUpdate(engine: Engine, elapsedMs: number): void;
}

export declare class Label extends Actor {}
export declare class ScreenElement extends Actor {}
export declare class Scene {
  camera: Camera;
  engine: Engine;
  add(entity: Entity): void;
  onInitialize(engine: Engine): void;
  onActivate(context?: any): void;
  onDeactivate(context?: any): void;
}

export declare class Camera {
  pos: Vector;
}

// --- old delta events (renamed to elapsedMs in 0.30) -----------------------
export declare class PreUpdateEvent {
  engine: Engine;
  delta: number;     // old
  elapsed: number;   // new
}
export declare class PostUpdateEvent {
  engine: Engine;
  delta: number;
  elapsed: number;
}
export declare class PreDrawEvent {
  delta: number;
  elapsed: number;
}
export declare class PostDrawEvent {
  delta: number;
  elapsed: number;
}

export declare class EasingFunctions {
  static EaseInOutCubic(t: number): number;
  static Linear(t: number): number;
}

export declare class ActionContext {
  easeTo(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext; // old
  moveTo(options: any): ActionContext;                                                            // new option-bag form
  moveBy(options: any): ActionContext;
  fade(opacity: number, durationMs: number): ActionContext;
}

export declare class ParticleEmitter extends Actor {
  constructor(config?: any);
}
export declare class Particle {
  constructor(config?: any);
}

export declare class Timer {
  constructor(options: any);
  start(): void;
}

export declare class Physics {
  static acc: Vector;      // old statics (removed 0.30)
  static enabled: boolean;
}

export declare class Trigger extends Actor {
  constructor(config?: any);
}

export declare class System {
  priority: number;
}

export declare class BoundingBox {
  draw(ctx: any): void;  // old (deprecated 0.32)
  debug(ctx: any): void; // new
}

export declare class ScreenShader {
  constructor(source: string);
}

export declare class TileMap {
  constructor(options?: any);
}

export declare enum DisplayMode {
  Fixed = "Fixed",
  FitScreen = "FitScreen",
  FillScreen = "FillScreen",
  FitContainer = "FitContainer",
  FillContainer = "FillContainer",
  FitScreenAndFill = "FitScreenAndFill",
  FitScreenAndZoom = "FitScreenAndZoom",
}

export declare enum SolverStrategy {
  Arcade = "arcade",
  Realistic = "realistic",
}

export declare class Screen {
  antialiasing: boolean;
  center: Vector;
  contentArea: { left: number; top: number; topLeft: Vector };
  contentAreaOffset: Vector; // new (v1)
  worldToScreenCoordinates(point: Vector): Vector;
  screenToWorldCoordinates(point: Vector): Vector;
}

export declare class Engine {
  constructor(options?: any);
  currentScene: Scene;
  screen: Screen;
  input: { keyboard: Keyboard };
  add(entity: Entity): void;
  goto(key: string): Promise<void>;      // old (removed 0.30)
  goToScene(key: string, options?: any): Promise<void>;
  getAntialiasing(): boolean;            // old
  setAntialiasing(value: boolean): void; // old
  start(sceneKey?: string, options?: any): Promise<void>;
}

export declare class ImageSource {
  constructor(path: string);
  toSprite(): Sprite;
}
export declare class Loader {
  addResource(resource: any): void;
}
export declare class DefaultLoader extends Loader {}
export declare class ExcaliburGraphicsContext {}
export declare class SceneActivationContext<T = unknown> {}
export declare class FadeInOut {
  constructor(options?: any);
}
