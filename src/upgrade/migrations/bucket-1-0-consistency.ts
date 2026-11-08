/**
 * v1 "API consistency" pass — core 1a1c8331 (`fix!: more api consistency
 * updates`), 6f19e7d2 (time units are always milliseconds) and b930f2b7
 * (event types), all landing after the 2026-11-06 API-shape review. Every
 * row verified against the core DIFF: the CHANGELOG names `ClockOptions.
 * defaultUpdateMs`, but the key only ever existed on `TestClockOptions`.
 *
 * Shapes: the `Ms` suffix drop and `Color.equal` → `equals` are typed member
 * renames; `TestClock({ defaultUpdateMs })` and `Slide({ easingFunction })`
 * are contextual option-key renames; `EventTypes.X` and the lowercase event
 * type aliases become their string literals (auto, import dropped when fully
 * rewritten); the Sound seconds → milliseconds change is a VALUE change with
 * no shape change, so it is breadcrumb-only (an auto `× 1000` would be
 * re-applied by a second run before `npm install`) — the breadcrumb spells
 * out the converted literal where there is one.
 */
import type * as TS from "typescript";
import { memberReshapeMigration } from "./_member-reshape.ts";
import { optionKeyRenameMigration } from "./_option-keys.ts";
import { removedExportsMigration } from "./_removed-exports.ts";
import { manualMigration } from "./_manual.ts";
import { constructedExcaliburClass, declaringTypeName, excaliburSymbolOf, quoteOf, removeImportSpecifiers, shaderTextOf } from "./_resolve.ts";
import { blankComments } from "../../doctor/rules/no-reserved-uniforms.ts";
import type { Migration, CheckResult, UpgradeContext } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";

/** Public members that carried an `Ms` suffix; time is implicitly milliseconds on v1. */
export const timeUnitSuffixRenames = memberReshapeMigration({
  id: "time-unit-suffix-renames",
  version: "1.0.0",
  title: "Ms suffix dropped in v1: Engine.currentFrameElapsedMs/currentFrameLagMs → currentFrameElapsed/currentFrameLag, FrameStats.elapsedMs → elapsed, GifFrame.delayMs → delay",
  link: V1,
  rules: [
    { owners: new Set(["Engine"]), members: { currentFrameElapsedMs: { to: "currentFrameElapsed" }, currentFrameLagMs: { to: "currentFrameLag" } } },
    { owners: new Set(["FrameStats", "FrameStatistics"]), members: { elapsedMs: { to: "elapsed" } } },
    { owners: new Set(["GifFrame"]), members: { delayMs: { to: "delay" } } },
  ],
});

/** `Color.equal(other)` → `Color.equals(other)` (same semantics modulo exact channel comparison). */
export const colorEquals = memberReshapeMigration({
  id: "color-equals",
  version: "1.0.0",
  title: "Color.equal() was renamed Color.equals() in v1",
  link: V1,
  rules: [{ owners: new Set(["Color"]), members: { equal: { to: "equals" } } }],
});

/** `new TestClock({ defaultUpdateMs })` → `defaultUpdate` (TestClockOptions; the CHANGELOG says ClockOptions, wrongly). */
export const timeUnitOptionKeys = optionKeyRenameMigration({
  id: "time-unit-option-keys",
  version: "1.0.0",
  title: "TestClock option defaultUpdateMs was renamed defaultUpdate in v1",
  link: V1,
  keys: [{ key: "defaultUpdateMs", to: "defaultUpdate", owners: new Set(["TestClockOptions", "ClockOptions"]) }],
});

/** `new Slide({ easingFunction })` → `easing` — the one transition that had its own key (and ignored `easing`). */
export const slideEasingOption = optionKeyRenameMigration({
  id: "slide-easing-option",
  version: "1.0.0",
  title: "Slide({ easingFunction }) is Slide({ easing }) in v1, like every other transition",
  link: V1,
  keys: [{ key: "easingFunction", to: "easing", owners: new Set(["SlideOptions"]) }],
});

// ---------------------------------------------------------------------------
// Sound: seconds → milliseconds
// ---------------------------------------------------------------------------

