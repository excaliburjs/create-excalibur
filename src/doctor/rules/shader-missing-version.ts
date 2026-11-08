import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * An UNTAGGED shader string handed to excalibur must begin with `#version
 * 300 es`: the engine injects nothing into user shader source (verified on
 * 0.32 and on v1 main — `material.ts:249`, `shader-pass.ts:172`,
 * `screen-shader.ts:41`, `shader.ts:590`; core e5c8601e also stopped
 * auto-tagging `passes:` strings), and WebGL2 rejects a GLSL ES 3.00 source
 * whose first characters aren't the version directive. Only v1's `ex.glsl`
 * tag adds the preamble, so tagged templates are skipped. Covers Material
 * fragment/vertex sources, `passes:` strings, ShaderPass fragments, and
 * ScreenShader sources — literal or ONE hop through a same-file const.
 */
const PASS_CONSTRUCTORS = new Set(["ShaderPass", "ShaderPipeline", "ShaderPipelinePostProcessor"]);

export const shaderMissingVersion: Rule = {
  id: "shader-missing-version",
  description: "an untagged shader source does not start with #version 300 es (excalibur injects no preamble)",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    const seen = new Set<number>();

    /** The literal a shader expression resolves to (one const hop), or null for tagged templates and non-literals. */
    const resolveLiteral = (expr: TS.Expression, hops: number): TS.StringLiteral | TS.NoSubstitutionTemplateLiteral | TS.TemplateExpression | null => {
      const node = utils.unwrap(expr);
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return node;
      if (ts.isIdentifier(node) && hops > 0) {
        const symbol = ts.isShorthandPropertyAssignment(node.parent) ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer && decl.getSourceFile() === sf) return resolveLiteral(decl.initializer, hops - 1);
      }
      return null; // tagged templates (ex.glsl) and anything dynamic
    };

    const check = (expr: TS.Expression | undefined, construct: string): void => {
      if (!expr) return;
      const literal = resolveLiteral(expr, 1);
      if (!literal) return;
      const head = ts.isTemplateExpression(literal) ? literal.head.text : literal.text;
      if (head.trim().length === 0 && !ts.isTemplateExpression(literal)) return; // empty source is a different bug
      if (/^\s*#version\b/.test(head)) return;
      const pos = literal.getStart(sf);
      if (seen.has(pos)) return;
      seen.add(pos);
      report({
        ...utils.lineCol(sf, literal),
        message: `${construct} shader source does not start with #version 300 es — excalibur injects no preamble, so WebGL rejects it`,
        hint: "put `#version 300 es` as the very first characters of the source (then `precision mediump float;`), or author it with the ex.glsl tag (v1), which adds both.",
      });
    };

    const checkOptions = (optionsExpr: TS.Expression | undefined, construct: string): void => {
      const obj = optionsExpr && utils.unwrap(optionsExpr);
      if (!obj || !ts.isObjectLiteralExpression(obj)) return;
      for (const prop of obj.properties) {
        let key: string | null = null;
        let value: TS.Expression | null = null;
        if (ts.isPropertyAssignment(prop)) {
          key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
          value = prop.initializer;
        } else if (ts.isShorthandPropertyAssignment(prop)) {
          key = prop.name.text;
          value = prop.name;
        }
        if (!key || !value) continue;
        if (key === "fragmentSource" || key === "vertexSource") check(value, construct);
        else if (key === "passes") {
          const list = utils.unwrap(value);
          if (ts.isArrayLiteralExpression(list)) for (const el of list.elements) check(el, `${construct} pass`);
        }
      }
    };

    return {
      [ts.SyntaxKind.NewExpression](node: TS.NewExpression) {
        const type = checker.getTypeAtLocation(node);
        const symbol = ((type as TS.TypeReference).target ?? type).getSymbol();
        const name = symbol?.getName();
        if (!name || !utils.isExcaliburSymbol(symbol)) return;
        if (name === "Material") checkOptions(node.arguments?.[0], "Material");
        else if (name === "ScreenShader") check(node.arguments?.[1], "ScreenShader");
        else if (PASS_CONSTRUCTORS.has(name)) checkOptions(node.arguments?.[0], name);
      },
      [ts.SyntaxKind.CallExpression](node: TS.CallExpression) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "createMaterial") return;
        const symbol = checker.getSymbolAtLocation(callee.name);
        if (!symbol || !utils.isExcaliburSymbol(symbol)) return;
        checkOptions(node.arguments?.[0], "Material");
      },
    };
  },
};
