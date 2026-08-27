import { actorNotAdded } from "./rules/actor-not-added.js";
import { unnamedActor } from "./rules/unnamed-actor.js";
import { dontShadowExcaliburInternals } from "./rules/dont-shadow-excalibur-internals.js";
import { leakedSubscription } from "./rules/leaked-subscription.js";
import { deadCollisionHooks } from "./rules/dead-collision-hooks.js";
import { dontMutateSharedGraphics } from "./rules/dont-mutate-shared-graphics.js";
import { unknownSceneKey } from "./rules/unknown-scene-key.js";
import { dontCallLifecycleHooks } from "./rules/dont-call-lifecycle-hooks.js";
import { cameraPosAliasing } from "./rules/camera-pos-aliasing.js";
import { noReservedTags } from "./rules/no-reserved-tags.js";
import { noReservedUniforms } from "./rules/no-reserved-uniforms.js";
import { preferSeededRandom } from "./rules/prefer-seeded-random.js";

/**
 * Doctor rule registry. A rule is
 * `{ id, description, create(ctx, sf) => listeners }` where `listeners` maps
 * ts.SyntaxKind → (node) => void plus an optional "exit:file" hook — the
 * kind-keyed listener shape typescript-eslint and tsgolint settled on. The
 * runner (run.js) does ONE AST walk per source file dispatching to every
 * rule's listeners; rules push findings through ctx.report. Project-wide
 * context (physics setting, scene keys, Random seeds) comes from the facts
 * pre-pass (facts.js) via ctx.facts.
 */
export const RULES = [
  actorNotAdded,
  unnamedActor,
  dontShadowExcaliburInternals,
  leakedSubscription,
  deadCollisionHooks,
  dontMutateSharedGraphics,
  unknownSceneKey,
  dontCallLifecycleHooks,
  cameraPosAliasing,
  noReservedTags,
  noReservedUniforms,
  preferSeededRandom,
];