const SOUND_TIME_OWNERS = new Set(["Sound", "SoundTrack"]);
const SOUND_OPTION_OWNERS = new Set(["PlayOptions", "SoundOptions"]);
/** Sound/SoundTrack members whose unit changed (6f19e7d2); `scheduledStartTime` only on SoundTrack (Sound's field is gone — sound-play-options). */
const SOUND_TIME_MEMBERS: Record<string, "call" | "property"> = {
  seek: "call",
  getPlaybackPosition: "call",
  getTotalPlaybackDuration: "call",
  duration: "property",
  position: "property",
  scheduledStartTime: "property",
};
const SOUND_TIME_KEYS = new Set(["duration", "position"]);

/** `2.5` → `2500`; null when the product is not a clean number (never emit 1100.0000000000002). */
function secondsToMsLiteral(text: string): string | null {
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const ms = n * 1000;
  const rounded = Math.round(ms);
  if (Math.abs(ms - rounded) < 1e-6) return String(rounded);
  const fixed = Number(ms.toFixed(6));
  return Number.isFinite(fixed) ? String(fixed) : null;
}

export const soundTimeUnits = manualMigration({
  id: "sound-time-units",
  version: "1.0.0",
  title: "Sound/SoundTrack positions and durations are milliseconds in v1 (seek, position, duration, getPlaybackPosition, getTotalPlaybackDuration, SoundTrack.scheduledStartTime were seconds)",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const literalOf = (expr: TS.Expression | undefined): string | null => {
      if (!expr) return null;
      const value = utils.unwrap(expr);
      return ts.isNumericLiteral(value) ? value.text : null;
    };
    const convert = (literal: string | null, render: (ms: string) => string): string => {
      const ms = literal === null ? null : secondsToMsLiteral(literal);
      return ms === null ? "multiply the seconds value by 1000" : `${render(ms)} keeps the old timing`;
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node) && Object.hasOwn(SOUND_TIME_MEMBERS, node.name.text)) {
          const name = node.name.text;
          const symbol = checker.getSymbolAtLocation(node.name);
          const owner = symbol && utils.isExcaliburSymbol(symbol) ? declaringTypeName(ctx, symbol) : null;
          const byProvenance = owner !== null && SOUND_TIME_OWNERS.has(owner);
          const byReceiver = !symbol && utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), SOUND_TIME_OWNERS);
          if ((byProvenance || byReceiver) && !(name === "scheduledStartTime" && owner === "Sound")) {
            const parent = node.parent;
            if (SOUND_TIME_MEMBERS[name] === "call") {
              if (ts.isCallExpression(parent) && parent.expression === node) {
                if (name === "seek") {
                  const arg = parent.arguments[0];
                  col.addManual(sf, parent, `seek() takes milliseconds in v1 (was seconds) — ${convert(literalOf(arg), (ms) => `seek(${ms}${parent.arguments.length > 1 ? ", …" : ""})`)}`, V1);
                } else {
                  col.addManual(sf, parent, `${name}() returns milliseconds in v1 (was seconds) — divide by 1000 where seconds are still expected`, V1);
                }
              }
              return;
            }
            if (ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
              col.addManual(sf, parent, `${name} is milliseconds in v1 (was seconds) — ${convert(literalOf(parent.right), (ms) => `${node.getText(sf).replace(/\s+/g, "")} = ${ms}`)}`, V1);
            } else {
              col.addManual(sf, node, `${name} is milliseconds in v1 (was seconds) — divide by 1000 where seconds are still expected`, V1);
            }
            return;
          }
        }
        if (ts.isObjectLiteralExpression(node)) {
          let contextual: TS.Type | undefined;
          for (const prop of node.properties) {
            if (!(ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) || !ts.isIdentifier(prop.name)) continue;
            const key = prop.name.text;
            if (!SOUND_TIME_KEYS.has(key)) continue;
            contextual ??= checker.getContextualType(node);
            if (!contextual) continue;
            const constituents = contextual.isUnion() ? contextual.types : [contextual];
            const symbol = constituents.map((t) => checker.getPropertyOfType(t, key)).find(Boolean);
            if (!symbol || !utils.isExcaliburSymbol(symbol) || !SOUND_OPTION_OWNERS.has(declaringTypeName(ctx, symbol) ?? "")) continue;
            const literal = ts.isPropertyAssignment(prop) ? literalOf(prop.initializer) : null;
            col.addManual(sf, prop, `${key} is milliseconds in v1 (was seconds) — ${convert(literal, (ms) => `${key}: ${ms}`)}`, V1);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});

