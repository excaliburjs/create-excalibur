/**
 * Symbol-resolution helpers shared by the v1 migrations. Every check gates on
 * the *excalibur* symbol behind a name — never the spelling — because real
 * projects reuse excalibur's names for their own classes (sum-monsters has
 * its own `SoundManager`; a `Pool` or `Direction` of one's own is common).
 */
import type * as TS from "typescript";
import type { UpgradeContext } from "../types.ts";

/** The excalibur export a name node (identifier / `ex.Name` / qualified name) resolves to, or null. */
export function excaliburSymbolOf(ctx: UpgradeContext, node: TS.Node | undefined): TS.Symbol | null {
  const { ts, checker, utils } = ctx;
  if (!node) return null;
  const nameNode = ts.isPropertyAccessExpression(node) ? node.name : ts.isQualifiedName(node) ? node.right : node;
  const symbol = checker.getSymbolAtLocation(nameNode);
  const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  return resolved && utils.isExcaliburSymbol(resolved) ? resolved : null;
}

/** The excalibur export NAME a node resolves to, or null (sugar over excaliburSymbolOf). */
export function excaliburNameOf(ctx: UpgradeContext, node: TS.Node | undefined): string | null {
  return excaliburSymbolOf(ctx, node)?.getName() ?? null;
}

/** The excalibur class a `new X(...)` constructs (generic instantiations unwrap to their target), or null. */
export function constructedExcaliburClass(ctx: UpgradeContext, node: TS.NewExpression): TS.Symbol | null {
  const { checker, utils } = ctx;
  const type = checker.getTypeAtLocation(node);
  const symbol = ((type as TS.TypeReference).target ?? type)?.getSymbol() ?? null;
  return symbol && utils.isExcaliburSymbol(symbol) ? symbol : null;
}

/** The excalibur class whose static `X.method(...)` is being called, or null. */
export function staticOwnerOf(ctx: UpgradeContext, callee: TS.PropertyAccessExpression): { owner: TS.Symbol; method: string } | null {
  const { ts, checker, utils } = ctx;
  const symbol = checker.getSymbolAtLocation(callee.name);
  const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  const parent = decl?.parent;
  if (!parent || !ts.isClassDeclaration(parent) || !parent.name) return null;
  const owner = checker.getSymbolAtLocation(parent.name);
  if (!owner || !utils.isExcaliburSymbol(owner)) return null;
  return { owner, method: callee.name.text };
}

/**
 * The quote character emitted string literals should use: the one `near`
 * uses when it is a string literal, else the file's first import specifier,
 * else double quotes (ts-edit's default).
 */
export function quoteOf(ctx: UpgradeContext, sf: TS.SourceFile, near?: TS.Node | null): string {
  const { ts } = ctx;
  let found: string | null = null;
  const visit = (node: TS.Node): void => {
    if (found) return;
    if (ts.isStringLiteral(node)) {
      found = sf.text[node.getStart(sf)] === "'" ? "'" : '"';
      return;
    }
    ts.forEachChild(node, visit);
  };
  if (near) visit(near);
  if (found) return found;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      return sf.text[stmt.moduleSpecifier.getStart(sf)] === "'" ? "'" : '"';
    }
  }
  return '"';
}

/** `name` as a property-access suffix: `.name` when it is an identifier, `["na-me"]` otherwise. */
export function memberSuffix(name: string, quote: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `[${quote}${name}${quote}]`;
}

/** Statement list of a block-like node (block / source file / case clause), or null. */
export function statementsOf(ctx: UpgradeContext, node: TS.Node): readonly TS.Statement[] | null {
  const { ts } = ctx;
  if (ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node)) return node.statements;
  if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return node.statements;
  return null;
}

