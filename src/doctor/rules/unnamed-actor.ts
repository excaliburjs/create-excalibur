import { ACTOR_BASES } from "../type-utils.ts";
import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";

/**
 * Flag actors that never get a name: (a) Actor-derived class declarations
 * whose super({...}) omits `name` (with `this.name = …` in the ctor as an
 * escape hatch), and (b) direct instantiations of excalibur-declared classes
 * (new Actor/Label/ScreenElement) without a `name` option.
 *
 * Double-flag avoidance is structural: (b) fires only for excalibur-declared
 * classes, so a user subclass problem is reported exactly once, at its
 * declaration. Can't-prove cases are skipped, never guessed: forwarding ctors
 * (`super(args)`), spreads in the options literal, classes with no ctor.
 */
export const unnamedActor: Rule = {
  id: "unnamed-actor",
  description: "an Actor is constructed without a name",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;

    const hint =
      'named actors are much easier to debug (shown in dev tools and debug output) — add name: "..." to the options.';

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

    function literalHasName(objLit: TS.ObjectLiteralExpression): boolean {
      return objLit.properties.some(
        (p) =>
          (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
          ts.isIdentifier(p.name) &&
          p.name.text === "name"
      );
    }

    function literalHasSpread(objLit: TS.ObjectLiteralExpression): boolean {
      return objLit.properties.some((p) => ts.isSpreadAssignment(p));
    }

    function assignsThisName(body: TS.Node): boolean {
      let found = false;
      const visit = (node: TS.Node): void => {
        if (found) return;
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
          node.left.name.text === "name"
        ) {
          found = true;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(body);
      return found;
    }

    function findSuperCall(body: TS.Node): TS.CallExpression | null {
      let superCall: TS.CallExpression | null = null;
      const visit = (node: TS.Node): void => {
        if (superCall) return;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.SuperKeyword) {
          superCall = node;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(body);
      return superCall;
    }

    function checkClass(node: TS.ClassDeclaration): void {
      if (!node.name) return;
      const symbol = checker.getSymbolAtLocation(node.name);
      if (!symbol) return;
      if (!utils.derivesFromExcalibur(checker.getDeclaredTypeOfSymbol(symbol), ACTOR_BASES)) return;
      const ctor = node.members.find(
        (m): m is TS.ConstructorDeclaration => ts.isConstructorDeclaration(m) && Boolean(m.body)
      );
      if (!ctor) return; // inherited ctor can pass name through — can't prove
      const superCall = findSuperCall(ctor.body!);
      if (!superCall) return; // missing super() is a TS error, not ours
      const first = superCall.arguments.length > 0 ? unwrap(superCall.arguments[0]) : null;
      let missing = false;
      if (!first) {
        missing = true;
      } else if (ts.isObjectLiteralExpression(first)) {
        if (literalHasSpread(first) || literalHasName(first)) return;
        missing = true;
      } else {
        return; // forwarding ctor — can't prove
      }
      if (missing && !assignsThisName(ctor.body!)) {
        report({
          ...utils.lineCol(sf, node.name),
          message: `${node.name.text} extends an Actor but never sets a name`,
          hint,
        });
      }
    }

    function checkNew(node: TS.NewExpression): void {
      const type = checker.getTypeAtLocation(node);
      const reference = type as TS.TypeReference;
      const target = reference.target && reference.target !== type ? reference.target : type;
      const symbol = target.getSymbol();
      // Only excalibur-declared classes here — user subclasses report at their declaration.
      if (!symbol || !utils.isExcaliburSymbol(symbol)) return;
      if (!utils.derivesFromExcalibur(type, ACTOR_BASES)) return;
      const first = node.arguments && node.arguments.length > 0 ? unwrap(node.arguments[0]) : null;
      if (first) {
        if (!ts.isObjectLiteralExpression(first)) return; // can't prove
        if (literalHasSpread(first) || literalHasName(first)) return;
      }
      report({
        ...utils.lineCol(sf, node),
        message: `new ${node.expression.getText(sf)}(...) has no name`,
        hint,
      });
    }

    return {
      [ts.SyntaxKind.ClassDeclaration]: checkClass,
      [ts.SyntaxKind.NewExpression]: checkNew,
    };
  },
};
