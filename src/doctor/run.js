import * as path from "node:path";
import { analyzeProject } from "../generate/project.js";
import { createProgramContext } from "./program.js";
import { createTypeUtils } from "./type-utils.js";
import { RULES } from "./rules.js";
import { collectIgnores, isIgnored } from "./suppress.js";

/**
 * Run every doctor rule against the project. Promptless core shared by the
 * CLI flow and the MCP `doctor` tool — throws GenerateError (with .hint) on
 * project/program problems, never prompts, never exits.
 *
 * @param {string} projectDir
 * @param {{ ts?: object }} [opts] inject a TypeScript module (tests)
 * @returns {Promise<{projectDir: string, filesScanned: number, findings: object[], ignored: number, warnings: string[]}>}
 *   `ignored` counts findings suppressed by ex-doctor-ignore comments (suppress.js).
 */
export async function runDoctor(projectDir, opts = {}) {
  const project = await analyzeProject(projectDir, opts.ts ? { ts: opts.ts } : {});
  const { ts, program, checker, sourceFiles } = createProgramContext(project);
  const utils = createTypeUtils(ts, checker, program);

  const collected = [];
  const ignoresByFile = new Map();
  for (const sf of sourceFiles) {
    const file = path.relative(project.projectDir, sf.fileName).split(path.sep).join("/");
    ignoresByFile.set(file, collectIgnores(sf.text));
    const active = RULES.map((rule) => {
      const report = (finding) => collected.push({ rule: rule.id, file, ...finding });
      return rule.create({ ts, checker, program, utils, projectDir: project.projectDir, report }, sf);
    });
    const visit = (node) => {
      for (const listeners of active) listeners[node.kind]?.(node);
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
