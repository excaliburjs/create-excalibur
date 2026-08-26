/**
 * Flag class members that redeclare a member excalibur already defines on the
 * base chain — e.g. `public isActive: boolean` on a ScreenElement subclass.
 * `isActive` is Entity's liveness flag: the EntityManager removes any entity
 * with isActive === false at end of frame, so the shadow silently kills the
 * entity (found the hard way; `isAdded`/`isInitialized`/`scene` are the same
 * class of footgun).
 *
 * Only *fields*, *accessors*, and constructor *parameter properties* flag —
 * method overrides (onInitialize, onPreUpdate, onAdd…) are excalibur's
 * intended API. A field is dangerous even without an initializer: under
 * ES2022 class-field semantics a bare `isActive: boolean` defines
 * `undefined` on the instance after super() ran. TS's `declare` modifier is
 * emit-free retyping and is skipped. The excalibur member is found through
 * the checker's inherited-property lookup, so shadows are caught any number
 * of user subclasses away from the excalibur base.
 */
/**
 * Only classes the engine *manages* are checked — Entity (actors, UI), Scene,
 * Engine — because that's where shadowed state corrupts engine bookkeeping.
 * Verified on a real project: GameEvent subclasses narrowing `target` via
 * `constructor(public target: …)` are the idiomatic typed-event pattern and
 * produced 12 noise findings before this scope was added.
 */
const SHADOW_SCOPES = new Set(["Entity", "Scene", "Engine"]);

export const dontShadowExcaliburInternals = {
  id: "dont-shadow-excalibur-internals",
  description: "a class member shadows a built-in excalibur member",
  create(ctx, sf) {
    const { ts, checker, utils, report } = ctx;

    function memberName(node) {
      if (!node.name) return null;
      if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
      return null; // computed / private #names can't shadow
    }

    function hasModifier(node, kind) {
      return (node.modifiers ?? []).some((m) => m.kind === kind);
    }

    /** The excalibur class that declares `symbol`, for the message. */
    function declaringClassName(symbol) {
      for (const decl of symbol.getDeclarations?.() ?? []) {
        const parent = decl.parent;
        if (parent && (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) && parent.name) {
          return parent.name.text;
        }
      }
      return "excalibur";
    }

    function checkClass(node) {
      if (!node.name || !node.heritageClauses?.length) return;
      const classSymbol = checker.getSymbolAtLocation(node.name);
      if (!classSymbol) return;
      const type = checker.getDeclaredTypeOfSymbol(classSymbol);
      if (!type?.isClassOrInterface?.()) return;
      if (!utils.derivesFromExcalibur(type, SHADOW_SCOPES)) return;
      const baseType = (checker.getBaseTypes(type) ?? [])[0];
      if (!baseType) return;

      const shadowing = [];
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
          shadowing.push(member);
        } else if (ts.isConstructorDeclaration(member)) {
          for (const param of member.parameters) {
            if (ts.isParameterPropertyDeclaration(param, member)) shadowing.push(param);
          }
        }
      }

      const seen = new Set();
      for (const member of shadowing) {
        if (hasModifier(member, ts.SyntaxKind.StaticKeyword)) continue;
        if (hasModifier(member, ts.SyntaxKind.DeclareKeyword)) continue; // emit-free retyping
        const name = memberName(member);
        if (!name || seen.has(name)) continue; // one finding per name (get/set pairs)
        seen.add(name);
        // Inherited-property lookup on the direct base covers the whole chain.
        const baseProp = checker.getPropertyOfType(baseType, name);
        if (!baseProp || !utils.isExcaliburSymbol(baseProp)) continue;
        const owner = declaringClassName(baseProp);
        report({
          ...utils.lineCol(sf, member.name ?? member),
          message: `${node.name.text}.${name} shadows excalibur's ${owner}.${name}`,
          hint: `the engine reads this at runtime (isActive === false makes the EntityManager remove the entity) — rename the member, or assign to the inherited one instead of redeclaring it.`,
        });
      }
    }

    return {
      [ts.SyntaxKind.ClassDeclaration]: checkClass,
    };
  },
};
