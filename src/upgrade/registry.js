import { applyPlannedEdits } from "./edits.js";
import { compareVersions } from "./versions.js";
import { inputNamespaceFlatten } from "./migrations/input-namespace-flatten.js";
import { deltaToElapsedMs } from "./migrations/delta-to-elapsedms.js";
import { gotoToGoToScene, graphicsShowToUse, vectorSizeToMagnitude, getGlobalAccessors } from "./migrations/renames-0-30.js";
import { eventDispatcherToEventEmitter, antialiasingAccessors } from "./migrations/eventdispatcher-antialiasing.js";
import { particleEmitterArgs } from "./migrations/particle-emitter-args.js";
import { easeActionsToMoveTo, timerOptionBag, screenShaderVTexcoord } from "./migrations/calls-0-30.js";
import { physicsStatics, collisionEventTarget, systemPriorityStatic, triggerApi, vectorNormalizeZero } from "./migrations/manuals-0-30.js";
import { boundingBoxDrawToDebug, physicsSleepDefaults, easingFunctions } from "./migrations/bucket-0-32.js";
import { screenCoordinatesRooting, tileMapCompositeStrategy, fontTextRendering } from "./migrations/bucket-1-0.js";

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
export const MIGRATIONS = [
  // --- v0.30.0 ---
  inputNamespaceFlatten,
  deltaToElapsedMs,
  gotoToGoToScene,
  graphicsShowToUse,
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
  // --- v0.32.0 ---
  boundingBoxDrawToDebug,
  physicsSleepDefaults,
  easingFunctions,
  // --- v1.0.0 ---
  screenCoordinatesRooting,
  tileMapCompositeStrategy,
  fontTextRendering,
];

const PROMPT_TYPES = new Set(["auto", "manual", "notification"]);

// Import-time structural validation (a unit test re-asserts the same rules).
{
  const seen = new Set();
  let prev = null;
  for (const m of MIGRATIONS) {
    if (!m.id || seen.has(m.id)) throw new Error(`upgrade registry: duplicate or missing id "${m.id}"`);
    seen.add(m.id);
    if (!PROMPT_TYPES.has(m.promptType)) throw new Error(`upgrade registry: ${m.id} has bad promptType`);
    if (typeof m.check !== "function" || typeof m.prompt !== "function") {
      throw new Error(`upgrade registry: ${m.id} is missing check/prompt`);
    }
    if (m.promptType === "auto") {
      if (!m.run) m.run = ({ ctx, result }) => applyPlannedEdits(ctx, result);
    } else if (m.run) {
      throw new Error(`upgrade registry: ${m.id} is ${m.promptType} and must not define run`);
    }
    if (prev && compareVersions(prev.version, m.version) > 0) {
      throw new Error(`upgrade registry: ${m.id} (${m.version}) is out of version order`);
    }
    prev = m;
  }
}
