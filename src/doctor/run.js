import * as path from "node:path";
import { analyzeProject } from "../generate/project.js";
import { createProgramContext } from "./program.js";
import { createTypeUtils } from "./type-utils.js";
import { RULES } from "./rules.js";

/**
 * Run every doctor rule against the project. Promptless core shared by the
 * CLI flow and the MCP `doctor` tool — throws GenerateError (with .hint) on
 * project/program problems, never prompts, never exits.
 *
 * @param {string} projectDir
 * @param {{ ts?: object }} [opts] inject a TypeScript module (tests)
 * @returns {Promise<{projectDir: string, filesScanned: number, findings: object[], warnings: string[]}>}
 */
export async function runDoctor(projectDir, opts = {}) {
  const project = await analyzeProject(projectDir, opts.ts ? { ts: opts.ts } : {});
  const { ts, program, checker, sourceFiles } = createProgramContext(project);
  const utils = createTypeUtils(ts, checker, program);

  const findings = [];
  for (const sf of sourceFiles) {
    const file = path.relative(project.projectDir, sf.fileName).split(path.sep).join("/");
    const active = RULES.map((rule) => {
      const report = (finding) => findings.push({ rule: rule.id, file, ...finding });
      return rule.create({ ts, checker, program, utils, projectDir: project.projectDir, report }, sf);
    });
    const visit = (node) => {
      for (const listeners of active) listeners[node.kind]?.(node);
      ts.forEachChild(node, visit);
    };
    visit(sf);
    for (const listeners of active) listeners["exit:file"]?.();
  }

  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column || a.rule.localeCompare(b.rule)
  );
  return {
    projectDir: project.projectDir,
    filesScanned: sourceFiles.length,
    findings,
    warnings: project.warnings,
  };
}
