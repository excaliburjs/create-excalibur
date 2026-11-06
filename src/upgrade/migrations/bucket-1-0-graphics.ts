/**
 * v1 shader/material surface (core fe4f7f58 pipelines, 13106c34 MaterialContext,
 * post-processor `process()`); shapes verified in graphics/context/material.ts
 * and graphics/post-processor/* on main.
 */
import type * as TS from "typescript";
import { manualMigration } from "./_manual.ts";
import { removedExportsMigration } from "./_removed-exports.ts";
import { excaliburNameOf, memberSuffix, quoteOf } from "./_resolve.ts";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";
const MATERIAL = new Set(["Material"]);

/** `trySetUniform<Kind>(name, value)` forms the uniforms dictionary dispatches on by declared GLSL type. */
const SIMPLE_SETTERS = new Set([
  "trySetUniformFloat",
  "trySetUniformInt",
  "trySetUniformBoolean",
  "trySetUniformFloatVector",
  "trySetUniformFloatVector3",
  "trySetUniformFloatVector4",
  "trySetUniformFloatColor",
  "trySetUniformMatrix",
]);

/**
 * `material.update(shader => …)` now receives a `MaterialContext`
 * (`{ uniforms, shaders, shadersByName }`), and the composite shader is no
 * longer `use()`d before the callback. Two rewrites:
 *  - a body made only of `shader.trySetUniform<Kind>('name', value)` calls
 *    (the common case: sample-material, jelly-jumper) becomes
 *    `({ uniforms }) => { uniforms.name = value; }` — the recommended form,
 *    forwarded to every pipeline pass;
 *  - anything else (balatro's `shader.addImageSource` / `setUniform`, array
 *    uniforms, non-literal names) keeps the exact old semantics through
 *    `({ shaders: [shader] }) => { shader.use(); … }` plus a breadcrumb.
 */
