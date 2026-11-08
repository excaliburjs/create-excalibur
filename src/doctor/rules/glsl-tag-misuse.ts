import type * as TS from "typescript";
import { blankComments } from "./no-reserved-uniforms.ts";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * Source authored with v1's `ex.glsl` tagged template that trips over what
 * the tag rewrites (verified in `graphics/context/glsl.ts` on core main):
 *  - `#version` is only stripped when it is the LITERAL start of the template
 *    (the regex has no multiline flag) — a leading comment leaves it in place
 *    and the tag emits a second one: `#version` must be first → compile error;
 *  - `pixel_texture(` makes the tag inject its own `pixel_texture` definition
 *    and a `uniform vec2 u_graphic_resolution;` — a user definition of either
 *    collides (the tag's dedupe regex doesn't see a precision-qualified
 *    `uniform highp vec2 u_graphic_resolution;`);
 *  - with premultiply on (no `#pragma excalibur premultiply(off)`), every
 *    `texture(` is rewritten to `ex_texture(`, which only has sampler2D
 *    overloads — sampling a samplerCube/sampler3D/isampler2D fails to
 *    compile; and a hand-written `color.rgb *= color.a;` premultiplies twice
 *    (the tag already does it on output; core only warns in dev builds).
 */
const NON_2D_SAMPLERS = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?(samplerCube|sampler3D|sampler2DArray|sampler2DShadow|isampler2D|usampler2D|isampler3D|usampler3D)\s+([A-Za-z_]\w*)/g;
const MANUAL_PREMULTIPLY = /[A-Za-z_]\w*\.rgb\s*(?:\*=|=)[^;]*\.a\s*;/;

export const glslTagMisuse: Rule = {
  id: "glsl-tag-misuse",
  description: "a shader written with the ex.glsl tag conflicts with what the tag injects (#version placement, pixel_texture, premultiply)",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;

    const isGlslTag = (tag: TS.Expression): boolean => {
      const expr = utils.unwrap(tag);
      const nameNode = ts.isPropertyAccessExpression(expr) ? expr.name : expr;
      const symbol = checker.getSymbolAtLocation(nameNode);
      const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return Boolean(resolved) && resolved!.getName() === "glsl" && utils.isExcaliburSymbol(resolved);
    };

    return {
      [ts.SyntaxKind.TaggedTemplateExpression](node: TS.TaggedTemplateExpression) {
        if (!isGlslTag(node.tag)) return;
        const start = node.template.getStart(sf);
        // Raw source of the template (backticks included) so matches map straight to file offsets.
        const raw = sf.text.slice(start, node.template.end);
        const text = blankComments(raw);
        const at = (offset: number) => {
          const { line, character } = sf.getLineAndCharacterOfPosition(start + offset);
          return { line: line + 1, column: character + 1 };
        };

        // The tag's own check runs on the RAW source (comments included), so a leading
        // comment is exactly what defeats it — test the raw text here, not the blanked one.
        const version = raw.indexOf("#version");
        if (version !== -1 && !/^`\s*$/.test(raw.slice(0, version))) {
          report({
            ...at(version),
            message: "#version is not the first thing in this ex.glsl template — the tag only strips a LEADING #version and emits its own, so the shader ends up with two",
            hint: "delete the #version line (the tag adds `#version 300 es`), or move it to the very start of the template.",
          });
        }

        const usesPixelTexture = /\bpixel_texture\s*\(/.test(text);
        if (usesPixelTexture) {
          const def = /\bvec4\s+pixel_texture\s*\(/.exec(text);
          if (def) {
            report({
              ...at(def.index),
              message: "pixel_texture is defined here AND injected by the ex.glsl tag (it sees `pixel_texture(` in the source) — duplicate function definition",
              hint: "drop the hand-written definition and use the tag's pixel_texture(sampler, uv), or rename yours.",
            });
          }
          const qualified = /\buniform\s+(?:lowp|mediump|highp)\s+vec2\s+u_graphic_resolution\b/.exec(text);
          if (qualified) {
            report({
              ...at(qualified.index),
              message: "u_graphic_resolution is declared with a precision qualifier — the ex.glsl tag's dedupe only recognizes `uniform vec2 u_graphic_resolution;` and injects a second declaration for pixel_texture",
              hint: "declare it exactly `uniform vec2 u_graphic_resolution;` (or omit it: the tag adds it when pixel_texture is used).",
            });
          }
        }

        const premultiply = !/#pragma\s+excalibur\s+premultiply\s*\(\s*off\s*\)/.test(text);
        if (!premultiply) return;
        NON_2D_SAMPLERS.lastIndex = 0;
        for (let m = NON_2D_SAMPLERS.exec(text); m; m = NON_2D_SAMPLERS.exec(text)) {
          const [, samplerType, name] = m as unknown as [string, string, string];
          const use = new RegExp(String.raw`\btexture\s*\(\s*${name}\b`).exec(text);
          if (use) {
            report({
              ...at(use.index),
              message: `texture(${name}, …) samples a ${samplerType} — the ex.glsl tag rewrites texture() to ex_texture(), which only has sampler2D overloads (compile error)`,
              hint: "sample it with ex_texture_raw() is sampler2D-only too — add `#pragma excalibur premultiply(off)` to this shader and handle alpha yourself, or split the non-2D sampling into an untagged shader.",
            });
          }
        }
        const manual = MANUAL_PREMULTIPLY.exec(text);
        if (manual) {
          report({
            ...at(manual.index),
            message: "manual premultiplication (`.rgb *= .a`) inside an ex.glsl template — the tag premultiplies the output itself, so this darkens edges twice",
            hint: "write straight-alpha math and let the tag premultiply, or add `#pragma excalibur premultiply(off)` to keep doing it by hand.",
          });
        }
      },
    };
  },
};
