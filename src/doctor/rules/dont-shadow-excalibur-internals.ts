import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
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
 * intended API, and so is an accessor overriding a base *accessor* (it can
 * delegate with super.x, e.g. Entity's isAdded/isInitialized/scene getters).
 * One more escape hatch, narrowly scoped: an `on[A-Z]…` field initialized
 * with an arrow/function expression that shadows a base *method* (e.g.
 * `onPostUpdate = (engine, elapsed) => {...}`) — excalibur's own lifecycle
 * hooks all follow that naming convention and are dispatched via
 * `this.onX(...)`, so the initialized instance field wins and works exactly
 * like a method override. This does NOT extend to non-hook methods like
 * `kill`, whose base implementation does real bookkeeping (removing the
 * entity from its scene) that a same-named field silently discards — only
 * the `on*` naming convention marks a method as an intentional override
 * point, so a field named e.g. `kill` still flags.
 * What always flags:
 *  - any field: under ES2022 class-field semantics even a bare
 *    `isActive: boolean` defines `undefined` on the instance after super();
 *  - an accessor over a base *field* (like Entity.isActive): super.x resolves
 *    through the prototype chain and never sees instance fields, and the base
 *    ctor's own `this.isActive = true` hits the shadowing setter (or throws
 *    on a getter-only pair) — "calling the appropriate super" cannot fix it.
 * TS's `declare` modifier is emit-free retyping and is skipped. The excalibur
 * member is found through the checker's inherited-property lookup, so shadows
 * are caught any number of user subclasses away from the excalibur base.
 */
/**
 * Only classes the engine *manages* are checked — Entity (actors, UI), Scene,
 * Engine — because that's where shadowed state corrupts engine bookkeeping.
 * Verified on a real project: GameEvent subclasses narrowing `target` via
 * `constructor(public target: …)` are the idiomatic typed-event pattern and
 * produced 12 noise findings before this scope was added.
 */
const SHADOW_SCOPES = new Set(["Entity", "Scene", "Engine"]);

export const dontShadowExcaliburInternals: Rule = {
  id: "dont-shadow-excalibur-internals",
  description: "a class member shadows a built-in excalibur member",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;

    type ShadowMember =
      | TS.PropertyDeclaration
      | TS.GetAccessorDeclaration
      | TS.SetAccessorDeclaration
      | TS.ParameterPropertyDeclaration;

    function memberName(node: ShadowMember): string | null {
      if (!node.name) return null;
      if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
      return null; // computed / private #names can't shadow
    }

    function hasModifier(node: ShadowMember, kind: number): boolean {
      const modifiers = (node as { modifiers?: readonly TS.ModifierLike[] }).modifiers;
      return (modifiers ?? []).some((m) => m.kind === kind);
    }

    /** The excalibur class that declares `symbol`, for the message. */
    function declaringClassName(symbol: TS.Symbol): string {
      for (const decl of symbol.getDeclarations?.() ?? []) {
        const parent = decl.parent;
        if (parent && (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) && parent.name) {
          return parent.name.text;
        }
      }
      return "excalibur";
    }

    function checkClass(node: TS.ClassDeclaration): void {
      if (!node.name || !node.heritageClauses?.length) return;
      const classSymbol = checker.getSymbolAtLocation(node.name);
      if (!classSymbol) return;
      const type = checker.getDeclaredTypeOfSymbol(classSymbol);
      if (!type.isClassOrInterface()) return;
      if (!utils.derivesFromExcalibur(type, SHADOW_SCOPES)) return;
      const baseType = (checker.getBaseTypes(type) ?? [])[0];
      if (!baseType) return;

      const shadowing: ShadowMember[] = [];
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
          shadowing.push(member);
        } else if (ts.isConstructorDeclaration(member)) {
          for (const param of member.parameters) {
            if (ts.isParameterPropertyDeclaration(param, member)) shadowing.push(param);
          }
        }
      }

      const seen = new Set<string>();
      for (const member of shadowing) {
        if (hasModifier(member, ts.SyntaxKind.StaticKeyword)) continue;
        if (hasModifier(member, ts.SyntaxKind.DeclareKeyword)) continue; // emit-free retyping
        const name = memberName(member);
        if (!name || seen.has(name)) continue; // one finding per name (get/set pairs)
        seen.add(name);
        // Inherited-property lookup on the direct base covers the whole chain.
        const baseProp = checker.getPropertyOfType(baseType, name);
        if (!baseProp || !utils.isExcaliburSymbol(baseProp)) continue;
        // Accessor over accessor is a legal prototype-level override (can
        // call super.x) — same policy as methods. Fields never get this
        // pass, and neither does an accessor over a base field.
        const memberIsAccessor = ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member);
        const baseIsAccessor = (baseProp.getDeclarations?.() ?? []).some(
          (d) => ts.isGetAccessor(d) || ts.isSetAccessor(d)
        );
        if (memberIsAccessor && baseIsAccessor) continue;
        // An on[A-Z]-named field initialized with a function expression that
        // shadows a base *method* is a functional lifecycle-hook override
        // (arrow-fn style), not the isActive-style undefined-after-super()
        // footgun — see the file doc comment for why this doesn't extend to
        // non-hook methods like `kill`.
        const initializerIsFunctionLike =
          ts.isPropertyDeclaration(member) &&
          /^on[A-Z]/.test(name) &&
          member.initializer &&
          (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer));
        const baseIsMethod = (baseProp.getDeclarations?.() ?? []).some(
          (d) => ts.isMethodDeclaration(d) || ts.isMethodSignature(d)
        );
        if (initializerIsFunctionLike && baseIsMethod) continue;
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
