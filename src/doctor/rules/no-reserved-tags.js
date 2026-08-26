/**
 * Flag `addTag`/`removeTag` with an engine-reserved `ex.*` tag. Those tags
 * are owned by engine systems (e.g. `ex.offscreen` by the OffscreenSystem,
 * which removes it again the moment the entity is evaluated) — writing them
 * doesn't stick, and while it lasts it silently excludes the entity from
 * other systems. Found live as a "keep enemies quiet" hack that was being
 * undone every frame. Reading with hasTag is fine and not flagged.
 */
export const noReservedTags = {
  id: "no-reserved-tags",
  description: "an engine-reserved ex.* tag is written by user code",
  create(ctx, sf) {
    const { ts, checker, utils, report } = ctx;
    const ENTITY = new Set(["Entity"]);

    return {
      [ts.SyntaxKind.CallExpression](node) {
        const callee = utils.unwrap(node.expression);
        if (!ts.isPropertyAccessExpression(callee)) return;
        const method = callee.name.text;
        if (method !== "addTag" && method !== "removeTag") return;
        const first = node.arguments?.length ? utils.unwrap(node.arguments[0]) : null;
        if (!first || !ts.isStringLiteral(first) || !first.text.startsWith("ex.")) return;
        if (!utils.derivesFromExcalibur(checker.getTypeAtLocation(callee.expression), ENTITY)) return;
        report({
          ...utils.lineCol(sf, node),
          message: `${method}("${first.text}") writes an engine-reserved tag`,
          hint: "ex.* tags are owned by engine systems, which set/clear them every frame — your write is undone and can exclude the entity from other systems meanwhile. Use your own tag name.",
        });
      },
    };
  },
};
