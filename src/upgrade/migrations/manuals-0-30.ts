import type * as TS from "typescript";
import { manualMigration } from "./_manual.ts";
import { excaliburNameOf } from "./_resolve.ts";

const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/** `ex.Physics.*` configuration statics were removed — configure via `new Engine({physics})`. */
export const physicsStatics = manualMigration({
  id: "physics-statics",
  version: "0.30.0",
  title: "ex.Physics.* statics were removed — configure physics in the Engine constructor",
  link: V030,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const symbol = checker.getSymbolAtLocation(node.expression);
          const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          if (resolved?.getName() === "Physics" && utils.isExcaliburSymbol(resolved)) {
            col.addManual(sf, node, "Physics statics were removed — move this into new Engine({ physics: { ... } })", V030);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** Collision events now always target ex.Collider, never ex.Entity. */
export const collisionEventTarget = manualMigration({
  id: "collision-event-target",
  version: "0.30.0",
  title: "collision events now target Collider (was sometimes Entity)",
  link: V030,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const ENTITY = new Set(["Entity"]);
    const COLLIDER = new Set(["Collider"]);
    const HOOKS = new Set(["onCollisionStart", "onCollisionEnd", "onPreCollisionResolve", "onPostCollisionResolve"]);
    const EVENTS = new Set(["collisionstart", "collisionend", "precollision", "postcollision", "collisionpresolve", "collisionpostsolve"]);
    /**
     * Code the change cannot affect: a handler that ignores the event entirely (zero params — breakout's
     * `ball.on("collisionend", () => { colliding = false })`), a Collider-typed parameter, or a body that reads `.owner`.
     */
    const alreadyColliderAware = (fn: TS.SignatureDeclaration & { body?: TS.Node }): boolean => {
      if (fn.parameters.length === 0) return true;
      if (fn.parameters.some((p) => utils.derivesFromExcalibur(checker.getTypeAtLocation(p), COLLIDER))) return true;
      let readsOwner = false;
      const walk = (n: TS.Node): void => {
        if (readsOwner) return;
        if (ts.isPropertyAccessExpression(n) && n.name.text === "owner") readsOwner = true;
        else ts.forEachChild(n, walk);
      };
      if (fn.body) walk(fn.body);
      return readsOwner;
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isMethodDeclaration(node) &&
          node.name &&
          ts.isIdentifier(node.name) &&
          HOOKS.has(node.name.text) &&
          (node.body?.statements.length ?? 0) > 0 &&
          utils.enclosingExcaliburClass(node, ENTITY) &&
          !alreadyColliderAware(node)
        ) {
          col.addManual(sf, node.name, "collision hooks now receive Collider participants — read .owner for the entity", V030);
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          const first = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
          const handler = node.arguments?.length > 1 ? utils.unwrap(node.arguments[1]!) : null;
          const handlerAware = !!handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) && alreadyColliderAware(handler);
          if ((method === "on" || method === "once") && first && ts.isStringLiteral(first) && EVENTS.has(first.text) && !handlerAware) {
            col.addManual(sf, node, `"${first.text}" events now target Collider — read .owner for the entity`, V030);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** System.priority became static in 0.30. */
export const systemPriorityStatic = manualMigration({
  id: "system-priority-static",
  version: "0.30.0",
  title: "System.priority is now static",
  link: V030,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const SYSTEM = new Set(["System"]);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isClassDeclaration(node) && node.name) {
          const symbol = checker.getSymbolAtLocation(node.name);
          if (symbol && utils.derivesFromExcalibur(checker.getDeclaredTypeOfSymbol(symbol), SYSTEM)) {
            for (const member of node.members) {
              if (
                ts.isPropertyDeclaration(member) &&
                member.name &&
                ts.isIdentifier(member.name) &&
                member.name.text === "priority" &&
                !(member.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
              ) {
                col.addManual(sf, member.name, "System.priority must be static in 0.30+ — add the static keyword", V030);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** Trigger API changed: action receives the entity; target now composes with filter. */
export const triggerApi = manualMigration({
  id: "trigger-api",
  version: "0.30.0",
  title: "Trigger API changed (action signature, target vs filter)",
  link: V030,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node)) {
          const symbol = (checker.getTypeAtLocation(node)?.symbol ?? null);
          // Only a literal carrying `target` changed meaning (it used to REPLACE filter, now it works with it);
          // a zero-arg `action` still compiles and runs. Anything else is already the 0.30 shape.
          const options = node.arguments?.length ? utils.unwrap(node.arguments[0]!) : null;
          const hasTarget = !!options && ts.isObjectLiteralExpression(options) && options.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "target");
          if (symbol?.getName() === "Trigger" && utils.isExcaliburSymbol(symbol) && hasTarget) {
            col.addManual(
              sf,
              node,
              "Trigger changed in 0.30: action now receives the triggering entity, and target works WITH filter instead of replacing it",
              V030
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** Behavioral: Vector.normalize() of a zero vector now returns (0,0), was (0,1). */
export const vectorNormalizeZero = manualMigration({
  id: "vector-normalize-zero",
  version: "0.30.0",
  promptType: "notification",
  title: "Vector.normalize() on a zero vector now returns (0,0) (was (0,1))",
  link: V030,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const VECTOR = new Set(["Vector"]);
    let count = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "normalize" &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), VECTOR)
        ) {
          count++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (count > 0) {
      col.addNote(
        `normalize() is called ${count} time(s): since 0.30 a zero-magnitude vector normalizes to (0,0) instead of (0,1) — audit any code relying on the old fallback direction.`
      );
    }
  },
});

/**
 * `ActorArgs` (0.29: a plain interface) became `ColliderArgs & {…}` in 0.30 —
 * a UNION over the three collider shapes (width/height | radius | collider).
 * Two things stop type-checking that a rename cannot fix: an `interface X
 * extends ActorArgs` (TS2312, an interface can only extend an object type)
 * and spreading an ActorArgs-typed value into a literal that ALSO sets
 * collider keys (the discriminant collapses to `undefined` — jelly-jumper had
 * 23 of its 48 residual v1 errors here). Breadcrumb both; the rename itself
 * is actor-args-to-options' job.
 */
const ACTOR_OPTION_TYPES = new Set(["ActorArgs", "ActorOptions"]);
const COLLIDER_KEYS = new Set(["width", "height", "radius", "collider"]);

export const actorOptionsUnion = manualMigration({
  id: "actor-options-union",
  version: "0.30.0",
  title: "ActorArgs/ActorOptions is a union type since 0.30 — interfaces cannot extend it, and spreading it next to width/height/radius/collider fails to type-check",
  link: V030,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    /** Is the expression's type excalibur's ActorArgs/ActorOptions (alias or interface)? */
    const isActorOptionsType = (expr: TS.Expression): boolean => {
      const type = checker.getTypeAtLocation(expr);
      const symbol = type.aliasSymbol ?? type.getSymbol();
      return !!symbol && utils.isExcaliburSymbol(symbol) && ACTOR_OPTION_TYPES.has(symbol.getName());
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isInterfaceDeclaration(node)) {
          for (const clause of node.heritageClauses ?? []) {
            for (const type of clause.types) {
              const name = excaliburNameOf(ctx, type.expression);
              if (name && ACTOR_OPTION_TYPES.has(name)) {
                col.addManual(sf, node.name, `${name} is a union type (ColliderArgs & {…}) since 0.30 — an interface cannot extend it: write \`type ${node.name.text} = ActorOptions & { … }\``, V030);
              }
            }
          }
        } else if (ts.isObjectLiteralExpression(node)) {
          const setsColliderKey = node.properties.some((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && COLLIDER_KEYS.has(p.name.text));
          if (setsColliderKey) {
            for (const prop of node.properties) {
              if (ts.isSpreadAssignment(prop) && isActorOptionsType(prop.expression)) {
                col.addManual(sf, prop, "spreading ActorOptions into a literal that also sets width/height/radius/collider fails the ColliderArgs union since 0.30 — put the collider keys inside the spread value, or build the options with an explicit `as ActorOptions`", V030);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});
