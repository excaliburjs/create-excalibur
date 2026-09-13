import { memberRenameMigration } from "./_member-rename.ts";
import type * as TS from "typescript";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V032 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.32.0";

/** `BoundingBox.draw(...)` (deprecated 0.32, gone in v1) → `.debug(...)`. */
export const boundingBoxDrawToDebug = memberRenameMigration({
  id: "boundingbox-draw-to-debug",
  version: "0.32.0",
  removedIn: "1.0.0",
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
export const physicsSleepDefaults: Migration = {
  id: "physics-sleep-defaults",
  version: "0.32.0",
  promptType: "notification",
  title: "Realistic physics bodies now sleep by default",
  link: V032,
  check(ctx: UpgradeContext) {
    if (!ctx.facts.usesRealisticPhysics) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      "this project uses the Realistic solver: since 0.32 bodies sleep by default (canSleepByDefault), sleepBias dropped 0.9 -> 0.5, and islands need ~1s of low motion to sleep. If gameplay depends on always-awake bodies, disable sleeping in the engine physics config."
    );
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0];
  },
};

/** The 7 legacy statics with a 1:1 flat export (all `(t: number) => number`; verified in 0.32's easings.ts). */
const FLAT_EASINGS: Record<string, string> = {
  Linear: "linear",
  EaseInQuad: "easeInQuad",
  EaseOutQuad: "easeOutQuad",
  EaseInOutQuad: "easeInOutQuad",
  EaseInCubic: "easeInCubic",
  EaseOutCubic: "easeOutCubic",
  EaseInOutCubic: "easeInOutCubic",
};

/**
 * Legacy `EasingFunctions.*` (deprecated 0.32, deleted in v1 along with the
 * class). Auto ONLY where the rewrite is provably equivalent: the access is
 * a VALUE handed to an excalibur API (a call/new argument whose callee is
 * excalibur's, or a property initializer inside an object literal that is
 * such an argument) — there excalibur treats both forms identically, and
 * the 7 statics map 1:1 onto the flat exports. Every other position gets a
 * breadcrumb: calling a static directly uses the 4-arg legacy signature
 * that the flat forms don't have, a value flowing into USER code may be
 * typed with the removed `EasingFunction`, and the `Create*` helpers have
 * no replacement. The namespace binding (`ex.EasingFunctions.X`) is what
 * real plugins use — resolve via the checker, never an identifier gate.
 */
export const easingFunctions: Migration = {
  id: "easing-functions",
  version: "0.32.0",
  removedIn: "1.0.0",
  promptType: "auto",
  title: "legacy EasingFunctions.* are deprecated (removed in v1) — use the flat (t) => number easings",
  link: V032,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils, editor } = ctx;
    const col = ctx.collector(this.id);

    const resolve = (node: TS.Node): TS.Symbol | undefined => {
      const symbol = checker.getSymbolAtLocation(node);
      return symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    };
    const isExcaliburCallee = (call: TS.CallExpression | TS.NewExpression): boolean => {
      if (ts.isNewExpression(call)) {
        const type = checker.getTypeAtLocation(call);
        return utils.isExcaliburSymbol(((type as TS.TypeReference).target ?? type)?.getSymbol());
      }
      return utils.isExcaliburSymbol(resolve(call.expression));
    };
    /** Is `node` an argument of an excalibur call, directly or through object-literal property initializers? */
    const isValueToExcaliburApi = (node: TS.Node): boolean => {
      let cur: TS.Node = node;
      for (;;) {
        let parent = cur.parent;
        while (parent && (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression?.(parent))) {
          cur = parent;
          parent = cur.parent;
        }
        if (!parent) return false;
        if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.some((a) => a === cur)) {
          return isExcaliburCallee(parent);
        }
        if (ts.isPropertyAssignment(parent) && parent.initializer === cur && ts.isObjectLiteralExpression(parent.parent)) {
          cur = parent.parent;
          continue;
        }
        return false;
      }
    };

    for (const { sf, text } of ctx.files) {
      const binding = editor.excaliburBinding(sf);
      const rewritten = new Set<string>();
      let untouched = 0;
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node)) {
          const owner = resolve(node.expression);
          if (owner?.getName() === "EasingFunctions" && utils.isExcaliburSymbol(owner)) {
            const member = node.name.text;
            const flat = FLAT_EASINGS[member];
            const isCallee = ts.isCallExpression(node.parent) && node.parent.expression === node;
            if (flat && !isCallee && isValueToExcaliburApi(node)) {
              col.addEdit(sf, node, editor.localRef(binding, flat), `EasingFunctions.${member} -> ${flat}`);
              rewritten.add(flat);
            } else {
              untouched++;
              const why = !flat
                ? `EasingFunctions.${member} has no replacement in v1 — write the easing as a (t: number) => number function`
                : isCallee
                  ? `EasingFunctions.${member}(...) is called with the legacy 4-arg signature (removed in v1) — the flat ${flat}(t) only maps 0..1; lerp the result yourself`
                  : `EasingFunctions.${member} flows into non-excalibur code (removed in v1) — pass the flat ${flat} and retype consumers from EasingFunction to Easing`;
              col.addManual(sf, node, why, V032);
            }
            return; // the access is handled; nothing below it matters
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);

      if (rewritten.size === 0 || binding?.kind === "namespace") continue; // `ex.linear` needs no import
      const names = [...rewritten].sort();
      if (untouched === 0 && binding?.kind === "named" && binding.locals.has("EasingFunctions")) {
        // Every use rewritten: swap the (now dangling) specifier for the flat names in one edit.
        const importEdit = editor.replaceImportSpecifier(sf, text, "excalibur", "EasingFunctions", names);
        if (importEdit) col.addEdit(sf, { getStart: () => importEdit.start, end: importEdit.end }, importEdit.text, "replace the EasingFunctions import with the flat easings");
        continue;
      }
      // Same-position inserts land in reverse push order — push descending so the import reads sorted.
      for (const name of [...names].reverse()) {
        const importEdit = editor.ensureNamedImport(sf, text, "excalibur", name);
        if (importEdit) col.addEdit(sf, { getStart: () => importEdit.start, end: importEdit.end }, importEdit.text, `import ${name}`);
      }
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} EasingFunctions reference(s) to rewrite${extra}`;
  },
};
