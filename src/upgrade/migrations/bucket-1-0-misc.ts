/**
 * Smaller v1 breaks found by the 2026-11 coverage review (core main vs
 * v0.32.0): a deprecation rename, the "prefer null" sweep (bcba0d72), new
 * base-class members that collide with user subclasses, and three behavior
 * changes that only warrant a notification.
 */
import type * as TS from "typescript";
import { memberRenameMigration } from "./_member-rename.ts";
import { manualMigration } from "./_manual.ts";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";

/** `actor.collider.set(c)` → `.use(c)` (deprecated on the v1 alphas, deleted by core 1a1c8331). */
export const colliderSetToUse = memberRenameMigration({
  id: "collider-set-to-use",
  version: "1.0.0",
  title: "ColliderComponent.set(collider) was removed in v1 — use .use(collider)",
  link: V1,
  receivers: new Set(["ColliderComponent"]),
  members: { set: "use" },
});

/**
 * core bcba0d72 "fix:! prefer null for empty" (NOT in the CHANGELOG): these
 * members return/hold `null` where they used to yield `undefined`, so a
 * strict `=== undefined` check silently flips. Breadcrumb at each strict
 * comparison against a member in the verified set on a receiver of the
 * verified class. (`Scene.onTransition` is NOT in the set: core 31789253
 * made its return type `Transition | void`, so a bare `return;` override
 * stays legal — the director coalesces the result with `?? null`.)
 */
const ANY_NULL_RECEIVER = new Set([
  "Component",
  "Collider",
  "ColliderComponent",
  "Director",
  "SoundManager",
  "ExcaliburGraphicsContext",
  "GraphicsComponent",
  "Font",
  "SpriteFont",
]);
/**
 * member → the excalibur classes it turned null on. Matched against the DIRECT receiver type, not the
 * whole chain: `this.owner.get(X)` inside a Component is `Entity.get` (still undefined), and
 * `Font.shadow` stayed optional while `SpriteFont.shadow` became null. Not listed on purpose:
 * `LineSegment.clip` / `Ray.intersectPoint` (null at runtime since before v1 — only the d.ts changed),
 * `Material.pipeline` (new in v1), `SoundManager.getSound` (soundmanager-members rewrites it).
 */
const NULL_MEMBERS: Record<string, ReadonlySet<string>> = {
  owner: new Set(["Component", "Collider"]),
  get: new Set(["ColliderComponent", "ExcaliburGraphicsContext"]),
  getSceneDefinition: new Set(["Director"]),
  getSceneInstance: new Set(["Director"]),
  currentTransition: new Set(["Director"]),
  getOptions: ANY_NULL_RECEIVER,
  currentOptions: ANY_NULL_RECEIVER,
  onPostDraw: new Set(["GraphicsComponent"]),
  lineHeight: new Set(["Font", "SpriteFont"]),
  shadow: new Set(["SpriteFont"]),
};

