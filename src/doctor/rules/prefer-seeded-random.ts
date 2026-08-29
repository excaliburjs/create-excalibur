import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * Determinism hygiene, three checks in one rule:
 *  - `Math.random()` — invisible to seeding/replay; use ex.Random.
 *  - `new Random()` with no seed — same non-determinism, harder to spot
 *    (found in otherwise fully-seeded games).
 *  - duplicate seed literals — two `new Random(1337)` instances produce
 *    IDENTICAL streams, silently correlating whatever consumes them
 *    (found: a config singleton and a scene field sharing a seed, plus the
 *    scene one never being read). Duplicates come from the facts pre-pass,
 *    so both sites flag, each in its own file.
 */
export const preferSeededRandom: Rule = {
  id: "prefer-seeded-random",
  description: "non-deterministic or stream-correlated randomness",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, facts, file, report } = ctx;
    const RANDOM = new Set(["Random"]);

    const seedCounts = new Map<string, number>();
    for (const site of facts.randomSeeds) {
      seedCounts.set(site.seed, (seedCounts.get(site.seed) ?? 0) + 1);
    }

    return {
      [ts.SyntaxKind.CallExpression](node: TS.CallExpression) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "random") return;
        const target = utils.unwrap(callee.expression);
        if (ts.isIdentifier(target) && target.text === "Math") {
          report({
            ...utils.lineCol(sf, node),
            message: "Math.random() is invisible to seeding and replay",
            hint: "use excalibur's Random (new Random(seed)) so gameplay stays reproducible.",
          });
        }
      },
      [ts.SyntaxKind.NewExpression](node: TS.NewExpression) {
        if ((node.arguments?.length ?? 0) > 0) return;
        if (!utils.derivesFromExcalibur(checker.getTypeAtLocation(node), RANDOM)) return;
        report({
          ...utils.lineCol(sf, node),
          message: "new Random() without a seed is non-deterministic",
          hint: "pass a seed (new Random(1337)) so runs are reproducible — or make the unseeded choice explicit with an ignore comment.",
        });
      },
      "exit:file"() {
        for (const site of facts.randomSeeds) {
          if (site.file !== file || (seedCounts.get(site.seed) ?? 0) < 2) continue;
          const others = facts.randomSeeds
            .filter((s) => s.seed === site.seed && s !== site)
            .map((s) => `${s.file}:${s.line}`)
            .join(", ");
          report({
            line: site.line,
            column: site.column,
            message: `seed ${site.seed} is reused (also at ${others}) — the streams are identical`,
            hint: "two generators with the same seed emit the same sequence, silently correlating their consumers — derive distinct seeds or share one instance.",
          });
        }
      },
    };
  },
};
