/**
 * Factory for EXPORT renames — `Pool` → `ArenaPool`, `Shape` → `Colliders`,
 * `EnterViewPortEvent` → `EnterViewportEvent`: the name of an excalibur
 * export changed, so every site that names it changes with it: import
 * specifiers (`replaceImportSpecifier` dedupes against an already-imported
 * new name), `ex.Old` namespace accesses, type references, `new Old(...)`,
 * `extends Old`, `Old.Static` accesses. Resolution is by SYMBOL: an
 * identifier only renames when it resolves to excalibur's export of that
 * name, so a user's own `Pool` class is untouched. Local import aliases
 * (`import { Pool as P }`) rename the imported name and leave `P` alone.
 *
 * `staticMembers` covers key renames on an exported const/enum
 * (`ActorEvents.EnterViewPort` → `.EnterViewport`), resolved on the owner.
 * `manualOnNew` turns `new Old(...)` into a breadcrumb instead of a rename —
 * for renames whose replacement has a different constructor (`new
 * WebAudioInstance(buffer)` vs `SoundTrack`'s three-argument one).
 */
import type * as TS from "typescript";
import { excaliburSymbolOf } from "./_resolve.ts";
import type { AutoMigration, CheckResult, UpgradeContext } from "../types.ts";

export function exportRenameMigration({
  id,
  version,
  removedIn,
  title,
  link,
  renames,
  staticMembers = {},
  manualOnNew,
}: {
  id: string;
  version: string;
  removedIn?: string;
  title: string;
  link?: string | null;
  /** old export name → new export name */
  renames: Record<string, string>;
  /** owner export name → { old member → new member } */
  staticMembers?: Record<string, Record<string, string>>;
  /** message for `new Old(...)` sites when the replacement's constructor differs (breadcrumb instead of rename) */
  manualOnNew?: string;
}): AutoMigration {
  return {
    id,
    version,
    ...(removedIn ? { removedIn } : {}),
    promptType: "auto",
    title,
    link,
    check(ctx: UpgradeContext) {
      const { ts, checker } = ctx;
      const col = ctx.collector(id);
      const isRenamedExport = (node: TS.Node, name: string): boolean => {
        const symbol = excaliburSymbolOf(ctx, node);
        return symbol !== null && symbol.getName() === name;
      };
      for (const { sf, text } of ctx.files) {
        const done = new Set<number>();
        const visit = (node: TS.Node): void => {
          if (ts.isIdentifier(node) && Object.hasOwn(renames, node.text) && !done.has(node.getStart(sf))) {
            const next = renames[node.text]!;
            const parent = node.parent;
            if (ts.isExportSpecifier(parent)) {
              // re-exporting the old name is the user's public API — leave it
            } else if (ts.isImportSpecifier(parent)) {
              if (parent.propertyName === node || (parent.name === node && !parent.propertyName)) {
                // `getSymbolAtLocation` on the specifier's local name yields the alias → unwrap to the export.
                if (isRenamedExport(parent.name, node.text)) {
                  if (parent.propertyName === node || parent.isTypeOnly) {
                    // `Old as X` keeps X; `type Old` keeps the inline `type` (replaceImportSpecifier would drop it)
                    col.addEdit(sf, { start: node.getStart(sf), end: node.end }, next, `import ${node.text} -> ${next}`);
                  } else {
                    const edit = ctx.editor.replaceImportSpecifier(sf, text, "excalibur", node.text, [next]);
                    if (edit) col.addEdit(sf, { getStart: () => edit.start, end: edit.end }, edit.text, `import ${node.text} -> ${next}`);
                  }
                  done.add(node.getStart(sf));
                }
              }
            } else if (isRenamedExport(node, node.text)) {
              done.add(node.getStart(sf));
              if (manualOnNew && ts.isNewExpression(parent) && parent.expression === node) {
                col.addManual(sf, parent, manualOnNew, link);
              } else if (manualOnNew && ts.isPropertyAccessExpression(parent) && parent.name === node && ts.isNewExpression(parent.parent) && parent.parent.expression === parent) {
                col.addManual(sf, parent.parent, manualOnNew, link);
              } else {
                col.addEdit(sf, { start: node.getStart(sf), end: node.end }, next, `${node.text} -> ${next}`);
              }
            }
          } else if (ts.isPropertyAccessExpression(node) && !done.has(node.name.getStart(sf))) {
            const owner = excaliburSymbolOf(ctx, node.expression)?.getName();
            const members = owner ? staticMembers[owner] : undefined;
            if (members && Object.hasOwn(members, node.name.text)) {
              // The owner resolved through the checker; the member is a plain key on it.
              void checker;
              done.add(node.name.getStart(sf));
              col.addEdit(
                sf,
                { start: node.name.getStart(sf), end: node.name.end },
                members[node.name.text]!,
                `${owner}.${node.name.text} -> ${owner}.${members[node.name.text]}`
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
