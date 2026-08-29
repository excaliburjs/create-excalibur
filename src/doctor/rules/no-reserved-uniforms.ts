import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * Flag shader sources that declare an excalibur built-in uniform/varying with
 * a conflicting GLSL type or qualifier.
 *
 * Ground truth (verified in build/dist/excalibur.development.js of BOTH
 * excalibur 0.32.0 and 0.33.0-alpha.174 — identical): excalibur does NOT
 * inject declarations into user shader source; `Material#fragmentSource` and
 * `new ScreenShader(ctx, source)` compile the user's text verbatim, so
 * declaring the built-ins is *required* to use them and never flags here.
 * The engine then sets them **by name with a fixed gl call** each draw
 * (`MaterialRenderer.draw`: trySetUniformFloat/FloatVector/Matrix/Int;
 * `Material.use`: trySetUniformFloatColor("u_color", …);
 * `updatePostProcessors`: u_time_ms/u_elapsed_ms/u_resolution; the screen
 * pass binds u_image to slot 0). `trySetUniform` looks the location up by
 * name and calls e.g. gl.uniform1f blind — a declaration with a different
 * type makes that call an INVALID_OPERATION no-op, so the uniform silently
 * stays zero; a wrong-typed varying fails program linking with a cryptic
 * "Could not link the program" throw. That mismatch is the real footgun.
 */

type ShaderRole = "uniform" | "varying" | "attribute";
interface BuiltinDecl {
  type: string;
  role: ShaderRole;
}
type BuiltinMap = Map<string, BuiltinDecl>;

const uniform = (type: string): BuiltinDecl => ({ type, role: "uniform" });
const varying = (type: string): BuiltinDecl => ({ type, role: "varying" });
const attribute = (type: string): BuiltinDecl => ({ type, role: "attribute" });

/**
 * Names + types the engine sets on every Material fragment shader.
 * Source: MaterialRenderer.draw + Material.use, excalibur 0.32.0 and
 * 0.33.0-alpha.174 (same list; u_color is set by Material.use even though
 * it's absent from Material.BuiltInUniforms). v_uv/v_screenuv come from the
 * default vertex source and are dropped when a custom vertexSource is given
 * (a custom vertex shader may legitimately retype its own varyings).
 */
const MATERIAL_FRAGMENT_BUILTINS: BuiltinMap = new Map([
  ["u_time_ms", uniform("float")],
  ["u_opacity", uniform("float")],
  ["u_resolution", uniform("vec2")],
  ["u_graphic_resolution", uniform("vec2")],
  ["u_size", uniform("vec2")],
  ["u_matrix", uniform("mat4")],
  ["u_transform", uniform("mat4")],
  ["u_graphic", uniform("sampler2D")],
  ["u_screen_texture", uniform("sampler2D")],
  ["u_color", uniform("vec4")],
  ["v_uv", varying("vec2")],
  ["v_screenuv", varying("vec2")],
]);

const MATERIAL_FRAGMENT_CUSTOM_VERTEX = new Map(
  [...MATERIAL_FRAGMENT_BUILTINS].filter(([name]) => !name.startsWith("v_"))
);

/**
 * Names the material vertex layout/renderer binds on a custom vertexSource.
 * Source: MaterialRenderer.initialize attributes + draw, 0.32.0 / 0.33-alpha.
 */
const MATERIAL_VERTEX_BUILTINS: BuiltinMap = new Map([
  ["a_position", attribute("vec2")],
  ["a_uv", attribute("vec2")],
  ["a_screenuv", attribute("vec2")],
  ["u_matrix", uniform("mat4")],
  ["u_transform", uniform("mat4")],
]);

/**
 * Names set on ScreenShader (post-processor) fragment shaders. Source:
 * ScreenShader's fixed vertex source (v_uv + deprecated v_texcoord),
 * updatePostProcessors, and the screen pass's trySetUniformInt("u_image", 0),
 * excalibur 0.32.0 and 0.33.0-alpha.174 (identical).
 */
const SCREEN_SHADER_BUILTINS: BuiltinMap = new Map([
  ["u_image", uniform("sampler2D")],
  ["u_time_ms", uniform("float")],
  ["u_elapsed_ms", uniform("float")],
  ["u_resolution", uniform("vec2")],
  ["v_uv", varying("vec2")],
  ["v_texcoord", varying("vec2")],
]);

const TYPE_TOKEN = /^(?:float|int|uint|bool|[biu]?vec[234]|mat[234](?:x[234])?|[iu]?sampler[A-Za-z0-9]+)$/;

