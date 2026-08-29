/**
 * Upgrade-only project facts, layered on doctor's collectFacts:
 *  - displayModes: the DisplayMode.<name> values passed to Engine options
 *    (screen-coordinates-rooting goes quiet when every mode is non-clipping)
 *  - usesRealisticPhysics: SolverStrategy.Realistic (or 'realistic') anywhere
 *    in an Engine physics config (gates the physics-sleep-defaults pin)
 */
import type * as TS from "typescript";
import type { TsModule } from "../generate/ts-loader.ts";
import type { TypeUtils } from "../doctor/type-utils.ts";

export interface UpgradeFacts {
  displayModes: Set<string>;
  usesRealisticPhysics: boolean;
}

export function collectUpgradeFacts({
  ts,
  checker,
  utils,
  files,
}: {
  ts: TsModule;
  checker: TS.TypeChecker;
  utils: TypeUtils;
  files: Array<{ sf: TS.SourceFile; file: string }>;
}): UpgradeFacts {
  const facts: UpgradeFacts = { displayModes: new Set(), usesRealisticPhysics: false };
  const ENGINE = new Set(["Engine"]);

  for (const { sf } of files) {
    const visit = (node: TS.Node): void => {
      if (ts.isNewExpression(node) && utils.derivesFromExcalibur(checker.getTypeAtLocation(node), ENGINE)) {
        const options = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
        if (options && ts.isObjectLiteralExpression(options)) readEngineOptions(options);
      }
      ts.forEachChild(node, visit);
    };
    const readEngineOptions = (options: TS.ObjectLiteralExpression): void => {
      for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        const value = utils.unwrap(prop.initializer);
        if (prop.name.text === "displayMode" && ts.isPropertyAccessExpression(value)) {
          facts.displayModes.add(value.name.text);
        }
        if (prop.name.text === "physics") {
          const text = prop.initializer.getText(sf);
          if (/Realistic|['"]realistic['"]/.test(text)) facts.usesRealisticPhysics = true;
        }
      }
    };
    visit(sf);
  }
  return facts;
}
