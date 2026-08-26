import * as path from "node:path";
import { createHash } from "node:crypto";
import { analyzeProject } from "../generate/project.js";
import { createTsEditor } from "../generate/ts-edit.js";
import { createProgramContext } from "../doctor/program.js";
import { createTypeUtils } from "../doctor/type-utils.js";
import { collectFacts } from "../doctor/facts.js";
import { collectUpgradeFacts } from "./facts.js";
import { hasMarker } from "./breadcrumbs.js";

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
export async function createUpgradeContext(projectDir, opts = {}) {
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
  const hashText = (text) => `${text.length}:${createHash("sha1").update(text).digest("hex").slice(0, 8)}`;

  /**
   * Per-check result collector: accumulates planned edits + manual sites,
   * auto-records file drift-hashes, and dedupes manual sites already
   * annotated by a previous run (idempotent reports, not just files).
   */
  function collector(migrationId) {
    const edits = [];
    const manual = [];
    const notes = [];
    const fileHashes = {};
    const touch = (sf) => {
      const file = relOf.get(sf);
      if (!(file in fileHashes)) fileHashes[file] = hashText(sf.text);
      return file;
    };
    return {
      edits,
      manual,
      notes,
      /** `range` is a node (getStart/end) or a plain {start, end}. */
      addEdit(sf, range, replacement, reason) {
        const file = touch(sf);
        const start = typeof range.getStart === "function" ? range.getStart(sf) : range.start;
        const end = range.end;
        edits.push({ file, start, end, replacement, reason, ...utils.lineCol(sf, { getStart: () => start }) });
      },
      addManual(sf, node, message, link) {
        const file = relOf.get(sf);
        const { line, column } = utils.lineCol(sf, node);
        if (hasMarker(sf.text, line, migrationId)) return; // already annotated by a prior run
        manual.push({ file, line, column, message, link: link ?? null });
      },
      addNote(note) {
        notes.push(note);
      },
      /** null when the migration found nothing at all (tally: not applicable). */
      result() {
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
