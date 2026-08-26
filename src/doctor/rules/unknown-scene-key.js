/**
 * Validate `goToScene("…")` / `engine.start("…")` string literals against
 * the union of keys from every `new Engine({scenes: {...}})` map — a typo'd
 * scene key ships silently and fails at runtime. Only active when the key
 * set is statically reliable: at least one scenes map, no spreads/computed
 * keys, and no `.addScene(...)` anywhere (runtime-minted keys). Uses the
 * facts pre-pass.
 */
export const unknownSceneKey = {
  id: "unknown-scene-key",
  description: "a scene key doesn't exist in the Engine's scenes map",
  create(ctx, sf) {
    const { ts, checker, utils, facts, report } = ctx;
    if (!facts.sceneKeysReliable) return {};
    const ENGINE = new Set(["Engine"]);

    return {
      [ts.SyntaxKind.CallExpression](node) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee)) return;
        const method = callee.name.text;
        if (method !== "goToScene" && method !== "start") return;
        const first = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
        if (!first || !ts.isStringLiteral(first)) return;
        if (facts.sceneKeys.has(first.text)) return;
        if (!utils.derivesFromExcalibur(checker.getTypeAtLocation(callee.expression), ENGINE)) return;
        const known = [...facts.sceneKeys].sort().join(", ");
        report({
          ...utils.lineCol(sf, first),
          message: `scene key "${first.text}" is not in the Engine's scenes map`,
          hint: `known scene keys: ${known}. A typo here fails silently at runtime.`,
        });
      },
    };
  },
};
