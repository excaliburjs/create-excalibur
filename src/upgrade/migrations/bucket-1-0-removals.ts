/**
 * v1 deleted the APIs that 0.30/0.32 only deprecated (core commit 5963eba3).
 * Every record here is `version: "1.0.0"`; the pure renames ride
 * memberRenameMigration (typed receivers — `.center` survives on Actor,
 * BoundingBox, Screen, TileMap, ...; only BodyComponent's was renamed), the
 * two shape changes are hand-written, and the two surfaces without a
 * mechanical rewrite are breadcrumb-only.
 */
import type * as TS from "typescript";
import { memberRenameMigration } from "./_member-rename.ts";
import { manualMigration } from "./_manual.ts";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";

/** `graphics.visible` / `IsometricMap.visible` accessors → `isVisible`. The `visible:` OPTION key is untouched (still valid). */
export const visibleToIsVisible = memberRenameMigration({
  id: "visible-to-isvisible",
  version: "1.0.0",
  title: "GraphicsComponent/IsometricMap .visible was removed — use .isVisible",
  link: V1,
  receivers: new Set(["GraphicsComponent", "IsometricMap"]),
  members: { visible: "isVisible" },
});

/** `entity.active` / `body.active` → `isActive` (BodyComponent's is a getter on both sides). */
export const activeToIsActive = memberRenameMigration({
  id: "active-to-isactive",
  version: "1.0.0",
  title: "Entity/BodyComponent .active was removed — use .isActive",
  link: V1,
  receivers: new Set(["Entity", "BodyComponent"]),
  members: { active: "isActive" },
});

/** `body.sleeping` → `body.isSleeping` (get+set). */
export const sleepingToIsSleeping = memberRenameMigration({
  id: "sleeping-to-issleeping",
  version: "1.0.0",
  title: "BodyComponent.sleeping was removed — use .isSleeping",
  link: V1,
  receivers: new Set(["BodyComponent"]),
  members: { sleeping: "isSleeping" },
});

/** `body.center` → `body.globalPos` — BodyComponent receivers ONLY (`.center` survives on 9 other classes). */
export const bodyCenterToGlobalPos = memberRenameMigration({
  id: "body-center-to-globalpos",
  version: "1.0.0",
  title: "BodyComponent.center was removed — use .globalPos",
  link: V1,
  receivers: new Set(["BodyComponent"]),
  members: { center: "globalPos" },
});

/** Screen fullscreen members lost their capital S; Engine.isFullscreen was already correct. */
export const fullscreenCasing = memberRenameMigration({
  id: "fullscreen-casing",
  version: "1.0.0",
  title: "Screen.isFullScreen/goFullScreen/exitFullScreen were renamed to isFullscreen/enterFullscreen/exitFullscreen",
  link: V1,
  receivers: new Set(["Screen"]),
  members: { isFullScreen: "isFullscreen", goFullScreen: "enterFullscreen", exitFullScreen: "exitFullscreen" },
});

/** `gamepad.isButtonPressed(...)` → `isButtonHeld(...)` (identical signature). */
export const gamepadIsButtonPressed = memberRenameMigration({
  id: "gamepad-isbuttonpressed",
  version: "1.0.0",
  title: "Gamepad.isButtonPressed was removed — use isButtonHeld (same signature)",
  link: V1,
  receivers: new Set(["Gamepad"]),
  members: { isButtonPressed: "isButtonHeld" },
});

/**
 * `body.setSleeping(x)` → `body.isSleeping = x`. A call-to-assignment shape:
 * only mechanical when the call IS the statement (an assignment expression
 * has a value where the void call had none — inside an arrow body or an
 * argument list that changes meaning), so anything else gets a breadcrumb.
 */
