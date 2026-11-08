/**
 * Factory for v1's API-shape normalization (core de02d9ff + bd9d912b): a
 * member keeps living on the same excalibur type but changes shape or
 * name — a zero-arg `isX()` becomes the getter `isX` (drop the parens), a
 * method is renamed (`toggleEnabled` → `setEnabled`), a property is
 * renamed (`isOffScreen` → `isOffscreen`). Each rule names the OWNER types
 * and its members; a site matches when either
 *   - the resolved property symbol is excalibur's and declared on an owner
 *     (works through interfaces, anonymous nested option types and mapped
 *     types — `physics.config.integration.onScreenOnly`), or
 *   - the receiver's type derives from / `implements` an owner (user
 *     overrides and user `implements Loadable` classes, whose symbol is
 *     their own).
 * Destructuring reads (`const { elapsedMs } = stats`) rename their key too.
 * Declarations get the same treatment: a user class deriving from or
 * implementing an owner that declares `isLoaded(): boolean` becomes
 * `get isLoaded(): boolean` (excalibur's loader reads the property — a
 * leftover method is truthy and the resource silently never loads).
 *
 * `dropCall` members are gated on the resolved symbol still being a METHOD,
 * so a project already on v1 types is a no-op. A non-call reference
 * (`sound.isPlaying` without parens) is left alone on purpose: against the
 * OLD types it is indistinguishable from a property read this migration
 * already produced (second run before `npm install`), and the rare
 * function-valued use fails to type-check on v1 anyway.
 */
import type * as TS from "typescript";
import { declaringTypeName, isMethodSymbol } from "./_resolve.ts";
import type { AutoMigration, CheckResult, Collector, UpgradeContext } from "../types.ts";

export interface MemberReshape {
  /** the new member name (same as the old one for a pure method → getter change) */
  to: string;
  /** zero-arg method → getter: drop the call parens */
  dropCall?: boolean;
  /** extra gate on the resolved property symbol (e.g. only rename `ready` while it is still the boolean) */
  when?: (ctx: UpgradeContext, symbol: TS.Symbol, node: TS.Node) => boolean;
}

export interface ReshapeRule {
  /** excalibur class / interface names that declare the members */
  owners: ReadonlySet<string>;
  members: Record<string, MemberReshape>;
}

