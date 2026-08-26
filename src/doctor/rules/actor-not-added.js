import { ACTOR_BASES, ADD_RECEIVERS } from "../type-utils.js";

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
 * the same file. Everything else — passed to a helper, returned, pushed into
 * an array, exported — flags (accepted false-positive posture). No flow
 * ordering: an add anywhere in the file counts.
 */
export const actorNotAdded = {
  id: "actor-not-added",
  description: "an Actor is constructed but never added to a scene",
  create(ctx, sf) {
    const { ts, checker, utils, report } = ctx;
    const actorNews = [];
    const addedNewNodes = new Set();
    const addedSymbols = new Set();

    /** Strip parens, as/satisfies, non-null. */
    function unwrap(node) {
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

    function recordAddCall(node) {
      const callee = unwrap(node.expression);
      if (!ts.isPropertyAccessExpression(callee)) return;
      const method = callee.name.text;
      if (method !== "add" && method !== "addChild") return;
      const receiver = unwrap(callee.expression);
      if (!utils.derivesFromExcalibur(checker.getTypeAtLocation(receiver), ADD_RECEIVERS)) return;
      for (const arg of node.arguments ?? []) {
        const value = unwrap(arg);
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
    }

    /**
     * Walk up through the wrapper set no-floating-promises treats as
     * transparent (parens, as/satisfies, ternary branches, &&/||/??, the
     * value side of a comma) to the first meaningful parent.
     */
    function meaningfulParent(node) {
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

    function isTracked(newExpr) {
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
      [ts.SyntaxKind.NewExpression](node) {
        if (utils.derivesFromExcalibur(checker.getTypeAtLocation(node), ACTOR_BASES)) {
          actorNews.push(node);
        }
      },
      [ts.SyntaxKind.CallExpression]: recordAddCall,
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
