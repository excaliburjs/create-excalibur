import { actorNotAdded } from "./rules/actor-not-added.ts";
import { unnamedActor } from "./rules/unnamed-actor.ts";
import { dontShadowExcaliburInternals } from "./rules/dont-shadow-excalibur-internals.ts";
import { leakedSubscription } from "./rules/leaked-subscription.ts";
import { deadCollisionHooks } from "./rules/dead-collision-hooks.ts";
import { dontMutateSharedGraphics } from "./rules/dont-mutate-shared-graphics.ts";
import { unknownSceneKey } from "./rules/unknown-scene-key.ts";
import { dontCallLifecycleHooks } from "./rules/dont-call-lifecycle-hooks.ts";
import { cameraPosAliasing } from "./rules/camera-pos-aliasing.ts";
import { noReservedTags } from "./rules/no-reserved-tags.ts";
import { noReservedUniforms } from "./rules/no-reserved-uniforms.ts";
import { preferSeededRandom } from "./rules/prefer-seeded-random.ts";

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
import type { Rule } from "./types.ts";

export const RULES: Rule[] = [
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
