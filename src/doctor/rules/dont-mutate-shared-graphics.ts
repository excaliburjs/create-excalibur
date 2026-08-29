import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * Flag writes to graphics that come out of a resource cache. Plugin getters
 * like Aseprite's `getAnimation(name)`/`getSpriteSheet(name)` return cached
 * singletons — mutating them mutates every user, forever. Real bug found:
 * three scenes each ran `sprite.sourceView.width *= 5` on the same cached
 * background animation, so playing N puzzles scaled it by 5^N.
 *
 * Per-file taint: a variable is tainted when initialized from a
 * `getAnimation`/`getSpriteSheet` call, or by property/element access off a
 * tainted variable. Any other call in the initializer chain (`.clone()`
 * above all) produces a fresh value and breaks the taint. Flagged: an
 * assignment (plain or compound) through a tainted root, or `reset()`
 * called on one.
 */
const SEED_METHODS = new Set(["getAnimation", "getSpriteSheet"]);
const MUTATOR_METHODS = new Set(["reset"]);

export const dontMutateSharedGraphics: Rule = {
  id: "dont-mutate-shared-graphics",
  description: "a cached resource graphic is mutated instead of cloned",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    const tainted = new Set<TS.Symbol>(); // ts.Symbol of tainted variables

    const ASSIGN_OPS = new Set([
      ts.SyntaxKind.EqualsToken,
      ts.SyntaxKind.PlusEqualsToken,
      ts.SyntaxKind.MinusEqualsToken,
      ts.SyntaxKind.AsteriskEqualsToken,
      ts.SyntaxKind.SlashEqualsToken,
    ]);

    function isSeedCall(node: TS.Expression): boolean {
      if (!ts.isCallExpression(node)) return false;
      const callee = utils.unwrap(node.expression);
      return ts.isPropertyAccessExpression(callee) && SEED_METHODS.has(callee.name.text);
    }

    /** Does this expression evaluate to a cache-shared value? */
    function isTaintedValue(expr: TS.Expression): boolean {
      const node = utils.unwrap(expr);
      if (!node) return false;
      if (isSeedCall(node)) return true;
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        return isTaintedValue(node.expression);
      }
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        return Boolean(symbol && tainted.has(symbol));
      }
      return false; // any other call/new produces a fresh value — taint broken
    }

    return {
      [ts.SyntaxKind.VariableDeclaration](node: TS.VariableDeclaration) {
        if (!node.initializer || !ts.isIdentifier(node.name)) return;
        if (isTaintedValue(node.initializer)) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol) tainted.add(symbol);
        }
      },
      [ts.SyntaxKind.BinaryExpression](node: TS.BinaryExpression) {
        if (!ASSIGN_OPS.has(node.operatorToken.kind)) return;
        const left = utils.unwrap(node.left);
        if (!ts.isPropertyAccessExpression(left) && !ts.isElementAccessExpression(left)) return;
        if (!isTaintedValue(left.expression)) return;
        report({
          ...utils.lineCol(sf, node),
          message: `assignment mutates a cached resource graphic shared by every user`,
          hint: "resource getters like getAnimation() return cached singletons — .clone() before mutating (this write compounds across scenes/instances).",
        });
      },
      [ts.SyntaxKind.CallExpression](node: TS.CallExpression) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee) || !MUTATOR_METHODS.has(callee.name.text)) return;
        if (!isTaintedValue(callee.expression)) return;
        report({
          ...utils.lineCol(sf, node),
          message: `${callee.name.text}() mutates a cached resource graphic shared by every user`,
          hint: "resource getters like getAnimation() return cached singletons — .clone() before mutating.",
        });
      },
    };
  },
};
