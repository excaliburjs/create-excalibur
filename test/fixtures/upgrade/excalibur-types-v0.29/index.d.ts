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
  static White: Color;
  r: number;
  g: number;
  b: number;
  a: number;
  equal(color: Color): boolean;  // old → equals (1a1c8331)
  equals(color: Color): boolean; // new
  invert(): Color;               // v1: keeps alpha
  screen(color: Color): Color;   // v1: alpha as coverage
  clone(): Color;
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
  get enabled(): boolean; // UNCHANGED (only Gamepads.enabled was renamed)
  wasPressed(key: Keys): boolean;
  on(name: string, handler: (evt: any) => void): void;
  toggleEnabled(enabled: boolean): void; // old → setEnabled (de02d9ff)
  setEnabled(enabled: boolean): void;    // new
}
export declare enum Buttons {
  Face1 = 0,
  Face2 = 1,
}
export declare class Gamepad {
  connected: boolean;   // old → isConnected (de02d9ff)
  isConnected: boolean; // new
  isButtonPressed(button: Buttons, threshold?: number): boolean; // old (removed v1)
  isButtonHeld(button: Buttons, threshold?: number): boolean;    // new
  wasButtonPressed(button: Buttons, threshold?: number): boolean;
}
export declare class Gamepads {
  at(index: number): Gamepad;
  enabled: boolean;        // old → pollingEnabled (bff60431)
  pollingEnabled: boolean; // new
  toggleEnabled(enabled: boolean): void; // old → setEnabled
  setEnabled(enabled: boolean): void;    // new
}
export declare class PointerEvent {
  active: boolean;   // old → isActive (bff60431)
  isActive: boolean; // new
  cancel(): void;
}
export declare class WheelEvent {
  active: boolean;   // old → isActive (bff60431)
  isActive: boolean; // new
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
  visible?: boolean;   // old → isVisible (de02d9ff)
  isVisible?: boolean; // new
  canPause?: boolean;
}

export declare class Graphic {
  isStale(): boolean; // old → getter (de02d9ff)
}
export declare class Sprite extends Graphic {}
export declare class SpriteSheet {}
export interface FromSpriteSheetOptions {
  spriteSheet: SpriteSheet;
  frameCoordinates: Array<{ x: number; y: number; duration?: number }>;
  durationPerFrameMs?: number; // old (removed v1)
  durationPerFrame?: number;   // new
  strategy?: any;
}
export declare class Animation extends Graphic {
  get isPlaying(): boolean; // already a getter at 0.32 — never touched
  get done(): boolean;      // old → isComplete (bff60431)
  get isComplete(): boolean; // new
  static fromSpriteSheet(spriteSheet: SpriteSheet, frameIndices: number[], durationPerFrame: number): Animation;
  static fromSpriteSheetCoordinates(options: FromSpriteSheetOptions): Animation;
}

