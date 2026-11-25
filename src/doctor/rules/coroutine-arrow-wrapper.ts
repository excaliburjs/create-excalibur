import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
import { detectExcaliburVersion } from "../../docs/version.ts";
import { compareVersions, parseVersion } from "../../upgrade/versions.ts";
/**
 * `ex.coroutine(() => myGenerator(args))` — an arrow (or plain, non-star
 * function expression) in the generator slot. The pre-fix dispatch
 * (src/engine/util/coroutine.ts before core 68ed9134) is a chain of
 * sequential `if (isCoroutineGenerator(args[0]))` / `if (isCoroutineGenerator
 * (args[1]))` / `if (args[1] instanceof Engine)` / `if (args[0] instanceof
 * Engine)` probes, and `isCoroutineGenerator` only accepts real `function*`
 * values (Function.prototype.toString must have the generator head, or the
 * prototype must be GeneratorFunction's). An arrow or plain function fails
 * both tests, so:
 *
 *  - `coroutine(arrow)` / `coroutine(arrow, opts)` — no probe matches, the
 *    slot stays `undefined`, and the very next line,
 *    `coroutineGenerator!.bind(thisArg)`, throws "Cannot read properties of
 *    undefined (reading 'bind')". CRASH. The same is true for the inverted
 *    `coroutine(arrow, engine)`: the args[1] instanceof Engine branch fires
 *    and reads a MISSING args[2], and with a function at args[0] the
 *    args[0] instanceof Engine branch cannot rescue it.
 *  - `coroutine(thisArg, arrow, opts?)` — same: the arrow is not a generator
 *    and thisArg is not an Engine, so nothing matches. CRASH. A `function*`
 *    at position ≥ 2 cannot rescue it either — isCoroutineGenerator probes
 *    only args[0]/args[1], and position 2 is the options slot.
 *  - `coroutine(engine, arrow)` / `coroutine(thisArg, engine, arrow)` — the
 *    `instanceof Engine` branches assign the slot UNVALIDATED (args[1] /
 *    args[2]), so the wrapper is bound and CALLED and whatever it returns is
 *    driven as the generator. A wrapper returning a generator happens to work
 *    pre-fix, so those shapes are deliberately NOT flagged.
 *
 * Core 68ed9134 (2026-11-25, #3939) fixes it: the dispatch accepts any
 * callable in the slot and the spec adds the wrapper idiom as supported.
 * The fix is in NO published release at the time this rule shipped (npm
 * latest = 1.0.1, next = 1.1.0-alpha.323), so the version gate is a bounded
 * window over every release with the MODERN dispatch (core faa4a37f, first
 * in stable v0.29.2) — versions that predate the API stay quiet, and so do
 * v0.29.0/v0.29.1: those carry only the old 2-arg coroutine(engine, generator)
 * shape with the call inside a Promise executor, so a wrapper there fails
 * too — but as a rejected promise ("coroutineGenerator is not a function"),
 * not the synchronous .bind throw this rule's hint describes.
 *
 * Only fires on what it can prove: the callee is excalibur's own coroutine,
 * neither args[0] nor args[1] is a `function*` expression (the dispatch would
 * find it there), the wrapper in the slot is an inline arrow/non-star
 * function expression, and every other probed argument can be neither a
 * generator function (its type is not callable) nor an Engine (an Engine in
 * the Engine slots makes the call work by accident — the checker's own
 * assignability decides, including the weak-type rule that keeps an Engine
 * out of an options interface). Identifier references in the slot stay
 * quiet — they may reference a real generator function.
 */
/** First release with the modern dispatch (core faa4a37f, in v0.29.2/v0.29.3); the synchronous .bind crash exists only from here. */
const FIRST_AFFECTED_RELEASE = "0.29.2";
/**
 * Last published releases that still crash; the fix (core 68ed9134) is
 * unreleased. RAISE these when a published release carries the fix — but
 * re-check them on EVERY npm publish, not just the fix: a still-crashing
 * release above the ceilings (an unfixed 1.0.2 cut from the 1.0 line, or an
 * unfixed 1.1.0-alpha.324+) would be silently missed below them.
 */
const LAST_AFFECTED_RELEASE = "1.0.1";
const LAST_AFFECTED_ALPHA = "1.1.0-alpha.323";

/** true when the installed excalibur crashes on non-generator coroutine wrappers; unknown versions stay quiet. */
export function coroutineArrowWrapperAffects(version: string | null | undefined): boolean {
  const parsed = parseVersion(version);
  if (!parsed) return false;
  if (compareVersions(parsed, FIRST_AFFECTED_RELEASE) < 0) return false;
  if (compareVersions(parsed, LAST_AFFECTED_RELEASE) <= 0) return true;
  return compareVersions(parsed, "1.1.0-alpha.0") >= 0 && compareVersions(parsed, LAST_AFFECTED_ALPHA) <= 0;
}

const ENGINE = new Set(["Engine"]);

