import { runDoctor } from "../../doctor/run.ts";
import { RULES } from "../../doctor/rules.ts";
import { jsonResult } from "../result.ts";
import { PROJECT_DIR_PROP } from "./generate.ts";
import { resolveProjectDir } from "./docs.ts";
import type { Tool } from "../types.ts";

interface DoctorToolArgs {
  projectDir?: string;
  scope?: string[];
}

export const doctorTools: [Tool<DoctorToolArgs>] = [
  {
    name: "doctor",
    description: `Diagnose common Excalibur mistakes: actors created but never added to a scene (actor-not-added) and actors without a name (unnamed-actor), class fields shadowing built-in excalibur members like Entity.isActive (dont-shadow-excalibur-internals), shader sources declaring a built-in uniform/varying like u_time_ms or v_uv with a conflicting GLSL type (no-reserved-uniforms), options bags carrying a key no overload accepts like moveBy({ durationMs }) so the call silently does nothing (unmatched-options), and multi-line Text/Label drawn with a Font that has no explicit lineHeight so lines overlap (multiline-text-no-lineheight) — ${RULES.length} rules total; prefer-seeded-random is the cheapest pre-check before recording screenshot baselines. Type-aware — requires the project's node_modules to be installed. Scans src/ plus any example dirs by default. Returns findings with rule, file, line, column, message, hint, plus an \`ignored\` count of findings suppressed by eslint-style \`// ex-doctor-ignore-next-line <rule>\` / \`// ex-doctor-ignore-line <rule>\` comments, and project-level tips in \`warnings\`.`,
    inputSchema: {
      type: "object",
      properties: {
        ...PROJECT_DIR_PROP,
        scope: {
          type: "array",
          items: { type: "string" },
          description: "Directories to scan, relative to the project root (default: src plus any example dirs).",
        },
      },
    },
    async handler(args, ctx) {
      const projectDir = resolveProjectDir(args, ctx);
      return jsonResult(
        await runDoctor(projectDir, {
          ...(ctx.ts ? { ts: ctx.ts } : {}),
          ...(args.scope ? { scope: args.scope } : {}),
        })
      );
    },
  },
];
