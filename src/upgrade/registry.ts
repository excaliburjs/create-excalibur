import { applyPlannedEdits } from "./edits.ts";
import { compareVersions } from "./versions.ts";
import { inputNamespaceFlatten } from "./migrations/input-namespace-flatten.ts";
import { deltaToElapsedMs } from "./migrations/delta-to-elapsedms.ts";
import { gotoToGoToScene, graphicsShowToUse, triggerEventEntity, vectorSizeToMagnitude, getGlobalAccessors } from "./migrations/renames-0-30.ts";
import { eventDispatcherToEventEmitter, antialiasingAccessors } from "./migrations/eventdispatcher-antialiasing.ts";
import { particleEmitterArgs } from "./migrations/particle-emitter-args.ts";
import { easeActionsToMoveTo, timerOptionBag, screenShaderVTexcoord } from "./migrations/calls-0-30.ts";
import { physicsStatics, collisionEventTarget, systemPriorityStatic, triggerApi, vectorNormalizeZero, actorOptionsUnion } from "./migrations/manuals-0-30.ts";
import { boundingBoxDrawToDebug, physicsSleepDefaults, easingFunctions } from "./migrations/bucket-0-32.ts";
import { screenCoordinatesRooting, tileMapCompositeStrategy, fontTextRendering } from "./migrations/bucket-1-0.ts";
import {
  visibleToIsVisible,
  activeToIsActive,
  sleepingToIsSleeping,
  setSleepingToAssignment,
  bodyCenterToGlobalPos,
  fullscreenCasing,
  gamepadIsButtonPressed,
  optionsKeyRenames,
  queryTagsToQuery,
  easingLegacySurface,
} from "./migrations/bucket-1-0-removals.ts";
import {
  poolToArenaPool,
  shapeToColliders,
  argsToOptionsTypes,
  viewportEventCasing,
  directionToTextDirection,
  webAudioInstanceToSoundTrack,
} from "./migrations/bucket-1-0-renames.ts";
import { systemLifecycleHooks } from "./migrations/bucket-1-0-system.ts";
import {
  soundRemovedExports,
  exResponseToLiteral,
  soundPlayOptions,
  soundManagerOptions,
  soundManagerMembers,
  soundMuteSemantics,
} from "./migrations/bucket-1-0-sound.ts";
import { materialUpdateContext, postProcessorProcess, materialOptionsUnion, obsoleteDecoratorRemoved } from "./migrations/bucket-1-0-graphics.ts";
import {
  colliderSetToUse,
  nullForEmpty,
  newBaseMembers,
  rotateByExactOffset,
  esmOnlyPackage,
  sceneDeactivateFlush,
  colliderOwnerNullable,
} from "./migrations/bucket-1-0-misc.ts";
import {
  methodsToGetters,
  v1MemberRenames,
  booleanOptionKeys,
  actorDraggableRemoved,
  pauseComponentOptions,
} from "./migrations/bucket-1-0-api-shape.ts";
import {
  timeUnitSuffixRenames,
  colorEquals,
  timeUnitOptionKeys,
  slideEasingOption,
  soundTimeUnits,
  eventTypesToStrings,
  v1LegacyRemovals,
  colorInvertAlpha,
  materialScreenUvOrigin,
} from "./migrations/bucket-1-0-consistency.ts";

/**
 * The ordered migration registry (Angular ng-update style): each entry is
 * tagged with the release it lands in; the runner executes everything in
 * (installedVersion, targetVersion] in this order. v0.31 shipped no breaking
 * changes, so that hop is simply absent.
 *
 * Record contract (Storybook automigrate's Fix triad):
 *   { id, version, promptType: auto|manual|notification, title, link,
 *     check(ctx) -> result|null, prompt(result), run?({ctx, result}) }
 * `auto` records get the shared splice applier as their default run;
 * `manual`/`notification` records are structurally forbidden a run.
 */
import type { AutoMigration, Migration } from "./types.ts";

