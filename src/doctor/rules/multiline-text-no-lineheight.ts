import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
import { detectExcaliburVersion } from "../../docs/version.ts";
import { compareVersions, parseVersion } from "../../upgrade/versions.ts";
/**
 * `new Text({ text: "a\nb", font: new Font({ size: 16 }) })` — multi-line
 * text (a `\n` in the literal, or `maxWidth` wrapping) drawn with a Font
 * that has no explicit `lineHeight`. v1 derives per-line spacing from the
 * measured block height minus the max ascent, which makes wrapped and
 * `\n`-containing lines overlap; an explicit `lineHeight` (≈1.2× the size)
 * is the workaround.
 *
 * This is an ENGINE bug with a bounded lifetime: introduced by core ab17499c
 * (first shipped in the 0.33.0 alphas), present in 1.0.0 and the 1.1.0
 * alphas through 323, fixed in core by 58093ef5 (lines stack by glyph height
 * again, as on 0.32). The rule only fires when the installed excalibur is in
 * that window — on 0.32 and on any later release the code is fine as written.
 *
 * Only fires on what it can prove: the callee is excalibur's own Text or
 * Label, the options literal has no spread, `text` is a string/template
 * literal containing a newline OR a `maxWidth` key is present, and the
 * `font` initializer is an inline `new Font({…})` without `lineHeight`
 * (or `new Font()`), or an identifier whose same-file `const`/`let`
 * initializer is such a `new Font`. No `font` key, a font from `this.x`
 * or another module, computed text — all quiet.
 */
/** Last published prerelease that still carries the bug (the fix landed after it). */
const LAST_AFFECTED_ALPHA = "1.1.0-alpha.323";

/** true when the installed excalibur overlaps unspaced lines; unknown versions stay quiet. */
export function lineHeightBugAffects(version: string | null | undefined): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  if (compareVersions(parsed, "0.33.0-alpha.0") < 0) return false;
  if (compareVersions(parsed, "1.0.0") <= 0) return true;
  return compareVersions(parsed, "1.1.0-alpha.0") >= 0 && compareVersions(parsed, LAST_AFFECTED_ALPHA) <= 0;
}

const TEXT_CLASSES = new Set(["Text", "Label"]);
const FONT_CLASS = new Set(["Font"]);

export const multilineTextNoLineheight: Rule = {
  id: "multiline-text-no-lineheight",
  description: "multi-line Text/Label drawn with a Font that has no explicit lineHeight (lines overlap on excalibur 1.0.0 and the alphas before the fix)",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    let affected: boolean | undefined;
    const isAffected = (): boolean => (affected ??= lineHeightBugAffects(detectExcaliburVersion(ctx.projectDir).version));

    interface PropLookup {
      present: boolean;
      /** the assigned expression (shorthand `{ font }` → the identifier) */
      initializer: TS.Expression | null;
      /** value symbol for shorthand properties (name lookup gives the property symbol) */
      valueSymbol?: TS.Symbol;
    }

    function findProp(literal: TS.ObjectLiteralExpression, name: string): PropLookup {
      for (const prop of literal.properties) {
        if (!prop.name || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) || prop.name.text !== name) continue;
        if (ts.isPropertyAssignment(prop)) return { present: true, initializer: prop.initializer };
        if (ts.isShorthandPropertyAssignment(prop)) {
          return { present: true, initializer: null, valueSymbol: checker.getShorthandAssignmentValueSymbol(prop) };
        }
        return { present: true, initializer: null }; // method / accessor
      }
      return { present: false, initializer: null };
    }

    /** The excalibur class name the `new` targets, when it is one of `names`. */
    function excaliburClassName(node: TS.NewExpression, names: ReadonlySet<string>): string | null {
      const symbol = checker.getTypeAtLocation(utils.unwrap(node.expression)).getSymbol();
      if (!symbol || !names.has(symbol.getName()) || !utils.isExcaliburSymbol(symbol)) return null;
      return symbol.getName();
    }

    /** The single spread-free object-literal argument, or null. */
    function optionsLiteral(node: TS.NewExpression): TS.ObjectLiteralExpression | null {
      if (!node.arguments || node.arguments.length !== 1) return null;
      const arg = utils.unwrap(node.arguments[0]!);
      if (!ts.isObjectLiteralExpression(arg) || arg.properties.some((p) => ts.isSpreadAssignment(p))) return null;
      return arg;
    }

    function isMultiline(literal: TS.ObjectLiteralExpression): boolean {
      if (findProp(literal, "maxWidth").present) return true;
      const text = findProp(literal, "text");
      if (!text.initializer) return false;
      const init = utils.unwrap(text.initializer);
      if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) return init.text.includes("\n");
      if (ts.isTemplateExpression(init)) {
        return init.head.text.includes("\n") || init.templateSpans.some((span) => span.literal.text.includes("\n"));
      }
      return false;
    }

    /** `new Font()` / `new Font({…})` (excalibur's) with no lineHeight key. */
    function fontNewLacksLineHeight(node: TS.NewExpression): boolean {
      if (!excaliburClassName(node, FONT_CLASS)) return false;
      if (!node.arguments || node.arguments.length === 0) return true;
      const literal = optionsLiteral(node);
      return literal ? !findProp(literal, "lineHeight").present : false;
    }

    function fontSymbolLacksLineHeight(symbol: TS.Symbol | undefined): boolean {
      const decl = symbol?.getDeclarations?.()?.[0];
      if (!decl || decl.getSourceFile() !== sf || !ts.isVariableDeclaration(decl) || !decl.initializer) return false;
      const init = utils.unwrap(decl.initializer);
      return ts.isNewExpression(init) && fontNewLacksLineHeight(init);
    }

    function fontExprLacksLineHeight(expr: TS.Expression): boolean {
      const init = utils.unwrap(expr);
      if (ts.isNewExpression(init)) return fontNewLacksLineHeight(init);
      if (ts.isIdentifier(init)) return fontSymbolLacksLineHeight(checker.getSymbolAtLocation(init));
      return false;
    }

    return {
      [ts.SyntaxKind.NewExpression](node: TS.NewExpression) {
        const className = excaliburClassName(node, TEXT_CLASSES);
        if (!className) return;
        const literal = optionsLiteral(node);
        if (!literal || !isMultiline(literal)) return;
        const font = findProp(literal, "font");
        if (!font.present) return;
        const lacks = font.initializer
          ? fontExprLacksLineHeight(font.initializer)
          : font.valueSymbol
            ? fontSymbolLacksLineHeight(font.valueSymbol)
            : false;
        if (!lacks || !isAffected()) return;
        report({
          ...utils.lineCol(sf, node),
          message: `multi-line ${className} without an explicit Font.lineHeight`,
          hint: "the installed excalibur (0.33 alphas through 1.0.0 / 1.1.0-alpha.323) spaces unsized lines too tightly, so wrapped or \\n-containing text overlaps. Upgrade excalibur to a release with the fix, or set lineHeight explicitly on the Font (e.g. ~1.2x the font size).",
        });
      },
    };
  },
};
