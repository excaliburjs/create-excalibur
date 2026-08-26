import { actorNotAdded } from "./rules/actor-not-added.js";
import { unnamedActor } from "./rules/unnamed-actor.js";
import { dontShadowExcaliburInternals } from "./rules/dont-shadow-excalibur-internals.js";

/**
 * Doctor rule registry. A rule is
 * `{ id, description, create(ctx, sf) => listeners }` where `listeners` maps
 * ts.SyntaxKind → (node) => void plus an optional "exit:file" hook — the
 * kind-keyed listener shape typescript-eslint and tsgolint settled on. The
 * runner (run.js) does ONE AST walk per source file dispatching to every
 * rule's listeners; rules push findings through ctx.report.
 */
export const RULES = [actorNotAdded, unnamedActor, dontShadowExcaliburInternals];
