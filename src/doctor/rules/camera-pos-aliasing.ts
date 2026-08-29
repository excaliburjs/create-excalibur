import type * as TS from "typescript";
import type { Rule, RuleContext, RuleListeners } from "../types.ts";
/**
 * `camera.pos = someEntity.pos` aliases live state: unlike Actor's pos
 * setter (which clones), Camera's setter wraps the operand in a WatchVector
 * that writes through to the ORIGINAL vector — camera shake/velocity/zoom
 * then silently moves the entity it was pointed at (live bug found: a
 * tutorial camera permanently aliased a tilemap tile's transform).
 *
 * Deliberately narrow: only assignments to a Camera-typed `.pos` whose RHS
 * is a bare `.pos`/`.worldPos` property read. `.clone()`, `vec(...)`, and
 * computed vectors (CallExpressions) are fine; `screen.center` returns a
 * fresh vector and is skipped by the property-name gate.
 */
export const cameraPosAliasing: Rule = {
  id: "camera-pos-aliasing",
  description: "camera.pos aliases another object's live position vector",
  create(ctx: RuleContext, sf: TS.SourceFile): RuleListeners {
    const { ts, checker, utils, report } = ctx;
    const CAMERA = new Set(["Camera"]);
    const LIVE_VECTOR_PROPS = new Set(["pos", "worldPos"]);

    return {
      [ts.SyntaxKind.BinaryExpression](node: TS.BinaryExpression) {
        if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
        const left = utils.unwrap(node.left);
        if (!ts.isPropertyAccessExpression(left) || left.name.text !== "pos") return;
        if (!utils.derivesFromExcalibur(checker.getTypeAtLocation(left.expression), CAMERA)) return;
        const right = utils.unwrap(node.right);
        if (!ts.isPropertyAccessExpression(right) || !LIVE_VECTOR_PROPS.has(right.name.text)) return;
        report({
          ...utils.lineCol(sf, node),
          message: `camera.pos = ${right.getText(sf)} aliases the live position vector`,
          hint: "Camera's pos setter writes through to the original vector — camera shake/velocity would move that object. Assign a copy: " + `${right.getText(sf)}.clone()`,
        });
      },
    };
  },
};
