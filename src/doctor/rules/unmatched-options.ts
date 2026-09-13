import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * An options bag passed to an excalibur call/constructor carries a key that
 * no overload declares — `actions.moveBy({ offset, durationMs: 1000 })`
 * (the option is `duration`). With a type-checking build TS rejects the
 * excess key; a transpile-only build (esbuild/vite/parcel without `tsc`)
 * ships it, and excalibur's fluent APIs match overloads by arity/shape at
 * runtime and return `this` on a miss — the action is never queued, nothing
 * throws, nothing moves.
 *
 * This is an EXCESS-KEY check, not overload resolution: the spike showed
 * `checker.getResolvedSignature` picks the options overload for the bad
 * call exactly as for a valid one (it never returns undefined on a
 * mismatch). So: union the property names of every overload's
 * single-object parameter and flag literal keys outside the union.
 *
 * Skips (quiet, never guesses): callee not declared by excalibur; the
 * literal has a spread or computed key; more than one argument; any
 * candidate parameter typed `any`/`unknown`, a type parameter, an
 * index-signature type (Record/arrays), or a propertyless `object`/`{}` —
 * one such overload accepts anything, so nothing can be "excess".
 * Overloads that need more than one required argument (the positional
 * `moveBy(offset, speed)` forms) can't match a one-literal call and are
 * left out of the union. Union parameter types (`Options | undefined` for
 * an optional bag) are flattened over their object constituents —
 * `getPropertiesOfType` on a union yields only the common members.
 */
export const unmatchedOptions: Rule = {
  id: "unmatched-options",
  description: "an options object has a key no overload accepts — the call silently does nothing",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;

    interface LiteralKey {
      name: string;
      node: TS.ObjectLiteralElementLike;
    }

    /** Plain keys of the literal, or null when a spread/computed key makes the shape unknowable. */
    function literalKeys(literal: TS.ObjectLiteralExpression): LiteralKey[] | null {
      const keys: LiteralKey[] = [];
      for (const prop of literal.properties) {
        if (ts.isSpreadAssignment(prop) || !prop.name) return null;
        const name = prop.name;
        if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) || ts.isNumericLiteral(name)) {
          keys.push({ name: name.text, node: prop });
        } else {
          return null; // computed key
        }
      }
      return keys;
    }

    function requiredParamCount(params: readonly TS.Symbol[]): number {
      let count = 0;
      for (const param of params) {
        const decl = param.valueDeclaration;
        if (decl && ts.isParameter(decl) && !decl.questionToken && !decl.initializer && !decl.dotDotDotToken) count++;
      }
      return count;
    }

    /**
     * Union of the option names across every overload that could take a
     * single object literal, or null when some overload accepts anything.
     */
    function acceptedKeys(signatures: readonly TS.Signature[], site: TS.Node): Set<string> | null {
      const keys = new Set<string>();
      for (const sig of signatures) {
        const params = sig.getParameters();
        if (params.length === 0 || requiredParamCount(params) > 1) continue; // can't match one literal argument
        const type = checker.getTypeOfSymbolAtLocation(params[0]!, site);
        const constituents = type.isUnion() ? type.types : [type];
        const UNKNOWABLE = ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter;
        for (const t of constituents) {
          // flag tests, not the isTypeParameter() guard: TS narrows `t` to never after a guarded early return
          if (t.flags & UNKNOWABLE) return null;
          if (t.flags & ts.TypeFlags.Intersection && (t as TS.IntersectionType).types.some((c) => c.flags & UNKNOWABLE)) return null;
          if (!(t.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection))) continue; // a primitive/undefined constituent can't take a literal
          if (checker.getIndexInfosOfType(t).length > 0) return null;
          const props = checker.getPropertiesOfType(t);
          if (props.length === 0) return null; // `object` / `{}` accept any key
          for (const prop of props) keys.add(prop.name);
        }
      }
      return keys;
    }

    function calleeLabel(node: TS.CallExpression | TS.NewExpression, callee: TS.Expression): string {
      if (callee.kind === ts.SyntaxKind.SuperKeyword) return "super";
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : callee.getText(sf);
      return ts.isNewExpression(node) ? `new ${name}` : name;
    }

    function check(node: TS.CallExpression | TS.NewExpression): void {
      if (!node.arguments || node.arguments.length !== 1) return;
      const literal = utils.unwrap(node.arguments[0]!);
      if (!ts.isObjectLiteralExpression(literal)) return;
      const keys = literalKeys(literal);
      if (!keys || keys.length === 0) return;

      const callee = utils.unwrap(node.expression);
      const calleeType = checker.getTypeAtLocation(callee);
      // For an imported class the type is `typeof Actor`, whose symbol is the
      // class itself (not the import alias); for `super(...)` in call
      // position the checker hands back the base constructor type directly.
      if (!utils.isExcaliburSymbol(calleeType.getSymbol())) return;
      const constructing = ts.isNewExpression(node) || callee.kind === ts.SyntaxKind.SuperKeyword;
      const signatures = constructing ? calleeType.getConstructSignatures() : calleeType.getCallSignatures();
      if (signatures.length === 0) return;
      const known = acceptedKeys(signatures, node);
      if (!known || known.size === 0) return;

      const shape = `${calleeLabel(node, callee)}({ ${keys.map((k) => k.name).join(", ")} })`;
      for (const key of keys) {
        if (known.has(key.name)) continue;
        const suggestion = nearestKey(key.name, known);
        const why = constructing
          ? "the constructor only reads the options it declares — the unknown key is silently dropped and the default stays in effect."
          : "excalibur's fluent APIs return `this` on an unmatched overload rather than throwing — the action is never queued and nothing happens at runtime.";
        report({
          ...utils.lineCol(sf, key.node),
          message: `${shape} has no option named '${key.name}' in any overload`,
          hint: suggestion ? `${why} Did you mean '${suggestion}'?` : why,
        });
      }
    }

    return {
      [ts.SyntaxKind.CallExpression]: check,
      [ts.SyntaxKind.NewExpression]: check,
    };
  },
};

/** Closest known key: edit distance ≤ 3, or one is a ≥3-char prefix of the other (durationMs → duration, position → pos). */
export function nearestKey(key: string, known: Iterable<string>): string | null {
  const target = key.toLowerCase();
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of known) {
    const other = candidate.toLowerCase();
    if (other === target) continue;
    const distance = levenshtein(target, other);
    const prefix = target.startsWith(other) ? other.length : other.startsWith(target) ? target.length : 0;
    if (distance > 3 && prefix < 3) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length]!;
}
