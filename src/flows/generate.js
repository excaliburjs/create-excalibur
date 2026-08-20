import { select } from "@inquirer/prompts";
import { getChalk, terminal } from "../console.js";
import { parseGenerateArgs, GENERATE_USAGE, GENERATE_KINDS } from "../generate/args.js";
import { GenerateError } from "../generate/errors.js";
import { analyzeProject } from "../generate/project.js";
import {
  actorWizard,
  labelWizard,
  sceneWizard,
  resourceWizard,
  engineWizard,
  materialWizard,
} from "../generate/wizards.js";
import {
  applyActor,
  applyLabel,
  applyScene,
  applyResource,
  applyEngine,
  applyMaterial,
} from "../generate/apply.js";

const WIZARDS = {
  actor: [actorWizard, applyActor],
  label: [labelWizard, applyLabel],
  scene: [sceneWizard, applyScene],
  resource: [resourceWizard, applyResource],
  engine: [engineWizard, applyEngine],
  material: [materialWizard, applyMaterial],
};

function reportGenerateError(error) {
  const c = getChalk();
  terminal.blank();
  terminal.warning(" Error ");
  terminal.print(` ${error.message}`);
  if (error.hint) terminal.print(` ${c.gray(error.hint)}`);
  terminal.blank();
}

function renderReport(report, { dryRun }) {
  const c = getChalk();
  terminal.blank();
  if (dryRun) terminal.print(c.yellow(" dry run — nothing was written"));
  for (const file of report.created) {
    terminal.print(` ${c.green("CREATE")} ${file}`);
  }
  for (const mod of report.modified) {
    terminal.print(` ${c.cyan("UPDATE")} ${mod.path} ${c.gray(`(${mod.snippet})`)}`);
  }
  for (const warning of report.warnings) {
    terminal.print(` ${c.yellow("!")} ${warning}`);
  }
  for (const manual of report.manual) {
    terminal.blank();
    terminal.print(` ${c.yellow("!")} ${manual.title}`);
    terminal.print(c.gray(manual.snippet.split("\n").map((l) => `     ${l}`).join("\n")));
  }
  for (const hint of report.hints) {
    terminal.print(` ${c.gray(hint)}`);
  }
  terminal.blank();
}

/**
 * `ex generate <kind> [name]` — scaffold Excalibur code and wire it up.
 * @param {string[]} argv
 */
export async function generateFlow(argv = []) {
  const args = parseGenerateArgs(argv);
  if (args.help) {
    process.stdout.write(GENERATE_USAGE);
    return;
  }
  try {
    if (args.rawKind && !args.kind) {
      throw new GenerateError(`unknown generate type "${args.rawKind}"`, {
        hint: `expected one of: ${GENERATE_KINDS.join(", ")}`,
      });
    }
    let kind = args.kind;
    const interactive = process.stdout.isTTY && process.stdin.isTTY;
    if (!kind) {
      if (!interactive) {
        throw new GenerateError("a generate type is required in non-interactive mode", {
          hint: `usage: ex generate <${GENERATE_KINDS.join("|")}> [name]`,
        });
      }
      kind = await select({
        message: "What do you want to generate?",
        choices: [
          { name: "Actor", value: "actor" },
          { name: "Label", value: "label" },
          { name: "Scene", value: "scene" },
          { name: "Resource (image, sound, …)", value: "resource" },
          { name: "Engine settings", value: "engine" },
          { name: "Material (custom shader)", value: "material" },
        ],
      });
    } else if (!interactive) {
      throw new GenerateError("ex generate needs an interactive terminal for its wizard", {
        hint: "run it in a terminal (non-interactive flags beyond --dry-run/--force are not supported yet).",
      });
    }

    const project = await analyzeProject(process.cwd());
    const c = getChalk();
    for (const warning of project.warnings) terminal.print(` ${c.yellow("!")} ${warning}`);
    if (project.plugins.length > 0) {
      const list = project.plugins.map((pl) => `${pl.name} ${pl.version ?? pl.range}`).join(", ");
      terminal.print(` ${c.gray(`plugins: ${list}`)}`);
    }

    const [wizard, apply] = WIZARDS[kind];
    const model = await wizard({
      project,
      name: args.name,
      sceneArg: args.scene,
      actorArg: args.actor,
      force: args.force,
    });
    const report = await apply(model, project, { dryRun: args.dryRun, force: args.force });
    renderReport(report, { dryRun: args.dryRun });
  } catch (error) {
    if (error instanceof GenerateError) {
      reportGenerateError(error);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
