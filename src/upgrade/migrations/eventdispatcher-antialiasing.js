const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/** `EventDispatcher` (removed 0.30) → `EventEmitter`: import + every identifier reference. */
export const eventDispatcherToEventEmitter = {
  id: "eventdispatcher-to-eventemitter",
  version: "0.30.0",
  promptType: "auto",
  title: "EventDispatcher was removed — use EventEmitter",
  link: V030,
  check(ctx) {
    const { ts, checker, utils, editor } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf, text } of ctx.files) {
      const binding = editor.excaliburBinding(sf);
      if (!binding) continue;
      let sawUse = false;
      const guard = (identifier) => {
        const symbol = checker.getSymbolAtLocation(identifier);
        if (!symbol) return false;
        const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return resolved.getName() === "EventDispatcher" && utils.isExcaliburSymbol(resolved);
      };
      const visit = (node) => {
        // ex.EventDispatcher (value or type via qualified name)
        if (ts.isPropertyAccessExpression(node) && node.name.text === "EventDispatcher" && guard(node.name)) {
          col.addEdit(sf, { start: node.name.getStart(sf), end: node.name.end }, "EventEmitter", "EventDispatcher -> EventEmitter");
          sawUse = true;
        } else if (ts.isQualifiedName(node) && node.right.text === "EventDispatcher" && guard(node.right)) {
          col.addEdit(sf, { start: node.right.getStart(sf), end: node.right.end }, "EventEmitter", "EventDispatcher -> EventEmitter");
          sawUse = true;
        } else if (
          ts.isIdentifier(node) &&
          node.text === "EventDispatcher" &&
          !ts.isImportSpecifier(node.parent) &&
          !ts.isPropertyAccessExpression(node.parent) &&
          !ts.isQualifiedName(node.parent) &&
          guard(node)
        ) {
          col.addEdit(sf, { start: node.getStart(sf), end: node.end }, "EventEmitter", "EventDispatcher -> EventEmitter");
          sawUse = true;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      if (sawUse && binding.kind === "named" && binding.locals.has("EventDispatcher")) {
        const importEdit = editor.replaceImportSpecifier(sf, text, "excalibur", "EventDispatcher", ["EventEmitter"]);
        if (importEdit) {
          col.addEdit(sf, { getStart: () => importEdit.start, end: importEdit.end }, importEdit.text, "rewrite EventDispatcher import");
        }
      }
    }
    return col.result();
  },
  prompt(result) {
    return `${result.edits.length} EventDispatcher reference(s)`;
  },
};

/**
 * `engine.getAntialiasing()` → `engine.screen.antialiasing`;
 * `engine.setAntialiasing(x)` → `engine.screen.antialiasing = x`.
 * The setter form only rewrites statement-position calls (the call returned
 * void anyway); anything else gets a breadcrumb.
 */
export const antialiasingAccessors = {
  id: "antialiasing-accessors",
  version: "0.30.0",
  promptType: "auto",
  title: "Engine.get/setAntialiasing() were removed — use engine.screen.antialiasing",
  link: V030,
  check(ctx) {
    const { ts, checker, utils } = ctx;
    const ENGINE = new Set(["Engine"]);
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          (node.name.text === "getAntialiasing" || node.name.text === "setAntialiasing") &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), ENGINE)
        ) {
          const call = node.parent;
          const isCall = ts.isCallExpression(call) && call.expression === node;
          if (node.name.text === "getAntialiasing" && isCall && call.arguments.length === 0) {
            col.addEdit(
              sf,
              { start: node.name.getStart(sf), end: call.end },
              "screen.antialiasing",
              "getAntialiasing() -> screen.antialiasing"
            );
          } else if (
            node.name.text === "setAntialiasing" &&
            isCall &&
            call.arguments.length === 1 &&
            ts.isExpressionStatement(call.parent)
          ) {
            const argText = call.arguments[0].getText(sf);
            col.addEdit(
              sf,
              { start: node.name.getStart(sf), end: call.end },
              `screen.antialiasing = ${argText}`,
              "setAntialiasing(x) -> screen.antialiasing = x"
            );
          } else {
            col.addManual(sf, node, `${node.name.text} was removed — use engine.screen.antialiasing`, V030);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} to review` : "";
    return `${result.edits.length} antialiasing accessor call(s)${extra}`;
  },
};