/** Blank out GLSL comments, preserving every offset (and newlines). */
function blankComments(text: string): string {
  return text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

const declRegexCache = new Map<BuiltinMap, RegExp>();
function declRegex(reserved: BuiltinMap): RegExp {
  let re = declRegexCache.get(reserved);
  if (!re) {
    const names = [...reserved.keys()].sort((a, b) => b.length - a.length).join("|");
    re = new RegExp(
      String.raw`\b(uniform|varying|attribute|in|out)\b([^;{}()=]*?)\b(${names})\b\s*(\[[^\]\n]*\])?(?=\s*[;,=])`,
      "dg"
    );
    declRegexCache.set(reserved, re);
  }
  re.lastIndex = 0;
  return re;
}

const QUALIFIERS_FOR_ROLE: Record<ShaderRole, Set<string>> = {
  uniform: new Set(["uniform"]),
  varying: new Set(["in", "varying"]),
  attribute: new Set(["in", "attribute"]),
};

export const noReservedUniforms: Rule = {
  id: "no-reserved-uniforms",
  description: "a shader declares a built-in excalibur uniform with a conflicting type",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    const seen = new Set<number>(); // same const reused for two materials → one finding

    /**
     * Resolve a shader-source expression to raw text chunks with absolute
     * source offsets. Handles string/template literals, tagged templates
     * (the `glsl\`…\`` highlighting idiom), templates with ${} (static
     * chunks only — declarations don't span substitutions), and ONE hop
     * through a same-file const (`const fragmentSource = \`…\``, the shape
     * `ex generate material` emits).
     */
    const resolveChunks = (expr: TS.Expression, hops: number): Array<{ start: number; text: string }> => {
      const node = utils.unwrap(expr);
      if (!node) return [];
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        return [{ start: node.getStart(sf), text: sf.text.slice(node.getStart(sf), node.end) }];
      }
      if (ts.isTaggedTemplateExpression(node)) return resolveChunks(node.template, hops);
      if (ts.isTemplateExpression(node)) {
        const pieces = [node.head, ...node.templateSpans.map((s) => s.literal)];
        return pieces.map((p) => ({ start: p.getStart(sf), text: sf.text.slice(p.getStart(sf), p.end) }));
      }
      if (ts.isIdentifier(node) && hops > 0) {
        const symbol = ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent)
          : checker.getSymbolAtLocation(node);
        const decl = symbol?.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer && decl.getSourceFile() === sf) {
          return resolveChunks(decl.initializer, hops - 1);
        }
      }
      return [];
    };

    const scanChunk = (chunk: { start: number; text: string }, reserved: BuiltinMap, construct: string): void => {
      const text = blankComments(chunk.text);
      const re = declRegex(reserved);
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const [, qual, middle, name, arraySuffix] = m as unknown as [string, string, string, string, string | undefined];
        const builtin = reserved.get(name)!;
        const declaredType =
          middle.trim().split(/[\s,]+/).find((tok) => TYPE_TOKEN.test(tok)) ?? null;
        const qualOk = QUALIFIERS_FOR_ROLE[builtin.role].has(qual);
        if (qualOk && declaredType === null) continue; // can't parse the type — stay silent
        if (qualOk && declaredType === builtin.type && !arraySuffix) continue; // correct redeclaration (required usage)

        const pos = chunk.start + m.indices![3]![0];
        if (seen.has(pos)) continue;
        seen.add(pos);
        const roleWord = builtin.role === "uniform" ? "uniform" : builtin.role;
        const expectedQual = builtin.role === "uniform" ? "uniform" : "in";
        const declared = `${qual} ${declaredType ?? "?"}${arraySuffix ? "[]" : ""}`;
        const { line, character } = sf.getLineAndCharacterOfPosition(pos);
        report({
          line: line + 1,
          column: character + 1,
          message: `${name} is a built-in excalibur ${construct} ${roleWord} — declaring it \`${declared}\` conflicts with the engine's \`${expectedQual} ${builtin.type}\``,
          hint: `excalibur sets ${name} by name at draw time with a fixed gl call; a conflicting declaration silently reads as all zeros (or fails shader linking with a cryptic WebGL error). Declare it \`${expectedQual} ${builtin.type} ${name};\` or rename yours.`,
        });
      }
    };

    const scanExpr = (expr: TS.Expression, reserved: BuiltinMap, construct: string): void => {
      for (const chunk of resolveChunks(expr, 1)) scanChunk(chunk, reserved, construct);
    };

    const checkMaterialOptions = (optionsExpr: TS.Expression | undefined): void => {
      const obj = optionsExpr && utils.unwrap(optionsExpr);
      if (!obj || !ts.isObjectLiteralExpression(obj)) return;
      let fragment: TS.Expression | null = null;
      let vertex: TS.Expression | null = null;
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
        if (key === "fragmentSource") fragment = value;
        else if (key === "vertexSource") vertex = value;
      }
      if (fragment) {
        scanExpr(fragment, vertex ? MATERIAL_FRAGMENT_CUSTOM_VERTEX : MATERIAL_FRAGMENT_BUILTINS, "Material");
      }
      if (vertex) scanExpr(vertex, MATERIAL_VERTEX_BUILTINS, "Material");
    };

    return {
      [ts.SyntaxKind.NewExpression](node: TS.NewExpression) {
        const type = checker.getTypeAtLocation(node);
        const symbol = ((type as TS.TypeReference).target ?? type).getSymbol();
        const name = symbol?.getName();
        if (name === "Material" && utils.isExcaliburSymbol(symbol)) {
          checkMaterialOptions(node.arguments?.[0]);
        } else if (name === "ScreenShader" && utils.isExcaliburSymbol(symbol)) {
          // ctor is (graphicsContext, fragmentSource) — non-literal args resolve to no chunks
          for (const arg of node.arguments ?? []) scanExpr(arg, SCREEN_SHADER_BUILTINS, "ScreenShader");
        }
      },
      [ts.SyntaxKind.CallExpression](node: TS.CallExpression) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "createMaterial") return;
        const symbol = checker.getSymbolAtLocation(callee.name);
        if (!symbol || !utils.isExcaliburSymbol(symbol)) return;
        checkMaterialOptions(node.arguments?.[0]);
      },
    };
  },
};
