/**
 * v1 API-shape normalization (core de02d9ff "Breaks api getter setter for
 * v1", bff60431 "more name breaks", 64d44e2d draggable removal — all after
 * the 2026-11-02 review). Verified member by member against the core diff,
 * not the CHANGELOG (which lists `PolygonCollider.isConvex` under the
 * getters; in code it became the method `checkConvex()`). "On screen" stays
 * two words on v1 (`forceOnScreen`, `onScreenOnly`, `getOnScreenTiles` are
 * NOT renamed — an earlier head bd9d912b did, bff60431 reverted it); only
 * `isOffScreen` → `isOffscreen` lands.
 *
 * Three shapes, one factory: zero-arg `isX()` → getter `isX` (drop the
 * parens, convert user overrides/implementations to `get`), method renames
 * (`toggleEnabled` → `setEnabled`), property renames (`isOffScreen` →
 * `isOffscreen`). Option KEYS (`visible:` → `isVisible:` on Actor/Trigger/
 * GraphicsComponent options, `solid:` → `isSolid:` on Tile) are a
 * contextual-type key rename — `super({ visible: false })` in an Actor
 * subclass is the common site and no constructor-gated check sees it.
 * (The mapped-type path — `physics.config.integration.<key>` — is proven
 * by the fixture even though no "on screen" key is renamed any more.)
 */
import type * as TS from "typescript";
import { memberReshapeMigration } from "./_member-reshape.ts";
import { manualMigration } from "./_manual.ts";
import { exportRenameMigration } from "./_export-rename.ts";
import { optionKeyRenameMigration } from "./_option-keys.ts";
import { declaringTypeName } from "./_resolve.ts";
import type { UpgradeContext } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";

/**
 * Zero-arg `isX()`/`hasX()` methods that became getters. Owners are the
 * declaring types (interfaces included: `Loadable`, `RendererPlugin`,
 * `CoroutineInstance` — user `implements` classes convert their declaration
 * too). Already-getters at 0.32 (`Timer.isRunning`, `Animation.isPlaying`,
 * `Entity.isInitialized`) are deliberately absent.
 */
export const methodsToGetters = memberReshapeMigration({
  id: "methods-to-getters",
  version: "1.0.0",
  title: "zero-arg isX()/hasX() methods are getters in v1 (isLoaded, isPlaying, isKilled, isRunning, …) — drop the parentheses",
  link: V1,
  rules: [
    { owners: new Set(["Entity"]), members: { isKilled: { to: "isKilled", dropCall: true } } },
    {
      owners: new Set(["Engine"]),
      members: {
        isRunning: { to: "isRunning", dropCall: true },
        isDisposed: { to: "isDisposed", dropCall: true },
        // the Promise moved from `isReady()` to the `ready` getter (the old boolean `ready` is `isReady` — see v1-member-renames)
        isReady: { to: "ready", dropCall: true },
      },
    },
    { owners: new Set(["Clock", "StandardClock", "TestClock"]), members: { isRunning: { to: "isRunning", dropCall: true } } },
    { owners: new Set(["GarbageCollector"]), members: { running: { to: "isRunning", dropCall: true } } },
    { owners: new Set(["CoroutineInstance"]), members: { isRunning: { to: "isRunning", dropCall: true }, isComplete: { to: "isComplete", dropCall: true } } },
    { owners: new Set(["Scene"]), members: { isCurrentScene: { to: "isCurrentScene", dropCall: true } } },
    { owners: new Set(["CollisionContact"]), members: { isCanceled: { to: "isCanceled", dropCall: true } } },
    {
      owners: new Set(["Sound", "SoundTrack", "WebAudioInstance", "Audio"]),
      members: {
        isPlaying: { to: "isPlaying", dropCall: true },
        isPaused: { to: "isPaused", dropCall: true },
        isStopped: { to: "isStopped", dropCall: true },
      },
    },
    {
      owners: new Set(["Loadable", "Resource", "ImageSource", "FontSource", "Gif", "Sound", "SoundManager", "DefaultLoader", "Loader"]),
      members: { isLoaded: { to: "isLoaded", dropCall: true } },
    },
    { owners: new Set(["Matrix", "AffineMatrix"]), members: { isIdentity: { to: "isIdentity", dropCall: true } } },
    { owners: new Set(["Transform"]), members: { isMirrored: { to: "isMirrored", dropCall: true } } },
    { owners: new Set(["BoundingBox"]), members: { hasZeroDimensions: { to: "hasZeroDimensions", dropCall: true } } },
    { owners: new Set(["Camera"]), members: { hasChanged: { to: "hasChanged", dropCall: true } } },
    { owners: new Set(["ActionQueue"]), members: { hasNext: { to: "hasNext", dropCall: true }, isComplete: { to: "isComplete", dropCall: true } } },
    { owners: new Set(["Graphic"]), members: { isStale: { to: "isStale", dropCall: true } } },
    { owners: new Set(["RendererPlugin"]), members: { hasPendingDraws: { to: "hasPendingDraws", dropCall: true } } },
    { owners: new Set(["Shader"]), members: { isCurrentlyBound: { to: "isCurrentlyBound", dropCall: true } } },
    { owners: new Set(["TreeNode"]), members: { isLeaf: { to: "isLeaf", dropCall: true } } },
    { owners: new Set(["WebAudio"]), members: { isUnlocked: { to: "isUnlocked", dropCall: true } } },
    { owners: new Set(["Serializer"]), members: { isInitialized: { to: "isInitialized", dropCall: true } } },
  ],
});

