/**
 * Checker-based classification shared by the doctor rules. Modeled on
 * typescript-eslint's type-utils (TypeOrValueSpecifier / builtinSymbolLikes):
 * class identity is symbol name + declaration provenance, never name alone,
 * and derivation walks checker.getBaseTypes() recursively — tse's shallow
 * typeIsOrHasBaseType misses `class Boss extends Monster extends Actor`.
 */

/** Actor-derivation root. Label/ScreenElement extend Actor in the .d.ts, so they classify transitively. */
export const ACTOR_BASES = new Set(["Actor"]);
/** Receivers whose .add()/.addChild() counts as adding to the scene graph. Entity covers addChild. */
export const ADD_RECEIVERS = new Set(["Scene", "Engine", "Actor", "Entity"]);

export function createTypeUtils(ts, checker, program) {
  /**
   * Does this symbol's class come from the excalibur package? Checks every
   * declaration (declaration merging → plural): either a file TS resolved out
   * of node_modules/excalibur (testing the *resolved* declaration file is what
   * makes pnpm/hoisted layouts a non-issue), or an ambient
   * `declare module "excalibur"` block.
   */
  function isExcaliburSymbol(symbol) {
    for (const decl of symbol?.getDeclarations?.() ?? []) {
      const sf = decl.getSourceFile();
      if (
        program.isSourceFileFromExternalLibrary(sf) &&
        sf.fileName.includes("/node_modules/excalibur/")
      ) {
        return true;
      }
      for (let node = decl.parent; node; node = node.parent) {
        if (
          ts.isModuleDeclaration(node) &&
          ts.isStringLiteral(node.name) &&
          node.name.text === "excalibur"
        ) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Does `type` derive (at any depth) from an excalibur class named in
   * `nameSet`? Recursive base-type walk in the isBuiltinSymbolLike style:
   * any/unknown/error bail false, union/intersection constituents use .some()
   * polarity, type parameters unwrap to their constraint, and generic
   * instantiations compare the type-reference target's symbol.
   */
  function derivesFromExcalibur(type, nameSet, seen = new Set()) {
    if (!type || seen.has(type)) return false;
    seen.add(type);
    if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
    if (type.isUnion?.() || type.isIntersection?.()) {
      return type.types.some((t) => derivesFromExcalibur(t, nameSet, seen));
    }
    if (type.isTypeParameter?.()) {
      return derivesFromExcalibur(checker.getBaseConstraintOfType(type), nameSet, seen);
    }
    const target = type.target && type.target !== type ? type.target : type;
    const symbol = target.getSymbol?.();
    if (!symbol) return false;
    if (nameSet.has(symbol.getName()) && isExcaliburSymbol(symbol)) return true;
    if (!target.isClassOrInterface?.()) return false;
    return (checker.getBaseTypes(target) ?? []).some((base) =>
      derivesFromExcalibur(base, nameSet, seen)
    );
  }

  /** 1-based position of a node, for findings. */
  function lineCol(sf, node) {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { line: line + 1, column: character + 1 };
  }

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

  /**
   * Does any link of a property/element chain (`this.engine.screen.events` →
   * this, this.engine, this.engine.screen, …) have a type deriving from one
   * of `nameSet`? Used to classify receivers by what they hang off of.
   */
  function chainContainsType(expr, nameSet) {
    let node = unwrap(expr);
    while (node) {
      if (derivesFromExcalibur(checker.getTypeAtLocation(node), nameSet)) return true;
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        node = unwrap(node.expression);
      } else {
        break;
      }
    }
    return false;
  }

  /** Innermost class declaration containing `node` whose type derives from `nameSet`, or null. */
  function enclosingExcaliburClass(node, nameSet) {
    for (let cur = node.parent; cur; cur = cur.parent) {
      if (ts.isClassDeclaration(cur) && cur.name) {
        const symbol = checker.getSymbolAtLocation(cur.name);
        if (symbol && derivesFromExcalibur(checker.getDeclaredTypeOfSymbol(symbol), nameSet)) {
          return cur;
        }
      }
    }
    return null;
  }

  return { isExcaliburSymbol, derivesFromExcalibur, lineCol, unwrap, chainContainsType, enclosingExcaliburClass };
}
