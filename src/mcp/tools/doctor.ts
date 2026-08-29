import { runDoctor } from "../../doctor/run.ts";
import { jsonResult } from "../result.ts";
import { PROJECT_DIR_PROP } from "./generate.ts";
import { resolveProjectDir } from "./docs.ts";
import type { Tool } from "../types.ts";

interface DoctorToolArgs {
  projectDir?: string;
}

export const doctorTools: [Tool<DoctorToolArgs>] = [
  {
    name: "doctor",
    description:
      "Diagnose common Excalibur mistakes: actors created but never added to a scene (actor-not-added) and actors without a name (unnamed-actor), class fields shadowing built-in excalibur members like Entity.isActive (dont-shadow-excalibur-internals), and shader sources declaring a built-in uniform/varying like u_time_ms or v_uv with a conflicting GLSL type (no-reserved-uniforms) — 12 rules total. Type-aware — requires the project's node_modules to be installed. Returns findings with rule, file, line, column, message, hint, plus an `ignored` count of findings suppressed by eslint-style `// ex-doctor-ignore-next-line <rule>` / `// ex-doctor-ignore-line <rule>` comments.",
    inputSchema: {
      type: "object",
      properties: { ...PROJECT_DIR_PROP },
    },
    async handler(args, ctx) {
      const projectDir = resolveProjectDir(args, ctx);
      return jsonResult(await runDoctor(projectDir, ctx.ts ? { ts: ctx.ts } : {}));
    },
  },
];
