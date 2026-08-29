import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * When the project constructs its Engine with `physics: false` (or
 * `physics: {enabled: false}`), no contacts are ever generated — every
 * collision hook and 'collisionstart'-family subscription is dead code that
 * looks like working game logic. Two of the three audited games disable
 * physics; one still overrode four collision hooks on its Player.
 *
 * Empty-bodied hook overrides (the template's comment-only stubs) are
 * skipped — only hooks with actual statements, and event subscriptions,
 * flag. Requires the project-wide facts pre-pass for the physics setting.
 */
const COLLISION_HOOKS = new Set([
  "onCollisionStart",
  "onCollisionEnd",
  "onPreCollisionResolve",
  "onPostCollisionResolve",
]);
const COLLISION_EVENTS = new Set(["collisionstart", "collisionend", "precollision", "postcollision"]);

export const deadCollisionHooks: Rule = {
  id: "dead-collision-hooks",
  description: "collision handlers can never fire because engine physics is disabled",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, facts, report } = ctx;
    if (!facts.physicsDisabled) return {};
    const ENTITY = new Set(["Entity"]);

    const hint =
      "the Engine is constructed with physics disabled, so no contacts are generated — enable physics or remove the handler.";

    return {
      [ts.SyntaxKind.MethodDeclaration](node: TS.MethodDeclaration) {
        if (!node.name || !ts.isIdentifier(node.name) || !COLLISION_HOOKS.has(node.name.text)) return;
        if (!node.body || node.body.statements.length === 0) return; // template stubs
        if (!utils.enclosingExcaliburClass(node, ENTITY)) return;
        report({
          ...utils.lineCol(sf, node.name),
          message: `${node.name.text} can never fire — engine physics is disabled`,
          hint,
        });
      },
      [ts.SyntaxKind.CallExpression](node: TS.CallExpression) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee)) return;
        if (callee.name.text !== "on" && callee.name.text !== "once") return;
        const first = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
        if (!first || !ts.isStringLiteral(first) || !COLLISION_EVENTS.has(first.text)) return;
        report({
          ...utils.lineCol(sf, node),
          message: `subscription to "${first.text}" can never fire — engine physics is disabled`,
          hint,
        });
      },
    };
  },
};
