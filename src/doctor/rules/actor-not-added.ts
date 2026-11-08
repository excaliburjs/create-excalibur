import { ACTOR_BASES, ADD_RECEIVERS } from "../type-utils.ts";
import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";

/**
 * Flag Actor constructions that never reach a scene graph — the excalibur
 * analogue of no-floating-promises. Same statement-shape as the
 * typescript-eslint rule (and its tsgolint port), with one deliberate step
 * further: no-floating-promises does NO variable tracking (`const p = f()`
 * never flags), while doctor's strict semantics also trace locals and
 * `this.prop` to an add call — kept per-file by symbol identity precisely
 * because whole-program flow is a non-goal.
 *
 * "Added" means: the new-expression is an argument to `.add(...)`/`.addChild(...)`
 * on a Scene/Engine/Actor/Entity-typed receiver (incl. `this.add` in a Scene),
 * or it's stored in a local/`this.prop` that is such an argument somewhere in
 * the same file. Ownership TRANSFERS also count as handled (calibration over
 * 22 org repos: 24 findings, 1 true positive — every miss was one of these):
 * returned from a function (factory callbacks: Tiled/LDtk entity factories,
 * `makeSpawner`), handed to a call whose name starts with add/spawn/register/
 * track/attach (`grid.addUnit(unit)`, `level.spawn(enemy)`), or pushed into a
 * collection (`bricks.push(new Brick())`, added in a later loop). Everything
 * else — a plain helper argument, an array literal, an export — still flags.
 * No flow ordering: an add anywhere in the file counts.
 */
export const actorNotAdded: Rule = {
  id: "actor-not-added",
  description: "an Actor is constructed but never added to a scene",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    const actorNews: TS.NewExpression[] = [];
    const addedNewNodes = new Set<TS.Node>();
    const addedSymbols = new Set<TS.Symbol>();

    /** Strip parens, as/satisfies, non-null. */
    function unwrap(node: TS.Expression): TS.Expression {
      while (
        node &&
        (ts.isParenthesizedExpression(node) ||
          ts.isAsExpression(node) ||
          ts.isSatisfiesExpression?.(node) ||
          ts.isNonNullExpression(node))
      ) {
        node = node.expression;
      }
      return node;
    }

    /** A call that takes ownership of its argument by name: `grid.addUnit(x)`, `spawnEnemy(x)`, `list.push(x)`. */
    const TRANSFER_NAME = /^(add|spawn|register|track|attach|push|unshift)/i;

    function markHandled(value: TS.Expression): void {
      value = unwrap(value);
      if (ts.isNewExpression(value)) {
        addedNewNodes.add(value);
      } else if (
        ts.isIdentifier(value) ||
        (ts.isPropertyAccessExpression(value) && value.expression.kind === ts.SyntaxKind.ThisKeyword)
      ) {
        const symbol = checker.getSymbolAtLocation(value);
        if (symbol) addedSymbols.add(symbol);
      }
    }

    function recordAddCall(node: TS.CallExpression): void {
      const callee = unwrap(node.expression);
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : null;
      if (name === null) return;
      const isExcaliburAdd =
        ts.isPropertyAccessExpression(callee) &&
        (name === "add" || name === "addChild") &&
        utils.derivesFromExcalibur(checker.getTypeAtLocation(unwrap(callee.expression)), ADD_RECEIVERS);
      if (!isExcaliburAdd && !TRANSFER_NAME.test(name)) return;
      for (const arg of node.arguments ?? []) markHandled(arg);
    }

    /**
     * Walk up through the wrapper set no-floating-promises treats as
     * transparent (parens, as/satisfies, ternary branches, &&/||/??, the
     * value side of a comma) to the first meaningful parent.
     */
    function meaningfulParent(node: TS.Node): { parent: TS.Node | undefined; child: TS.Node } {
      let child = node;
      let parent = node.parent;
      while (parent) {
        if (
          ts.isParenthesizedExpression(parent) ||
          ts.isAsExpression(parent) ||
          ts.isSatisfiesExpression?.(parent) ||
          ts.isNonNullExpression(parent)
        ) {
          child = parent;
          parent = parent.parent;
          continue;
        }
        if (ts.isConditionalExpression(parent) && (parent.whenTrue === child || parent.whenFalse === child)) {
          child = parent;
          parent = parent.parent;
          continue;
        }
        if (
          ts.isBinaryExpression(parent) &&
          [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken,
          ].includes(parent.operatorToken.kind)
        ) {
          child = parent;
          parent = parent.parent;
          continue;
        }
        if (
          ts.isBinaryExpression(parent) &&
          parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
          parent.right === child
        ) {
          child = parent;
          parent = parent.parent;
          continue;
        }
        break;
      }
      return { parent, child };
    }

    function isTracked(newExpr: TS.NewExpression): boolean {
      const { parent, child } = meaningfulParent(newExpr);
      if (!parent) return false;
      if (
        (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) &&
        parent.initializer === child &&
        ts.isIdentifier(parent.name)
      ) {
        const symbol = checker.getSymbolAtLocation(parent.name);
        return Boolean(symbol && addedSymbols.has(symbol));
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        parent.right === child
      ) {
        const left = parent.left;
        if (
          ts.isIdentifier(left) ||
          (ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword)
        ) {
          const symbol = checker.getSymbolAtLocation(left);
          return Boolean(symbol && addedSymbols.has(symbol));
        }
      }
      return false;
    }

    return {
      [ts.SyntaxKind.NewExpression](node: TS.NewExpression) {
        if (utils.derivesFromExcalibur(checker.getTypeAtLocation(node), ACTOR_BASES)) {
          actorNews.push(node);
        }
      },
      [ts.SyntaxKind.CallExpression]: recordAddCall,
      // returned to a caller — the caller owns it (factory callbacks are the dominant real-world shape)
      [ts.SyntaxKind.ReturnStatement](node: TS.ReturnStatement) {
        if (node.expression) markHandled(node.expression);
      },
      [ts.SyntaxKind.ArrowFunction](node: TS.ArrowFunction) {
        if (!ts.isBlock(node.body)) markHandled(node.body);
      },
      "exit:file"() {
        for (const node of actorNews) {
          if (addedNewNodes.has(node) || isTracked(node)) continue;
          report({
            ...utils.lineCol(sf, node),
            message: `new ${node.expression.getText(sf)}(...) is created but never added to a scene`,
            hint: "actors are not updated or drawn until added — call scene.add(...) (or this.add(...) inside a Scene), or remove it.",
          });
        }
      },
    };
  },
};
