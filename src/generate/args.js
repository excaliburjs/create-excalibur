import { parseArgs } from "node:util";

export const GENERATE_OPTIONS = {
  help: { type: "boolean", short: "h" },
  scene: { type: "string", short: "s" },
  actor: { type: "string", short: "a" },
  "dry-run": { type: "boolean" },
  force: { type: "boolean" },
};

const KIND_ALIASES = {
  a: "actor",
  actor: "actor",
  l: "label",
  label: "label",
  s: "scene",
  scene: "scene",
  r: "resource",
  resource: "resource",
  resources: "resource",
  e: "engine",
  engine: "engine",
  m: "material",
  material: "material",
  ua: "update-actor",
  "update-actor": "update-actor",
};

export const GENERATE_KINDS = ["actor", "label", "scene", "resource", "engine", "material", "update-actor"];

/**
 * Parse the arguments that follow `ex generate` / `ex g`.
 * @param {string[]} argv
 */
export function parseGenerateArgs(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: GENERATE_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const rawKind = positionals[0] ? String(positionals[0]) : null;
  const kind = rawKind ? (KIND_ALIASES[rawKind.toLowerCase()] ?? null) : null;
  return {
    help: Boolean(values.help),
    dryRun: Boolean(values["dry-run"]),
    force: Boolean(values.force),
    scene: values.scene ? String(values.scene) : null,
    actor: values.actor ? String(values.actor) : null,
    rawKind,
    kind,
    name: positionals[1] ? String(positionals[1]) : null,
  };
}

export const GENERATE_USAGE = `
Usage: ex generate <actor|label|scene|resource|engine|material|update-actor> [name] [options]
       ex g <a|l|s|r|e|m|ua> [name]

Generate Excalibur code into the current project and wire it up.

  ex generate actor Player        new actor class + add it to a scene's onInitialize
  ex generate label ScoreText     new label class + add it to a scene
  ex generate scene Level2        new scene class + register it in the engine's scenes map
  ex generate resource            add an image/sound/font to resources.ts (with file picker)
  ex generate engine              configure EngineOptions (creates main.ts if no engine exists)
  ex generate material Ripple     new custom-shader material + assign it to an actor's graphics
  ex generate update-actor Player change an existing actor's constructor options (ActorArgs)

Options:
  -s, --scene <name>   target scene for actor/label wiring (skips the picker)
  -a, --actor <name>   target actor for material wiring (skips the picker)
      --dry-run        show what would be created/modified without writing
      --force          overwrite an existing generated file
  -h, --help           show this help
`.trimStart();
