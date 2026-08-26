const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";

/** Display modes that never clip — unaffected by the v1 screen-space rooting change. */
const NON_CLIPPING = new Set(["Fixed", "FitScreen", "FillScreen", "FitContainer", "FillContainer"]);

/**
 * v1's headline break: screen space is now consistently rooted at the safe
 * content area. worldToScreenCoordinates returns content-area-rooted values,
 * contentArea is rooted at (0,0), and the old canvas-space inset moved to
 * the new Screen.contentAreaOffset. Whether a call site wants the old or new
 * value is intent (e.g. HTML overlay positioning wants the old one via
 * `.add(engine.screen.contentAreaOffset)`), so every site gets a breadcrumb
 * carrying the changelog's shim recipe. Quiet when every detected
 * displayMode is non-clipping (those modes have a (0,0) offset).
 */
export const screenCoordinatesRooting = {
  id: "screen-coordinates-rooting",
  version: "1.0.0",
  promptType: "manual",
  title: "screen space is now rooted at the content area (worldToScreenCoordinates/contentArea changed)",
  link: V1,
  check(ctx) {
    const { ts, utils, facts } = ctx;
    if (facts.displayModes.size > 0 && [...facts.displayModes].every((m) => NON_CLIPPING.has(m))) {
      return null; // non-clipping modes have a (0,0) offset — unaffected
    }
    const SCREEN = new Set(["Screen"]);
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node) => {
        if (ts.isPropertyAccessExpression(node)) {
          const name = node.name.text;
          if (
            (name === "worldToScreenCoordinates" || name === "screenToWorldCoordinates") &&
            utils.chainContainsType(node.expression, SCREEN)
          ) {
            col.addManual(
              sf,
              node,
              `${name} is now content-area-rooted in v1 — for the old canvas-rooted value (e.g. HTML overlays) add .add(engine.screen.contentAreaOffset)`,
              V1
            );
          } else if (
            (name === "left" || name === "top" || name === "topLeft") &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === "contentArea" &&
            utils.chainContainsType(node.expression.expression, SCREEN)
          ) {
            col.addManual(
              sf,
              node,
              "contentArea is rooted at (0,0) in v1 — the old canvas-space inset moved to Screen.contentAreaOffset",
              V1
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result) {
    return `${result.manual.length} screen-coordinate site(s) to review (clipping display mode detected or unknown)`;
  },
};

/**
 * v1 flips TileMap's default compositeStrategy to 'separate'. Behavior-pin:
 * write the old default explicitly into TileMap constructions that don't set
 * it. OLD_DEFAULT verified against the pre-v1 TileMap source at impl time.
 */
const OLD_DEFAULT = "together";

export const tileMapCompositeStrategy = {
  id: "tilemap-composite-strategy",
  version: "1.0.0",
  promptType: "auto",
  title: "TileMap's default compositeStrategy changed to 'separate' — pinning the old default",
  link: V1,
  check(ctx) {
    const { ts, checker, utils, editor } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf, text } of ctx.files) {
      const visit = (node) => {
        if (ts.isNewExpression(node) && node.arguments?.length) {
          const symbol = (checker.getTypeAtLocation(node)?.symbol ?? null);
          if (symbol?.getName() === "TileMap" && utils.isExcaliburSymbol(symbol)) {
            const literal = utils.unwrap(node.arguments[0]);
            if (ts.isObjectLiteralExpression(literal)) {
              const hasIt = literal.properties.some(
                (p) => p.name && ts.isIdentifier(p.name) && p.name.text === "compositeStrategy"
              );
              const hasSpread = literal.properties.some((p) => ts.isSpreadAssignment(p));
              if (!hasIt && !hasSpread && literal.properties.length > 0) {
                // Exactly ONE property inserted per literal (ts-edit sharp edge:
                // multi-inserts into emptied literals throw).
                const edits = editor.insertObjectProperty(sf, text, literal, `compositeStrategy: '${OLD_DEFAULT}'`);
                for (const e of edits) {
                  col.addEdit(sf, { getStart: () => e.start, end: e.end }, e.text, "pin old compositeStrategy default");
                }
              } else if (!hasIt) {
                col.addManual(sf, node, `TileMap's default compositeStrategy is 'separate' in v1 — set compositeStrategy: '${OLD_DEFAULT}' to keep the old behavior`, V1);
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
  prompt(result) {
    return `${result.edits.length > 0 ? "pinning the old default in " : ""}${new Set(result.edits.map((e) => e.file)).size || result.manual.length} TileMap construction site(s)`;
  },
};

/** Behavioral: v1 text renders slightly differently (more accurate, less texture space). */
export const fontTextRendering = {
  id: "font-text-rendering",
  version: "1.0.0",
  promptType: "notification",
  title: "Font/Text render slightly differently in v1",
  link: V1,
  check(ctx) {
    const { ts } = ctx;
    let usesText = false;
    for (const { sf } of ctx.files) {
      const visit = (node) => {
        if (usesText) return;
        if (ts.isIdentifier(node) && (node.text === "Font" || node.text === "Text" || node.text === "Label")) {
          usesText = true;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (!usesText) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      "v1 renders Font/Text more accurately and faster; output differs slightly from 0.32 — eyeball any pixel-perfect text layouts after upgrading."
    );
    return col.result();
  },
  prompt(result) {
    return result.notes[0];
  },
};
