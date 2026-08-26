import { memberRenameMigration } from "./_member-rename.js";

const V032 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.32.0";

/** `BoundingBox.draw(...)` (deprecated 0.32, gone in v1) → `.debug(...)`. */
export const boundingBoxDrawToDebug = memberRenameMigration({
  id: "boundingbox-draw-to-debug",
  version: "0.32.0",
  title: "BoundingBox.draw(...) is deprecated — use debug(...)",
  link: V032,
  receivers: new Set(["BoundingBox"]),
  members: { draw: "debug" },
});

/**
 * Behavioral: Realistic physics bodies sleep by default since 0.32
 * (canSleepByDefault true, sleepBias 0.9 -> 0.5, island-wide
 * sleepTimeThreshold 1000ms). Zero code changes — notification only, and
 * only for projects actually using the Realistic solver.
 */
export const physicsSleepDefaults = {
  id: "physics-sleep-defaults",
  version: "0.32.0",
  promptType: "notification",
  title: "Realistic physics bodies now sleep by default",
  link: V032,
  check(ctx) {
    if (!ctx.facts.usesRealisticPhysics) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      "this project uses the Realistic solver: since 0.32 bodies sleep by default (canSleepByDefault), sleepBias dropped 0.9 -> 0.5, and islands need ~1s of low motion to sleep. If gameplay depends on always-awake bodies, disable sleeping in the engine physics config."
    );
    return col.result();
  },
  prompt(result) {
    return result.notes[0];
  },
};

/**
 * Legacy EasingFunctions.* are deprecated in 0.32 and removed by v1. The
 * mapping to the simpler `(t) => number` forms isn't mechanical, so sites
 * get breadcrumbs.
 */
export const easingFunctions = {
  id: "easing-functions",
  version: "0.32.0",
  promptType: "manual",
  title: "legacy EasingFunctions.* are deprecated — use the simple (t) => number forms",
  link: V032,
  check(ctx) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node) => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
          const symbol = checker.getSymbolAtLocation(node.expression);
          const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
          if (resolved?.getName() === "EasingFunctions" && utils.isExcaliburSymbol(resolved)) {
            col.addManual(sf, node, `EasingFunctions.${node.name.text} is deprecated (removed in v1) — use the simple (t: number) => number easing forms`, V032);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result) {
    return `${result.manual.length} EasingFunctions site(s) to modernize`;
  },
};
