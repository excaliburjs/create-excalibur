/**
 * Option models for `ex generate` — the contract shared by the interactive
 * wizards, the MCP generate tools, and the tests' canned models. All three
 * produce these shapes; the apply*() functions consume them. Keeping them in
 * one place makes wizard/MCP schema drift a compile error.
 */
import type { SpriteSheetGrid, SpriteSheetSpacing } from "./ts-edit.ts";

export interface Vec2 {
  x: number;
  y: number;
}

/** A scene picked as a wiring target ({@link ProjectScene} satisfies it). */
export interface SceneTarget {
  className: string;
  file: string;
}

/** An actor picked as a wiring target ({@link ProjectActor} satisfies it). */
export interface ActorTarget {
  className: string;
  file: string;
}

export type ColliderModel =
  | { type: "none" }
  | { type: "box"; width: number; height: number }
  | { type: "circle"; radius: number }
  | { type: "custom" };

export type GraphicModel =
  | { type: "none" }
  | { type: "color"; color: string }
  | { type: "sprite"; resourceKey: string };

export interface ActorAdvancedOptions {
  pos?: Vec2 | null;
  coordPlane?: "World" | "Screen" | null;
  anchor?: "center" | "topLeft" | null;
  z?: number | null;
  rotation?: number | null;
  collisionGroupName?: string | null;
}

export interface ActorModel {
  className: string;
  fileName: string;
  targetScene?: SceneTarget | null;
  collider?: ColliderModel | null;
  graphic?: GraphicModel | null;
  collisionType?: string | null;
  advanced?: ActorAdvancedOptions | null;
}

export interface LabelFontModel {
  family?: string | null;
  size?: number | null;
  unit?: string | null;
  bold?: boolean | null;
  color?: string | null;
}

export interface LabelModel {
  className: string;
  fileName: string;
  targetScene?: SceneTarget | null;
  text?: string | null;
  pos?: Vec2 | null;
  font?: LabelFontModel | null;
}

export interface SceneModel {
  className: string;
  fileName: string;
  key: string;
  register?: boolean;
  lifecycle?: string[] | null;
}

/** The subset emitResourceExpr needs; ResourceModel adds the wiring info. */
export interface ResourceExprModel {
  resourceClass: string;
  assetPath: string;
  pixelFiltering?: boolean | null;
  family?: string | null;
  responseType?: string | null;
}

export interface ResourceModel extends ResourceExprModel {
  key: string;
  target?: { root?: boolean; scene?: SceneTarget | null } | null;
}

export interface EnginePhysicsOptions {
  solver?: string | null;
  gravity?: Vec2 | null;
  substep?: number | null;
}

export interface EngineOptionsModel {
  width?: number | null;
  height?: number | null;
  displayMode?: string | null;
  backgroundColor?: string | null;
  pixelArt?: boolean | null;
  antialiasing?: boolean | null;
  suppressPlayButton?: boolean | null;
  fixedUpdateFps?: number | null;
  physics?: EnginePhysicsOptions | null;
}

export interface EngineModel {
  options?: EngineOptionsModel | null;
  remove?: string[] | null;
  scenes?: Array<{ key?: string | null; className: string; file: string }> | null;
}

export interface ActorArgsOptionsModel {
  name?: string | null;
  pos?: Vec2 | null;
  width?: number | null;
  height?: number | null;
  radius?: number | null;
  color?: string | null;
  collisionType?: string | null;
  anchor?: "center" | "topLeft" | null;
  coordPlane?: string | null;
  rotation?: number | null;
  z?: number | null;
}

export interface UpdateActorModel {
  actor: ActorTarget;
  options?: ActorArgsOptionsModel | null;
  remove?: string[] | null;
}

export interface MaterialModel {
  className: string;
  fileName: string;
  /** MATERIAL_TEMPLATES key; ignored when fragmentSource is given */
  template?: string | null;
  fragmentSource?: string | null;
  pixelArt?: boolean | null;
  targetActor?: ActorTarget | null;
}

export interface FrameCoord {
  x: number;
  y: number;
  duration: number;
}

export interface AnimationSpec {
  name: string;
  frames: FrameCoord[];
  strategy: string;
}

export interface SpriteSheetImageModel {
  key: string;
  assetPath?: string | null;
  pixelFiltering?: boolean | null;
  /** true when `key` already exists in the Resources literal */
  reuseExisting?: boolean | null;
}

export interface SpriteSheetModel {
  name: string;
  image: SpriteSheetImageModel;
  grid: SpriteSheetGrid;
  spacing?: SpriteSheetSpacing | null;
  animations?: AnimationSpec[] | null;
  wire?: { actor: ActorTarget; animationName: string } | null;
}

export interface AnimationModel {
  name: string;
  sheet: { name: string; file: string; grid?: SpriteSheetGrid | null };
  frames: FrameCoord[];
  strategy: string;
  targetActor?: ActorTarget | null;
}

/** What apply*() reports back to the flow / MCP tool. */
export interface GenerateReport {
  created: string[];
  modified: Array<{ path: string; snippet: string }>;
  manual: Array<{ title: string; snippet: string }>;
  warnings: string[];
  hints: string[];
}

export interface ApplyOptions {
  dryRun?: boolean;
  force?: boolean;
}
