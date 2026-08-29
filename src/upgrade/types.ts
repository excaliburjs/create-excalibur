/**
 * The migration contract: Storybook automigrate's Fix triad as a
 * discriminated union on promptType — `auto` records may carry a run
 * (registry injects the shared splice applier when absent);
 * `manual`/`notification` records cannot have one (compile-time now,
 * registry's structural validation stays as a belt-and-braces assert).
 */
import type * as TS from "typescript";
import type { TsModule } from "../generate/ts-loader.ts";
import type { TsEditor } from "../generate/ts-edit.ts";
import type { Project } from "../generate/project.ts";
import type { TypeUtils } from "../doctor/type-utils.ts";
import type { Facts } from "../doctor/facts.ts";
import type { UpgradeFacts } from "./facts.ts";

export interface PlannedEdit {
  file: string;
  start: number;
  end: number;
  replacement: string;
  reason: string;
  line: number;
  column: number;
}

export interface ManualSite {
  file: string;
  line: number;
  column: number;
  message: string;
  link: string | null;
}

export interface CheckResult {
  edits: PlannedEdit[];
  manual: ManualSite[];
  notes: string[];
  fileHashes: Record<string, string>;
}

/** A node, an import-edit ({getStart(), end}), or a plain span. */
export type EditRange = { getStart(sf?: TS.SourceFile): number; end: number } | { start: number; end: number };

export interface Collector {
  edits: PlannedEdit[];
  manual: ManualSite[];
  notes: string[];
  addEdit(sf: TS.SourceFile, range: EditRange, replacement: string, reason: string): void;
  addManual(sf: TS.SourceFile, node: TS.Node, message: string, link?: string | null): void;
  addNote(note: string): void;
  /** null when the migration found nothing at all (tally: not applicable). */
  result(): CheckResult | null;
}

export interface UpgradeFile {
  sf: TS.SourceFile;
  file: string;
  text: string;
}

export interface UpgradeContext {
  ts: TsModule;
  program: TS.Program;
  checker: TS.TypeChecker;
  sourceFiles: TS.SourceFile[];
  projectDir: string;
  srcDir: string;
  project: Project;
  utils: TypeUtils;
  editor: TsEditor;
  facts: Facts & UpgradeFacts;
  files: UpgradeFile[];
  degraded: boolean;
  collector(migrationId: string): Collector;
  hashText(text: string): string;
}

export interface RunOutcome {
  changedFiles: string[];
  skippedFiles: Array<{ file: string; reason: string }>;
}

interface MigrationBase {
  id: string;
  version: string;
  title: string;
  link?: string | null;
  check(ctx: UpgradeContext): CheckResult | null;
  prompt(result: CheckResult): string;
}

export interface AutoMigration extends MigrationBase {
  promptType: "auto";
  run?: (args: { ctx: UpgradeContext; result: CheckResult }) => Promise<RunOutcome> | RunOutcome;
}

export interface ManualMigration extends MigrationBase {
  promptType: "manual" | "notification";
  run?: never;
}

export type Migration = AutoMigration | ManualMigration;
