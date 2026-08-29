import type * as TS from "typescript";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/** 0.30 Particle/ParticleEmitter key renames (old -> new). */
const KEY_RENAMES: Record<string, string> = {
  particleSprite: "graphic",
  particleRotationalVelocity: "angularVelocity",
  fadeFlag: "fade",
  acceleration: "acc",
  particleLife: "life",
  minVel: "minSpeed",
  maxVel: "maxSpeed",
};

/** Post-rename keys that 0.30 moved into the nested `particle: {...}` config on ParticleEmitter. */
const PARTICLE_SCOPED = new Set([
  "graphic",
  "angularVelocity",
  "fade",
  "acc",
  "life",
  "minSpeed",
  "maxSpeed",
  "opacity",
  "beginColor",
  "endColor",
  "startSize",
  "endSize",
  "minSize",
  "maxSize",
  "minAngle",
  "maxAngle",
  "randomRotation",
  "transform",
]);

/**
 * Key renames are automated (name-token splices). The structural nesting of
 * particle-scoped keys into `particle: {...}` is deliberately NOT automated —
 * it's the empty-literal/overlapping-edit minefield (open review finding #1)
 * — so emitters carrying particle-scoped keys get one breadcrumb instead.
 */
export const particleEmitterArgs: Migration = {
  id: "particle-emitter-args",
  version: "0.30.0",
  promptType: "auto",
  title: "Particle/ParticleEmitter options were renamed (and emitters gained a nested particle config)",
  link: V030,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const TARGETS = new Set(["ParticleEmitter", "Particle"]);
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node)) {
          const type = checker.getTypeAtLocation(node);
          const reference = type as TS.TypeReference;
          const target = reference.target && reference.target !== type ? reference.target : type;
          const symbol = target.getSymbol();
          const literal = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
          if (
            symbol &&
            TARGETS.has(symbol.getName()) &&
            utils.isExcaliburSymbol(symbol) &&
            literal &&
            ts.isObjectLiteralExpression(literal)
          ) {
            let needsNesting = false;
            for (const prop of literal.properties) {
              if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
              const oldName = prop.name.text;
              if (Object.hasOwn(KEY_RENAMES, oldName)) {
                col.addEdit(
                  sf,
                  { start: prop.name.getStart(sf), end: prop.name.end },
                  KEY_RENAMES[oldName]!,
                  `${oldName} -> ${KEY_RENAMES[oldName]}`
                );
              }
              const newName = KEY_RENAMES[oldName] ?? oldName;
              if (symbol.getName() === "ParticleEmitter" && PARTICLE_SCOPED.has(newName)) {
                needsNesting = true;
              }
            }
            if (needsNesting) {
              col.addManual(
                sf,
                node,
                "ParticleEmitter now takes particle-specific options in a nested particle: { ... } config — move the particle keys in",
                V030
              );
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} emitter(s) need the nested particle config` : "";
    return `${result.edits.length} option key rename(s)${extra}`;
  },
};