export const nullForEmpty = manualMigration({
  id: "null-for-empty",
  version: "1.0.0",
  title: "several accessors return null instead of undefined in v1 (Component.owner, Director.getSceneInstance, ColliderComponent.get, Font.lineHeight, …)",
  link: V1,
  findSites(ctx, col) {
    const { ts, utils, checker } = ctx;
    const isUndefined = (expr: TS.Expression): boolean => {
      const e = utils.unwrap(expr);
      return (ts.isIdentifier(e) && e.text === "undefined") || ts.isVoidExpression(e);
    };
    /** The member access an expression ends in (`x.owner`, `x.get()`), or null. */
    const memberOf = (expr: TS.Expression): TS.PropertyAccessExpression | null => {
      const e = utils.unwrap(expr);
      if (ts.isPropertyAccessExpression(e)) return e;
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) return e.expression;
      return null;
    };
    const flagsNull = (access: TS.PropertyAccessExpression | null): boolean =>
      access !== null &&
      Object.hasOwn(NULL_MEMBERS, access.name.text) &&
      utils.derivesFromExcalibur(checker.getTypeAtLocation(access.expression), NULL_MEMBERS[access.name.text]!);
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isBinaryExpression(node)) {
          const op = node.operatorToken.kind;
          if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
            // `x.member === undefined` and `typeof x.member === "undefined"`
            const other = isUndefined(node.left) ? node.right : isUndefined(node.right) ? node.left : null;
            const typeofSide = [node.left, node.right].map(utils.unwrap).find((e) => ts.isTypeOfExpression(e)) as TS.TypeOfExpression | undefined;
            const literalSide = [node.left, node.right].map(utils.unwrap).find((e) => ts.isStringLiteral(e) && e.text === "undefined");
            const access = other ? memberOf(other) : typeofSide && literalSide ? memberOf(typeofSide.expression) : null;
            if (flagsNull(access)) {
              col.addManual(sf, node, `${access!.name.text} yields null (not undefined) in v1 — this strict check never matches; compare with \`== null\` / \`!= null\``, V1);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/**
 * v1 added members to Actor/Scene/Engine that a user subclass may already
 * define for its own purposes — the subclass member now silently overrides
 * engine behavior (`Scene.pause()` is a lifecycle method on v1). Doctor's
 * shadow rule skips methods by design (lifecycle overrides are the API), so
 * this is the one place these get called out.
 */
const NEW_BASE_MEMBERS: Array<{ bases: ReadonlySet<string>; members: ReadonlySet<string>; owner: string }> = [
  // de02d9ff renamed the component field `paused` → `pauseComponent`; `isPaused`/`canPause` are the flags
  { bases: new Set(["Actor"]), members: new Set(["pauseComponent", "isPaused", "canPause"]), owner: "Actor" },
  { bases: new Set(["Scene"]), members: new Set(["pause", "resume"]), owner: "Scene" },
  { bases: new Set(["Engine"]), members: new Set(["plugins", "addPlugin", "removePlugin", "hasPlugin", "lighting", "isLoaded", "setInputEnabled", "isHiDPI", "currentFrameElapsed", "currentFrameLag"]), owner: "Engine" },
];

export const newBaseMembers = manualMigration({
  id: "new-base-members",
  version: "1.0.0",
  title: "v1 added Actor.pauseComponent/isPaused/canPause, Scene.pause/resume, Engine.plugins/addPlugin/lighting — subclass members with those names now override engine behavior",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isClassDeclaration(node) && node.name) {
          const symbol = checker.getSymbolAtLocation(node.name);
          const type = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : null;
          for (const { bases, members, owner } of NEW_BASE_MEMBERS) {
            if (!utils.derivesFromExcalibur(type, bases)) continue;
            for (const member of node.members) {
              if (!member.name || !ts.isIdentifier(member.name) || !members.has(member.name.text)) continue;
              if (ts.canHaveModifiers(member) && ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) continue;
              col.addManual(sf, member.name, `${owner}.${member.name.text} is an engine member in v1 — this ${ts.isMethodDeclaration(member) ? "method" : "member"} now overrides it; rename yours or implement the engine's contract`, V1);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

/** Behavioral: options-form rotateBy without rotationType now rotates by the exact signed offset. */
export const rotateByExactOffset: Migration = {
  id: "rotateby-exact-offset",
  version: "1.0.0",
  promptType: "notification",
  title: "rotateBy({ angleRadiansOffset }) without rotationType rotates by the exact signed offset in v1",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const ACTIONS = new Set(["ActionContext", "ActionsComponent"]);
    let sites = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "rotateBy" &&
          node.arguments.length === 1 &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), ACTIONS)
        ) {
          const options = utils.unwrap(node.arguments[0]!);
          if (ts.isObjectLiteralExpression(options) && !options.properties.some((p) => p.name && ts.isIdentifier(p.name) && p.name.text === "rotationType")) {
            sites++;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (sites === 0) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      `${sites} rotateBy({ … }) call(s) without rotationType: in v1 the actor rotates by exactly the signed offset — offsets beyond ±π now travel the long way in the direction of their sign, and 2π is a full revolution (it was a no-op). Offsets within ±π behave as before. Pass an explicit rotationType to keep path-based behavior.`
    );
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0]!;
  },
};

/** Behavioral/packaging: excalibur v1 is ESM-only (no UMD build, no `require` export condition). */
export const esmOnlyPackage: Migration = {
  id: "esm-only-package",
  version: "1.0.0",
  promptType: "notification",
  title: "excalibur is ESM-only in v1 (no UMD bundle, no require())",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, program, project } = ctx;
    const reasons: string[] = [];
    let requires = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "require" &&
          node.arguments.length === 1 &&
          ts.isStringLiteral(node.arguments[0]!) &&
          node.arguments[0]!.text === "excalibur"
        ) {
          requires++;
        } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
          const spec = node.moduleReference.expression;
          if (ts.isStringLiteral(spec) && spec.text === "excalibur") requires++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (requires > 0) reasons.push(`${requires} require("excalibur") site(s)`);
    const options = program.getCompilerOptions();
    const pkgType = (project.pkg as { type?: unknown }).type;
    if (options.module === ts.ModuleKind.CommonJS && pkgType !== "module") reasons.push('tsconfig emits CommonJS (`module: "commonjs"`) and package.json has no `"type": "module"`');
    if (reasons.length === 0) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      `excalibur v1 ships ESM only ("type": "module", no UMD bundle, no require() export condition) — ${reasons.join("; ")}. Switch to \`import … from "excalibur"\` under a bundler or \`module: "esnext"\`/\`"nodenext"\`; a <script src="excalibur.min.js"> global \`ex\` no longer exists.`
    );
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0]!;
  },
};

