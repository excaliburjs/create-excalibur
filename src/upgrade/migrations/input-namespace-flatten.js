const V030 = "https://github.com/excaliburjs/Excalibur/releases/tag/v0.30.0";

/**
 * 0.30 removed the `ex.Input.*` namespace and promoted its types to `ex.*`.
 * Members known to be promoted top-level (verify against the 0.30 .d.ts —
 * unknown members get a breadcrumb instead of a blind rename).
 */
const FLATTENED = new Set([
  "Keys",
  "KeyEvent",
  "Keyboard",
  "PointerButton",
  "PointerType",
  "PointerScope",
  "PointerEvent",
  "WheelEvent",
  "WheelDeltaMode",
  "NativePointerButton",
  "Gamepad",
  "Gamepads",
  "GamepadConnectEvent",
  "GamepadDisconnectEvent",
  "GamepadButtonEvent",
  "GamepadAxisEvent",
  "Buttons",
  "Axes",
  "EngineInput",
  "CapturePointerConfig",
]);

export const inputNamespaceFlatten = {
  id: "input-namespace-flatten",
  version: "0.30.0",
  promptType: "auto",
  title: "ex.Input.* namespace was flattened into ex.*",
  link: V030,
  check(ctx) {
    const { ts, checker, utils, editor } = ctx;
    const col = ctx.collector(this.id);

    for (const { sf, text } of ctx.files) {
      const binding = editor.excaliburBinding(sf);
      if (!binding) continue;
      const namedLocal = binding.kind === "named" ? binding.locals.get("Input") : null;
      const usedMembers = new Set();

      const visit = (node) => {
        // Value positions: X.Input.Member
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "Input" &&
          binding.kind === "namespace" &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === binding.name
        ) {
          handleNamespaceValue(node);
          return; // children handled
        }
        if (
          namedLocal &&
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === namedLocal
        ) {
          handleNamedValue(node);
          return;
        }
        // Type positions: X.Input.Member / Input.Member as QualifiedName
        if (ts.isQualifiedName(node)) {
          if (
            binding.kind === "namespace" &&
            ts.isQualifiedName(node.left) &&
            node.left.right.text === "Input" &&
            ts.isIdentifier(node.left.left) &&
            node.left.left.text === binding.name
          ) {
            handleNamespaceType(node);
            return;
          }
          if (namedLocal && ts.isIdentifier(node.left) && node.left.text === namedLocal) {
            handleNamedType(node);
            return;
          }
        }
        ts.forEachChild(node, visit);
      };

      const guard = (nameNode) => {
        const symbol = checker.getSymbolAtLocation(nameNode);
        if (!symbol) return false;
        const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return utils.isExcaliburSymbol(resolved);
      };

      const handleNamespaceValue = (node) => {
        const inner = node.expression; // ex.Input
        if (!guard(inner.name)) return;
        const member = node.name.text;
        if (!FLATTENED.has(member)) {
          col.addManual(sf, node, `Input.${member} — the Input namespace was removed in 0.30`, V030);
          return;
        }
        col.addEdit(sf, { start: inner.expression.end, end: inner.end }, "", `ex.Input.${member} -> ex.${member}`);
      };
      const handleNamedValue = (node) => {
        if (!guard(node.expression)) return;
        const member = node.name.text;
        if (!FLATTENED.has(member)) {
          col.addManual(sf, node, `Input.${member} — the Input namespace was removed in 0.30`, V030);
          return;
        }
        usedMembers.add(member);
        col.addEdit(sf, { start: node.expression.getStart(sf), end: node.name.getStart(sf) }, "", `${namedLocal}.${member} -> ${member}`);
      };
      const handleNamespaceType = (node) => {
        const inner = node.left; // ex.Input
        if (!guard(inner.right)) return;
        const member = node.right.text;
        if (!FLATTENED.has(member)) {
          col.addManual(sf, node, `Input.${member} — the Input namespace was removed in 0.30`, V030);
          return;
        }
        col.addEdit(sf, { start: inner.left.end, end: inner.end }, "", `ex.Input.${member} type -> ex.${member}`);
      };
      const handleNamedType = (node) => {
        if (!guard(node.left)) return;
        const member = node.right.text;
        if (!FLATTENED.has(member)) {
          col.addManual(sf, node, `Input.${member} — the Input namespace was removed in 0.30`, V030);
          return;
        }
        usedMembers.add(member);
        col.addEdit(sf, { start: node.left.getStart(sf), end: node.right.getStart(sf) }, "", `${namedLocal}.${member} type -> ${member}`);
      };

      visit(sf);

      if (namedLocal && usedMembers.size > 0) {
        const importEdit = editor.replaceImportSpecifier(sf, text, "excalibur", "Input", [...usedMembers].sort());
        if (importEdit) {
          col.addEdit(sf, { getStart: () => importEdit.start, end: importEdit.end }, importEdit.text, "rewrite Input import to flattened members");
        }
      }
    }
    return col.result();
  },
  prompt(result) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} unrecognized member(s) flagged` : "";
    return `${result.edits.length} Input-qualified reference(s) to flatten${extra}`;
  },
};