// ---------------------------------------------------------------------------
// EventTypes enum + lowercase event type aliases → string literals
// ---------------------------------------------------------------------------

/** The removed `ex.EventTypes` enum, key → wire string (events.ts before b930f2b7/1a1c8331). */
const EVENT_TYPES: Record<string, string> = {
  Kill: "kill",
  PreKill: "prekill",
  PostKill: "postkill",
  PreDraw: "predraw",
  PostDraw: "postdraw",
  PreDebugDraw: "predebugdraw",
  PostDebugDraw: "postdebugdraw",
  PreUpdate: "preupdate",
  PostUpdate: "postupdate",
  PreFrame: "preframe",
  PostFrame: "postframe",
  PreCollision: "precollision",
  CollisionStart: "collisionstart",
  CollisionEnd: "collisionend",
  PostCollision: "postcollision",
  Initialize: "initialize",
  Activate: "activate",
  Deactivate: "deactivate",
  ExitViewport: "exitviewport",
  EnterViewport: "enterviewport",
  ExitTrigger: "exit",
  EnterTrigger: "enter",
  Connect: "connect",
  Disconnect: "disconnect",
  Button: "button",
  Axis: "axis",
  Visible: "visible",
  Hidden: "hidden",
  Start: "start",
  Stop: "stop",
  PointerUp: "pointerup",
  PointerDown: "pointerdown",
  PointerMove: "pointermove",
  PointerEnter: "pointerenter",
  PointerLeave: "pointerleave",
  PointerCancel: "pointercancel",
  PointerWheel: "pointerwheel",
  Up: "up",
  Down: "down",
  Move: "move",
  Enter: "enter",
  Leave: "leave",
  Cancel: "cancel",
  Wheel: "wheel",
  Press: "press",
  Release: "release",
  Hold: "hold",
  PointerDragStart: "pointerdragstart",
  PointerDragEnd: "pointerdragend",
  PointerDragEnter: "pointerdragenter",
  PointerDragLeave: "pointerdragleave",
  PointerDragMove: "pointerdragmove",
  ActionStart: "actionstart",
  ActionComplete: "actioncomplete",
  Add: "add",
  Remove: "remove",
};

/** The removed lowercase type aliases (`export type kill = 'kill'`): identity, except the two trigger ones (there was no `exit` alias). */
const EVENT_TYPE_ALIASES: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(EVENT_TYPES)
      .filter((v) => v !== "exit")
      .map((v) => [v, v])
  ),
  exittrigger: "exit",
  entertrigger: "enter",
  subscribe: "subscribe",
  unsubscribe: "unsubscribe",
};

