// Minimal excalibur type surface for ex doctor tests. Covers exactly what the
// vite-project fixture's src files import plus what the doctor rules classify
// (Actor/Entity derivation, Scene/Engine add receivers). Not the real API.

export declare class Vector {
  x: number;
  y: number;
  constructor(x: number, y: number);
  clone(): Vector;
  add(v: Vector): Vector;
}
export declare function vec(x: number, y: number): Vector;

export declare class Subscription {
  close(): void;
}

export declare class EventEmitter<T = any> {
  on(name: string, handler: (evt: T) => void): Subscription;
  once(name: string, handler: (evt: T) => void): Subscription;
  off(name: string, handler?: (evt: T) => void): void;
}

export declare class Keyboard extends EventEmitter {}
export declare class PointerEvents extends EventEmitter {}

export declare class EngineInput {
  keyboard: Keyboard;
  pointers: PointerEvents;
}

export declare class SceneInput {
  keyboard: Keyboard;
  pointers: PointerEvents;
  toggleEnabled(enabled: boolean): void;
}

export declare class Screen {
  events: EventEmitter;
  center: Vector;
}

export declare class Camera {
  pos: Vector;
  zoom: number;
}

export declare class Random {
  constructor(seed?: number);
  pickOne<T>(items: T[]): T;
  integer(min: number, max: number): number;
}

export declare class Animation {
  strategy: any;
  frames: { graphic: any }[];
  reset(): void;
  clone(): Animation;
}

export declare class Color {
  static ExcaliburBlue: Color;
  static Red: Color;
}

export interface ActorArgs {
  name?: string;
  pos?: Vector;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  z?: number;
  color?: Color;
}

// Member kinds mirror real excalibur 0.32: isActive is a plain instance
// field; isInitialized/isAdded/scene are accessors. The shadow rule treats
// the two kinds differently.
export declare class Entity {
  name: string;
  isActive: boolean;
  events: EventEmitter;
  get isInitialized(): boolean;
  get isAdded(): boolean;
  get scene(): Scene | null;
  addChild(entity: Entity): Entity;
  addTag(tag: string): Entity;
  removeTag(tag: string): Entity;
  hasTag(tag: string): boolean;
  kill(): void;
}

export declare class Collider {}
export declare class CollisionContact {}
export declare enum Side {
  None = "None",
  Top = "Top",
  Bottom = "Bottom",
  Left = "Left",
  Right = "Right",
}

export declare class Actor extends Entity {
  constructor(config?: ActorArgs);
  graphics: any;
  actions: ActionContext;
  onInitialize(engine: Engine): void;
  onPreUpdate(engine: Engine, elapsedMs: number): void;
  onPostUpdate(engine: Engine, elapsedMs: number): void;
  onCollisionStart(self: Collider, other: Collider, side: Side, contact: CollisionContact): void;
}

export declare class Label extends Actor {
  constructor(config?: ActorArgs & { text?: string; font?: Font; maxWidth?: number });
  text: string;
}

export declare class ScreenElement extends Actor {}

// v1 shader surface: Material takes `fragmentSource` xor `passes`; ShaderPass /
// ShaderPipeline / ShaderPipelinePostProcessor are the multipass primitives;
// `glsl` is the tagged template that injects the #version/precision preamble.
export type ShaderPassLike = string | ShaderPass;
export interface MaterialOptions {
  name?: string;
  color?: Color;
  fragmentSource?: string;
  vertexSource?: string;
  passes?: ShaderPassLike[] | { process(source: any, destination: any): void };
  padding?: number;
  uniforms?: Record<string, any>;
  images?: Record<string, ImageSource>;
  graphicsContext?: ExcaliburGraphicsContext;
}

export declare class Material {
  constructor(options: MaterialOptions);
  update(callback: (shader: any) => void): void;
}

export declare class ScreenShader {
  constructor(context: ExcaliburGraphicsContext, fragmentSource: string);
}

export interface ShaderPassOptions {
  graphicsContext?: ExcaliburGraphicsContext;
  name?: string;
  fragmentSource?: string;
  uniforms?: Record<string, any>;
}
export declare class ShaderPass {
  constructor(options: ShaderPassOptions);
}
export declare class ShaderPipeline {
  constructor(options: { graphicsContext?: ExcaliburGraphicsContext; passes: ShaderPassLike[] });
}
export declare class ShaderPipelinePostProcessor {
  constructor(options: { name?: string; passes: ShaderPassLike[] });
}
export declare function glsl(strings: TemplateStringsArray, ...values: unknown[]): string;