/**
 * Name of the nearest named class / interface / type alias enclosing a
 * symbol's declaration (`Actor` for `Actor.isOffScreen`, `ActorOptions` for
 * the `visible?` key inside `type ActorOptions = ColliderArgs & {...}`), or
 * null. Mapped-type properties (`DeepRequired<PhysicsConfig>`) keep the
 * original declarations, so the walk sees through them.
 */
export function declaringTypeName(ctx: UpgradeContext, symbol: TS.Symbol | null | undefined): string | null {
  const { ts } = ctx;
  const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  for (let node = decl?.parent; node; node = node.parent) {
    if ((ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
      return node.name.text;
    }
  }
  return null;
}

/** Is the symbol declared as a METHOD (class method / interface method signature)? Getters and fields are not. */
export function isMethodSymbol(ctx: UpgradeContext, symbol: TS.Symbol | null | undefined): boolean {
  const { ts } = ctx;
  const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
  return !!decl && (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl));
}

/**
 * Edits that drop several named specifiers from the file's `import {…} from
 * "excalibur"` declarations at once. `replaceImportSpecifier` removes ONE
 * element and its neighbouring comma; two removals on the same import can
 * overlap (the last element's range reaches back into its predecessor's), so
 * consecutive removals are merged into one span here: a run that does not
 * reach the end of the list takes `[run.start, nextKept.start)`, a run that
 * does takes `[prevKept.end, run.end)`, and an import losing every element
 * keeps an empty `{}` (a legal side-effect import).
 */
export function removeImportSpecifiers(ctx: UpgradeContext, sf: TS.SourceFile, names: ReadonlySet<string>): Array<{ start: number; end: number }> {
  const { ts } = ctx;
  const ranges: Array<{ start: number; end: number }> = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== "excalibur") continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    const elements = bindings.elements;
    const removed = elements.map((el) => names.has(el.propertyName?.text ?? el.name.text));
    if (!removed.some(Boolean)) continue;
    if (removed.every(Boolean)) {
      // up to the closing brace, so a trailing comma (prettier `trailingComma: all`) goes too
      ranges.push({ start: elements[0]!.getStart(sf), end: bindings.end - 1 });
      continue;
    }
    for (let i = 0; i < elements.length; i++) {
      if (!removed[i]) continue;
      let j = i;
      while (j + 1 < elements.length && removed[j + 1]) j++;
      if (j + 1 < elements.length) {
        ranges.push({ start: elements[i]!.getStart(sf), end: elements[j + 1]!.getStart(sf) });
      } else {
        ranges.push({ start: elements[i - 1]!.end, end: elements[j]!.end });
      }
      i = j;
    }
  }
  return ranges;
}

/**
 * The GLSL text an expression carries, when it is statically knowable: a
 * string / template literal, a tagged template (balatro's `glsl\`…\``), a
 * `${}` template (static chunks and expressions' text — enough for a word
 * search), or an identifier / `Shaders.name` member bound ONE hop away to
 * such a literal (any file of the program — shaders usually live in their own
 * module). Null for anything dynamic.
 */
export function shaderTextOf(ctx: UpgradeContext, sf: TS.SourceFile, expr: TS.Expression | undefined, hops = 1): string | null {
  const { ts, checker, utils } = ctx;
  if (!expr) return null;
  const value = utils.unwrap(expr);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (ts.isTemplateExpression(value)) return value.getText(sf);
  if (ts.isTaggedTemplateExpression(value)) return value.template.getText(sf);
  if ((ts.isIdentifier(value) || ts.isPropertyAccessExpression(value)) && hops > 0) {
    // `reflect` / `Shaders.reflect`: follow the binding (through import aliases) to its initializer, in any file of the program
    const nameNode = ts.isPropertyAccessExpression(value) ? value.name : value;
    const symbol = checker.getSymbolAtLocation(nameNode);
    const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    const decl = resolved?.valueDeclaration;
    if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
      return shaderTextOf(ctx, decl.getSourceFile(), decl.initializer, hops - 1);
    }
  }
  return null;
}