export const MIGRATIONS: Migration[] = [
  // --- v0.30.0 ---
  inputNamespaceFlatten,
  deltaToElapsedMs,
  gotoToGoToScene,
  graphicsShowToUse,
  triggerEventEntity,
  vectorSizeToMagnitude,
  getGlobalAccessors,
  eventDispatcherToEventEmitter,
  antialiasingAccessors,
  particleEmitterArgs,
  easeActionsToMoveTo,
  timerOptionBag,
  screenShaderVTexcoord,
  physicsStatics,
  collisionEventTarget,
  systemPriorityStatic,
  triggerApi,
  vectorNormalizeZero,
  actorOptionsUnion,
  // --- v0.32.0 ---
  boundingBoxDrawToDebug,
  physicsSleepDefaults,
  easingFunctions,
  // --- v1.0.0 ---
  screenCoordinatesRooting,
  tileMapCompositeStrategy,
  fontTextRendering,
  // v1 removals of APIs deprecated earlier (core 5963eba3)
  visibleToIsVisible,
  activeToIsActive,
  sleepingToIsSleeping,
  setSleepingToAssignment,
  bodyCenterToGlobalPos,
  fullscreenCasing,
  gamepadIsButtonPressed,
  optionsKeyRenames,
  queryTagsToQuery,
  easingLegacySurface,
  // v1 coverage review (2026-11, core main @ 1e0df576): breaks the first pass
  // predates — several are absent from the CHANGELOG (System hook rename,
  // null-for-empty, the event-class casing fixes).
  systemLifecycleHooks,
  soundRemovedExports,
  webAudioInstanceToSoundTrack,
  exResponseToLiteral,
  soundPlayOptions,
  soundManagerOptions,
  soundManagerMembers,
  soundMuteSemantics,
  materialUpdateContext,
  postProcessorProcess,
  materialOptionsUnion,
  obsoleteDecoratorRemoved,
  poolToArenaPool,
  shapeToColliders,
  argsToOptionsTypes,
  viewportEventCasing,
  directionToTextDirection,
  colliderSetToUse,
  nullForEmpty,
  newBaseMembers,
  rotateByExactOffset,
  esmOnlyPackage,
  sceneDeactivateFlush,
  // API-shape normalization (core de02d9ff / bd9d912b / 64d44e2d, 2026-11-04): isX() methods → getters,
  // casing + isX renames, option keys, the draggable removal.
  // Order matters: the boolean `engine.ready` → `isReady` rename runs BEFORE `isReady()` → `ready`,
  // or it would re-rename the other record's output (the pre-v1 types are still installed).
  v1MemberRenames,
  methodsToGetters,
  booleanOptionKeys,
  actorDraggableRemoved,
  pauseComponentOptions,
  // API consistency pass (core b930f2b7 / 6f19e7d2 / 1a1c8331, 2026-11-07): the Ms-suffix drop,
  // Sound seconds → milliseconds, Color.equals, EventTypes → strings, the last legacy removals.
  timeUnitSuffixRenames,
  colorEquals,
  timeUnitOptionKeys,
  slideEasingOption,
  soundTimeUnits,
  eventTypesToStrings,
  v1LegacyRemovals,
  colorInvertAlpha,
  materialScreenUvOrigin,
  colliderOwnerNullable,
];

const PROMPT_TYPES = new Set(["auto", "manual", "notification"]);

// Import-time structural validation (a unit test re-asserts the same rules).
{
  const seen = new Set<string>();
  let prev: Migration | null = null;
  for (const m of MIGRATIONS) {
    if (!m.id || seen.has(m.id)) throw new Error(`upgrade registry: duplicate or missing id "${m.id}"`);
    seen.add(m.id);
    if (!PROMPT_TYPES.has(m.promptType)) throw new Error(`upgrade registry: ${m.id} has bad promptType`);
    if (typeof m.check !== "function" || typeof m.prompt !== "function") {
      throw new Error(`upgrade registry: ${m.id} is missing check/prompt`);
    }
    if (m.promptType === "auto") {
      if (!m.run) (m as AutoMigration).run = ({ ctx, result }) => applyPlannedEdits(ctx, result);
    } else if ((m as { run?: unknown }).run) {
      // unreachable when the Migration union holds — belt-and-braces for plain-JS callers
      throw new Error(`upgrade registry: ${m.id} is ${m.promptType} and must not define run`);
    }
    if (prev && compareVersions(prev.version, m.version) > 0) {
      throw new Error(`upgrade registry: ${m.id} (${m.version}) is out of version order`);
    }
    if (m.removedIn && compareVersions(m.removedIn, m.version) < 0) {
      throw new Error(`upgrade registry: ${m.id} removedIn (${m.removedIn}) predates its version (${m.version})`);
    }
    prev = m;
  }
}
