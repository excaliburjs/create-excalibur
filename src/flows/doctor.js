import { checkbox } from "@inquirer/prompts";
import { getChalk, terminal } from "../console.js";
import { parseDoctorArgs, DOCTOR_USAGE } from "../doctor/args.js";
import { runDoctor } from "../doctor/run.js";
import { insertIgnoreComments } from "../doctor/suppress.js";
import { GenerateError } from "../generate/errors.js";

function reportDoctorError(error) {
  const c = getChalk();
  terminal.blank();
  terminal.warning(" Error ");
  terminal.print(` ${error.message}`);
  if (error.hint) terminal.print(` ${c.gray(error.hint)}`);
  terminal.blank();
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function renderDoctorReport(result) {
  const c = getChalk();
  terminal.blank();
  terminal.print(c.gray(` ex doctor — ${result.projectDir}`));
  for (const warning of result.warnings) {
    terminal.print(` ${c.gray(`! ${warning}`)}`);
  }
  let currentFile = null;
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
async function pickIgnores(findings) {
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
    if (error?.name === "ExitPromptError") return [];
    throw error;
  }
}

/**
 * `ex doctor` — run diagnostics against the Excalibur project in cwd.
 * Non-interactive; exit code 1 when any finding (or error) is reported.
 */
export async function doctorFlow(argv = []) {
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
        const modified = insertIgnoreComments(result.projectDir, picked);
        for (const file of modified) terminal.print(` ${c.cyan("UPDATE")} ${file}`);
        final = await runDoctor(process.cwd());
        renderDoctorReport(final);
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
