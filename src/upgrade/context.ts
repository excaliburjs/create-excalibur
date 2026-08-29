import * as path from "node:path";
import { createHash } from "node:crypto";
import { analyzeProject } from "../generate/project.ts";
import { createTsEditor } from "../generate/ts-edit.ts";
import { createProgramContext } from "../doctor/program.ts";
import { createTypeUtils } from "../doctor/type-utils.ts";
import { collectFacts } from "../doctor/facts.ts";
import { collectUpgradeFacts } from "./facts.ts";
import { hasMarker } from "./breadcrumbs.ts";
import type * as TS from "typescript";
import type { TsModule } from "../generate/ts-loader.ts";
import type { CheckResult, Collector, EditRange, ManualSite, PlannedEdit, UpgradeContext } from "./types.ts";

/**
 * Shared check-context for upgrade migrations. Reuses doctor's Program/
 * checker seam with `requireExcalibur: false`: when excalibur's .d.ts can't
 * resolve, `degraded` is true and the runner downgrades every `auto`
 * migration to a notification (missed renames are safe; half-blind renames
 * are not).
 *
 * Invariant carried from the plan: checks run against the OLD installed
 * excalibur — the package.json bump is the runner's last step.
 */
export async function createUpgradeContext(projectDir: string, opts: { ts?: TsModule } = {}): Promise<UpgradeContext> {
  const project = await analyzeProject(projectDir, opts.ts ? { ts: opts.ts } : {});
  const { ts, program, checker, sourceFiles, excaliburResolved } = createProgramContext(project, {
    requireExcalibur: false,
  });
  const utils = createTypeUtils(ts, checker, program);
  const editor = createTsEditor(ts);
  const files = sourceFiles.map((sf) => ({
    sf,
    file: path.relative(project.projectDir, sf.fileName).split(path.sep).join("/"),
    text: sf.text,
  }));
  const facts = {
    ...collectFacts({ ts, checker, utils, files }),
    ...collectUpgradeFacts({ ts, checker, utils, files }),
  };

  const relOf = new Map(files.map(({ sf, file }) => [sf, file]));
  const hashText = (text: string) => `${text.length}:${createHash("sha1").update(text).digest("hex").slice(0, 8)}`;

  /**
   * Per-check result collector: accumulates planned edits + manual sites,
   * auto-records file drift-hashes, and dedupes manual sites already
   * annotated by a previous run (idempotent reports, not just files).
   */
  function collector(migrationId: string): Collector {
    const edits: PlannedEdit[] = [];
    const manual: ManualSite[] = [];
    const notes: string[] = [];
    const fileHashes: Record<string, string> = {};
    const touch = (sf: TS.SourceFile): string => {
      const file = relOf.get(sf)!;
      if (!(file in fileHashes)) fileHashes[file] = hashText(sf.text);
      return file;
    };
    return {
      edits,
      manual,
      notes,
      /** `range` is a node (getStart/end) or a plain {start, end}. */
      addEdit(sf: TS.SourceFile, range: EditRange, replacement: string, reason: string) {
        const file = touch(sf);
        const start = "getStart" in range ? range.getStart(sf) : range.start;
        const end = range.end;
        edits.push({ file, start, end, replacement, reason, ...utils.lineCol(sf, { getStart: () => start } as unknown as TS.Node) });
      },
      addManual(sf: TS.SourceFile, node: TS.Node, message: string, link?: string | null) {
        const file = relOf.get(sf)!;
        const { line, column } = utils.lineCol(sf, node);
        if (hasMarker(sf.text, line, migrationId)) return; // already annotated by a prior run
        manual.push({ file, line, column, message, link: link ?? null });
      },
      addNote(note: string) {
        notes.push(note);
      },
      /** null when the migration found nothing at all (tally: not applicable). */
      result(): CheckResult | null {
        if (edits.length === 0 && manual.length === 0 && notes.length === 0) return null;
        return { edits, manual, notes, fileHashes };
      },
    };
  }

  return {
    ts,
    program,
    checker,
    sourceFiles,
    projectDir: project.projectDir,
    srcDir: project.srcDir,
    project,
    utils,
    editor,
    facts,
    files,
    degraded: !excaliburResolved,
    collector,
    hashText,
  };
}
