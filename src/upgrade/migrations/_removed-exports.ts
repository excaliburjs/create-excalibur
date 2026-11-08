/**
 * Factory for "this export is gone and there is no mechanical rewrite":
 * every identifier that resolves to one of the named excalibur exports gets
 * a breadcrumb carrying that export's replacement advice — type references,
 * values, `ex.Name` accesses, and the import or re-export specifier itself.
 * One breadcrumb per line (an import line naming three removed types is one
 * site, not three).
 */
import type * as TS from "typescript";
import { manualMigration } from "./_manual.ts";
import { excaliburSymbolOf } from "./_resolve.ts";
import type { ManualMigration } from "../types.ts";

export function removedExportsMigration({
  id,
  version,
  removedIn,
  title,
  link,
  names,
}: {
  id: string;
  version: string;
  removedIn?: string;
  title: string;
  link?: string | null;
  /** removed export name → what to do instead */
  names: Record<string, string>;
}): ManualMigration {
  return manualMigration({
    id,
    version,
    ...(removedIn ? { removedIn } : {}),
    title,
    link,
    findSites(ctx, col) {
      const { ts } = ctx;
      for (const { sf } of ctx.files) {
        const flaggedLines = new Set<number>();
        const visit = (node: TS.Node): void => {
          if (ts.isIdentifier(node) && Object.hasOwn(names, node.text)) {
            // An import/export specifier's local name resolves to the alias → the export; its
            // `propertyName` (the `Old` in `Old as X`) resolves the same way. A re-export
            // (`export { Old } from "excalibur"`) is flagged too — it has no replacement either.
            const target = ts.isImportSpecifier(node.parent) || ts.isExportSpecifier(node.parent) ? node.parent.name : node;
            const symbol = excaliburSymbolOf(ctx, target);
            if (symbol && symbol.getName() === node.text) {
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
              if (!flaggedLines.has(line)) {
                flaggedLines.add(line);
                col.addManual(sf, node, `${node.text} ${names[node.text]}`, link);
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    },
  });
}
