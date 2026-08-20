import { SAMPLES, TEMPLATES } from "../../constants.js";
import { ScaffoldError, scaffoldProject } from "../../create/scaffold.js";
import { jsonResult } from "../result.js";
import { resolveProjectDir } from "./docs.js";

/** Dedupe by value — SAMPLES has known duplicate entries (upstream data bug). */
function dedupe(entries) {
  const byValue = new Map();
  for (const entry of entries) {
    if (!byValue.has(entry.value)) byValue.set(entry.value, entry);
  }
  return [...byValue.values()];
}

const TEMPLATE_ENTRIES = dedupe(TEMPLATES);
const SAMPLE_ENTRIES = dedupe(SAMPLES).filter((s) => !TEMPLATE_ENTRIES.some((t) => t.value === s.value));
const ALL_TEMPLATE_IDS = [...TEMPLATE_ENTRIES, ...SAMPLE_ENTRIES].map((t) => t.value);

function toListing(entry) {
  return {
    id: entry.value,
    name: entry.name,
    description: entry.description || undefined,
    repo: entry.repo,
    startCommand: entry.startCommand ?? null,
  };
}

export const createTools = [
  {
    name: "list_templates",
    description: "List the available Excalibur project templates (starter stacks) and sample projects (complete example games) usable with create_project.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["template", "sample", "all"], description: 'Default "all".' },
      },
    },
    async handler(args) {
      const kind = args.kind ?? "all";
      const payload = {};
      if (kind !== "sample") payload.templates = TEMPLATE_ENTRIES.map(toListing);
      if (kind !== "template") payload.samples = SAMPLE_ENTRIES.map(toListing);
      return jsonResult(payload);
    },
  },
  {
    name: "create_project",
    description:
      "Scaffold a new Excalibur game from a template into a new directory (clones the template repo and rewrites its package.json). npm install and git init are skipped unless requested — report the returned nextSteps to the user.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name; slugified into the directory name." },
        template: { type: "string", enum: ALL_TEMPLATE_IDS, description: 'Template or sample id from list_templates. Default "typescript_vite".' },
        directory: { type: "string", description: "Parent directory to create the project folder in. Defaults to the server's working directory." },
        install: { type: "boolean", description: "Run npm install after scaffolding (can take minutes). Default false." },
        initGit: { type: "boolean", description: "Run git init after scaffolding. Default false." },
      },
      required: ["name"],
    },
    async handler(args, ctx) {
      const templateId = args.template ?? "typescript_vite";
      const template = [...TEMPLATE_ENTRIES, ...SAMPLE_ENTRIES].find((t) => t.value === templateId);
      if (!template) {
        throw new ScaffoldError(`unknown template "${templateId}".`, {
          hint: `available: ${ALL_TEMPLATE_IDS.join(", ")}`,
        });
      }
      const cwd = resolveProjectDir({ projectDir: args.directory }, ctx);
      const result = await scaffoldProject({
        name: args.name,
        template,
        cwd,
        install: args.install ?? false,
        initGit: args.initGit ?? false,
      });
      const nextSteps = [`cd ${result.projectDir}`];
      if (!result.installed) nextSteps.push("npm install");
      if (result.startCommand) nextSteps.push(result.startCommand);
      return jsonResult({ ...result, nextSteps });
    },
  },
];
