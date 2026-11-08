/**
 * core 694877b3 "fix!: system lifecycles match rest of engine" — NOT in the
 * CHANGELOG. ECS `System` hooks gained the `on` prefix the rest of the engine
 * uses: `initialize` → `onInitialize`, `update` → `onUpdate`, `preupdate` →
 * `onPreUpdate`, `postupdate` → `onPostUpdate` (the new `dispose` keeps its
 * name). `SystemManager` calls only the new names, so a subclass that still
 * defines `update` fails to compile (abstract `onUpdate` missing) and its
 * `preupdate`/`postupdate` silently never run. Also hits subclasses of the
 * built-in systems (GraphicsSystem, PointerSystem, …) and every call site:
 * `super.update(...)`, `this.update(...)`, `system.update(...)`.
 */
import type * as TS from "typescript";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/commit/694877b3";

const HOOKS: Record<string, string> = {
  initialize: "onInitialize",
  update: "onUpdate",
  preupdate: "onPreUpdate",
  postupdate: "onPostUpdate",
};

export const systemLifecycleHooks: Migration = {
  id: "system-lifecycle-hooks",
  version: "1.0.0",
  promptType: "auto",
  title: "System lifecycle hooks are now onInitialize/onUpdate/onPreUpdate/onPostUpdate",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const SYSTEM = new Set(["System"]);
    const col = ctx.collector(this.id);
    const isSystemClass = (node: TS.ClassDeclaration): boolean => {
      if (!node.name) return false;
      const symbol = checker.getSymbolAtLocation(node.name);
      return Boolean(symbol) && utils.derivesFromExcalibur(checker.getDeclaredTypeOfSymbol(symbol!), SYSTEM);
    };
    const isStatic = (member: TS.ClassElement): boolean =>
      Boolean(ts.canHaveModifiers(member) && ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword));
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isClassDeclaration(node) && isSystemClass(node)) {
          const declared = new Set(
            node.members.map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : null)).filter((n): n is string => n !== null)
          );
          for (const member of node.members) {
            if (!(ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member))) continue;
            if (!member.name || !ts.isIdentifier(member.name) || !Object.hasOwn(HOOKS, member.name.text) || isStatic(member)) continue;
            const next = HOOKS[member.name.text]!;
            if (declared.has(next)) {
              col.addManual(sf, member.name, `${member.name.text}() is never called by v1 (the hook is ${next}, which this class also defines) — merge or delete it`, V1);
            } else {
              col.addEdit(sf, { start: member.name.getStart(sf), end: member.name.end }, next, `System.${member.name.text} -> ${next}`);
            }
          }
        } else if (ts.isPropertyAccessExpression(node) && Object.hasOwn(HOOKS, node.name.text)) {
          // `this.update(...)`, `super.update(...)`, `system.update(...)` — the receiver must be a System.
          const receiver = node.expression;
          const onSystem =
            receiver.kind === ts.SyntaxKind.SuperKeyword || receiver.kind === ts.SyntaxKind.ThisKeyword
              ? utils.enclosingExcaliburClass(node, SYSTEM) !== null
              : utils.derivesFromExcalibur(checker.getTypeAtLocation(receiver), SYSTEM);
          if (onSystem) {
            col.addEdit(sf, { start: node.name.getStart(sf), end: node.name.end }, HOOKS[node.name.text]!, `.${node.name.text} -> .${HOOKS[node.name.text]}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} System hook rename(s)${extra}`;
  },
};
