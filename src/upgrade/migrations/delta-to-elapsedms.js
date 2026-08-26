const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/**
 * Event classes whose `delta` was renamed in 0.30. Verified against the
 * PUBLISHED .d.ts (0.30.0, 0.32.0, next): the event property is `elapsed` —
 * the changelog's "elapsedMs" wording refers to lifecycle hook params.
 */
const DELTA_EVENTS = new Set([
  "PreUpdateEvent",
  "PostUpdateEvent",
  "PreDrawEvent",
  "PostDrawEvent",
  "PreTransformDrawEvent",
  "PostTransformDrawEvent",
]);

/**
 * `.delta` reads on excalibur event objects become `.elapsed`. The
 * derivation gate is the whole point: a user's own `.delta` (physics struct,
 * tween lib) fails it and is untouched. Lifecycle override *parameters*
 * (`onPreUpdate(engine, delta)`) are user-named and need nothing.
 * Destructured `({ delta })` handlers become `({ elapsed: delta })` — a
 * pure insertion that keeps every downstream use valid.
 */
export const deltaToElapsedMs = {
  id: "delta-to-elapsedms",
  version: "0.30.0",
  promptType: "auto",
  title: "event .delta was renamed to .elapsed",
  link: V030,
  check(ctx) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          node.name.text === "delta" &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), DELTA_EVENTS)
        ) {
          col.addEdit(sf, { start: node.name.getStart(sf), end: node.name.end }, "elapsed", "delta -> elapsed");
        }
        if (
          ts.isBindingElement(node) &&
          !node.propertyName &&
          ts.isIdentifier(node.name) &&
          node.name.text === "delta" &&
          ts.isObjectBindingPattern(node.parent) &&
          ts.isParameter(node.parent.parent) &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.parent.parent), DELTA_EVENTS)
        ) {
          const start = node.name.getStart(sf);
          col.addEdit(sf, { start, end: start }, "elapsed: ", "destructured delta -> elapsed: delta");
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result) {
    return `${result.edits.length} .delta read(s) on event objects`;
  },
};
