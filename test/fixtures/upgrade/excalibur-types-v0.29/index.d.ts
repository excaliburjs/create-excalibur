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
export declare enum Buttons {
  Face1 = 0,
  Face2 = 1,
}
export declare class Gamepad {
  isButtonPressed(button: Buttons, threshold?: number): boolean; // old (removed v1)
  isButtonHeld(button: Buttons, threshold?: number): boolean;    // new
  wasButtonPressed(button: Buttons, threshold?: number): boolean;
}
export declare class Gamepads {
  at(index: number): Gamepad;
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
export declare class SpriteSheet {}
export interface FromSpriteSheetOptions {
  spriteSheet: SpriteSheet;
  frameCoordinates: Array<{ x: number; y: number; duration?: number }>;
  durationPerFrameMs?: number; // old (removed v1)
  durationPerFrame?: number;   // new
  strategy?: any;
}
export declare class Animation extends Graphic {
  static fromSpriteSheet(spriteSheet: SpriteSheet, frameIndices: number[], durationPerFrame: number): Animation;
  static fromSpriteSheetCoordinates(options: FromSpriteSheetOptions): Animation;
}

export interface GraphicsComponentOptions {
  visible?: boolean; // still a valid OPTION key in v1 (only the accessor was renamed)
  opacity?: number;
}
export declare class GraphicsComponent {
  constructor(options?: GraphicsComponentOptions);
  show(graphic: any, options?: any): any; // old
  use(graphic: any, options?: any): any;  // new
  add(graphic: any): any;
  get visible(): boolean;                 // old (removed v1)
  set visible(value: boolean);
  isVisible: boolean;                     // new
}

export declare class BodyComponent {
  get active(): boolean;   // old (removed v1)
  get isActive(): boolean; // new
  sleeping: boolean;       // old (removed v1)
  isSleeping: boolean;     // new
  setSleeping(sleeping: boolean): void; // old (removed v1) -> `isSleeping = x`
  center: Vector;          // old (removed v1)
  globalPos: Vector;       // new
  vel: Vector;
}

export declare class TransformComponent {
  pos: Vector;
}

export declare class Entity {
  name: string;
  events: EventEmitter;
  active: boolean;   // old (removed v1)
  isActive: boolean; // new
  addChild(entity: Entity): Entity;
  kill(): void;
}

export declare class Actor extends Entity {
  constructor(config?: ActorArgs);
  graphics: GraphicsComponent;
  body: BodyComponent;
  actions: ActionContext;
  pos: Vector;
  vel: Vector;
  center: Vector; // NOT renamed on Actor (only BodyComponent.center -> globalPos)
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
  world: World;
  add(entity: Entity): void;
  onInitialize(engine: Engine): void;
  onActivate(context?: any): void;
  onDeactivate(context?: any): void;
}

export declare class Camera {
  pos: Vector;
  move(pos: Vector, duration: number, easing?: Easing): Promise<Vector>;
  zoomOverTime(scale: number, duration?: number, easing?: Easing): Promise<boolean>;
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
  static Linear(t: number): number;
  static EaseInQuad(t: number): number;
  static EaseOutQuad(t: number): number;
  static EaseInOutQuad(t: number): number;
  static EaseInCubic(t: number): number;
  static EaseOutCubic(t: number): number;
  static EaseInOutCubic(t: number): number;
  static CreateReversibleEasingFunction(easing: (t: number) => number): (t: number) => number;
  static CreateVectorEasingFunction(easing: (t: number) => number): (t: number) => number;
}
// new flat easings (0.32+; the only surviving forms in v1)
export declare const linear: (t: number) => number;
export declare const easeInQuad: (t: number) => number;
export declare const easeOutQuad: (t: number) => number;
export declare const easeInOutQuad: (t: number) => number;
export declare const easeInCubic: (t: number) => number;
export declare const easeOutCubic: (t: number) => number;
export declare const easeInOutCubic: (t: number) => number;
export type Easing = (t: number) => number;                       // new
export type EasingFunction = (currentTime: number, startValue: number, endValue: number, duration: number) => number; // old (removed v1)
export declare function isLegacyEasing(fn: any): fn is EasingFunction; // old (removed v1)
export declare class EaseTo {           // old (un-exported v1)
  constructor(entity: Entity, x: number, y: number, duration: number, easing: EasingFunction);
}
export declare class EaseBy {           // old (un-exported v1)
  constructor(entity: Entity, x: number, y: number, duration: number, easing: EasingFunction);
}
export declare class MoveToWithOptions { // new
  constructor(entity: Entity, options: any);
}
export declare class MoveByWithOptions { // new
  constructor(entity: Entity, options: any);
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

export interface TimerOptions {
  fcn?: () => void;    // old (removed v1)
  action?: () => void; // new
  interval: number;
  repeats?: boolean;
}
export declare class Timer {
  constructor(options: TimerOptions);
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
  center: Vector; // survives (only BodyComponent.center was renamed)
}
export declare class IsometricMap {
  constructor(options?: any);
  visible: boolean;   // old (removed v1)
  isVisible: boolean; // new
}

// --- ECS world/queries (queryTags + TagQuery removed in v1) ----------------
export declare class Query<T = any> {
  getEntities(): Entity[];
}
export declare class TagQuery extends Query { // old (removed v1)
  constructor(tags: string[]);
}
export declare class World {
  queryTags(tags: string[]): TagQuery;                                        // old (removed v1)
  query(options: { tags?: { all?: string[]; any?: string[]; not?: string[] } }): Query; // new object form
  query(components: any[]): Query;                                            // component-constructor overload
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
  isFullScreen: boolean;                 // old (removed v1)
  goFullScreen(): Promise<void>;         // old
  exitFullScreen(): Promise<void>;       // old
  isFullscreen: boolean;                 // new
  enterFullscreen(): Promise<void>;      // new
  exitFullscreen(): Promise<void>;       // new
  contentArea: { left: number; top: number; topLeft: Vector };
  contentAreaOffset: Vector; // new (v1)
  worldToScreenCoordinates(point: Vector): Vector;
  screenToWorldCoordinates(point: Vector): Vector;
}

export declare class Engine {
  constructor(options?: any);
  currentScene: Scene;
  screen: Screen;
  isFullscreen: boolean; // already the v1 casing at 0.32 — never renamed
  input: { keyboard: Keyboard; gamepads: Gamepads };
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
