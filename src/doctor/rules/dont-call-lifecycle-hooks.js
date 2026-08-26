/**
 * Flag user code invoking an excalibur lifecycle hook directly
 * (`this.onInitialize(engine)` from a restart() helper was the root cause of
 * a compounding input-handler leak in a real game: it bypasses the engine's
 * initialize guard and re-runs every subscription). `super.onX(...)` inside
 * an override is the correct pattern and never flags.
 */
const LIFECYCLE = new Set([
  "onInitialize",
  "onActivate",
  "onDeactivate",
  "onPreLoad",
  "onPreUpdate",
  "onPostUpdate",
  "onPreDraw",
  "onPostDraw",
  "onAdd",
  "onRemove",
  "onPreKill",
  "onPostKill",
  "onCollisionStart",
  "onCollisionEnd",
  "onPreCollisionResolve",
  "onPostCollisionResolve",
]);

export const dontCallLifecycleHooks = {
  id: "dont-call-lifecycle-hooks",
  description: "a lifecycle hook is invoked directly instead of by the engine",
  create(ctx, sf) {
    const { ts, checker, utils, report } = ctx;
    const MANAGED = new Set(["Entity", "Scene", "Engine"]);

    return {
      [ts.SyntaxKind.CallExpression](node) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee) || !LIFECYCLE.has(callee.name.text)) return;
        const receiver = utils.unwrap(callee.expression);
        if (receiver.kind === ts.SyntaxKind.SuperKeyword) return; // super.onX() in an override is correct
        if (!utils.derivesFromExcalibur(checker.getTypeAtLocation(receiver), MANAGED)) return;
        report({
          ...utils.lineCol(sf, node),
          message: `${callee.name.text} is a lifecycle hook — the engine calls it, you shouldn't`,
          hint: "calling hooks directly bypasses the engine's guards (double-subscriptions, skipped events) — move the shared logic into a plain method both can call.",
        });
      },
    };
  },
};
