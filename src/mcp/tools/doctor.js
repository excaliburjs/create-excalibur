import { runDoctor } from "../../doctor/run.js";
import { jsonResult } from "../result.js";
import { PROJECT_DIR_PROP } from "./generate.js";
import { resolveProjectDir } from "./docs.js";

export const doctorTools = [
  {
    name: "doctor",
    description:
      "Diagnose common Excalibur mistakes: actors created but never added to a scene (actor-not-added) and actors without a name (unnamed-actor), and class fields shadowing built-in excalibur members like Entity.isActive (dont-shadow-excalibur-internals). Type-aware — requires the project's node_modules to be installed. Returns findings with rule, file, line, column, message, hint, plus an `ignored` count of findings suppressed by eslint-style `// ex-doctor-ignore-next-line <rule>` / `// ex-doctor-ignore-line <rule>` comments.",
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