export const coroutineArrowWrapper: Rule = {
  id: "coroutine-arrow-wrapper",
  description:
    "ex.coroutine's generator argument is an arrow/plain function instead of a function* — it crashes at runtime on every published excalibur",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, program, report } = ctx;
    let affected: boolean | undefined;
    const isAffected = (): boolean => (affected ??= coroutineArrowWrapperAffects(detectExcaliburVersion(ctx.projectDir).version));

    /** The installed excalibur's Engine type (for the "could this be an Engine" probe). */
    let engineType: TS.Type | null | undefined;
    const installedEngineType = (): TS.Type | null => {
      if (engineType !== undefined) return engineType;
      engineType = null;
      for (const file of program.getSourceFiles()) {
        if (!program.isSourceFileFromExternalLibrary(file) || !file.fileName.includes("/node_modules/excalibur/")) continue;
        const moduleSymbol = checker.getSymbolAtLocation(file);
        const symbol = moduleSymbol ? checker.getExportsOfModule(moduleSymbol).find((e) => e.getName() === "Engine") : undefined;
        if (symbol) {
          engineType = checker.getDeclaredTypeOfSymbol(symbol);
          break;
        }
      }
      return engineType;
    };

    /**
     * Could this argument hold an Engine instance at runtime? True for
     * Engine and its subclasses (the instanceof branches match → the call
     * works by accident, so the rule stays quiet), and for any type an
     * Engine value could be assigned to (any, unknown, unions, supertypes).
     * An object literal is provably not an Engine instance — its prototype
     * chain is Object.prototype, not Engine.prototype — even though `{}`'s
     * weak type is structurally assignable from Engine.
     */
    function couldBeEngine(expr: TS.Expression): boolean {
      if (ts.isObjectLiteralExpression(expr)) return false;
      const type = checker.getTypeAtLocation(expr);
      if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true; // unprovable
      if (utils.derivesFromExcalibur(type, ENGINE)) return true;
      const engine = installedEngineType();
      if (!engine) return true; // can't probe the installed typings — assume it could be
      return checker.isTypeAssignableTo(engine, type);
    }

    /**
     * Could this argument be the real generator function? Inline arrows and
     * non-star function expressions are provably not (that is the bug);
     * anything else is decided by the checker — a callable type might be a
     * generator function, so it can rescue the dispatch and the rule stays
     * quiet.
     */
    function couldBeGeneratorFunction(expr: TS.Expression): boolean {
      if (ts.isFunctionExpression(expr)) return !!expr.asteriskToken;
      if (ts.isArrowFunction(expr)) return false;
      if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr) || ts.isElementAccessExpression(expr)) {
        if (!checker.getSymbolAtLocation(expr)) return true; // unresolved reference — unprovable
      }
      const type = checker.getTypeAtLocation(expr);
      if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
      return type.getCallSignatures().length > 0;
    }

    /** Inline arrow or non-star function expression — the shapes isCoroutineGenerator rejects. */
    function nonGeneratorWrapper(expr: TS.Expression): TS.ArrowFunction | TS.FunctionExpression | null {
      if (ts.isArrowFunction(expr)) return expr;
      if (ts.isFunctionExpression(expr) && !expr.asteriskToken) return expr;
      return null;
    }

    return {
      [ts.SyntaxKind.CallExpression](node: TS.CallExpression) {
        const callee = utils.unwrap(node.expression);
        // ex.coroutine(...) or an imported coroutine(...) — resolve through
        // import aliases so the symbol's provenance is excalibur's own.
        const probe = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
        if (!ts.isIdentifier(probe)) return;
        const raw = checker.getSymbolAtLocation(probe);
        if (!raw) return;
        const symbol = raw.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(raw) : raw;
        if (symbol.getName() !== "coroutine" || !utils.isExcaliburSymbol(symbol)) return;

        const args = node.arguments.map((a) => utils.unwrap(a));
        if (args.length === 0) return;
        if (args.some((a) => ts.isSpreadElement(a))) return; // could expand into any shape — unprovable
        // A function* in args[0]/args[1]: the pre-fix dispatch finds it
        // (isCoroutineGenerator probes exactly those two positions). One at
        // position ≥ 2 is NEVER probed (that is the options slot) — the call
        // still crashes, so the scan below runs.
        if (args.slice(0, 2).some((a) => ts.isFunctionExpression(a) && a.asteriskToken)) return;

        // The working-by-accident Engine shapes: (engine, gen, opts?) — the
        // args[0] instanceof Engine branch assigns args[1] unvalidated — and
        // (thisArg, engine, gen, opts?) — the args[1] instanceof Engine
        // branch assigns args[2] unvalidated. In both, the wrapper is bound
        // and CALLED and its return value driven as the generator, so they
        // are never flagged. The args[1] bail needs args.length >= 3: a
        // 2-arg (thisArg, engine) call is that reading with NO generator
        // slot (args[2] is undefined → crash), and with a wrapper at args[0]
        // no other probe can rescue it — inverted shapes like
        // coroutine(wrapper, engine) crash and must fall through to flag.
        if (args.length >= 3 && couldBeEngine(args[1]!)) return;
        if (couldBeEngine(args[0]!)) return;

        // Remaining shapes — (gen, opts?) / (thisArg, gen, opts?) — fill the slot
        // only when args[0] or args[1] IS a generator function. Flag when the
        // slot is an inline non-generator wrapper and no probe can find the
        // real generator. Positions past 1 never reach isCoroutineGenerator.
        let wrapper: TS.ArrowFunction | TS.FunctionExpression | null = null;
        for (const arg of args.slice(0, 2)) {
          const found = nonGeneratorWrapper(arg);
          if (found) {
            wrapper = found;
            continue;
          }
          if (couldBeGeneratorFunction(arg)) return; // may hold the real generator — unprovable
        }
        if (!wrapper || !isAffected()) return;
        const kind = ts.isArrowFunction(wrapper) ? "an arrow function" : "a plain function";
        report({
          ...utils.lineCol(sf, wrapper),
          message: `ex.coroutine's generator argument is ${kind}, not a function* — this call crashes at runtime on the installed excalibur`,
          hint: 'the pre-fix dispatch never finds a generator for a non-star function, so it throws "Cannot read properties of undefined (reading \'bind\')". Pass the generator directly — ex.coroutine(function* () { ... }) — or bind this: ex.coroutine(myThis, function* () { ... }). Wrapper support only arrives in the first excalibur release published after 1.1.0-alpha.323 (core 68ed9134).',
        });
      },
    };
  },
};
