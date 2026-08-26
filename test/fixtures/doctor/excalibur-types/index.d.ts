// Minimal excalibur type surface for ex doctor tests. Covers exactly what the
// vite-project fixture's src files import plus what the doctor rules classify
// (Actor/Entity derivation, Scene/Engine add receivers). Not the real API.

export declare class Vector {
  x: number;
  y: number;
  constructor(x: number, y: number);
}
export declare function vec(x: number, y: number): Vector;

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

export declare class Entity {
  name: string;
  addChild(entity: Entity): Entity;
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

export interface ExcaliburGraphicsContext {}

export declare class SceneActivationContext<TData = undefined> {
  data?: TData;
}

export declare class DefaultLoader {
  addResource(resource: any): void;
}
export declare class Loader extends DefaultLoader {}

export declare class Scene {
  add(entity: Entity): void;
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
  add(entity: Entity): void;
  start(sceneKey?: string, options?: any): Promise<void>;
}

export declare class Transition extends Entity {}
export declare class FadeInOut extends Transition {
  constructor(options?: { duration?: number; direction?: string; color?: Color });
}

export declare class ImageSource {
  constructor(path: string);
  toSprite(): any;
}
