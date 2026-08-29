import { checkbox } from "@inquirer/prompts";
import { getChalk, terminal } from "../console.ts";
import { parseDoctorArgs, DOCTOR_USAGE } from "../doctor/args.ts";
import { runDoctor, type DoctorResult } from "../doctor/run.ts";
import type { Finding } from "../doctor/types.ts";
import { insertIgnoreComments } from "../doctor/suppress.ts";
import { GenerateError } from "../generate/errors.ts";

function reportDoctorError(error: GenerateError): void {
  const c = getChalk();
  terminal.blank();
  terminal.warning(" Error ");
  terminal.print(` ${error.message}`);
  if (error.hint) terminal.print(` ${c.gray(error.hint)}`);
  terminal.blank();
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function renderDoctorReport(result: DoctorResult): void {
  const c = getChalk();
  terminal.blank();
  terminal.print(c.gray(` ex doctor — ${result.projectDir}`));
  for (const warning of result.warnings) {
    terminal.print(` ${c.gray(`! ${warning}`)}`);
  }
  let currentFile: string | null = null;
  for (const finding of result.findings) {
    if (finding.file !== currentFile) {
      terminal.blank();
      terminal.print(` ${finding.file}`);
      currentFile = finding.file;
    }
    terminal.print(
      `   ${c.yellow(`${finding.line}:${finding.column}`)}  ${c.magenta(finding.rule)}  ${finding.message}`
    );
    if (finding.hint) terminal.print(`   ${c.gray(finding.hint)}`);
  }
  terminal.blank();
  const ignoredNote = result.ignored > 0 ? c.gray(` (${result.ignored} ignored by comments)`) : "";
  if (result.findings.length === 0) {
    terminal.print(
      c.green(` ✓ no problems found (checked ${plural(result.filesScanned, "file")})`) + ignoredNote
    );
  } else {
    const files = new Set(result.findings.map((f) => f.file)).size;
    terminal.print(
      c.yellow(
        ` ✖ ${plural(result.findings.length, "problem")} in ${plural(files, "file")} (checked ${plural(result.filesScanned, "file")})`
      ) + ignoredNote
    );
  }
  terminal.blank();
}

/**
 * Checkbox over the findings; the selected ones get an eslint-style
 * `// ex-doctor-ignore-next-line <rule>` comment inserted above them.
 * Enter with nothing selected (or Ctrl-C) skips.
 */
async function pickIgnores(findings: Finding[]): Promise<Finding[]> {
  const c = getChalk();
  try {
    return await checkbox({
      message: "Ignore any of these? (inserts // ex-doctor-ignore-next-line comments)",
      choices: findings.map((f) => ({
        name: `${f.file}:${f.line}  ${c.magenta(f.rule)}  ${f.message}`,
        value: f,
      })),
      pageSize: 10,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ExitPromptError") return [];
    throw error;
  }
}

/**
 * `ex doctor` — run diagnostics against the Excalibur project in cwd.
 * Non-interactive; exit code 1 when any finding (or error) is reported.
 */
export async function doctorFlow(argv: string[] = []): Promise<void> {
  const args = parseDoctorArgs(argv);
  if (args.help) {
    process.stdout.write(DOCTOR_USAGE);
    return;
  }
  try {
    const result = await runDoctor(process.cwd());
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (result.findings.length > 0) process.exitCode = 1;
      return;
    }
    renderDoctorReport(result);
    let final = result;
    if (result.findings.length > 0 && process.stdout.isTTY && process.stdin.isTTY) {
      const picked = await pickIgnores(result.findings);
      if (picked.length > 0) {
        const c = getChalk();
        const { modified, skipped } = insertIgnoreComments(result.projectDir, picked);
        for (const file of modified) terminal.print(` ${c.cyan("UPDATE")} ${file}`);
        for (const s of skipped) {
          terminal.print(
            ` ${c.yellow("SKIP")} ${s.file}:${s.line}  ${c.magenta(s.rule)}  ${c.gray("inside a template literal — add the ignore comment by hand")}`
          );
        }
        if (modified.length > 0) {
          final = await runDoctor(process.cwd());
          renderDoctorReport(final);
        }
      }
    }
    if (final.findings.length > 0) process.exitCode = 1;
  } catch (error) {
    if (error instanceof GenerateError) {
      if (args.json) {
        process.stdout.write(
          JSON.stringify({ error: { message: error.message, hint: error.hint ?? null } }) + "\n"
        );
      } else {
        reportDoctorError(error);
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