export const materialUpdateContext: Migration = {
  id: "material-update-context",
  version: "1.0.0",
  promptType: "auto",
  title: "Material.update() passes a MaterialContext ({ uniforms, shaders }) instead of the Shader in v1",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils, editor } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf, text } of ctx.files) {
      const { eol } = editor.detectFormat(text);
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "update" &&
          node.arguments.length === 1 &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), MATERIAL)
        ) {
          const fn = utils.unwrap(node.arguments[0]!);
          if (!(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
            col.addManual(sf, node, "Material.update() passes a MaterialContext in v1 ({ uniforms, shaders, shadersByName }) — set ctx.uniforms.<name> = value, or use ctx.shaders[0] after calling .use() on it", V1);
            return;
          }
          const param = fn.parameters[0];
          if (fn.parameters.length !== 1 || !param || !ts.isIdentifier(param.name)) {
            if (fn.parameters.length > 0) col.addManual(sf, node, "Material.update() passes a MaterialContext in v1 — destructure { uniforms } or { shaders }", V1);
            return; // zero params: the callback never touched the shader
          }
          const p = param.name.text;
          const bodyStatements: TS.Node[] = ts.isBlock(fn.body) ? [...fn.body.statements] : [fn.body];
          const callOf = (stmt: TS.Node): TS.CallExpression | null => {
            const expr = ts.isExpressionStatement(stmt) ? stmt.expression : ts.isBlock(fn.body) ? null : (stmt as TS.Expression);
            const call = expr ? utils.unwrap(expr) : null;
            return call && ts.isCallExpression(call) ? call : null;
          };
          const simple = (stmt: TS.Node): { call: TS.CallExpression; name: string; value: TS.Expression } | null => {
            const call = callOf(stmt);
            if (!call || !ts.isPropertyAccessExpression(call.expression)) return null;
            const receiver = utils.unwrap(call.expression.expression);
            if (!ts.isIdentifier(receiver) || receiver.text !== p || !SIMPLE_SETTERS.has(call.expression.name.text)) return null;
            if (call.arguments.length !== 2) return null;
            const [name, value] = call.arguments as unknown as [TS.Expression, TS.Expression];
            const nameNode = utils.unwrap(name);
            if (!(ts.isStringLiteral(nameNode) || ts.isNoSubstitutionTemplateLiteral(nameNode))) return null;
            return { call, name: nameNode.text, value };
          };
          const parenthesized = sf.text[fn.getStart(sf)] === "(" || ts.isFunctionExpression(fn);
          const wrap = (inner: string) => (parenthesized ? inner : `(${inner})`);
          /** Does the statement mention the shader parameter at all? (locals computed for the uniforms don't) */
          const touchesParam = (stmt: TS.Node): boolean => {
            let found = false;
            const walk = (n: TS.Node): void => {
              if (found) return;
              if (ts.isIdentifier(n) && n.text === p) found = true;
              else ts.forEachChild(n, walk);
            };
            walk(stmt);
            return found;
          };
          const simples = bodyStatements.map(simple);
          const allSimple = bodyStatements.length > 0 && simples.every((s, i) => s !== null || !touchesParam(bodyStatements[i]!));
          if (allSimple && simples.some((s) => s !== null)) {
            const q = quoteOf(ctx, sf, fn);
            col.addEdit(sf, param, wrap("{ uniforms }"), "shader -> { uniforms }");
            for (const s of simples) {
              if (!s) continue;
              const assignment = `uniforms${memberSuffix(s.name, q)} = ${s.value.getText(sf)}`;
              if (ts.isBlock(fn.body)) {
                col.addEdit(sf, s.call, assignment, `${p}.trySetUniform…(${s.name}) -> uniforms.${s.name} = …`);
              } else {
                // an expression body becomes a block: `=> uniforms.x = v` would parse but reads as a return-assign
                col.addEdit(sf, fn.body, `{ ${assignment}; }`, `${p}.trySetUniform…(${s.name}) -> uniforms.${s.name} = …`);
              }
            }
            return;
          }
          // Fallback: keep the exact old semantics (the composite shader, used) and flag it.
          col.addEdit(sf, param, wrap(`{ shaders: [${p}] }`), "shader -> { shaders: [shader] }");
          if (ts.isBlock(fn.body)) {
            const first = fn.body.statements[0];
            if (first) {
              const lineStart = text.lastIndexOf("\n", first.getStart(sf) - 1) + 1;
              const indent = text.slice(lineStart, first.getStart(sf)).match(/^\s*/)![0];
              col.addEdit(sf, { start: first.getStart(sf), end: first.getStart(sf) }, `${p}.use();${eol}${indent}`, "use() the composite shader first");
            } else {
              const open = fn.body.getStart(sf) + 1;
              col.addEdit(sf, { start: open, end: open }, ` ${p}.use(); `, "use() the composite shader first");
            }
          } else {
            col.addEdit(sf, fn.body, `{ ${p}.use(); ${fn.body.getText(sf)}; }`, "use() the composite shader first");
          }
          col.addManual(
            sf,
            node,
            "Material.update() passes a MaterialContext in v1 — this callback was rewritten to keep using the composite shader; prefer `({ uniforms }) => { uniforms.<name> = value }`, which reaches every pipeline pass",
            V1
          );
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} Material.update callback edit(s)${extra}`;
  },
};

/**
 * `PostProcessor.getShader()/getLayout()` are deprecated on v1 (removal in
 * 1.x) in favor of `process(source, destination)` over a `ShaderPass`; the
 * built-in `ColorBlindnessPostProcessor` already dropped them. Breadcrumb
 * only: the ShaderPass conventions differ (`u_time_ms` is performance.now(),
 * `u_resolution` is drawing-buffer pixels, no `v_texcoord`), so a port is a
 * shader review, not a splice.
 */
export const postProcessorProcess = manualMigration({
  id: "postprocessor-process",
  version: "1.0.0",
  title: "PostProcessor.getShader/getLayout are deprecated in v1 — implement process(source, destination)",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const COLOR_BLIND = new Set(["ColorBlindnessPostProcessor"]);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isClassDeclaration(node)) {
          const implementsPostProcessor = (node.heritageClauses ?? []).some(
            (c) => c.token === ts.SyntaxKind.ImplementsKeyword && c.types.some((t) => excaliburNameOf(ctx, t.expression) === "PostProcessor")
          );
          if (implementsPostProcessor) {
            const legacy = node.members.find((m) => ts.isMethodDeclaration(m) && m.name && ts.isIdentifier(m.name) && (m.name.text === "getShader" || m.name.text === "getLayout"));
            if (legacy) {
              col.addManual(
                sf,
                legacy,
                "getShader()/getLayout() are deprecated in v1 (removed in 1.x) — implement process(source, destination) { this.pass.draw(source, destination) } with a ShaderPass; note ShaderPass conventions: u_image is the source, u_resolution is drawing-buffer pixels, u_time_ms is performance.now(), and there is no v_texcoord (use v_uv)",
                V1
              );
            }
          }
        } else if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === "getShader" || node.expression.name.text === "getLayout") &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), COLOR_BLIND)
        ) {
          col.addManual(sf, node, `ColorBlindnessPostProcessor.${node.expression.name.text}() was removed in v1 — it is a ShaderPass-based process() post processor now`, V1);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** `MaterialOptions` is a union type on v1 (`fragmentSource` xor `passes`); an interface cannot extend it. */
export const materialOptionsUnion = manualMigration({
  id: "material-options-union",
  version: "1.0.0",
  title: "MaterialOptions is a union type in v1 — interfaces extending it must become type intersections",
  link: V1,
  findSites(ctx, col) {
    const { ts } = ctx;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isInterfaceDeclaration(node)) {
          for (const clause of node.heritageClauses ?? []) {
            for (const type of clause.types) {
              if (excaliburNameOf(ctx, type.expression) === "MaterialOptions") {
                col.addManual(sf, node.name, "MaterialOptions is a union type in v1 (fragmentSource | passes) — an interface cannot extend it: write `type X = MaterialOptions & { … }`", V1);
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** The `@obsolete` decorator and its helpers were deleted (core aebbb023). */
export const obsoleteDecoratorRemoved = removedExportsMigration({
  id: "obsolete-decorator-removed",
  version: "1.0.0",
  title: "the @obsolete decorator (and ObsoleteOptions/maxMessages/resetObsoleteCounter) was removed in v1",
  link: V1,
  names: {
    obsolete: "(the deprecation decorator) was removed in v1 — log a one-time warning yourself (Logger.getInstance().warnOnce)",
    ObsoleteOptions: "was removed in v1 along with the @obsolete decorator",
    maxMessages: "was removed in v1 along with the @obsolete decorator",
    resetObsoleteCounter: "was removed in v1 along with the @obsolete decorator",
  },
});