export const eventTypesToStrings: Migration = {
  id: "event-types-to-strings",
  version: "1.0.0",
  promptType: "auto",
  title: "ex.EventTypes and the lowercase event type aliases (ex.kill, ex.pointerup, …) were removed in v1 — use the string literals",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts } = ctx;
    const col = ctx.collector(this.id);
    /** The removed EXPORT a name node resolves to (`EventTypes`, or an alias like `kill`) — through local import aliases. */
    const removedExportOf = (node: TS.Node): string | null => {
      const symbol = excaliburSymbolOf(ctx, node);
      if (!symbol) return null;
      const name = symbol.getName();
      if (name === "EventTypes" && symbol.flags & ts.SymbolFlags.Enum) return name;
      if (Object.hasOwn(EVENT_TYPE_ALIASES, name) && symbol.flags & ts.SymbolFlags.TypeAlias) return name;
      return null;
    };
    for (const { sf } of ctx.files) {
      // Export names this file still reaches for after the rewrite (breadcrumbed sites keep their import).
      const untouched = new Set<string>();
      // Local names bound to the removed exports by this file's imports (`E` for `EventTypes as E`), plus the bare names.
      const localNames = new Set<string>(["EventTypes", ...Object.keys(EVENT_TYPE_ALIASES)]);
      for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== "excalibur") continue;
        const bindings = stmt.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) localNames.add(el.name.text);
      }
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node) && Object.hasOwn(EVENT_TYPES, node.name.text) && removedExportOf(node.expression) === "EventTypes") {
          const q = quoteOf(ctx, sf, node);
          col.addEdit(sf, node, `${q}${EVENT_TYPES[node.name.text]}${q}`, `EventTypes.${node.name.text} -> '${EVENT_TYPES[node.name.text]}'`);
          return;
        }
        if (ts.isTypeReferenceNode(node)) {
          const nameNode = ts.isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
          if (localNames.has(nameNode.text)) {
            const exported = removedExportOf(node.typeName);
            if (exported && exported !== "EventTypes") {
              const q = quoteOf(ctx, sf, node);
              col.addEdit(sf, node, `${q}${EVENT_TYPE_ALIASES[exported]}${q}`, `${exported} -> '${EVENT_TYPE_ALIASES[exported]}'`);
              return;
            }
          }
        }
        if (ts.isIdentifier(node) && localNames.has(node.text) && !ts.isImportSpecifier(node.parent)) {
          // Any other reach for the removed names: `EventTypes[x]`, `Object.values(EventTypes)`, an enum type
          // annotation, an aliased type used outside a type reference, or a re-export (`export { EventTypes }`).
          const exported = removedExportOf(node);
          if (exported) {
            untouched.add(exported);
            col.addManual(
              sf,
              node,
              exported === "EventTypes"
                ? "ex.EventTypes was removed in v1 — use the event name strings ('kill', 'pointerup', …) directly"
                : `the ${exported} event type alias was removed in v1 — use the literal type '${EVENT_TYPE_ALIASES[exported]}'`,
              V1
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      // Drop the import of every removed name this file no longer reaches for (rewritten, or imported and never used).
      const droppable = new Set<string>();
      for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== "excalibur") continue;
        const bindings = stmt.importClause?.namedBindings;
        if (!bindings || !ts.isNamedImports(bindings)) continue;
        for (const el of bindings.elements) {
          const exported = removedExportOf(el.name);
          if (exported && !untouched.has(exported)) droppable.add(el.propertyName?.text ?? el.name.text);
        }
      }
      for (const range of removeImportSpecifiers(ctx, sf, droppable)) {
        col.addEdit(sf, range, "", "drop the removed import(s)");
      }
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} event name(s) to inline${extra}`;
  },
};

// ---------------------------------------------------------------------------
// Remaining removals (1a1c8331 "remove deprecated apis")
// ---------------------------------------------------------------------------

export const v1LegacyRemovals = removedExportsMigration({
  id: "v1-legacy-removals",
  version: "1.0.0",
  title: "remaining legacy exports removed in v1: ScreenShader, TagsComponent, AddedComponent/RemovedComponent, CapturePointerConfig, Util.addItemToArray, Flags.useLegacyImageRenderer, Particle.DefaultConfig, GifParser/Stream",
  link: V1,
  names: {
    ScreenShader: "was removed in v1 — implement PostProcessor.process(source, destination) with a ShaderPass, or use new ShaderPipelinePostProcessor({ passes: [fragmentSource] }); the only varying is v_uv (v_texcoord is gone)",
    TagsComponent: "was removed in v1 — tags live on the entity itself: entity.tags, addTag(), removeTag(), hasTag()",
    AddedComponent: "was removed in v1 — observe entity.componentAdded$ (it emits the Component)",
    RemovedComponent: "was removed in v1 — observe entity.componentRemoved$ (it emits the Component)",
    isAddedComponent: "was removed in v1 along with the AddedComponent message — subscribe to entity.componentAdded$ instead",
    isRemovedComponent: "was removed in v1 along with the RemovedComponent message — subscribe to entity.componentRemoved$ instead",
    CapturePointerConfig: "(the type) was removed in v1 — pointer capture is configured on actor.pointer (useGraphicsBounds / useColliderShape)",
    addItemToArray: "(Util) was removed in v1 — inline it: if (!array.includes(item)) array.push(item)",
    useLegacyImageRenderer: "(Flags) was removed in v1 — ex.image-v2 is the only image renderer; delete the call",
    imageRenderer: "(ExcaliburGraphicsContextWebGL) was removed in v1 — ex.image-v2 is the only image renderer",
    DefaultConfig: "(Particle.DefaultConfig) was removed in v1 — the defaults are Particle's field initializers (life 300, size 5, begin/endColor White, fade false)",
    GifParser: "is internal in v1 (no longer exported) — load through the Gif resource and its toSprite()/toSpriteSheet()/toAnimation()",
    Stream: "(the GIF byte stream) is internal in v1 (no longer exported) — load through the Gif resource",
    LegacyWebAudioSource: "is internal in v1 (no longer exported) — nothing to replace",
  },
});

// ---------------------------------------------------------------------------
// Behavior changes that only warrant a heads-up
// ---------------------------------------------------------------------------

/** `Color.invert()` keeps alpha (CSS semantics) and `screen()` unions coverage; both used to invert alpha. */
export const colorInvertAlpha: Migration = {
  id: "color-invert-alpha",
  version: "1.0.0",
  promptType: "notification",
  title: "Color.invert() preserves alpha in v1 (it used to invert it); Color.screen() combines alpha as coverage",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const COLOR = new Set(["Color"]);
    let inverts = 0;
    let screens = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === "invert" || node.expression.name.text === "screen") &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), COLOR)
        ) {
          if (node.expression.name.text === "invert") inverts++;
          else screens++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (inverts + screens === 0) return null;
    const col = ctx.collector(this.id);
    const parts: string[] = [];
    if (inverts > 0) parts.push(`${inverts} Color.invert() call(s): v1 inverts only r/g/b and keeps alpha (CSS invert() semantics) — an opaque color stays opaque, where it used to become transparent`);
    if (screens > 0) parts.push(`${screens} Color.screen() call(s): v1 computes 1 - (1 - a)(1 - b) per channel and unions alpha as coverage instead of inverting through invert()`);
    col.addNote(`${parts.join("; ")}. Code that relied on the old alpha flip (e.g. invert() to fade a color out) needs an explicit alpha.`);
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0]!;
  },
};

/**
 * Material `v_screenuv` is now the fragment's position after the FULL
 * transform in resolution space, y-flipped so `texture(u_screen_texture,
 * v_screenuv)` is the pixel behind (bottom-left origin, like every GL
 * texture). It used to be an untransformed top-down quad in canvas pixels
 * (wrong under rotation/scale/zoom and at DPR ≠ 1), so shaders that
 * compensated with `1.0 - v_screenuv.y` now render upside down.
 */
export const materialScreenUvOrigin = manualMigration({
  id: "material-screenuv-origin",
  version: "1.0.0",
  title: "Material v_screenuv has a bottom-left origin and follows the full transform in v1",
  link: V1,
  findSites(ctx, col) {
    const { ts, checker, utils } = ctx;
    const MESSAGE =
      "v_screenuv changed in v1: it is now the pixel's position after the full transform (rotation/scale/zoom, DPR-correct) with a bottom-left origin, so texture(u_screen_texture, v_screenuv) is exactly the screen behind the pixel — remove any `1.0 - v_screenuv.y` flip and re-check effects that read the screen";
    /** Does the GLSL READ v_screenuv (not just declare the varying — templates declare it and never use it)? */
    const readsScreenUv = (glsl: string | null): boolean =>
      glsl !== null && /\bv_screenuv\b/.test(blankComments(glsl).replace(/\bin\s+vec2\s+v_screenuv\s*;/g, ""));
    const scanOptions = (sf: TS.SourceFile, options: TS.ObjectLiteralExpression): void => {
      for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;
        if (prop.name.text === "fragmentSource") {
          if (readsScreenUv(shaderTextOf(ctx, sf, prop.initializer))) col.addManual(sf, prop, MESSAGE, V1);
        } else if (prop.name.text === "passes") {
          const passes = utils.unwrap(prop.initializer);
          if (!ts.isArrayLiteralExpression(passes)) continue;
          for (const pass of passes.elements) {
            if (readsScreenUv(shaderTextOf(ctx, sf, pass))) col.addManual(sf, pass, MESSAGE, V1);
          }
        }
      }
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        let options: TS.Expression | undefined;
        if (ts.isNewExpression(node) && constructedExcaliburClass(ctx, node)?.getName() === "Material") {
          options = node.arguments?.[0];
        } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "createMaterial") {
          const method = checker.getSymbolAtLocation(node.expression.name);
          if (method && utils.isExcaliburSymbol(method)) options = node.arguments[0];
        }
        const literal = options ? utils.unwrap(options) : null;
        if (literal && ts.isObjectLiteralExpression(literal)) scanOptions(sf, literal);
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  },
});
