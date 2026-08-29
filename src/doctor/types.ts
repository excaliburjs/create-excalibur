/**
 * The doctor rule contract — the typescript-eslint/tsgolint listener shape.
 * Handlers declare the node type their SyntaxKind guarantees; the runner
 * dispatches by kind and holds the single cast (run.ts).
 */
import type * as TS from "typescript";
import type { TsModule } from "../generate/ts-loader.ts";
import type { TypeUtils } from "./type-utils.ts";
import type { Facts } from "./facts.ts";

/** What a rule reports (rule id + file are added by the runner). */
export interface RuleFinding {
  line: number;
  column: number;
  message: string;
  hint?: string;
}

export interface Finding extends RuleFinding {
  rule: string;
  file: string;
}

export interface RuleContext {
  ts: TsModule;
  checker: TS.TypeChecker;
  program: TS.Program;
  utils: TypeUtils;
  facts: Facts;
  /** project-relative POSIX path of the file being checked */
  file: string;
  projectDir: string;
  report: (finding: RuleFinding) => void;
}

/**
 * Listeners keyed by ts.SyntaxKind, plus the "exit:file" hook. The value
 * type is (node: never) => void so a handler may declare the concrete node
 * type its kind guarantees (contravariance makes any such handler valid).
 */
export type RuleListeners = {
  [kind: number]: ((node: never) => void) | undefined;
} & { "exit:file"?: () => void };

export interface Rule {
  id: string;
  description: string;
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners;
}
