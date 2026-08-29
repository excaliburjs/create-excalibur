import { confirm } from "@inquirer/prompts";
import { getChalk, terminal } from "../console.js";
import { parseUpgradeArgs, UPGRADE_USAGE } from "../upgrade/args.js";
import { runUpgrade } from "../upgrade/run.js";
import { renderPlan, renderResult } from "../upgrade/report.js";
import { GenerateError } from "../generate/errors.js";

function reportUpgradeError(error) {
  const c = getChalk();
  terminal.blank();
  terminal.warning(" Error ");
  terminal.print(` ${error.message}`);
  if (error.hint) terminal.print(` ${c.gray(error.hint)}`);
  terminal.blank();
}

/**
 * `ex upgrade` / `ex up` — plan-preview + one confirm, then apply.
 * Non-interactive callers (--yes, --json, non-TTY) skip the confirm.
 */
export async function upgradeFlow(argv = []) {
  const args = parseUpgradeArgs(argv);
  if (args.help) {
    process.stdout.write(UPGRADE_USAGE);
    return;
  }
  const interactive = process.stdout.isTTY && process.stdin.isTTY && !args.yes && !args.json;
  try {
    const result = await runUpgrade(process.cwd(), {
      to: args.to,
      from: args.from,
      dryRun: args.dryRun,
      migrateOnly: args.migrateOnly,
      allowDirty: args.allowDirty,
      confirm: async (summary) => {
        if (!args.json) renderPlan(summary);
        if (!interactive) return true;
        const actionable = summary.plan.filter((p) => p.promptType !== "notification").length;
        try {
          return await confirm({ message: `Apply ${actionable} migration(s)?`, default: true });
        } catch (error) {
          if (error?.name === "ExitPromptError") return false;
          throw error;
        }
      },
    });
    if (args.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    if (result.dryRun || result.upToDate) {
      renderPlan(result);
      return;
    }
    // The confirm callback already rendered the plan; declined runs show it too.
    if (result.applied.length === 0 && result.manual.length === 0 && result.skipped.some((s) => s.reason === "declined")) {
      terminal.print(getChalk().gray(" nothing applied."));
      terminal.blank();
      return;
    }
    renderResult(result);
  } catch (error) {
    if (error instanceof GenerateError) {
      if (args.json) {
        process.stdout.write(JSON.stringify({ error: { message: error.message, hint: error.hint ?? null } }) + "\n");
      } else {
        reportUpgradeError(error);
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
