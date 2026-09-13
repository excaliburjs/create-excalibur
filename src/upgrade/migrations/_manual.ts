import type { Collector, ManualMigration, CheckResult, UpgradeContext } from "../types.ts";

/**
 * Shared shape for breadcrumb-only migrations: find sites, flag them, never
 * edit. `findSites` gets the collector and calls addManual/addNote; the
 * record's promptType decides whether the sites become in-source breadcrumbs
 * (`manual`) or a report-only notification.
 */
export function manualMigration({
  id,
  version,
  removedIn,
  title,
  link,
  promptType = "manual",
  findSites,
}: {
  id: string;
  version: string;
  /** see MigrationBase.removedIn */
  removedIn?: string;
  title: string;
  link?: string | null;
  promptType?: "manual" | "notification";
  findSites(ctx: UpgradeContext, col: Collector): void;
}): ManualMigration {
  return {
    id,
    version,
    ...(removedIn ? { removedIn } : {}),
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
