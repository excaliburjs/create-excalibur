/**
 * One pass over every source file BEFORE the rules run, collecting the
 * project-wide facts that per-file rules can't see:
 *  - physicsDisabled: some `new Engine({physics: false})` (or {enabled:false})
 *  - sceneKeys / sceneKeysReliable: union of the `scenes: {...}` map keys from
 *    every Engine construction; unreliable when a spread appears in a scenes
 *    literal or any `.addScene(...)` call exists (keys minted at runtime)
 *  - randomSeeds: every `new Random(<literal>)` site, for duplicate detection
 */
import type * as TS from "typescript";
import type { TsModule } from "../generate/ts-loader.ts";
import type { TypeUtils } from "./type-utils.ts";

export interface RandomSeedSite {
  file: string;
  seed: string;
  line: number;
  column: number;
}

export interface Facts {
  physicsDisabled: boolean;
  sceneKeys: Set<string>;
  sceneKeysReliable: boolean;
  sawScenesMap: boolean;
  randomSeeds: RandomSeedSite[];
}

export function collectFacts({
  ts,
  checker,
  utils,
  files,
}: {
  ts: TsModule;
  checker: TS.TypeChecker;
  utils: TypeUtils;
  files: Array<{ sf: TS.SourceFile; file: string }>;
}): Facts {
  const facts: Facts = {
    physicsDisabled: false,
    sceneKeys: new Set(),
    sceneKeysReliable: false,
    sawScenesMap: false,
    randomSeeds: [],
  };
  let unreliable = false;

  const seedText = (arg: TS.Expression): string | null => {
    const value = utils.unwrap(arg);
    if (!value) return null;
    if (ts.isNumericLiteral(value) || ts.isStringLiteral(value)) return value.getText();
    if (
      ts.isPrefixUnaryExpression(value) &&
      value.operator === ts.SyntaxKind.MinusToken &&
      ts.isNumericLiteral(value.operand)
    ) {
      return value.getText();
    }
    return null;
  };

  for (const { sf, file } of files) {
    const visit = (node: TS.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = utils.unwrap(node.expression);
        if (ts.isPropertyAccessExpression(callee) && callee.name.text === "addScene") {
          unreliable = true;
        }
      }
      if (ts.isNewExpression(node)) {
        const type = checker.getTypeAtLocation(node);
        if (utils.derivesFromExcalibur(type, ENGINE)) {
          readEngineOptions(node);
        } else if (utils.derivesFromExcalibur(type, RANDOM)) {
          const seed = node.arguments?.length ? seedText(node.arguments[0]) : null;
          if (seed !== null) {
            facts.randomSeeds.push({ file, seed, ...utils.lineCol(sf, node) });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    const readEngineOptions = (node: TS.NewExpression): void => {
      const options = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
      if (!options || !ts.isObjectLiteralExpression(options)) return;
      for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        const value = utils.unwrap(prop.initializer);
        if (prop.name.text === "physics") {
          if (value.kind === ts.SyntaxKind.FalseKeyword) facts.physicsDisabled = true;
          if (ts.isObjectLiteralExpression(value)) {
            const enabled = value.properties.find(
              (p): p is TS.PropertyAssignment =>
                ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === "enabled"
            );
            if (enabled && utils.unwrap(enabled.initializer).kind === ts.SyntaxKind.FalseKeyword) {
              facts.physicsDisabled = true;
            }
          }
        }
        if (prop.name.text === "scenes" && ts.isObjectLiteralExpression(value)) {
          facts.sawScenesMap = true;
          for (const scene of value.properties) {
            if (ts.isSpreadAssignment(scene) || !scene.name) {
              unreliable = true;
            } else if (ts.isIdentifier(scene.name) || ts.isStringLiteral(scene.name)) {
              facts.sceneKeys.add(scene.name.text);
            } else {
              unreliable = true; // computed key
            }
          }
        }
      }
    };

    visit(sf);
  }

  facts.sceneKeysReliable = facts.sawScenesMap && !unreliable && facts.sceneKeys.size > 0;
  return facts;
}

const ENGINE = new Set(["Engine"]);
const RANDOM = new Set(["Random"]);
