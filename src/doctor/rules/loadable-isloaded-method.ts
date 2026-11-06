import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * Excalibur v1 made `Loadable.isLoaded` a readonly boolean property (core
 * de02d9ff; it was a zero-arg method through 0.32). The loader reads it as
 * a property: `resources.filter((r) => !r.isLoaded)` — a class that still
 * declares the METHOD is always truthy there, so the loader skips it and
 * the resource silently never loads (and `loader.isLoaded` reports true).
 * Under `implements Loadable` TypeScript catches it, but three of nine
 * official templates are transpile-only builds and a structurally-typed
 * loadable never meets the interface. Gated on the INSTALLED excalibur's
 * `Loadable.isLoaded` being a property, so 0.32 projects stay quiet;
 * `ex upgrade` performs the conversion (methods-to-getters).
 */
export const loadableIsLoadedMethod: Rule = {
  id: "loadable-isloaded-method",
  description: "a Loadable still declares isLoaded() as a method — v1's loader reads the property and skips the resource",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report, program } = ctx;
    const LOADABLE = new Set(["Loadable"]);

    /** Is the installed excalibur's `Loadable.isLoaded` a property (v1) rather than a method (≤0.32)? Memoized per file. */
    let installedIsProperty: boolean | null = null;
    const v1Loadable = (): boolean => {
      if (installedIsProperty !== null) return installedIsProperty;
      installedIsProperty = false;
      for (const file of program.getSourceFiles()) {
        if (!program.isSourceFileFromExternalLibrary(file) || !file.fileName.includes("/node_modules/excalibur/")) continue;
        const moduleSymbol = checker.getSymbolAtLocation(file);
        const symbol = moduleSymbol ? checker.getExportsOfModule(moduleSymbol).find((e) => e.getName() === "Loadable") : undefined;
        const decl = symbol?.declarations?.find((d: TS.Declaration) => ts.isInterfaceDeclaration(d)) as TS.InterfaceDeclaration | undefined;
        const member = decl?.members.find((m) => m.name && ts.isIdentifier(m.name) && m.name.text === "isLoaded");
        if (member) {
          installedIsProperty = ts.isPropertySignature(member);
          break;
        }
      }
      return installedIsProperty;
    };

    return {
      [ts.SyntaxKind.ClassDeclaration](node: TS.ClassDeclaration) {
        const method = node.members.find(
          (m): m is TS.MethodDeclaration => ts.isMethodDeclaration(m) && !!m.name && ts.isIdentifier(m.name) && m.name.text === "isLoaded" && m.parameters.length === 0
        );
        if (!method || !node.name) return;
        if (ts.getModifiers(method)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) return;
        const symbol = checker.getSymbolAtLocation(node.name);
        if (!symbol) return;
        const type = checker.getDeclaredTypeOfSymbol(symbol);
        if (!utils.implementsExcalibur(type, LOADABLE) && !utils.derivesFromExcalibur(type, LOADABLE)) return;
        if (!v1Loadable()) return; // pre-v1 excalibur: the method IS the contract
        report({
          ...utils.lineCol(sf, method.name),
          message: `${node.name.text}.isLoaded() is a method, but v1's loader reads the isLoaded property — a method is always truthy, so this resource is never loaded`,
          hint: "declare it as a getter: `get isLoaded(): boolean { ... }` (ex upgrade's methods-to-getters migration does this)",
        });
      },
    };
  },
};
