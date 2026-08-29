import * as path from "node:path";
import { analyzeProject } from "../generate/project.ts";
import type * as TS from "typescript";
import { createProgramContext } from "./program.ts";
import { createTypeUtils } from "./type-utils.ts";
import { RULES } from "./rules.ts";
import { collectIgnores, isIgnored, type IgnoreMap } from "./suppress.ts";
import { collectFacts } from "./facts.ts";
import type { TsModule } from "../generate/ts-loader.ts";
import type { Finding, RuleFinding } from "./types.ts";

export interface DoctorResult {
  projectDir: string;
  filesScanned: number;
  findings: Finding[];
  /** findings suppressed by ex-doctor-ignore comments (suppress.ts) */
  ignored: number;
  warnings: string[];
}

/**
 * Run every doctor rule against the project. Promptless core shared by the
 * CLI flow and the MCP `doctor` tool — throws GenerateError (with .hint) on
 * project/program problems, never prompts, never exits.
 *
 * `opts.ts` injects a TypeScript module (tests).
 */
export async function runDoctor(projectDir: string, opts: { ts?: TsModule } = {}): Promise<DoctorResult> {
  const project = await analyzeProject(projectDir, opts.ts ? { ts: opts.ts } : {});
  const { ts, program, checker, sourceFiles } = createProgramContext(project);
  const utils = createTypeUtils(ts, checker, program);

  const files = sourceFiles.map((sf) => ({
    sf,
    file: path.relative(project.projectDir, sf.fileName).split(path.sep).join("/"),
  }));
  const facts = collectFacts({ ts, checker, utils, files });

  const collected: Finding[] = [];
  const ignoresByFile = new Map<string, IgnoreMap>();
  for (const { sf, file } of files) {
    ignoresByFile.set(file, collectIgnores(sf.text));
    const active = RULES.map((rule) => {
      const report = (finding: RuleFinding) => collected.push({ rule: rule.id, file, ...finding });
      return rule.create({ ts, checker, program, utils, facts, file, projectDir: project.projectDir, report }, sf);
    });
    const visit = (node: TS.Node): void => {
      // The single dispatch cast: handlers declared their node type per kind.
      for (const listeners of active) (listeners[node.kind] as ((n: TS.Node) => void) | undefined)?.(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const listeners of active) listeners["exit:file"]?.();
  }

  const findings = collected.filter((f) => !isIgnored(ignoresByFile.get(f.file), f.line, f.rule));

  const warnings = [...project.warnings];
  if (
    findings.some((f) => f.rule === "dont-shadow-excalibur-internals") &&
    !program.getCompilerOptions().noImplicitOverride
  ) {
    warnings.push(
      'tip: set "noImplicitOverride": true in tsconfig.json — TypeScript then rejects members that silently shadow a base-class member (TS4114) at compile time'
    );
  }

  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)
  );
  return {
    projectDir: project.projectDir,
    filesScanned: sourceFiles.length,
    findings,
    ignored: collected.length - findings.length,
    warnings,
  };
}