export const setSleepingToAssignment: Migration = {
  id: "setsleeping-to-assignment",
  version: "1.0.0",
  promptType: "auto",
  title: "BodyComponent.setSleeping(x) was removed — assign .isSleeping = x",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const BODY = new Set(["BodyComponent"]);
    const col = ctx.collector(this.id);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "setSleeping" &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), BODY)
        ) {
          const [arg] = node.arguments;
          if (ts.isExpressionStatement(node.parent) && node.arguments.length === 1 && arg) {
            col.addEdit(
              sf,
              { start: node.expression.name.getStart(sf), end: node.end },
              `isSleeping = ${arg.getText(sf)}`,
              "setSleeping(x) -> isSleeping = x"
            );
          } else {
            col.addManual(sf, node, "setSleeping() was removed in v1 — assign body.isSleeping = <value> as its own statement", V1);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} setSleeping call(s) to rewrite${extra}`;
  },
};

/**
 * Object-literal KEY renames (not property accesses): `fcn` → `action` in
 * `new Timer({...})`, `durationPerFrameMs` → `durationPerFrame` in the
 * options bag of `Animation.fromSpriteSheet*({...})`. Gated on the
 * constructed/called symbol being excalibur's (tileMapCompositeStrategy's
 * pattern); the first argument is unwrapped and its PropertyAssignment /
 * ShorthandPropertyAssignment names walked. Literals annotated with the
 * options interface (`const o: TimerOptions = {...}`) are renamed the same
 * way. A non-literal argument is flagged only when the old key is
 * USER-declared on its type (`{ fcn, interval }` built elsewhere) — a
 * variable merely typed as the old interface always carries `fcn?` and
 * proves nothing.
 */
interface KeyRenameTarget {
  /** the excalibur class whose constructor / static is being called */
  className: string;
  /** null = the constructor (`new X({...})`); otherwise static method names on X */
  statics: ReadonlySet<string> | null;
  /** the excalibur options interface, for annotated literals */
  optionsType: string;
  keys: Record<string, string>;
}

const KEY_RENAMES: KeyRenameTarget[] = [
  { className: "Timer", statics: null, optionsType: "TimerOptions", keys: { fcn: "action" } },
  {
    className: "Animation",
    statics: new Set(["fromSpriteSheet", "fromSpriteSheetCoordinates"]),
    optionsType: "FromSpriteSheetOptions",
    keys: { durationPerFrameMs: "durationPerFrame" },
  },
];

export const optionsKeyRenames: Migration = {
  id: "options-key-renames",
  version: "1.0.0",
  promptType: "auto",
  title: "option keys renamed: Timer fcn -> action, Animation.fromSpriteSheet durationPerFrameMs -> durationPerFrame",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);

    /** The excalibur class symbol a `new X(...)` constructs, or null. */
    const constructedClass = (node: TS.NewExpression): TS.Symbol | null => {
      const type = checker.getTypeAtLocation(node);
      const symbol = ((type as TS.TypeReference).target ?? type)?.getSymbol() ?? null;
      return symbol && utils.isExcaliburSymbol(symbol) ? symbol : null;
    };
    /** For `X.method(...)`: the excalibur class declaring that static, or null. */
    const staticOwner = (callee: TS.PropertyAccessExpression): { owner: TS.Symbol; method: string } | null => {
      const symbol = checker.getSymbolAtLocation(callee.name);
      const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
      const parent = decl?.parent;
      if (!parent || !ts.isClassDeclaration(parent) || !parent.name) return null;
      const owner = checker.getSymbolAtLocation(parent.name);
      if (!owner || !utils.isExcaliburSymbol(owner)) return null;
      return { owner, method: callee.name.text };
    };

    const renameKeys = (sf: TS.SourceFile, site: TS.Node, arg: TS.Expression, target: KeyRenameTarget, label: string): void => {
      const value = utils.unwrap(arg);
      if (ts.isObjectLiteralExpression(value)) {
        for (const prop of value.properties) {
          if (ts.isShorthandPropertyAssignment(prop) && Object.hasOwn(target.keys, prop.name.text)) {
            const next = target.keys[prop.name.text]!;
            col.addEdit(sf, { start: prop.name.getStart(sf), end: prop.name.end }, `${next}: ${prop.name.text}`, `${prop.name.text} -> ${next}`);
          } else if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && Object.hasOwn(target.keys, prop.name.text)) {
            const next = target.keys[prop.name.text]!;
            const q = ts.isStringLiteral(prop.name) ? sf.text[prop.name.getStart(sf)] : "";
            col.addEdit(sf, { start: prop.name.getStart(sf), end: prop.name.end }, `${q}${next}${q}`, `${prop.name.text} -> ${next}`);
          }
        }
        return;
      }
      // Not a literal: flag it only when the old key is user-declared on its type.
      const type = checker.getTypeAtLocation(value);
      for (const [oldKey, newKey] of Object.entries(target.keys)) {
        const prop = checker.getPropertyOfType(type, oldKey);
        if (prop && !utils.isExcaliburSymbol(prop)) {
          col.addManual(sf, site, `${label} options use \`${oldKey}\`, removed in v1 — rename it to \`${newKey}\` where this object is built`, V1);
          return;
        }
      }
    };

    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node) && node.arguments?.length) {
          const symbol = constructedClass(node);
          const target = symbol && KEY_RENAMES.find((t) => t.statics === null && t.className === symbol.getName());
          if (target) renameKeys(sf, node, node.arguments[0]!, target, `new ${target.className}(...)`);
        } else if (ts.isCallExpression(node) && node.arguments.length > 0 && ts.isPropertyAccessExpression(node.expression)) {
          const found = staticOwner(node.expression);
          const target =
            found && KEY_RENAMES.find((t) => t.statics?.has(found.method) && t.className === found.owner.getName());
          if (target) renameKeys(sf, node, node.arguments[0]!, target, `${target.className}.${found!.method}(...)`);
        } else if (ts.isVariableDeclaration(node) && node.type && node.initializer && ts.isTypeReferenceNode(node.type)) {
          const symbol = checker.getTypeFromTypeNode(node.type).getSymbol();
          const target = symbol && utils.isExcaliburSymbol(symbol) && KEY_RENAMES.find((t) => t.optionsType === symbol.getName());
          if (target) renameKeys(sf, node, node.initializer, target, target.optionsType);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} option key(s) to rename${extra}`;
  },
};

/**
 * `world.queryTags([...])` and `TagQuery` are gone. NOT auto-rewritten:
 * `query()`'s array overload takes component constructors, so
 * `query(["tag"])` would compile against the wrong overload and silently
 * match nothing — the correct form is the object one.
 */
export const queryTagsToQuery = manualMigration({
  id: "querytags-to-query",
  version: "1.0.0",
  title: "World.queryTags/TagQuery were removed — use world.query({ tags: { all: [...] } })",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const WORLD = new Set(["World"]);
    const excaliburNamed = (nameNode: TS.Node, name: string): boolean => {
      const symbol = checker.getSymbolAtLocation(nameNode);
      const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return resolved?.getName() === name && utils.isExcaliburSymbol(resolved);
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "queryTags" &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), WORLD)
        ) {
          col.addManual(
            sf,
            node,
            "queryTags([...]) was removed in v1 — use world.query({ tags: { all: [...] } }) (query([...]) takes component constructors, not tags); the result still has .getEntities()",
            V1
          );
        } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && excaliburNamed(node.expression, "TagQuery")) {
          col.addManual(sf, node, "TagQuery was removed in v1 — use world.query({ tags: { all: [...] } }), which returns a Query", V1);
        } else if (ts.isTypeReferenceNode(node) && excaliburNamed(node.typeName, "TagQuery")) {
          col.addManual(sf, node, "the TagQuery type was removed in v1 — world.query({ tags }) returns a Query", V1);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/**
 * The rest of the legacy easing surface: the 4-arg `EasingFunction` type,
 * `isLegacyEasing()`, and the `EaseTo`/`EaseBy` action classes (no longer
 * exported). `EasingFunctions.*` accesses themselves belong to the 0.32
 * `easing-functions` record (auto in argument position) — not repeated here.
 */
export const easingLegacySurface = manualMigration({
  id: "easing-legacy-surface",
  version: "1.0.0",
  title: "legacy easing surface removed: EasingFunction type, isLegacyEasing(), EaseTo/EaseBy actions",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const resolvedName = (nameNode: TS.Node): string | null => {
      const symbol = checker.getSymbolAtLocation(nameNode);
      const resolved = symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return resolved && utils.isExcaliburSymbol(resolved) ? resolved.getName() : null;
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isTypeReferenceNode(node)) {
          const name = resolvedName(node.typeName);
          if (name === "EasingFunction") {
            col.addManual(sf, node, "the EasingFunction type (4-arg legacy easing) was removed in v1 — use Easing, i.e. (t: number) => number", V1);
          } else if (name === "EaseTo" || name === "EaseBy") {
            col.addManual(sf, node, `${name} is no longer exported in v1 — use ${name === "EaseTo" ? "MoveToWithOptions" : "MoveByWithOptions"}`, V1);
          }
        } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && resolvedName(node.expression) === "isLegacyEasing") {
          col.addManual(sf, node, "isLegacyEasing() was removed in v1 — only (t: number) => number easings remain; drop the branch", V1);
        } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
          const name = resolvedName(node.expression);
          if (name === "EaseTo" || name === "EaseBy") {
            col.addManual(
              sf,
              node,
              `new ${name}(...) is no longer exported in v1 — use new ${name === "EaseTo" ? "MoveToWithOptions" : "MoveByWithOptions"}(entity, { ${name === "EaseTo" ? "pos" : "offset"}, duration, easing }) or actions.${name === "EaseTo" ? "moveTo" : "moveBy"}({...})`,
              V1
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});
