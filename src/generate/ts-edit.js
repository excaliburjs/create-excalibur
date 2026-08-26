import { GenerateError, SeamNotFoundError } from "./errors.js";

/**
 * TypeScript AST helpers for `ex generate`.
 *
 * Strategy: parse with the *project's* TypeScript (injected — see ts-loader.js),
 * locate nodes, then apply minimal TEXT SPLICES at node positions so the user's
 * formatting and comments survive. We never print whole files with
 * ts.createPrinter. After building edits, callers must `validate()` the result
 * (re-parse, zero parseDiagnostics) before writing.
 *
 * Only the syntactic API is used — no Program, no type checker.
 *
 * @param {object} ts the TypeScript module (any 4.x/5.x/6.x)
 */
export function createTsEditor(ts) {
  function parse(fileName, text) {
    return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS);
  }

  /** Zero-length or replacing edits: { start, end, text }. */
  function applyEdits(text, edits) {
    const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].end > sorted[i - 1].start) {
        throw new Error(`internal: overlapping edits at ${sorted[i].start}..${sorted[i].end}`);
      }
    }
    let out = text;
    for (const e of sorted) {
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    return out;
  }

  /** Re-parse and return syntax diagnostics (must be [] before writing). */
  function validate(fileName, text) {
    const sf = parse(fileName, text);
    return sf.parseDiagnostics ?? [];
  }

  function detectFormat(text) {
    const eol = text.includes("\r\n") ? "\r\n" : "\n";
    const match = text.match(/^(?:[ \t]*\r?\n)*?([ \t]+)\S/m);
    const indent = match ? (match[1].startsWith("\t") ? "\t" : " ".repeat(Math.min(match[1].length, 8))) : "  ";
    return { eol, indent };
  }

  function lineStartOf(text, pos) {
    return text.lastIndexOf("\n", pos - 1) + 1;
  }
  function indentOfLine(text, pos) {
    const start = lineStartOf(text, pos);
    return text.slice(start).match(/^[ \t]*/)[0];
  }

  /** Strip parens / `as const` / `satisfies` wrappers. */
  function unwrapExpression(node) {
    let n = node;
    while (
      n &&
      (ts.isParenthesizedExpression(n) ||
        ts.isAsExpression(n) ||
        (ts.isSatisfiesExpression && ts.isSatisfiesExpression(n)))
    ) {
      n = n.expression;
    }
    return n;
  }

  function walk(node, visit) {
    if (visit(node) === false) return;
    ts.forEachChild(node, (child) => walk(child, visit));
  }

  /**
   * How does this file import excalibur?
   * @returns {{kind:'named', locals: Map<string,string>, node: object} |
   *           {kind:'namespace', name: string} | null}
   *  locals maps exported name → local name (usually identical).
   */
  function excaliburBinding(sf, specifier = "excalibur") {
    let named = null;
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== specifier) continue;
      const clause = stmt.importClause;
      if (!clause?.namedBindings) continue;
      if (ts.isNamespaceImport(clause.namedBindings)) {
        return { kind: "namespace", name: clause.namedBindings.name.text };
      }
      if (ts.isNamedImports(clause.namedBindings) && !clause.isTypeOnly) {
        const locals = named?.locals ?? new Map();
        for (const el of clause.namedBindings.elements) {
          locals.set(el.propertyName?.text ?? el.name.text, el.name.text);
        }
        named = { kind: "named", locals, node: stmt };
      }
    }
    return named;
  }

  /** The local expression text for an excalibur export, e.g. "Engine" or "ex.Engine". */
  function localRef(binding, exportedName) {
    if (binding?.kind === "namespace") return `${binding.name}.${exportedName}`;
    return binding?.locals.get(exportedName) ?? exportedName;
  }

  function quoteChar(sf) {
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        return sf.text[stmt.moduleSpecifier.getStart(sf)] === "'" ? "'" : '"';
      }
    }
    return '"';
  }

  /**
   * Ensure `import { name } from "specifier"` exists.
   * Returns an edit, or null when already imported.
   * A namespace import of the same module counts as covered (callers should
   * then reference `ns.Name` — see localRef()).
   */
  function ensureNamedImport(sf, text, specifier, name) {
    const { eol } = detectFormat(text);
    const q = quoteChar(sf);
    let lastImport = null;
    let target = null;
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt)) continue;
      lastImport = stmt;
      if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== specifier) continue;
      const clause = stmt.importClause;
      if (!clause?.namedBindings) continue;
      if (ts.isNamespaceImport(clause.namedBindings)) return null; // ns.Name covers it
      if (ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          if ((el.propertyName?.text ?? el.name.text) === name) return null; // already imported (incl. type-only)
        }
        if (!clause.isTypeOnly && !target) target = stmt;
      }
    }
    if (target) {
      const elements = target.importClause.namedBindings.elements;
      const last = elements[elements.length - 1];
      const bindingsText = text.slice(target.importClause.namedBindings.getStart(sf), target.importClause.namedBindings.end);
      const multiline = bindingsText.includes("\n");
      const indent = multiline ? indentOfLine(text, last.getStart(sf)) : "";
      if (elements.hasTrailingComma) {
        // elements.end includes the trailing comma
        const insert = multiline ? `${eol}${indent}${name},` : ` ${name},`;
        return { start: elements.end, end: elements.end, text: insert };
      }
      const insert = multiline ? `,${eol}${indent}${name}` : `, ${name}`;
      return { start: last.end, end: last.end, text: insert };
    }
    const line = `import { ${name} } from ${q}${specifier}${q};`;
    if (lastImport) {
      const nl = text.indexOf("\n", lastImport.end);
      const pos = nl === -1 ? text.length : nl + 1;
      const insert = nl === -1 ? `${eol}${line}${eol}` : `${line}${eol}`;
      return { start: pos, end: pos, text: insert };
    }
    const pos = sf.statements.length ? sf.statements[0].getStart(sf) : 0;
    return { start: pos, end: pos, text: `${line}${eol}${eol}` };
  }

  function propertyName(prop) {
    const n = prop.name;
    if (!n) return null;
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) return n.text;
    return null;
  }

  function objectPropertyNames(objLit) {
    return objLit.properties.map(propertyName).filter(Boolean);
  }

  function findProperty(objLit, name) {
    return objLit.properties.find((p) => propertyName(p) === name) ?? null;
  }

  /**
   * Insert `propText` (e.g. `key: Value`) as the last property of an object
   * literal. Returns an ARRAY of edits (multiline inserts go at end-of-line so
   * a trailing `// comment` stays attached to the previous property).
   */
  function insertObjectProperty(sf, text, objLit, propText) {
    const { eol, indent: indentUnit } = detectFormat(text);
    const props = objLit.properties;
    const open = objLit.getStart(sf);
    if (props.length === 0) {
      const inner = text.slice(open + 1, objLit.end - 1);
      if (!inner.includes("\n")) {
        return [{ start: open + 1, end: objLit.end - 1, text: ` ${propText} ` }];
      }
      const closeIndent = indentOfLine(text, objLit.end - 1);
      return [
        {
          start: open + 1,
          end: objLit.end - 1,
          text: `${eol}${closeIndent}${indentUnit}${propText}${eol}${closeIndent}`,
        },
      ];
    }
    const last = props[props.length - 1];
    const multiline = text.slice(open, objLit.end).includes("\n");
    const indent = indentOfLine(text, last.getStart(sf));
    // end of the line the last property (or its trailing comma) sits on
    const afterProps = props.hasTrailingComma ? props.end : last.end;
    let lineEnd = text.indexOf("\n", afterProps);
    if (lineEnd === -1 || lineEnd > objLit.end) lineEnd = -1;
    if (lineEnd !== -1 && text[lineEnd - 1] === "\r") lineEnd -= 1;
    if (props.hasTrailingComma) {
      if (multiline && lineEnd !== -1) {
        return [{ start: lineEnd, end: lineEnd, text: `${eol}${indent}${propText},` }];
      }
      return [{ start: props.end, end: props.end, text: ` ${propText},` }];
    }
    if (multiline && lineEnd > last.end) {
      // a trailing comment sits after the last property — keep it on that line
      return [
        { start: last.end, end: last.end, text: "," },
        { start: lineEnd, end: lineEnd, text: `${eol}${indent}${propText}` },
      ];
    }
    if (multiline) {
      return [{ start: last.end, end: last.end, text: `,${eol}${indent}${propText}` }];
    }
    return [{ start: last.end, end: last.end, text: `, ${propText}` }];
  }

  /** Replace the initializer expression of `propName` inside an object literal. */
  function replaceInitializer(sf, text, objLit, propName, exprText) {
    const prop = findProperty(objLit, propName);
    if (!prop || !ts.isPropertyAssignment(prop)) {
      throw new SeamNotFoundError(`property "${propName}" is not a plain assignment`);
    }
    return { start: prop.initializer.getStart(sf), end: prop.initializer.end, text: exprText };
  }

  /** Remove a property (and its comma) from an object literal. */
  function removeObjectProperty(sf, text, objLit, propName) {
    const prop = findProperty(objLit, propName);
    if (!prop) return null;
    let end = prop.end;
    while (end < text.length && (text[end] === " " || text[end] === "\t")) end++;
    if (text[end] === ",") end++;
    const propStart = prop.getStart(sf);
    const lineStart = lineStartOf(text, propStart);
    const beforeIsBlank = /^[ \t]*$/.test(text.slice(lineStart, propStart));
    const nl = text.indexOf("\n", end);
    const restOfLineBlank = nl !== -1 && /^[ \t]*\r?$/.test(text.slice(end, nl));
    if (beforeIsBlank && restOfLineBlank) {
      return { start: lineStart, end: nl + 1, text: "" };
    }
    while (end < text.length && text[end] === " ") end++;
    return { start: propStart, end, text: "" };
  }

  /** All `new Engine(...)` expressions (named or namespace excalibur import). */
  function findEngineNews(sf) {
    const binding = excaliburBinding(sf);
    if (!binding) return [];
    const results = [];
    walk(sf, (n) => {
      if (!ts.isNewExpression(n)) return;
      const callee = n.expression;
      if (binding.kind === "named") {
        const local = binding.locals.get("Engine");
        if (local && ts.isIdentifier(callee) && callee.text === local) results.push(n);
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === binding.name &&
        callee.name.text === "Engine"
      ) {
        results.push(n);
      }
    });
    return results;
  }

  /** Class declarations extending excalibur's Scene. */
  function findSceneClasses(sf) {
    const binding = excaliburBinding(sf);
    const results = [];
    for (const stmt of sf.statements) {
      if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
      const extendsClause = stmt.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
      const base = extendsClause?.types?.[0]?.expression;
      if (!base) continue;
      let extendsScene = false;
      if (binding?.kind === "named") {
        const local = binding.locals.get("Scene");
        extendsScene = Boolean(local && ts.isIdentifier(base) && base.text === local);
      } else if (binding?.kind === "namespace") {
        extendsScene =
          ts.isPropertyAccessExpression(base) &&
          ts.isIdentifier(base.expression) &&
          base.expression.text === binding.name &&
          base.name.text === "Scene";
      }
      if (extendsScene) results.push({ className: stmt.name.text, node: stmt });
    }
    return results;
  }

  // Direct excalibur bases that make a class assignable-to-Actor for our purposes.
  const ACTOR_BASES = ["Actor", "Label", "ScreenElement"];

  /** Class declarations directly extending excalibur's Actor (or Label/ScreenElement). */
  function findActorClasses(sf) {
    const binding = excaliburBinding(sf);
    const results = [];
    for (const stmt of sf.statements) {
      if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
      const extendsClause = stmt.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword);
      const base = extendsClause?.types?.[0]?.expression;
      if (!base) continue;
      let baseName = null;
      if (binding?.kind === "named" && ts.isIdentifier(base)) {
        for (const b of ACTOR_BASES) {
          if (binding.locals.get(b) === base.text) baseName = b;
        }
      } else if (
        binding?.kind === "namespace" &&
        ts.isPropertyAccessExpression(base) &&
        ts.isIdentifier(base.expression) &&
        base.expression.text === binding.name &&
        ACTOR_BASES.includes(base.name.text)
      ) {
        baseName = base.name.text;
      }
      if (baseName) results.push({ className: stmt.name.text, base: baseName, node: stmt });
    }
    return results;
  }

  /** The ActorArgs object literal in a class constructor's super(...), or throws SeamNotFoundError. */
  function actorSuperOptionsLiteral(sf, className) {
    const cls = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name?.text === className);
    if (!cls) throw new SeamNotFoundError(`class "${className}" not found`);
    const ctor = cls.members.find((m) => ts.isConstructorDeclaration(m) && m.body);
    if (!ctor) throw new SeamNotFoundError(`${className} has no constructor`);
    let superCall = null;
    walk(ctor.body, (n) => {
      if (!superCall && ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.SuperKeyword) {
        superCall = n;
      }
    });
    if (!superCall) throw new SeamNotFoundError(`${className}'s constructor never calls super()`);
    const arg = superCall.arguments?.[0];
    const opts = arg ? unwrapExpression(arg) : null;
    if (!opts || !ts.isObjectLiteralExpression(opts)) {
      throw new SeamNotFoundError("the super(...) options are not an inline object literal", {
        hint: "ex generate can only edit `super({ ... })` written inline.",
      });
    }
    return opts;
  }

  /** The engine options object literal for a `new Engine(...)`, or throws SeamNotFoundError. */
  function engineOptionsLiteral(sf, newExpr) {
    const arg = newExpr.arguments?.[0];
    const opts = arg ? unwrapExpression(arg) : null;
    if (!opts || !ts.isObjectLiteralExpression(opts)) {
      throw new SeamNotFoundError("the Engine options are not an inline object literal", {
        hint: "ex generate can only edit `new Engine({ ... })` written inline.",
      });
    }
    return opts;
  }

  /**
   * Seam A: register a scene in the engine's `scenes:` map.
   * @returns {{ edits: Array, warnings: string[] }}
   */
  function addSceneToEngine(sf, text, { key, className, specifier }) {
    const warnings = [];
    const engines = findEngineNews(sf);
    if (engines.length === 0) {
      throw new SeamNotFoundError("no `new Engine(...)` found", {
        hint: "expected the engine to be constructed in this file.",
      });
    }
    if (engines.length > 1) warnings.push("multiple `new Engine(...)` found — using the first one");
    const opts = engineOptionsLiteral(sf, engines[0]);
    const edits = [];
    const scenesProp = findProperty(opts, "scenes");
    if (scenesProp) {
      if (!ts.isPropertyAssignment(scenesProp)) {
        throw new SeamNotFoundError("the `scenes` property is not a plain object literal");
      }
      const scenesLit = unwrapExpression(scenesProp.initializer);
      if (!ts.isObjectLiteralExpression(scenesLit)) {
        throw new SeamNotFoundError("the `scenes` property is not an inline object literal");
      }
      if (objectPropertyNames(scenesLit).includes(key)) {
        throw new GenerateError(`scene key "${key}" is already registered in the engine`);
      }
      edits.push(...insertObjectProperty(sf, text, scenesLit, `${key}: ${className}`));
    } else {
      edits.push(...insertObjectProperty(sf, text, opts, `scenes: { ${key}: ${className} }`));
    }
    if (specifier) {
      const imp = ensureNamedImport(sf, text, specifier, className);
      if (imp) edits.push(imp);
    }
    return { edits, warnings };
  }

  /** The exported `Resources` object literal, or throws SeamNotFoundError. */
  function findResourcesLiteral(sf) {
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === "Resources" && decl.initializer) {
          const lit = unwrapExpression(decl.initializer);
          if (ts.isObjectLiteralExpression(lit)) return lit;
        }
      }
    }
    throw new SeamNotFoundError("no `Resources` object literal found", {
      hint: "expected `export const Resources = { ... }` (optionally `as const`).",
    });
  }

  /**
   * Seam B: add a resource entry to the `Resources` literal.
   * @returns {{ edits: Array }}
   */
  function addResource(sf, text, { key, expr, excaliburImports = [] }) {
    const lit = findResourcesLiteral(sf);
    if (objectPropertyNames(lit).includes(key)) {
      throw new GenerateError(`resource key "${key}" already exists in Resources`);
    }
    const binding = excaliburBinding(sf);
    const edits = [...insertObjectProperty(sf, text, lit, `${key}: ${expr}`)];
    if (binding?.kind !== "namespace") {
      for (const name of excaliburImports) {
        const imp = ensureNamedImport(sf, text, "excalibur", name);
        if (imp) edits.push(imp);
      }
    }
    return { edits };
  }

  /**
   * Seam C: append statements to a method body of a class (creating the method
   * if missing). Used for Scene.onInitialize and Scene.onPreLoad.
   *
   * @param {object} opts
   * @param {string} opts.className        class to edit
   * @param {string} opts.methodName       e.g. "onInitialize"
   * @param {string} opts.methodSignature  e.g. "override onInitialize(engine: Engine): void"
   * @param {string[]} opts.statements     lines to insert (no indentation)
   * @param {Array<{specifier: string, name: string}>} [opts.imports]
   * @param {Array<{specifier: string, name: string}>} [opts.methodImports] only needed when the method is created
   */
  function addToClassMethod(sf, text, { className, methodName, methodSignature, statements, imports = [], methodImports = [] }) {
    const { eol, indent: indentUnit } = detectFormat(text);
    const cls = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name?.text === className);
    if (!cls) {
      throw new SeamNotFoundError(`class "${className}" not found`);
    }
    const edits = [];
    const method = cls.members.find(
      (m) => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === methodName && m.body
    );
    let createdMethod = false;
    if (method) {
      const body = method.body;
      const methodIndent = indentOfLine(text, method.getStart(sf));
      const inner = text.slice(body.getStart(sf) + 1, body.end - 1);
      if (!inner.includes("\n")) {
        // single-line body `{}` or `{ foo(); }` — rewrite as multiline
        const existing = inner.trim();
        const bodyIndent = methodIndent + indentUnit;
        const lines = [...(existing ? [existing] : []), ...statements];
        edits.push({
          start: body.getStart(sf) + 1,
          end: body.end - 1,
          text: `${eol}${lines.map((l) => bodyIndent + l).join(eol)}${eol}${methodIndent}`,
        });
      } else {
        const first = body.statements[0];
        const bodyIndent = first ? indentOfLine(text, first.getStart(sf)) : methodIndent + indentUnit;
        const pos = lineStartOf(text, body.end - 1);
        edits.push({
          start: pos,
          end: pos,
          text: `${statements.map((l) => bodyIndent + l).join(eol)}${eol}`,
        });
      }
    } else {
      createdMethod = true;
      const classIndent = indentOfLine(text, cls.getStart(sf));
      const memberIndent = cls.members.length
        ? indentOfLine(text, cls.members[0].getStart(sf))
        : classIndent + indentUnit;
      const bodyIndent = memberIndent + indentUnit;
      const pos = lineStartOf(text, cls.end - 1);
      const methodText =
        `${eol}${memberIndent}${methodSignature} {${eol}` +
        `${statements.map((l) => bodyIndent + l).join(eol)}${eol}` +
        `${memberIndent}}${eol}`;
      edits.push({ start: pos, end: pos, text: methodText });
    }
    const binding = excaliburBinding(sf);
    const wanted = [...imports, ...(createdMethod ? methodImports : [])];
    for (const { specifier, name } of wanted) {
      if (specifier === "excalibur" && binding?.kind === "namespace") continue;
      const imp = ensureNamedImport(sf, text, specifier, name);
      if (imp) edits.push(imp);
    }
    return { edits, createdMethod };
  }

  /** Module-level VariableStatement declaring `name`, or null. */
  function findVariableStatement(sf, name) {
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name) return stmt;
      }
    }
    return null;
  }

  /**
   * Insert `statementText` as a new top-level statement on a fresh line after
   * the line containing `stmt`'s end (so a trailing `// comment` on that line
   * stays put), separated by a blank line.
   */
  function insertStatementAfter(sf, text, stmt, statementText) {
    const { eol } = detectFormat(text);
    const body = statementText.split("\n").join(eol);
    const nl = text.indexOf("\n", stmt.end);
    if (nl === -1) {
      return { start: text.length, end: text.length, text: `${eol}${eol}${body}${eol}` };
    }
    return { start: nl + 1, end: nl + 1, text: `${eol}${body}${eol}` };
  }

  /**
   * Module-level `const X = SpriteSheet.fromImageSource({...})` declarations
   * (named or namespace excalibur import). grid/spacing are extracted only
   * when written as numeric literals (else null); imageKey comes from
   * `image: Resources.<Key>`.
   * @returns {{ name: string, node: object, grid: object | null,
   *             spacing: { margin: object|null, originOffset: object|null } | null,
   *             imageKey: string | null }[]}
   */
  function findSpriteSheetConsts(sf) {
    const binding = excaliburBinding(sf);
    const numOf = (objLit, name) => {
      const p = findProperty(objLit, name);
      if (!p || !ts.isPropertyAssignment(p)) return null;
      const e = unwrapExpression(p.initializer);
      return e && ts.isNumericLiteral(e) ? Number(e.text) : null;
    };
    const objOf = (objLit, name) => {
      const p = findProperty(objLit, name);
      if (!p || !ts.isPropertyAssignment(p)) return null;
      const e = unwrapExpression(p.initializer);
      return e && ts.isObjectLiteralExpression(e) ? e : null;
    };
    const xyOf = (objLit, name) => {
      const o = objOf(objLit, name);
      if (!o) return null;
      const x = numOf(o, "x");
      const y = numOf(o, "y");
      return x != null && y != null ? { x, y } : null;
    };
    const results = [];
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const init = unwrapExpression(decl.initializer);
        if (!init || !ts.isCallExpression(init)) continue;
        const callee = init.expression;
        if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "fromImageSource") continue;
        const target = callee.expression;
        let isSpriteSheet = false;
        if (binding?.kind === "namespace") {
          isSpriteSheet =
            ts.isPropertyAccessExpression(target) &&
            ts.isIdentifier(target.expression) &&
            target.expression.text === binding.name &&
            target.name.text === "SpriteSheet";
        } else {
          const local = binding?.kind === "named" ? (binding.locals.get("SpriteSheet") ?? "SpriteSheet") : "SpriteSheet";
          isSpriteSheet = ts.isIdentifier(target) && target.text === local;
        }
        if (!isSpriteSheet) continue;
        const arg = init.arguments?.[0];
        const optsLit = arg ? unwrapExpression(arg) : null;
        let grid = null;
        let spacing = null;
        let imageKey = null;
        if (optsLit && ts.isObjectLiteralExpression(optsLit)) {
          const gridLit = objOf(optsLit, "grid");
          if (gridLit) {
            const rows = numOf(gridLit, "rows");
            const columns = numOf(gridLit, "columns");
            const spriteWidth = numOf(gridLit, "spriteWidth");
            const spriteHeight = numOf(gridLit, "spriteHeight");
            if (rows != null && columns != null && spriteWidth != null && spriteHeight != null) {
              grid = { rows, columns, spriteWidth, spriteHeight };
            }
          }
          const spacingLit = objOf(optsLit, "spacing");
          if (spacingLit) {
            spacing = { margin: xyOf(spacingLit, "margin"), originOffset: xyOf(spacingLit, "originOffset") };
          }
          const imageProp = findProperty(optsLit, "image");
          if (imageProp && ts.isPropertyAssignment(imageProp)) {
            const ie = unwrapExpression(imageProp.initializer);
            if (
              ie &&
              ts.isPropertyAccessExpression(ie) &&
              ts.isIdentifier(ie.expression) &&
              ie.expression.text === "Resources"
            ) {
              imageKey = ie.name.text;
            }
          }
        }
        results.push({ name: decl.name.text, node: stmt, grid, spacing, imageKey });
      }
    }
    return results;
  }

  return {
    parse,
    applyEdits,
    validate,
    detectFormat,
    unwrapExpression,
    walk,
    excaliburBinding,
    localRef,
    ensureNamedImport,
    insertObjectProperty,
    replaceInitializer,
    removeObjectProperty,
    objectPropertyNames,
    findProperty,
    propertyName,
    findEngineNews,
    findSceneClasses,
    findActorClasses,
    actorSuperOptionsLiteral,
    engineOptionsLiteral,
    findResourcesLiteral,
    addSceneToEngine,
    addResource,
    addToClassMethod,
    findVariableStatement,
    insertStatementAfter,
    findSpriteSheetConsts,
  };
}
