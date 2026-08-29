/**
 * Factory for typed-receiver member renames — the workhorse migration shape:
 * `.old` → `.new` only when the receiver's type derives from the given
 * excalibur classes (so `.goto` on a router object never renames).
 *
 * `members` maps oldName → newName. With `callToAccessor`, a zero-arg call
 * `x.getGlobalPos()` collapses to the accessor `x.globalPos` (non-zero-arg
 * or non-call uses get a breadcrumb instead of a guess).
 */
import type * as TS from "typescript";
import type { AutoMigration, CheckResult, UpgradeContext } from "../types.ts";

export function memberRenameMigration({
  id,
  version,
  title,
  link,
  receivers,
  members,
  callToAccessor = false,
}: {
  id: string;
  version: string;
  title: string;
  link?: string | null;
  receivers: ReadonlySet<string>;
  members: Record<string, string>;
  callToAccessor?: boolean;
}): AutoMigration {
  return {
    id,
    version,
    promptType: "auto",
    title,
    link,
    check(ctx: UpgradeContext) {
      const { ts, checker, utils } = ctx;
      const col = ctx.collector(id);
      for (const { sf } of ctx.files) {
        const visit = (node: TS.Node): void => {
          if (
            ts.isPropertyAccessExpression(node) &&
            Object.hasOwn(members, node.name.text) &&
            utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), receivers)
          ) {
            const replacement = members[node.name.text]!;
            if (callToAccessor) {
              const call = node.parent;
              if (ts.isCallExpression(call) && call.expression === node && (call.arguments?.length ?? 0) === 0) {
                col.addEdit(
                  sf,
                  { start: node.name.getStart(sf), end: call.end },
                  replacement,
                  `${node.name.text}() -> ${replacement}`
                );
              } else {
                col.addManual(sf, node, `${node.name.text} was replaced by the ${replacement} accessor`, link);
              }
            } else {
              col.addEdit(
                sf,
                { start: node.name.getStart(sf), end: node.name.end },
                replacement,
                `${node.name.text} -> ${replacement}`
              );
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
      return `${result.edits.length} rename(s)${extra}`;
    },
  };
}
