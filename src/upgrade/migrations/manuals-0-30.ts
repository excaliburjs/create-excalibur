import type * as TS from "typescript";
import type { Collector, ManualMigration, CheckResult, UpgradeContext } from "../types.ts";

const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/** Shared shape for breadcrumb-only migrations: find sites, flag them, never edit. */
function manualMigration({
  id,
  version,
  title,
  link,
  promptType = "manual",
  findSites,
}: {
  id: string;
  version: string;
  title: string;
  link?: string | null;
  promptType?: "manual" | "notification";
  findSites(ctx: UpgradeContext, col: Collector): void;
}): ManualMigration {
  return {
    id,
    version,
    promptType,
    title,
    link,
    check(ctx: UpgradeContext) {
      const col = ctx.collector(id);
      findSites(ctx, col);
      return col.result();
    },
    prompt(result: CheckResult) {
      if (result.manual.length > 0) return `${result.manual.length} site(s) to review by hand`;
      return result.notes[0] ?? "review required";
    },
  };
}

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
    const { ts, utils } = ctx;
    const ENTITY = new Set(["Entity"]);
    const HOOKS = new Set(["onCollisionStart", "onCollisionEnd", "onPreCollisionResolve", "onPostCollisionResolve"]);
    const EVENTS = new Set(["collisionstart", "collisionend", "precollision", "postcollision", "collisionpresolve", "collisionpostsolve"]);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isMethodDeclaration(node) &&
          node.name &&
          ts.isIdentifier(node.name) &&
          HOOKS.has(node.name.text) &&
          (node.body?.statements.length ?? 0) > 0 &&
          utils.enclosingExcaliburClass(node, ENTITY)
        ) {
          col.addManual(sf, node.name, "collision hooks now receive Collider participants — read .owner for the entity", V030);
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          const first = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
          if ((method === "on" || method === "once") && first && ts.isStringLiteral(first) && EVENTS.has(first.text)) {
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
          if (symbol?.getName() === "Trigger" && utils.isExcaliburSymbol(symbol)) {
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
