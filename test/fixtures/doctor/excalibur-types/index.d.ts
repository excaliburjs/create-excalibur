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
  onInitialize(engine: Engine): void;
  onPreUpdate(engine: Engine, elapsedMs: number): void;
  onPostUpdate(engine: Engine, elapsedMs: number): void;
  onCollisionStart(self: Collider, other: Collider, side: Side, contact: CollisionContact): void;
}

export declare class Label extends Actor {
  constructor(config?: ActorArgs & { text?: string });
  text: string;
}

export declare class ScreenElement extends Actor {}

export interface MaterialOptions {
  name?: string;
  color?: Color;
  fragmentSource: string;
  vertexSource?: string;
  uniforms?: Record<string, any>;
  graphicsContext?: ExcaliburGraphicsContext;
}

export declare class Material {
  constructor(options: MaterialOptions);
  update(callback: (shader: any) => void): void;
}

export declare class ScreenShader {
  constructor(context: ExcaliburGraphicsContext, fragmentSource: string);
}

export interface ExcaliburGraphicsContext {
  createMaterial(options: MaterialOptions): Material;
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

export declare class ImageSource {
  constructor(path: string);
  toSprite(): any;
}