export interface ExcaliburGraphicsContext {
  createMaterial(options: MaterialOptions): Material;
}

// v1 ECS System: hooks carry the `on` prefix (the pre-v1 names are dead code).
export declare class World {}
export declare class System {
  static priority: number;
  systemType: string;
  onInitialize?(world: World, scene: Scene): void;
  onUpdate(elapsed: number): void;
  onPreUpdate?(scene: Scene, elapsed: number): void;
  onPostUpdate?(scene: Scene, elapsed: number): void;
  dispose?(world: World, scene: Scene): void;
}

export declare class SceneActivationContext<TData = undefined> {
  data?: TData;
}

export declare class DefaultLoader {
  addResource(resource: any): void;
}
export declare class Loader extends DefaultLoader {}

export declare class Scene {
  camera: Camera;
  input: SceneInput;
  events: EventEmitter;
  engine: Engine;
  add(entity: Entity): void;
  clear(deferred?: boolean): void;
  onInitialize(engine: Engine): void;
  onPreLoad(loader: DefaultLoader): void;
  onActivate(context: SceneActivationContext<unknown>): void;
  onDeactivate(context: SceneActivationContext): void;
  onPreUpdate(engine: Engine, elapsedMs: number): void;
  onPostUpdate(engine: Engine, elapsedMs: number): void;
  onPreDraw(ctx: ExcaliburGraphicsContext, elapsedMs: number): void;
  onPostDraw(ctx: ExcaliburGraphicsContext, elapsedMs: number): void;
}

export declare enum DisplayMode {
  Fixed = "Fixed",
  FitScreen = "FitScreen",
  FitScreenAndFill = "FitScreenAndFill",
  FillScreen = "FillScreen",
}

export declare class Engine {
  constructor(options?: any);
  currentScene: Scene;
  events: EventEmitter;
  input: EngineInput;
  screen: Screen;
  graphicsContext: ExcaliburGraphicsContext;
  add(entity: Entity): void;
  addScene(key: string, scene: any): void;
  goToScene(key: string, options?: any): Promise<void>;
  start(sceneKey?: string, options?: any): Promise<void>;
}

export declare class Transition extends Entity {}
export declare class FadeInOut extends Transition {
  constructor(options?: { duration?: number; direction?: string; color?: Color });
}

export declare class GameEvent<T = unknown> {
  target: T;
}

// v1 Loadable: `isLoaded` is a readonly PROPERTY (the loader reads it; a leftover method is always truthy).
export interface Loadable<T> {
  data: T;
  load(): Promise<T>;
  readonly isLoaded: boolean;
}
export declare class Resource<T> implements Loadable<T> {
  constructor(path: string, responseType: string);
  data: T;
  load(): Promise<T>;
  get isLoaded(): boolean;
}
export declare class ImageSource implements Loadable<HTMLImageElement> {
  constructor(path: string);
  data: HTMLImageElement;
  load(): Promise<HTMLImageElement>;
  get isLoaded(): boolean;
  toSprite(): any;
}

// Surfaces for unmatched-options (moveBy's three overloads: excess-key detection
// must union the options-bag keys across overloads) and
// multiline-text-no-lineheight (Text/Label + Font). Engine's ctor stays
// `options?: any` on purpose — an `any` options bag must make the rule skip.
export interface MoveByOptions {
  offset: Vector;
  duration: number;
  easing?: (t: number) => number;
}

export declare class ActionContext {
  moveBy(options: MoveByOptions): ActionContext;
  moveBy(offset: Vector, speed: number): ActionContext;
  moveBy(x: number, y: number, speed: number): ActionContext;
}

export interface FontOptions {
  size?: number;
  family?: string;
  lineHeight?: number;
}

export declare class Font {
  constructor(options?: FontOptions);
}

export interface TextOptions {
  text: string;
  font?: Font;
  color?: Color;
  maxWidth?: number;
}

export declare class Text {
  constructor(options: TextOptions);
  text: string;
}