export function memberReshapeMigration({
  id,
  version,
  removedIn,
  title,
  link,
  rules,
}: {
  id: string;
  version: string;
  removedIn?: string;
  title: string;
  link?: string | null;
  rules: ReshapeRule[];
}): AutoMigration {
  const allMembers = new Set(rules.flatMap((r) => Object.keys(r.members)));
  return {
    id,
    version,
    ...(removedIn ? { removedIn } : {}),
    promptType: "auto",
    title,
    link,
    check(ctx: UpgradeContext) {
      const { ts, checker, utils } = ctx;
      const col = ctx.collector(id);

      const ownedBy = (type: TS.Type | null | undefined, owners: ReadonlySet<string>): boolean =>
        utils.derivesFromExcalibur(type, owners) || utils.implementsExcalibur(type, owners);

      /** The rule+spec a member access matches, or null. */
      const matchAccess = (name: string, receiverType: TS.Type, symbol: TS.Symbol | undefined): MemberReshape | null => {
        for (const rule of rules) {
          const spec = rule.members[name];
          if (!spec) continue;
          const byProvenance = !!symbol && utils.isExcaliburSymbol(symbol) && rule.owners.has(declaringTypeName(ctx, symbol) ?? "");
          if (byProvenance || ownedBy(receiverType, rule.owners)) return spec;
        }
        return null;
      };

      const matchDeclaration = (name: string, classType: TS.Type | null | undefined): MemberReshape | null => {
        for (const rule of rules) {
          const spec = rule.members[name];
          if (spec && ownedBy(classType, rule.owners)) return spec;
        }
        return null;
      };

      for (const { sf } of ctx.files) {
        const visit = (node: TS.Node): void => {
          if (ts.isPropertyAccessExpression(node) && allMembers.has(node.name.text)) {
            visitAccess(sf, node, col);
          } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
            visitBinding(sf, node, col);
          } else if (
            (ts.isMethodDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) &&
            node.name &&
            ts.isIdentifier(node.name) &&
            allMembers.has(node.name.text)
          ) {
            visitDeclaration(sf, node, col);
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
      return col.result();

      function visitAccess(sf: TS.SourceFile, node: TS.PropertyAccessExpression, col: Collector): void {
        const name = node.name.text;
        const symbol = checker.getSymbolAtLocation(node.name);
        if (!symbol) return; // unresolved (any / unknown receiver): nothing to classify
        const spec = matchAccess(name, checker.getTypeAtLocation(node.expression), symbol);
        if (!spec) return;
        if (spec.when && !spec.when(ctx, symbol, node)) return;
        const call = node.parent;
        const isCallee = ts.isCallExpression(call) && call.expression === node;
        if (spec.dropCall) {
          if (!isMethodSymbol(ctx, symbol)) return; // already the getter (migrated, or v1 types installed)
          if (isCallee && call.arguments.length === 0) {
            col.addEdit(sf, { start: node.name.getStart(sf), end: call.end }, spec.to, `${name}() -> ${spec.to}`);
          }
          return;
        }
        if (name !== spec.to) {
          col.addEdit(sf, { start: node.name.getStart(sf), end: node.name.end }, spec.to, `${name} -> ${spec.to}`);
        }
      }

      /** `const { elapsedMs } = stats` / `{ currentFrameElapsedMs: e }`: the destructured key is a member read. */
      function visitBinding(sf: TS.SourceFile, node: TS.BindingElement, col: Collector): void {
        const keyNode = node.propertyName ?? node.name;
        if (!ts.isIdentifier(keyNode) || !allMembers.has(keyNode.text)) return;
        const name = keyNode.text;
        const sourceType = checker.getTypeAtLocation(node.parent);
        const symbol = checker.getPropertyOfType(sourceType, name);
        if (!symbol) return;
        const spec = matchAccess(name, sourceType, symbol);
        if (!spec) return;
        if (spec.when && !spec.when(ctx, symbol, node)) return;
        if (spec.dropCall) {
          if (isMethodSymbol(ctx, symbol)) col.addManual(sf, node, `${name}() is the getter ${spec.to} on v1 — destructuring the method no longer works; read .${spec.to} on the object`, link);
          return;
        }
        if (name === spec.to) return;
        const range = { start: keyNode.getStart(sf), end: keyNode.end };
        // `{ old }` → `{ new: old }` keeps the local binding; `{ old: x }` → `{ new: x }`
        col.addEdit(sf, range, node.propertyName ? spec.to : `${spec.to}: ${name}`, `{ ${name} } -> { ${spec.to} }`);
      }

      function visitDeclaration(
        sf: TS.SourceFile,
        node: TS.MethodDeclaration | TS.PropertyDeclaration | TS.GetAccessorDeclaration | TS.SetAccessorDeclaration,
        col: Collector
      ): void {
        const name = (node.name as TS.Identifier).text;
        if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) return;
        const parent = node.parent;
        let ownerType: TS.Type | null | undefined = null;
        if (ts.isClassLike(parent)) {
          ownerType = parent.name ? checker.getDeclaredTypeOfSymbol(checker.getSymbolAtLocation(parent.name)!) : checker.getTypeAtLocation(parent);
        } else if (ts.isObjectLiteralExpression(parent)) {
          ownerType = checker.getContextualType(parent); // `const r: Loadable<X> = { isLoaded() {...} }`
        } else {
          return;
        }
        const spec = matchDeclaration(name, ownerType);
        if (!spec) return;
        const nameRange = { start: node.name.getStart(sf), end: node.name.end };
        if (spec.dropCall) {
          if (ts.isMethodDeclaration(node)) {
            if (node.parameters.length === 0) {
              col.addEdit(sf, nameRange, `get ${spec.to}`, `${name}() -> get ${spec.to}`);
            } else {
              col.addManual(sf, node.name, `${name} is a parameterless getter on v1 — this override takes parameters; make it \`get ${spec.to}()\``, link);
            }
          } else if (ts.isPropertyDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
            col.addManual(sf, node.name, `${name} is a getter on v1 — excalibur reads it as a property, a function-valued field is always truthy; make it \`get ${spec.to}()\``, link);
          } else if (name !== spec.to) {
            col.addEdit(sf, nameRange, spec.to, `${name} -> ${spec.to}`);
          }
          return;
        }
        if (name !== spec.to) {
          col.addEdit(sf, nameRange, spec.to, `${name} -> ${spec.to}`);
        }
      }
    },
    prompt(result: CheckResult) {
      const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
      return `${result.edits.length} member(s) to reshape${extra}`;
    },
  };
}
