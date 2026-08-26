import * as fs from "node:fs";
import * as path from "node:path";
import { getChalk, terminal } from "../console.js";

const TYPE_BADGE = { auto: "auto", manual: "manual", notification: "note" };

/** Phase-1 plan preview: every applicable migration + sample hunks. */
export function renderPlan(summary, { maxHunks = 8 } = {}) {
  const c = getChalk();
  terminal.blank();
  terminal.print(
    c.gray(` ex upgrade — excalibur ${summary.from} → ${summary.to}`) +
      (summary.dryRun ? c.yellow("  (dry run — nothing will be written)") : "")
  );
  for (const warning of summary.warnings) terminal.print(` ${c.yellow("!")} ${warning}`);
  if (summary.upToDate) {
    terminal.blank();
    terminal.print(c.green(` ✓ ${summary.reason}`));
    terminal.blank();
    return;
  }
  const lineCache = new Map();
  const sourceLine = (file, line) => {
    if (!lineCache.has(file)) {
      try {
        lineCache.set(file, fs.readFileSync(path.join(summary.projectDir, file), "utf8").split("\n"));
      } catch {
        lineCache.set(file, []);
      }
    }
    return lineCache.get(file)[line - 1] ?? "";
  };

  for (const item of summary.plan) {
    terminal.blank();
    terminal.print(` ${c.cyan(item.id)} ${c.gray(`[${TYPE_BADGE[item.promptType]}, v${item.version}]`)}`);
    terminal.print(`   ${item.title}`);
    terminal.print(`   ${c.gray(item.prompt)}  ${c.gray(item.link ?? "")}`);
    let shown = 0;
    for (const edit of item.edits) {
      if (shown >= maxHunks) {
        terminal.print(`   ${c.gray(`… ${item.edits.length - shown} more`)}`);
        break;
      }
      const old = sourceLine(edit.file, edit.line);
      if (old) {
        terminal.print(`   ${c.gray(`${edit.file}:${edit.line}`)}`);
        terminal.print(`   ${c.red(`- ${old.trim()}`)}`);
        const startCol = edit.column - 1;
        const lineStart = old.slice(0, startCol);
        // Best-effort single-line preview; multi-line edits just show the reason.
        terminal.print(`   ${c.green(`+ ${(lineStart + edit.replacement).trim()}${c.gray(" …")}`)}`);
      }
      shown++;
    }
    for (const site of item.manual.slice(0, maxHunks)) {
      terminal.print(`   ${c.yellow("→")} ${site.file}:${site.line}  ${c.gray(site.message)}`);
    }
    for (const note of item.notes) {
      terminal.print(`   ${c.gray(`• ${note}`)}`);
    }
  }
  terminal.blank();
}

/** Post-apply report: buckets + next steps. */
export function renderResult(summary) {
  const c = getChalk();
  terminal.blank();
  if (summary.applied.length > 0) {
    terminal.print(c.green(` ✓ applied ${summary.applied.length} migration(s):`));
    for (const a of summary.applied) {
      terminal.print(`   ${a.id} ${c.gray(`(${a.editCount} edit(s) in ${a.files.length} file(s))`)}`);
    }
  }
  if (summary.manual.length > 0) {
    terminal.print(c.yellow(` → ${summary.manual.length} manual follow-up(s) — breadcrumbs inserted, grep "ex-upgrade("`));
    for (const m of summary.manual) {
      terminal.print(`   ${m.id} ${c.gray(`(${m.sites.length} site(s))`)} ${c.gray(m.link ?? "")}`);
    }
  }
  for (const n of summary.notifications) {
    for (const note of n.notes) terminal.print(` ${c.gray(`• ${note}`)}`);
  }
  for (const skip of summary.files.skipped) {
    terminal.print(` ${c.yellow("!")} ${skip.file}: ${skip.reason}`);
  }
  for (const warning of summary.warnings) terminal.print(` ${c.yellow("!")} ${warning}`);
  terminal.blank();
  if (summary.files.changed.length > 0 || summary.packageJson.bumped) {
    if (summary.packageJson.bumped) {
      terminal.print(` package.json: excalibur → ${summary.packageJson.spec}`);
    }
    terminal.print(c.gray(` next steps: 1. review the diff (git diff)  2. ${summary.packageJson.installHint}  3. ex doctor`));
  } else if (summary.applied.length === 0 && summary.manual.length === 0) {
    terminal.print(c.green(" ✓ nothing to change"));
  }
  terminal.blank();
}
