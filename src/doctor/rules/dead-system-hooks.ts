import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * Excalibur v1 renamed the ECS System hooks (core 694877b3, not in the
 * CHANGELOG): `initialize`/`update`/`preupdate`/`postupdate` became
 * `onInitialize`/`onUpdate`/`onPreUpdate`/`onPostUpdate`. On v1 the
 * SystemManager calls only the new names — a subclass still defining the
 * old ones has dead hooks (`update` is also a compile error because the
 * abstract `onUpdate` is unimplemented; the other three are silent). Gated
 * on the INSTALLED excalibur's System declaring `onUpdate`, so 0.32 projects
 * stay quiet; `ex upgrade` performs the rename (system-lifecycle-hooks).
 */
const OLD_HOOKS: Record<string, string> = {
  initialize: "onInitialize",
  update: "onUpdate",
  preupdate: "onPreUpdate",
  postupdate: "onPostUpdate",
};

export const deadSystemHooks: Rule = {
  id: "dead-system-hooks",
  description: "a System subclass defines the pre-v1 hook names (update/preupdate/…) that v1 never calls",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    const SYSTEM = new Set(["System"]);

    /** excalibur's own System class type reached from a user class, or null. */
    const excaliburSystemType = (type: TS.Type, seen = new Set<TS.Type>()): TS.Type | null => {
      if (seen.has(type)) return null;
      seen.add(type);
      const target = ((type as TS.TypeReference).target ?? type) as TS.Type;
      const symbol = target.getSymbol();
      if (symbol && symbol.getName() === "System" && utils.isExcaliburSymbol(symbol)) return target;
      if (!target.isClassOrInterface()) return null;
      for (const base of checker.getBaseTypes(target) ?? []) {
        const found = excaliburSystemType(base, seen);
        if (found) return found;
      }
      return null;
    };

    return {
      [ts.SyntaxKind.ClassDeclaration](node: TS.ClassDeclaration) {
        if (!node.name) return;
        const symbol = checker.getSymbolAtLocation(node.name);
        if (!symbol) return;
        const type = checker.getDeclaredTypeOfSymbol(symbol);
        if (!utils.derivesFromExcalibur(type, SYSTEM)) return;
        const system = excaliburSystemType(type);
        if (!system || !checker.getPropertyOfType(system, "onUpdate")) return; // pre-v1 excalibur: the old names ARE the hooks
        for (const member of node.members) {
          if (!(ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member))) continue;
          if (!member.name || !ts.isIdentifier(member.name) || !Object.hasOwn(OLD_HOOKS, member.name.text)) continue;
          if (ts.canHaveModifiers(member) && ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue;
          const next = OLD_HOOKS[member.name.text]!;
          report({
            ...utils.lineCol(sf, member.name),
            message: `${member.name.text}() is never called by excalibur v1 — the System hook is ${next}()`,
            hint: `rename it to ${next} (ex upgrade's system-lifecycle-hooks migration does this); ${member.name.text === "update" ? "without onUpdate the class also fails to compile" : "the engine calls only the on-prefixed hooks"}.`,
          });
        }
      },
    };
  },
};
