import type * as TS from "typescript";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/**
 * `easeTo(x, y, ms, fn?)` / `easeBy(x, y, ms, fn?)` (deprecated 0.30, gone in
 * v1) → `moveTo({pos: vec(x, y), duration: ms, easing: fn})` /
 * `moveBy({offset: vec(x, y), ...})`. Only the plain positional form is
 * automated; anything else gets a breadcrumb. The rewrite needs `vec` — an
 * import edit is added once per file when missing.
 */
export const easeActionsToMoveTo: Migration = {
  id: "ease-actions-to-moveto",
  version: "0.30.0",
  promptType: "auto",
  title: "easeTo/easeBy actions are deprecated — use moveTo/moveBy with easing",
  link: V030,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils, editor } = ctx;
    const ACTIONS = new Set(["ActionContext"]);
    const VECTOR = new Set(["Vector"]);
    const col = ctx.collector(this.id);
    for (const { sf, text } of ctx.files) {
      let importNeeded = false;
      const visit = (node: TS.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const name = node.expression.name.text;
          if (
            (name === "easeTo" || name === "easeBy") &&
            utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), ACTIONS)
          ) {
            const args = node.arguments;
            const key = name === "easeTo" ? "pos" : "offset";
            const method = name === "easeTo" ? "moveTo" : "moveBy";
            const isVectorOverload =
              args.length >= 1 && utils.derivesFromExcalibur(checker.getTypeAtLocation(args[0]), VECTOR);
            if (isVectorOverload) {
              if (args.length >= 2 && args.length <= 3) {
                const [pos, ms, fn] = args.map((a) => a.getText(sf));
                const easing = fn ? `, easing: ${fn}` : "";
                col.addEdit(
                  sf,
                  { start: node.expression.name.getStart(sf), end: node.end },
                  `${method}({ ${key}: ${pos}, duration: ${ms}${easing} })`,
                  `${name}(...) -> ${method}({...})`
                );
              } else {
                col.addManual(sf, node, `${name} is deprecated — use ${name === "easeTo" ? "moveTo" : "moveBy"}({...})`, V030);
              }
            } else if (args.length >= 3 && args.length <= 4) {
              const [x, y, ms, fn] = args.map((a) => a.getText(sf));
              const easing = fn ? `, easing: ${fn}` : "";
              col.addEdit(
                sf,
                { start: node.expression.name.getStart(sf), end: node.end },
                `${method}({ ${key}: vec(${x}, ${y}), duration: ${ms}${easing} })`,
                `${name}(...) -> ${method}({...})`
              );
              importNeeded = true;
            } else {
              col.addManual(sf, node, `${name} is deprecated — use ${name === "easeTo" ? "moveTo" : "moveBy"}({...})`, V030);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      if (importNeeded) {
        const importEdit = editor.ensureNamedImport(sf, text, "excalibur", "vec");
        if (importEdit) {
          col.addEdit(sf, { getStart: () => importEdit.start, end: importEdit.end }, importEdit.text, "import vec");
        }
      }
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    return `${result.edits.length} ease action(s) to rewrite`;
  },
};

/**
 * `new Timer(fcn, interval, repeats?)` positional (removed 0.30) → the
 * option-bag form. Automated only when arg0 is function-shaped.
 */
export const timerOptionBag: Migration = {
  id: "timer-option-bag",
  version: "0.30.0",
  promptType: "auto",
  title: "Timer now only takes the option-bag constructor",
  link: V030,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node) && node.arguments && node.arguments.length >= 2) {
          const type = checker.getTypeAtLocation(node);
          const symbol = ((type as TS.TypeReference).target ?? type).getSymbol();
          if (symbol?.getName() === "Timer" && utils.isExcaliburSymbol(symbol)) {
            const first = utils.unwrap(node.arguments[0]);
            const functionish =
              ts.isArrowFunction(first) || ts.isFunctionExpression(first) || ts.isIdentifier(first);
            if (functionish && node.arguments.length <= 3) {
              const [fcn, interval, repeats] = node.arguments.map((a) => a.getText(sf));
              const tail = repeats !== undefined ? `, repeats: ${repeats}` : "";
              col.addEdit(
                sf,
                { start: node.arguments[0].getStart(sf), end: node.arguments[node.arguments.length - 1].end },
                `{ fcn: ${fcn}, interval: ${interval}${tail} }`,
                "positional Timer args -> option bag"
              );
            } else if (!ts.isObjectLiteralExpression(first)) {
              col.addManual(sf, node, "Timer now only takes an option bag: new Timer({ fcn, interval, repeats })", V030);
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
    return `${result.edits.length} positional Timer constructor(s)`;
  },
};

/**
 * ScreenShader source: `v_texcoord` varying renamed to `v_uv` (0.30, to
 * match the materials API). Only plain string / no-substitution template
 * literals are edited in place; templates with `${}` get a breadcrumb.
 */
export const screenShaderVTexcoord: Migration = {
  id: "screenshader-vtexcoord",
  version: "0.30.0",
  promptType: "auto",
  title: "ScreenShader v_texcoord is deprecated — use v_uv",
  link: V030,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node) && node.arguments?.length) {
          const type = checker.getTypeAtLocation(node);
          const symbol = ((type as TS.TypeReference).target ?? type).getSymbol();
          if (symbol?.getName() === "ScreenShader" && utils.isExcaliburSymbol(symbol)) {
            for (const arg of node.arguments) {
              const value = utils.unwrap(arg);
              if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
                const raw = sf.text.slice(value.getStart(sf), value.end);
                let idx = raw.indexOf("v_texcoord");
                while (idx !== -1) {
                  const abs = value.getStart(sf) + idx;
                  col.addEdit(sf, { start: abs, end: abs + "v_texcoord".length }, "v_uv", "v_texcoord -> v_uv");
                  idx = raw.indexOf("v_texcoord", idx + 1);
                }
              } else if (ts.isTemplateExpression(value) && value.getText(sf).includes("v_texcoord")) {
                col.addManual(sf, value, "shader uses v_texcoord (deprecated) inside a template with ${} — rename to v_uv by hand", V030);
              }
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
    return `${result.edits.length} v_texcoord occurrence(s) in shader sources`;
  },
};