export interface GraphicsComponentOptions {
  visible?: boolean;   // old → isVisible (de02d9ff; the key survived 5963eba3 but not the getter/setter pass)
  isVisible?: boolean; // new
  opacity?: number;
}
export declare class GraphicsComponent {
  constructor(options?: GraphicsComponentOptions);
  forceOnScreen: boolean; // UNCHANGED on v1 ("on screen" stays two words — bff60431 reverted bd9d912b)
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
export declare class MotionComponent {
  integration: { onScreenOnly: boolean }; // UNCHANGED on v1
}

export declare class Entity {
  name: string;
  events: EventEmitter;
  active: boolean;   // old (removed v1)
  isActive: boolean; // new
  get isInitialized(): boolean; // already a getter at 0.32
  addChild(entity: Entity): Entity;
  kill(): void;
  isKilled(): boolean; // old → getter (de02d9ff)
}

export declare class Actor extends Entity {
  constructor(config?: ActorArgs);
  graphics: GraphicsComponent;
  body: BodyComponent;
  collider: ColliderComponent;
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
  get isOffScreen(): boolean; // old → isOffscreen (bff60431; the one "offscreen" spelling fix)
  get isOffscreen(): boolean; // new
  get draggable(): boolean;   // old (removed 64d44e2d)
  set draggable(value: boolean);
  paused: PauseComponent;         // old (0.33-alpha) → pauseComponent
  pauseComponent: PauseComponent; // new
  get isPaused(): boolean;
  canPause: boolean;
}
export interface PauseComponentInterface { canPause: boolean; } // old → PauseComponentOptions
export interface PauseComponentOptions { canPause: boolean; }   // new
export declare class PauseComponent extends Component {
  constructor(options?: Partial<PauseComponentOptions>);
  paused: boolean;        // old → isPaused (readonly)
  get isPaused(): boolean; // new
  canPause: boolean;
}

export declare class Label extends Actor {}
export declare class ScreenElement extends Actor {}
export declare class Scene {
  camera: Camera;
  engine: Engine;
  world: World;
  physics: PhysicsWorld;
  input: { keyboard: Keyboard; gamepads: Gamepads };
  add(entity: Entity): void;
  onInitialize(engine: Engine): void;
  onActivate(context?: any): void;
  onDeactivate(context?: any): void;
  onTransition(direction: "in" | "out"): Transition | undefined; // v1: Transition | void (31789253)
  isCurrentScene(): boolean; // old → getter (de02d9ff)
}
export declare class Transition extends Entity {
  get complete(): boolean;   // old → isComplete (de02d9ff)
  get isComplete(): boolean; // new
  started: boolean;    // old → hasStarted (bff60431)
  hasStarted: boolean; // new
  done: Promise<void>;       // unchanged (a Promise, never renamed)
}

// physics config reaches user code through a mapped type exactly like core's DeepRequired
export type DeepRequired<T> = { [K in keyof T]-?: T[K] extends object ? DeepRequired<T[K]> : T[K] };
export interface PhysicsConfig {
  enabled?: boolean;
  integration?: { onScreenOnly?: boolean }; // UNCHANGED on v1 (the mapped-type path is still exercised by the fixtures)
}
export declare class PhysicsWorld {
  config: DeepRequired<PhysicsConfig>;
}

export declare class Camera {
  pos: Vector;
  hasChanged(): boolean; // old → getter (de02d9ff)
  get isInitialized(): boolean; // already a getter at 0.32
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

export interface ActionContextMethods {
  easeTo(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext; // old
  easeBy(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext; // old
  moveTo(options: any): ActionContext;                                                            // new option-bag form
  moveBy(options: any): ActionContext;
  rotateBy(options: { angleRadiansOffset: number; duration: number; rotationType?: any }): ActionContext;
  rotateBy(angleRadiansOffset: number, speed: number, rotationType?: any): ActionContext;
  fade(opacity: number, durationMs: number): ActionContext;
}
export declare class ActionContext implements ActionContextMethods {
  easeTo(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext;
  easeBy(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext;
  moveTo(options: any): ActionContext;
  moveBy(options: any): ActionContext;
  rotateBy(options: { angleRadiansOffset: number; duration: number; rotationType?: any }): ActionContext;
  rotateBy(angleRadiansOffset: number, speed: number, rotationType?: any): ActionContext;
  fade(opacity: number, durationMs: number): ActionContext;
}
// `actor.actions` is NOT an ActionContext in 0.29–0.32 (`extends Component implements ActionContextMethods`) —
// the ease-actions-to-moveto receiver set has to name it explicitly (missed on 4 calibration repos).
export declare class ActionsComponent extends Component implements ActionContextMethods {
  easeTo(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext;
  easeBy(x: number, y: number, durationMs: number, easing?: (t: number) => number): ActionContext;
  moveTo(options: any): ActionContext;
  moveBy(options: any): ActionContext;
  rotateBy(options: { angleRadiansOffset: number; duration: number; rotationType?: any }): ActionContext;
  rotateBy(angleRadiansOffset: number, speed: number, rotationType?: any): ActionContext;
  fade(opacity: number, durationMs: number): ActionContext;
}
export declare class ActionQueue {
  hasNext(): boolean;    // old → getter (de02d9ff)
  isComplete(): boolean; // old → getter
}
export interface Action {
  isComplete(entity: Entity): boolean; // keeps its parameter — NOT a getter
}

export declare class ParticleEmitter extends Actor {
  constructor(config?: any);
}
export declare class Particle extends Entity {
  static DefaultConfig: ParticleConfig; // removed v1 (1a1c8331)
  constructor(config?: any);
  visible: boolean;        // old → isVisible (de02d9ff)
  isVisible: boolean;      // new
  paused: PauseComponent;  // old → pauseComponent
  pauseComponent: PauseComponent;
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
  get complete(): boolean;   // old → isComplete (de02d9ff)
  get isComplete(): boolean; // new
  get isRunning(): boolean;  // already a getter at 0.32 — never touched
}

export declare class Physics {
  static acc: Vector;      // old statics (removed 0.30)
  static enabled: boolean;
}

export interface TriggerOptions {
  pos?: Vector;
  visible?: boolean;   // old → isVisible (de02d9ff)
  isVisible?: boolean; // new
}
export declare class Trigger extends Actor {
  constructor(config?: TriggerOptions);
}

// --- ECS System hooks: pre-v1 names (renamed on*/ in v1, core 694877b3) ------
export declare enum SystemType {
  Update = "update",
  Draw = "draw",
}
export declare class System {
  static priority: number;
  systemType: SystemType;
  priority: number;
  initialize?(world: World, scene: Scene): void; // old → onInitialize
  update(elapsed: number): void;                 // old → onUpdate
  preupdate?(scene: Scene, elapsed: number): void;  // old → onPreUpdate
  postupdate?(scene: Scene, elapsed: number): void; // old → onPostUpdate
}
export declare class GraphicsSystem extends System {}

export declare class BoundingBox {
  draw(ctx: any): void;  // old (deprecated 0.32)
  debug(ctx: any): void; // new
  hasZeroDimensions(): boolean; // old → getter (de02d9ff)
}
export declare class PolygonCollider extends Collider {
  isConvex(): boolean;   // old → checkConvex() (de02d9ff; stays a method — the CHANGELOG lists it under getters, wrongly)
  checkConvex(): boolean; // new
}
export declare class CollisionContact {
  isCanceled(): boolean; // old → getter
}
export declare class Matrix { isIdentity(): boolean; }       // old → getter
export declare class AffineMatrix { isIdentity(): boolean; } // old → getter
export declare class Transform { isMirrored(): boolean; }    // old → getter
export declare class Future<T> {
  get isCompleted(): boolean; // old → isComplete (bd9d912b)
  get isComplete(): boolean;  // new
  promise: Promise<T>;
}
export declare class GarbageCollector { running(): boolean; } // old → isRunning getter (de02d9ff)
export declare class SystemManager {
  initialized: boolean;   // old → isInitialized (de02d9ff)
  isInitialized: boolean; // new
}
export interface CoroutineInstance extends PromiseLike<void> {
  isRunning(): boolean;  // old → getter (de02d9ff)
  isComplete(): boolean; // old → getter
  done: Promise<void>;
}
export declare function coroutine(fn: () => Generator<any, void, number>): CoroutineInstance;
export declare class WebAudio { static isUnlocked(): boolean; }     // old → static getter
export declare class Serializer { static isInitialized(): boolean; } // old → static getter
export declare class FontTextInstance {
  disposed: boolean;   // old → isDisposed (de02d9ff)
  isDisposed: boolean; // new
}

export declare class ScreenShader { // removed v1 (1a1c8331)
  constructor(source: string);
}

export interface TileOptions {
  x: number;
  y: number;
  map: TileMap;
  solid?: boolean;   // old → isSolid (de02d9ff)
  isSolid?: boolean; // new
}
export declare class Tile {
  constructor(options: TileOptions);
  get solid(): boolean;   // old → isSolid (de02d9ff)
  set solid(value: boolean);
  get isSolid(): boolean; // new
  set isSolid(value: boolean);
}
export declare class TileMap {
  constructor(options?: any);
  center: Vector; // survives (only BodyComponent.center was renamed)
  tiles: Tile[];
  getTile(x: number, y: number): Tile;
  getOnScreenTiles(): readonly Tile[]; // UNCHANGED on v1
}
export declare class IsometricTile extends Entity {
  solid: boolean;   // old → isSolid (de02d9ff)
  isSolid: boolean; // new
}
export declare class IsometricMap {
  constructor(options?: any);
  visible: boolean;   // old (removed v1)
  isVisible: boolean; // new
  tiles: IsometricTile[];
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
  get isHiDpi(): boolean; // old → isHiDPI (bd9d912b)
  get isHiDPI(): boolean; // new
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

export interface EngineOptions {
  physics?: boolean | PhysicsConfig;
  [key: string]: any; // every other key the fixtures use (displayMode, scenes, ...)
}
export declare class Engine {
  constructor(options?: EngineOptions);
  currentScene: Scene;
  screen: Screen;
  director: Director;
  graphicsContext: ExcaliburGraphicsContext;
  isFullscreen: boolean; // already the v1 casing at 0.32 — never renamed
  currentFrameElapsedMs: number; // old → currentFrameElapsed (6f19e7d2)
  currentFrameElapsed: number;   // new
  currentFrameLagMs: number;     // old → currentFrameLag
  currentFrameLag: number;       // new
  stats: { currFrame: FrameStats; prevFrame: FrameStats };
  clock: Clock;
  input: { keyboard: Keyboard; gamepads: Gamepads };
  debug: { collider: { z: { solid: number; dashed: number } } }; // DebugConfig's `solid` z-index key SURVIVES v1
  isRunning(): boolean;  // old → getter (de02d9ff)
  isDisposed(): boolean; // old → getter
  toggleInputEnabled(enabled: boolean): void; // old → setInputEnabled (bff60431)
  setInputEnabled(enabled: boolean): void;    // new
  get loadingComplete(): boolean; // old → isLoaded (de02d9ff)
  get isLoaded(): boolean;        // new
  get ready(): boolean;           // old boolean → isReady; on v1 `ready` is the Promise
  isReady(): Promise<void>;       // old Promise method → `ready` getter
  get isHiDpi(): boolean; // old → isHiDPI (bd9d912b)
  get isHiDPI(): boolean; // new
  add(entity: Entity): void;
  goto(key: string): Promise<void>;      // old (removed 0.30)
  goToScene(key: string, options?: any): Promise<void>;
  getAntialiasing(): boolean;            // old
  setAntialiasing(value: boolean): void; // old
  start(sceneKey?: string, options?: any): Promise<void>;
}

export interface Loadable<T> {
  data: T;
  load(): Promise<T>;
  isLoaded(): boolean; // old → `readonly isLoaded: boolean` (de02d9ff)
}
export declare class ImageSource implements Loadable<HTMLImageElement> {
  constructor(path: string);
  data: HTMLImageElement;
  load(): Promise<HTMLImageElement>;
  toSprite(): Sprite;
  isLoaded(): boolean; // old → getter
  ready: Promise<HTMLImageElement>; // a Promise on ImageSource — NOT the Engine.ready rename
}
export declare class Loader {
  addResource(resource: any): void;
  isLoaded(): boolean; // old → getter
}
export declare class DefaultLoader extends Loader {}
export declare class ExcaliburGraphicsContext {
  get(rendererName: string): any; // v1: RendererPlugin | null
  createMaterial(options: MaterialOptions): Material;
}
export declare class Director {
  getSceneDefinition(key: string): any;  // v1: | null
  getSceneInstance(key: string): any;    // v1: | null
  currentTransition: Transition | undefined; // v1: | null
}
export declare class SceneActivationContext<T = unknown> {}
export declare class FadeInOut {
  constructor(options?: any);
}

// ===========================================================================
// v1 coverage review (2026-11): surfaces the second migration pass needs, in
// BOTH generations where v1 renamed rather than removed.
// ===========================================================================

// --- shaders / materials / post processors ---------------------------------
export interface RendererPlugin {
  hasPendingDraws(): boolean; // old → readonly property (de02d9ff)
  flush(): void;
}
export declare class Shader {
  use(): void;
  isCurrentlyBound(): boolean; // old → getter
  trySetUniformFloat(name: string, value: number): boolean;
  trySetUniformInt(name: string, value: number): boolean;
  trySetUniformBoolean(name: string, value: boolean): boolean;
  trySetUniformFloatVector(name: string, value: Vector): boolean;
  trySetUniformFloatColor(name: string, value: Color): boolean;
  trySetUniformMatrix(name: string, value: any): boolean;
  trySetUniformFloatArray(name: string, value: number[]): boolean;
  setUniform(kind: string, name: string, value: any): void;
  addImageSource(name: string, image: ImageSource): void;
}
export interface MaterialContext { // new (v1)
  uniforms: Record<string, any>;
  shaders: Shader[];
  shadersByName: Map<string, Shader>;
}
export interface MaterialOptions {
  name?: string;
  fragmentSource?: string;
  passes?: any[]; // new (v1)
  vertexSource?: string;
  color?: Color;
  uniforms?: Record<string, any>;
}
export declare class Material {
  constructor(options: MaterialOptions);
  uniforms: Record<string, any>;
  update(callback: (shader: Shader) => any): void; // old; v1 passes a MaterialContext
}
export interface PostProcessor {
  initialize(gl: any): void;
  getShader(): Shader;  // old (deprecated v1)
  getLayout(): any;     // old (deprecated v1)
  onUpdate?(elapsed: number): void;
}
export declare class ColorBlindnessPostProcessor implements PostProcessor {
  constructor(mode?: any, simulate?: boolean);
  initialize(gl: any): void;
  getShader(): Shader; // removed v1
  getLayout(): any;    // removed v1
}

// --- audio (core 7206a977) ---------------------------------------------------
export interface PlayOptions {
  volume?: number;
  scheduledStartTime?: number; // milliseconds in BOTH generations
  position?: number; // seconds → milliseconds (6f19e7d2)
  duration?: number; // seconds → milliseconds
  loop?: boolean;
}
export interface SoundOptions {
  paths: string[];
  volume?: number;
  position?: number; // seconds → milliseconds (6f19e7d2)
  duration?: number; // seconds → milliseconds
}
export interface Audio { // old (removed v1)
  volume: number;
  loop: boolean;
  play(): Promise<any>;
  pause(): void;
  stop(): void;
  isPlaying(): boolean; // old → getter on SoundTrack
}
export interface AudioImplementation { responseType: string; } // old (removed v1)
export declare class WebAudioInstance implements Audio { // old → SoundTrack
  constructor(src: AudioBuffer);
  volume: number;
  loop: boolean;
  play(): Promise<any>;
  pause(): void;
  stop(): void;
}
export declare class SoundTrack { // new (v1)
  volume: number;
  done: Promise<boolean>;
  isPlaying(): boolean; // old (0.33-alpha) → getter (de02d9ff)
  isPaused(): boolean;
  isStopped(): boolean;
  duration: number;           // seconds → milliseconds (6f19e7d2)
  scheduledStartTime: number; // seconds → milliseconds
  seek(position: number): void;
  getTotalPlaybackDuration(): number;
  getPlaybackPosition(): number;
}
export declare class ExResponse { // old (removed v1)
  static type: { any: ""; blob: "blob"; json: "json"; text: "text"; document: "document"; arraybuffer: "arraybuffer" };
}
export type ExResponseType = "" | "arraybuffer" | "blob" | "document" | "json" | "text"; // old (removed v1)
export interface ExResponseTypesLookup { [name: string]: ExResponseType } // old (removed v1)
export declare class Resource<T> implements Loadable<T> {
  constructor(path: string, responseType: ExResponseType, bustCache?: boolean);
  data: T;
  load(): Promise<T>;
  isLoaded(): boolean; // old → getter
}
export declare class Sound implements Loadable<AudioBuffer> {
  constructor(options: SoundOptions);
  constructor(...paths: string[]);
  data: AudioBuffer;
  load(): Promise<AudioBuffer>;
  isLoaded(): boolean;  // old → getter (de02d9ff)
  isPlaying(): boolean; // old → getter
  isPaused(): boolean;  // old → getter
  isStopped(): boolean; // old → getter
  volume: number;
  loop: boolean;
  scheduledStartTime: number; // old (removed v1)
  instances: Audio[];
  duration: number | undefined; // seconds → milliseconds (6f19e7d2)
  position: number | undefined; // seconds → milliseconds
  play(volumeOrConfig?: number | PlayOptions): Promise<boolean>;
  start(options?: PlayOptions): SoundTrack | null;
  resume(): Promise<boolean>; // new (v1)
  pause(): void;
  stop(): void;
  seek(position: number, trackId?: number): void;
  getTotalPlaybackDuration(): number; // seconds → milliseconds
  getPlaybackPosition(trackId?: number): number; // seconds → milliseconds
}
export interface SoundConfig<C extends string = string> {
  sound: Sound;
  volume?: number;
  channels?: C[]; // old
  channel?: C;    // new
  name?: string;  // new
}
export interface SoundManagerOptions<C extends string = string, S extends string = string> {
  channels?: C[];
  sounds?: Record<S, Sound | SoundConfig<C>> | Array<Sound | SoundConfig<C>>;
  volume?: number;
}
export interface SoundManagerApi<S extends string = string> {
  play(name: S, volume?: number): Promise<void>;
}
export declare class ChannelCollection<C extends string = string> {
  constructor(options: any, manager: SoundManager<any, any>); // old; v1 takes (manager)
  play(name: string, volume?: number | PlayOptions): Promise<any>;
  mute(name?: string): void;
  unmute(name?: string): void;
  toggle(name?: string): void;
}
export declare class SoundManager<C extends string = string, S extends string = string> implements SoundManagerApi<S> {
  constructor(options: SoundManagerOptions<C, S>);
  channel: ChannelCollection<C>;
  defaultVolume: number; // old → volume
  volume: number;        // new
  _muted: boolean;                                // old (removed v1)
  _isMuted(sound: Sound): boolean;                // old → isMuted
  _getEffectiveVolume(sound: Sound): number;      // old (removed v1)
  _activeTrackCount(): number;                    // old (removed v1)
  isMuted(sound?: Sound | S): boolean;            // new
  play(name: S, volume?: number | PlayOptions): Promise<any>;
  getSound(name: S): Sound | undefined;           // v1: Sound | null
  addChannel(name: S, channels: C[]): void;       // old (removed v1)
  removeChannel(name: S, channels: C[]): void;    // old (removed v1)
  setChannel(name: S, channel: C | null): void;   // new
  track(name: S, soundOrConfig: Sound | SoundConfig<C>): void;
  mute(name?: S): void;
  unmute(name?: S): void;
  toggle(name?: S): void;
}

// --- deprecations added on v1 (old name survives as an alias) ---------------
export declare class ArenaPool<T> {
  constructor(builder: () => T, recycler?: (t: T) => T, max?: number);
  get(): T;
}
/** @deprecated use ArenaPool */
export declare class Pool<T> extends ArenaPool<T> {}
export declare class Collider {}
export declare class Shape { // old → Colliders
  static Box(width: number, height: number): Collider;
  static Circle(radius: number): Collider;
  static Polygon(points: Vector[]): Collider;
  static Edge(begin: Vector, end: Vector): Collider;
  static Capsule(width: number, height: number): Collider;
}
export declare class Colliders {
  static Box(width: number, height: number): Collider;
  static Circle(radius: number): Collider;
  static Polygon(points: Vector[]): Collider;
  static Edge(begin: Vector, end: Vector): Collider;
  static Capsule(width: number, height: number): Collider;
}
export declare class ColliderComponent {
  set(collider: Collider): Collider; // old (deprecated v1)
  use(collider: Collider): Collider; // new
  get(): Collider | undefined;       // v1: Collider | null
}
export type ActorOptions = ActorArgs; // new name (ActorArgs is the deprecated alias on v1)
export interface ParticleEmitterArgs { emitRate?: number; }    // old
export interface ParticleEmitterOptions { emitRate?: number; } // new
export declare class Component { owner: Entity | undefined; } // v1: Entity | null

// --- casing fixes without an alias (core 8b9be850 + Screen rename) ----------
export declare enum Direction { ltr = "ltr", rtl = "rtl" }     // old → TextDirection
export declare enum TextDirection { ltr = "ltr", rtl = "rtl" } // new
export declare class EnterViewPortEvent {} // old
export declare class ExitViewPortEvent {}  // old
export declare class EnterViewportEvent {} // new
export declare class ExitViewportEvent {}  // new
export declare class FullScreenChangeEvent {} // old
export declare class FullscreenChangeEvent {} // new
export declare const ActorEvents: {
  EnterViewPort: "enterviewport"; // old
  ExitViewPort: "exitviewport";   // old
  EnterViewport: "enterviewport"; // new
  ExitViewport: "exitviewport";   // new
  Kill: "kill";
};
export declare const ScreenEvents: {
  FullScreenChange: "fullscreen"; // old
  FullscreenChange: "fullscreen"; // new
  Resize: "resize";
};
export declare function obsolete(options?: { message?: string; alternateMethod?: string }): any; // old (removed v1)

// --- graph edges (bff60431: the `directed` edge option → `isDirected`) -----
export interface EdgeOptionsWithWeight { weight: number; directed?: boolean; isDirected?: boolean; }
export interface EdgeOptionsWeightless { directed?: boolean; isDirected?: boolean; }
export declare class GraphNode<T> { id: number; }
export declare class Graph<T> {
  addNode(data: T): GraphNode<T>;
  addEdge(from: GraphNode<T>, to: GraphNode<T>, options?: EdgeOptionsWithWeight | EdgeOptionsWeightless): any[];
}

// ===========================================================================
// API consistency pass (core b930f2b7 / 6f19e7d2 / 1a1c8331, 2026-11-07)
// ===========================================================================

// --- time units: the Ms suffix is gone, milliseconds are implicit ----------
export interface FrameStatistics {
  id: number;
  elapsedMs: number; // old → elapsed (6f19e7d2)
  elapsed: number;   // new
  fps: number;
}
export declare class FrameStats implements FrameStatistics {
  id: number;
  elapsedMs: number; // old → elapsed
  elapsed: number;   // new
  fps: number;
}
export interface GifFrame {
  delayTime: number;
  delayMs: number; // old → delay (6f19e7d2)
  delay: number;   // new
}
export interface ClockOptions {
  tick: (elapsed: number) => any;
  maxFps?: number;
}
export interface TestClockOptions { // TestClock's ctor takes ClockOptions & TestClockOptions (v1 shape)
  defaultUpdateMs?: number; // old → defaultUpdate (6f19e7d2; the CHANGELOG says ClockOptions, wrongly)
  defaultUpdate?: number;   // new
}
export declare class Clock {
  constructor(options: ClockOptions);
  isRunning(): boolean; // old → getter (de02d9ff)
  elapsed(): number;
}
export declare class TestClock extends Clock {
  constructor(options: ClockOptions & TestClockOptions);
  step(overrideUpdate?: number): void;
}

// --- transitions: Slide had its own easing key ------------------------------
export interface TransitionOptions {
  duration: number;
  easing?: Easing;
  direction?: "in" | "out";
}
export interface SlideOptions {
  duration: number;
  slideDirection: "up" | "down" | "left" | "right";
  easingFunction?: Easing; // old → easing (1a1c8331; `easing` from TransitionOptions was silently ignored)
}
export declare class Slide extends Transition {
  constructor(options: TransitionOptions & SlideOptions);
}

// --- events: the EventTypes enum and lowercase type aliases (removed 1a1c8331)
export declare enum EventTypes {
  Kill = "kill",
  PreKill = "prekill",
  PostKill = "postkill",
  PreDraw = "predraw",
  PostDraw = "postdraw",
  PreUpdate = "preupdate",
  PostUpdate = "postupdate",
  PreFrame = "preframe",
  PostFrame = "postframe",
  PreCollision = "precollision",
  CollisionStart = "collisionstart",
  CollisionEnd = "collisionend",
  PostCollision = "postcollision",
  Initialize = "initialize",
  Activate = "activate",
  Deactivate = "deactivate",
  ExitTrigger = "exit",
  EnterTrigger = "enter",
  PointerUp = "pointerup",
  PointerDown = "pointerdown",
  PointerMove = "pointermove",
  Up = "up",
  Down = "down",
  Press = "press",
  Release = "release",
  Hold = "hold",
  Add = "add",
  Remove = "remove",
}
export type kill = "kill";
export type prekill = "prekill";
export type postkill = "postkill";
export type preupdate = "preupdate";
export type postupdate = "postupdate";
export type initialize = "initialize";
export type exittrigger = "exit";
export type entertrigger = "enter";
export type pointerup = "pointerup";
export type pointerdown = "pointerdown";
export type pointermove = "pointermove";
export type up = "up";
export type down = "down";
export type press = "press";
export type add = "add";
export type remove = "remove";
export type subscribe = "subscribe";

// --- the last legacy removals (1a1c8331 "remove deprecated apis") ----------
export declare class TagsComponent extends Component { tags: Set<string>; }
export interface Message<T> { type: string; data: T; }
export interface EntityComponent { component: Component; entity: Entity; }
export declare class AddedComponent implements Message<EntityComponent> { type: "Component Added"; data: EntityComponent; }
export declare class RemovedComponent implements Message<EntityComponent> { type: "Component Removed"; data: EntityComponent; }
export declare function isAddedComponent(x: Message<EntityComponent>): x is AddedComponent;
export declare function isRemovedComponent(x: Message<EntityComponent>): x is RemovedComponent;
export interface CapturePointerConfig { captureMoveEvents: boolean; captureDragEvents: boolean; }
export declare class GifParser { frames: GifFrame[]; }
export declare class Stream { data: Uint8Array; }
export interface LegacyWebAudioSource { playbackState: string; }
export declare class Flags {
  static useCanvasGraphicsContext(): void;
  static useLegacyImageRenderer(): void; // removed v1
  static enable(flag: string): void;
}
export declare class ExcaliburGraphicsContextWebGL extends ExcaliburGraphicsContext {
  imageRenderer: "ex.image" | "ex.image-v2"; // removed v1
}
export declare namespace Util {
  function addItemToArray<T>(item: T, array: T[]): boolean;    // removed v1
  function removeItemFromArray<T>(item: T, array: T[]): boolean; // stays
}
export interface ParticleConfig { life?: number; fade?: boolean; }