/**
 * `engine.ready` only renames while it is still the 0.32 boolean (on v1 `ready` IS the Promise),
 * and never where it is consumed as a Promise.
 */
const isBooleanProperty = (ctx: UpgradeContext, symbol: TS.Symbol, node: TS.Node): boolean => {
  const { ts, checker } = ctx;
  // `await engine.ready` / `engine.ready.then(…)` is methods-to-getters' own output (`isReady()` → `ready`):
  // against the still-installed pre-v1 types it reads as the old boolean, and renaming it would await a boolean.
  const parent = node.parent;
  if (parent && (ts.isAwaitExpression(parent) || (ts.isPropertyAccessExpression(parent) && parent.expression === node))) return false;
  const type = checker.getTypeOfSymbolAtLocation(symbol, node);
  return !!(type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral));
};

/**
 * Property / method renames on the same owner (casing and `isX` naming).
 * `paused` splits by owner: on Actor/Particle it was the PauseComponent
 * (now `pauseComponent`), on PauseComponent it was the flag (now `isPaused`).
 */
export const v1MemberRenames = memberReshapeMigration({
  id: "v1-member-renames",
  version: "1.0.0",
  title: "v1 member renames: isOffScreen → isOffscreen, Engine.loadingComplete → isLoaded, Timer/Transition/Animation → isComplete, Tile.solid → isSolid, toggleEnabled → setEnabled, PointerEvent.active → isActive, Actor.paused → pauseComponent, …",
  link: V1,
  rules: [
    { owners: new Set(["Actor"]), members: { isOffScreen: { to: "isOffscreen" }, paused: { to: "pauseComponent" } } },
    { owners: new Set(["Particle"]), members: { visible: { to: "isVisible" }, paused: { to: "pauseComponent" } } },
    { owners: new Set(["PauseComponent"]), members: { paused: { to: "isPaused" } } },
    {
      owners: new Set(["Engine"]),
      members: {
        loadingComplete: { to: "isLoaded" },
        ready: { to: "isReady", when: isBooleanProperty },
        toggleInputEnabled: { to: "setInputEnabled" },
      },
    },
    { owners: new Set(["Engine", "Screen"]), members: { isHiDpi: { to: "isHiDPI" } } },
    { owners: new Set(["Animation"]), members: { done: { to: "isComplete" } } },
    { owners: new Set(["Timer", "Transition"]), members: { complete: { to: "isComplete" } } },
    { owners: new Set(["Transition"]), members: { started: { to: "hasStarted" } } },
    { owners: new Set(["Gamepad"]), members: { connected: { to: "isConnected" } } },
    // the polling opt-in; `Keyboard.enabled`/`InputHost.enabled` keep their names
    { owners: new Set(["Gamepads"]), members: { enabled: { to: "pollingEnabled" } } },
    // the cancel flag on the input events (Entity.active → isActive is active-to-isactive's job)
    { owners: new Set(["PointerEvent", "WheelEvent"]), members: { active: { to: "isActive" } } },
    { owners: new Set(["SystemManager"]), members: { initialized: { to: "isInitialized" } } },
    { owners: new Set(["Future"]), members: { isCompleted: { to: "isComplete" } } },
    { owners: new Set(["FontTextInstance"]), members: { disposed: { to: "isDisposed" } } },
    { owners: new Set(["Tile", "IsometricTile"]), members: { solid: { to: "isSolid" } } },
    { owners: new Set(["Keyboard", "Gamepads", "PointerEventReceiver", "InputHost"]), members: { toggleEnabled: { to: "setEnabled" } } },
    { owners: new Set(["PolygonCollider"]), members: { isConvex: { to: "checkConvex" } } },
    { owners: new Set(["HashGridProxy", "HashColliderProxy"]), members: { hasChanged: { to: "refreshAndCheckChanged" } } },
  ],
});

