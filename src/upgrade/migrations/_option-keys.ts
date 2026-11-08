/**
 * Factory for object-literal KEY renames resolved through the literal's
 * CONTEXTUAL type: the old key must be excalibur's and declared inside one of
 * the named option types (DebugConfig's z-index map also has a `solid` key —
 * that one survives, hence the owner gate). Shorthand `{ visible }` →
 * `isVisible: visible`; quoted keys keep their quotes. Catches
 * `super({ visible })` in a subclass, `const o: ActorOptions = {...}`, and
 * nested option literals — anything the checker gives a contextual type.
 */
import type * as TS from "typescript";
import { declaringTypeName } from "./_resolve.ts";
import type { AutoMigration, CheckResult, UpgradeContext } from "../types.ts";

export interface OptionKeyRename {
  key: string;
  to: string;
  /** the excalibur option interfaces / type aliases that declare the key */
  owners: ReadonlySet<string>;
}

export function optionKeyRenameMigration({
  id,
  version,
  removedIn,
  title,
  link,
  keys,
}: {
  id: string;
  version: string;
  removedIn?: string;
  title: string;
  link?: string | null;
  keys: OptionKeyRename[];
}): AutoMigration {
  return {
    id,
    version,
    ...(removedIn ? { removedIn } : {}),
    promptType: "auto",
    title,
    link,
    check(ctx: UpgradeContext) {
      const { ts, checker, utils } = ctx;
      const col = ctx.collector(id);
      const keyOf = (prop: TS.ObjectLiteralElementLike): { name: string; node: TS.Node; shorthand: boolean; quote: string } | null => {
        if (ts.isShorthandPropertyAssignment(prop)) return { name: prop.name.text, node: prop.name, shorthand: true, quote: "" };
        if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) return { name: prop.name.text, node: prop.name, shorthand: false, quote: "" };
        if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.name)) {
          return { name: prop.name.text, node: prop.name, shorthand: false, quote: prop.name.getText()[0]! };
        }
        return null;
      };
      for (const { sf } of ctx.files) {
        const visit = (node: TS.Node): void => {
          if (ts.isObjectLiteralExpression(node)) {
            let contextual: TS.Type | undefined;
            for (const prop of node.properties) {
              const key = keyOf(prop);
              const target = key && keys.find((k) => k.key === key.name);
              if (!key || !target) continue;
              contextual ??= checker.getContextualType(node);
              if (!contextual) continue;
              const constituents = contextual.isUnion() ? contextual.types : [contextual];
              const symbol = constituents.map((t) => checker.getPropertyOfType(t, key.name)).find(Boolean);
              if (!symbol || !utils.isExcaliburSymbol(symbol) || !target.owners.has(declaringTypeName(ctx, symbol) ?? "")) continue;
              if (node.properties.some((p) => p !== prop && keyOf(p)?.name === target.to)) {
                // both spellings present (Slide({ easing, easingFunction }) — the old one was the effective key): a rename would duplicate the key
                col.addManual(sf, prop, `${key.name} was renamed ${target.to} in v1 and this literal already has a ${target.to} key — keep one (the ${key.name} value was the one in effect)`, link);
                continue;
              }
              const replacement = key.shorthand ? `${target.to}: ${key.name}` : `${key.quote}${target.to}${key.quote}`;
              col.addEdit(sf, { start: key.node.getStart(sf), end: key.node.end }, replacement, `${key.name} -> ${target.to}`);
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
      return col.result();
    },
    prompt(result: CheckResult) {
      return `${result.edits.length} option key(s) to rename`;
    },
  };
}