/** Behavioral: scene deactivation now flushes entity/component removals synchronously (core #3904). */
export const sceneDeactivateFlush: Migration = {
  id: "scene-deactivate-flush",
  version: "1.0.0",
  promptType: "notification",
  title: "Scene deactivation flushes pending entity/component removals synchronously in v1",
  link: "https://github.com/excaliburjs/Excalibur/pull/3904",
  check(ctx: UpgradeContext) {
    const { ts, utils } = ctx;
    const SCENE = new Set(["Scene"]);
    let overrides = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isMethodDeclaration(node) &&
          node.name &&
          ts.isIdentifier(node.name) &&
          node.name.text === "onDeactivate" &&
          (node.body?.statements.length ?? 0) > 0 && // the template's comment-only stub is not an override worth a note
          utils.enclosingExcaliburClass(node, SCENE)
        ) {
          overrides++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (overrides === 0) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      `${overrides} Scene.onDeactivate override(s): in v1, right after onDeactivate returns, the scene processes every pending entity kill and component removal synchronously (they used to wait for the next update) — code that expects killed entities to linger in the scene until the next frame, or re-adds them during deactivation, now sees them gone.`
    );
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0]!;
  },
};

/**
 * `Collider.owner` is `Entity | null` on v1 (0.32: `Entity`). Every collision
 * handler reads `other.owner`, so under strictNullChecks each dereference is
 * now a TS18047 — typing only (the runtime value was always nullable for a
 * detached collider), hence a notification that counts the sites rather than
 * a breadcrumb per line.
 */
export const colliderOwnerNullable: Migration = {
  id: "collider-owner-nullable",
  version: "1.0.0",
  promptType: "notification",
  title: "Collider.owner is typed Entity | null in v1 — collision handlers dereferencing other.owner need a null check",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const COLLIDER = new Set(["Collider"]);
    let sites = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node) && node.name.text === "owner" && utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), COLLIDER)) {
          const parent = node.parent;
          // a dereference (`.owner.kill()`, `.owner.pos`) — a bare read or a null-guarded one (`?.`) is fine
          if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node && !parent.questionDotToken) sites++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (sites === 0) return null;
    const col = ctx.collector(this.id);
    col.addNote(`${sites} dereference(s) of a Collider's .owner: it is typed Entity | null in v1 (it was Entity), so under strictNullChecks each one is a TS18047 — guard with \`?.\` or an early return; an attached collider behaves as before (a detached one now holds null, was undefined).`);
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0]!;
  },
};