/**
 * Object-literal KEY renames resolved through the literal's CONTEXTUAL type
 * (`_option-keys.ts`): DebugConfig's z-index map also has a `solid` key —
 * that one survives, hence the owner gate. Shorthand `{ visible }` →
 * `isVisible: visible`.
 */
export const booleanOptionKeys = optionKeyRenameMigration({
  id: "boolean-option-keys",
  version: "1.0.0",
  title: "option keys renamed in v1: visible → isVisible (Actor/Trigger/GraphicsComponent options), solid → isSolid (Tile), directed → isDirected (Graph edges)",
  link: V1,
  keys: [
    { key: "visible", to: "isVisible", owners: new Set(["ActorOptions", "ActorArgs", "TriggerOptions", "GraphicsComponentOptions"]) },
    { key: "solid", to: "isSolid", owners: new Set(["TileOptions"]) },
    { key: "directed", to: "isDirected", owners: new Set(["EdgeOptionsWithWeight", "EdgeOptionsWeightless", "EdgeOptionsWithEuclidean"]) },
  ],
});

/** `Actor.draggable` (core 64d44e2d "remove!: broken actor drag helper") has no replacement. */
export const actorDraggableRemoved = manualMigration({
  id: "actor-draggable-removed",
  version: "1.0.0",
  title: "Actor.draggable was removed in v1 — handle pointerdragstart/pointerdragmove/pointerdragend yourself",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const ACTOR = new Set(["Actor"]);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node) && node.name.text === "draggable") {
          const symbol = checker.getSymbolAtLocation(node.name);
          const excaliburs = !!symbol && utils.isExcaliburSymbol(symbol) && declaringTypeName(ctx, symbol) === "Actor";
          if (excaliburs || (!symbol && utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), ACTOR))) {
            col.addManual(
              sf,
              node,
              "Actor.draggable was removed in v1 (the helper was broken) — subscribe to pointerdragstart/pointerdragmove/pointerdragend and set pos from evt.worldPos",
              V1
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** The PauseComponent options interface was renamed (de02d9ff). */
export const pauseComponentOptions = exportRenameMigration({
  id: "pause-component-options",
  version: "1.0.0",
  title: "PauseComponentInterface was renamed PauseComponentOptions in v1",
  link: V1,
  renames: { PauseComponentInterface: "PauseComponentOptions" },
});
