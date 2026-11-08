/**
 * core 7206a977 "feat: Sound + SoundManager Refactor" — the largest v1 break.
 * Shapes verified in `src/engine/resources/sound/*` on main (the CHANGELOG
 * is wrong twice: `SoundTrack` DOES have `.volume`, and the record form of
 * `sounds:` is NOT accepted — `sound-manager.ts:441` only iterates arrays,
 * so a record silently tracks nothing). Every check is excalibur-symbol
 * gated: real games ship their own `class SoundManager`.
 */
import type * as TS from "typescript";
import { removedExportsMigration } from "./_removed-exports.ts";
import { constructedExcaliburClass, excaliburNameOf, memberSuffix, quoteOf, statementsOf } from "./_resolve.ts";
import type { Migration, CheckResult, UpgradeContext, Collector } from "../types.ts";

const V1 = "https://github.com/excaliburjs/Excalibur/blob/main/CHANGELOG.md";
const SOUND = new Set(["Sound"]);
const MANAGER = new Set(["SoundManager"]);
const MANAGER_OR_CHANNELS = new Set(["SoundManager", "ChannelCollection"]);
const MUTE_RECEIVERS = new Set(["Sound", "SoundManager", "ChannelCollection", "SoundChannel"]);

/** The audio surface v1 deleted outright (no mechanical rewrite). `WebAudioInstance` rides the export-rename record. */
export const soundRemovedExports = removedExportsMigration({
  id: "sound-removed-exports",
  version: "1.0.0",
  title: "audio abstraction removed in v1: Audio, AudioImplementation, ExResponseType, SoundManager helper types",
  link: V1,
  names: {
    Audio: "(the audio interface) was removed in v1 — type tracks as SoundTrack and sounds as Sound",
    AudioImplementation: "was removed in v1 — Web Audio is the only implementation; drop the custom backend",
    ExResponseType: "was removed in v1 — inline the union '' | 'arraybuffer' | 'blob' | 'document' | 'json' | 'text'",
    ExResponseTypesLookup: "was removed in v1 — use Record<string, Resource<unknown>['responseType']>",
    ChannelSoundsConfiguration: "was removed in v1 — read a channel's sounds via soundManager.getChannel(name).sounds",
    PossibleChannels: "was removed in v1 (no replacement; SoundManager infers its channel names)",
    PossibleSounds: "was removed in v1 (no replacement; SoundManager infers its sound names from `name`)",
  },
});

const EX_RESPONSE_LITERALS: Record<string, string> = {
  any: "",
  blob: "blob",
  json: "json",
  text: "text",
  document: "document",
  arraybuffer: "arraybuffer",
};

/**
 * `ExResponse.type.arraybuffer` → `'arraybuffer'`. The lookup class is gone;
 * `Resource`'s constructor always took the string (the engine itself now
 * writes `new Resource('', 'arraybuffer')`). `any` maps to the empty string.
 */
export const exResponseToLiteral: Migration = {
  id: "exresponse-to-literal",
  version: "1.0.0",
  promptType: "auto",
  title: "ExResponse.type.* was removed in v1 — pass the response type string",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts } = ctx;
    const col = ctx.collector(this.id);
    for (const { sf, text } of ctx.files) {
      let rewritten = 0;
      let untouched = 0;
      const visit = (node: TS.Node): void => {
        // `<ExResponse>.type.<k>` / `<ExResponse>.type['k']` / `<ExResponse>.type[expr]`
        if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && ts.isPropertyAccessExpression(node.expression)) {
          const typeAccess = node.expression;
          if (typeAccess.name.text === "type" && excaliburNameOf(ctx, typeAccess.expression) === "ExResponse") {
            const key = ts.isPropertyAccessExpression(node)
              ? node.name.text
              : ts.isStringLiteral(node.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)
                ? node.argumentExpression.text
                : null;
            if (key !== null && Object.hasOwn(EX_RESPONSE_LITERALS, key)) {
              const q = quoteOf(ctx, sf, node);
              col.addEdit(sf, node, `${q}${EX_RESPONSE_LITERALS[key]}${q}`, `ExResponse.type.${key} -> '${EX_RESPONSE_LITERALS[key]}'`);
              rewritten++;
            } else {
              col.addManual(sf, node, "ExResponse was removed in v1 — pass the response type string ('arraybuffer', 'blob', 'json', 'text', 'document', or '' for any) directly", V1);
              untouched++;
            }
            return;
          }
        } else if (ts.isIdentifier(node) && node.text === "ExResponse" && !ts.isImportSpecifier(node.parent) && !ts.isPropertyAccessExpression(node.parent)) {
          if (excaliburNameOf(ctx, node) === "ExResponse") {
            col.addManual(sf, node, "ExResponse was removed in v1 — pass the response type string directly", V1);
            untouched++;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      if (rewritten > 0 && untouched === 0) {
        // Every use became a literal: the import would dangle (noUnusedLocals) — drop the specifier.
        const importEdit = ctx.editor.replaceImportSpecifier(sf, text, "excalibur", "ExResponse", []);
        if (importEdit) col.addEdit(sf, { getStart: () => importEdit.start, end: importEdit.end }, importEdit.text, "drop the ExResponse import");
      }
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} ExResponse lookup(s) to inline${extra}`;
  },
};

/** number, a numeric literal type, or a union of those with undefined/null (`volume?: number` destructured with a default). */
function isNumberish(ctx: UpgradeContext, type: TS.Type): boolean {
  const { ts } = ctx;
  const parts = type.isUnion() ? type.types : [type];
  const numeric = parts.filter((t) => t.flags & ts.TypeFlags.NumberLike);
  return numeric.length > 0 && parts.every((t) => t.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void));
}

/** The receiver expression of `X.m(...)` / `X.m` when it is Sound-typed, else null. */
function soundReceiver(ctx: UpgradeContext, node: TS.Node): TS.Expression | null {
  const { ts, checker, utils } = ctx;
  if (!ts.isPropertyAccessExpression(node)) return null;
  return utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression), SOUND) ? node.expression : null;
}

/** The call `X.<name>(...)` (possibly awaited) that an expression statement makes, else null. */
function statementCall(ctx: UpgradeContext, stmt: TS.Statement): TS.CallExpression | null {
  const { ts, utils } = ctx;
  if (!ts.isExpressionStatement(stmt)) return null;
  let expr = utils.unwrap(stmt.expression);
  if (ts.isAwaitExpression(expr)) expr = utils.unwrap(expr.expression);
  return ts.isCallExpression(expr) ? expr : null;
}

/**
 * `Sound.play()` changed meaning three ways; each gets the most mechanical
 * treatment the change admits:
 *  - `play(0.5)` (volume number) → `play({ volume: 0.5 })`: the number form
 *    is deprecated. NOTE the semantics moved too — the volume used to be
 *    written into `sound.volume` for good, now it is per-track — surfaced as
 *    a notification once, never a breadcrumb per site.
 *  - `sound.scheduledStartTime = x`: the field is gone (and 0.32 never read
 *    it — the statement was always a no-op). Replaced in place by a comment
 *    pointing at `play({ scheduledStartTime })`, so line numbers hold.
 *  - `seek(t); play()` → `seek(t); resume()`: `play()` now always starts a
 *    NEW track, so the seeked (paused) track would be orphaned.
 *  - a file that both pauses and plays a Sound: every `play()` there gets a
 *    breadcrumb — `play()` no longer resumes; that is `resume()` now.
 */
export const soundPlayOptions: Migration = {
  id: "sound-play-options",
  version: "1.0.0",
  promptType: "auto",
  title: "Sound.play() no longer resumes or takes a volume number — use play({ volume }) / resume()",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);
    let volumeRewrites = 0;
    let scheduledRemovals = 0;
    for (const { sf } of ctx.files) {
      const resumed = new Set<TS.CallExpression>();
      const plays: TS.CallExpression[] = [];
      let pauses = 0;
      const visit = (node: TS.Node): void => {
        const statements = statementsOf(ctx, node);
        if (statements) {
          // `R.seek(...)` immediately followed by `R.play()` — same receiver text.
          for (let i = 0; i + 1 < statements.length; i++) {
            const seek = statementCall(ctx, statements[i]!);
            const play = statementCall(ctx, statements[i + 1]!);
            if (!seek || !play || !ts.isPropertyAccessExpression(seek.expression) || !ts.isPropertyAccessExpression(play.expression)) continue;
            if (seek.expression.name.text !== "seek" || play.expression.name.text !== "play" || play.arguments.length !== 0) continue;
            if (!soundReceiver(ctx, seek.expression)) continue;
            if (seek.expression.expression.getText(sf) !== play.expression.expression.getText(sf)) continue;
            col.addEdit(sf, { start: play.expression.name.getStart(sf), end: play.expression.name.end }, "resume", "seek(); play() -> seek(); resume()");
            resumed.add(play);
          }
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const receiver = soundReceiver(ctx, node.expression);
          const name = node.expression.name.text;
          if (receiver && name === "play") {
            plays.push(node);
            const [arg] = node.arguments;
            if (node.arguments.length === 1 && arg) {
              const value = utils.unwrap(arg);
              const type = checker.getTypeAtLocation(value);
              if (!ts.isObjectLiteralExpression(value) && isNumberish(ctx, type)) {
                const argText = arg.getText(sf);
                col.addEdit(sf, arg, argText === "volume" ? "{ volume }" : `{ volume: ${argText} }`, "play(volume) -> play({ volume })");
                volumeRewrites++;
              }
            }
          } else if (receiver && name === "pause") {
            pauses++;
          }
        }
        if (
          ts.isExpressionStatement(node) &&
          ts.isBinaryExpression(node.expression) &&
          node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.expression.left) &&
          node.expression.left.name.text === "scheduledStartTime" &&
          soundReceiver(ctx, node.expression.left)
        ) {
          const rhs = node.expression.right.getText(sf).replace(/\s+/g, " ");
          col.addEdit(
            sf,
            { start: node.getStart(sf), end: node.end },
            `// ex-upgrade(${this.id}): Sound.scheduledStartTime was removed in v1 (0.32 never read it) — pass play({ scheduledStartTime: ${rhs} }) instead`,
            "scheduledStartTime assignment -> comment"
          );
          scheduledRemovals++;
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
      if (pauses > 0) {
        for (const play of plays) {
          if (resumed.has(play)) continue;
          col.addManual(sf, play, "play() no longer resumes a paused track in v1 (it always starts a new one) — call resume() to continue a paused/seeked track", V1);
        }
      }
    }
    if (volumeRewrites > 0) {
      col.addNote(
        `${volumeRewrites} Sound.play(volume) call(s) rewritten to play({ volume }) — in v1 that volume applies to the started track only (it used to overwrite sound.volume for every later play); set sound.volume explicitly where the old sticky behavior was relied on.`
      );
    }
    if (scheduledRemovals > 0) {
      col.addNote(`${scheduledRemovals} \`sound.scheduledStartTime = …\` statement(s) replaced by an ex-upgrade comment (the field was removed; pass play({ scheduledStartTime })).`);
    }
    return col.result();
  },
  prompt(result: CheckResult) {
    const extra = result.manual.length > 0 ? `, ${result.manual.length} site(s) need review` : "";
    return `${result.edits.length} Sound.play/seek/scheduledStartTime site(s) to rewrite${extra}`;
  },
};

/**
 * Rewrite one SoundConfig literal's `channels: [...]` (list) to `channel:`
 * (single). Returns false when the shape has no mechanical form (several
 * channels, a computed list, or an empty list in first position where the
 * removal splice would touch the brace).
 */
function rewriteChannelsKey(ctx: UpgradeContext, col: Collector, sf: TS.SourceFile, text: string, config: TS.ObjectLiteralExpression): boolean {
  const { ts, editor } = ctx;
  for (const prop of config.properties) {
    if (!ts.isPropertyAssignment(prop) || !prop.name || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) || prop.name.text !== "channels") continue;
    const value = ctx.utils.unwrap(prop.initializer);
    if (!ts.isArrayLiteralExpression(value)) return false;
    if (value.elements.length > 1) return false;
    if (value.elements.length === 0) {
      if (config.properties[0] === prop) return false;
      const removal = editor.removeObjectProperty(sf, text, config, "channels");
      if (!removal) return false;
      col.addEdit(sf, { getStart: () => removal.start, end: removal.end }, removal.text, "drop empty channels: []");
      return true;
    }
    const q = ts.isStringLiteral(prop.name) ? sf.text[prop.name.getStart(sf)] : "";
    col.addEdit(sf, { start: prop.name.getStart(sf), end: prop.name.end }, `${q}channel${q}`, "channels -> channel");
    col.addEdit(sf, value, value.elements[0]!.getText(sf), "channels: [x] -> channel: x");
    return true;
  }
  return true;
}

/**
 * `new SoundManager({ sounds: { key: … } })` → the array form. ALWAYS emits
 * `name: 'key'`: without it v1 registers the sound under its file's
 * basename, which almost never matches the old record key, and every
 * `play('key')` would silently miss.
 */
export const soundManagerOptions: Migration = {
  id: "soundmanager-options",
  version: "1.0.0",
  promptType: "auto",
  title: "SoundManager `sounds` is an array of named configs in v1 (the record form silently tracks nothing); `channels` → `channel`",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);

    const convertSounds = (sf: TS.SourceFile, text: string, literal: TS.ObjectLiteralExpression, site: TS.Node): void => {
      const q = quoteOf(ctx, sf, site);
      const keyText = (name: TS.Identifier | TS.StringLiteral | TS.NumericLiteral): string =>
        ts.isStringLiteral(name) ? name.getText(sf) : `${q}${name.text}${q}`;
      type Entry =
        | { kind: "config"; prop: TS.PropertyAssignment; key: string; config: TS.ObjectLiteralExpression }
        | { kind: "sound"; prop: TS.PropertyAssignment; key: string; init: TS.Expression }
        | { kind: "shorthand"; prop: TS.ShorthandPropertyAssignment; key: string };
      const entries: Entry[] = [];
      for (const prop of literal.properties) {
        if (ts.isShorthandPropertyAssignment(prop)) {
          entries.push({ kind: "shorthand", prop, key: keyText(prop.name) });
        } else if (ts.isPropertyAssignment(prop) && prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
          const init = utils.unwrap(prop.initializer);
          if (ts.isObjectLiteralExpression(init)) {
            if (init.properties.some((p) => ts.isSpreadAssignment(p))) return bail();
            entries.push({ kind: "config", prop, key: keyText(prop.name), config: init });
          } else {
            entries.push({ kind: "sound", prop, key: keyText(prop.name), init: prop.initializer });
          }
        } else {
          return bail();
        }
      }
      function bail(): void {
        col.addManual(
          sf,
          site,
          "SoundManager `sounds` must be an array in v1 ([{ name: 'key', sound, volume?, channel? }]) — the record form is silently ignored and a sound can belong to ONE channel",
          V1
        );
      }
      // Every entry has a mechanical form before any edit is planned (all-or-nothing per literal).
      const planned: Array<() => void> = [];
      for (const entry of entries) {
        if (entry.kind === "config") {
          const channelsOk = rewriteChannelsKey(ctx, { ...col, addEdit: (...args) => planned.push(() => col.addEdit(...args)) } as Collector, sf, text, entry.config);
          if (!channelsOk) return bail();
          const { prop, config, key } = entry;
          const braceEnd = config.getStart(sf) + 1;
          const nextChar = sf.text[braceEnd] ?? "";
          const pad = /\s/.test(nextChar) ? "" : " ";
          planned.push(() => col.addEdit(sf, { start: prop.getStart(sf), end: braceEnd }, `{ name: ${key},${pad}`, `${key}: {…} -> { name: ${key}, … }`));
        } else if (entry.kind === "sound") {
          const { prop, init, key } = entry;
          planned.push(() => col.addEdit(sf, { start: prop.getStart(sf), end: init.getStart(sf) }, `{ name: ${key}, sound: `, `${key}: sound -> { name, sound }`));
          planned.push(() => col.addEdit(sf, { start: init.end, end: init.end }, " }", "close the config"));
        } else {
          const { prop, key } = entry;
          planned.push(() => col.addEdit(sf, prop, `{ name: ${key}, sound: ${prop.name.text} }`, `${key} -> { name, sound }`));
        }
      }
      col.addEdit(sf, { start: literal.getStart(sf), end: literal.getStart(sf) + 1 }, "[", "sounds record -> array");
      col.addEdit(sf, { start: literal.end - 1, end: literal.end }, "]", "sounds record -> array");
      for (const apply of planned) apply();
    };

    const handleOptions = (sf: TS.SourceFile, text: string, options: TS.Expression, site: TS.Node): void => {
      const literal = utils.unwrap(options);
      if (!ts.isObjectLiteralExpression(literal)) return;
      for (const prop of literal.properties) {
        if (!ts.isPropertyAssignment(prop) || !prop.name || !(ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) || prop.name.text !== "sounds") continue;
        const sounds = utils.unwrap(prop.initializer);
        if (ts.isObjectLiteralExpression(sounds)) convertSounds(sf, text, sounds, prop);
        else if (ts.isArrayLiteralExpression(sounds)) {
          for (const el of sounds.elements) {
            const cfg = utils.unwrap(el);
            if (ts.isObjectLiteralExpression(cfg) && !rewriteChannelsKey(ctx, col, sf, text, cfg)) {
              col.addManual(sf, cfg, "a SoundManager sound belongs to ONE channel in v1 (`channel: 'x'`) — pick one", V1);
            }
          }
        }
      }
    };

    for (const { sf, text } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isNewExpression(node) && node.arguments?.length) {
          if (constructedExcaliburClass(ctx, node)?.getName() === "SoundManager") handleOptions(sf, text, node.arguments[0]!, node);
        } else if (ts.isVariableDeclaration(node) && node.type && node.initializer && ts.isTypeReferenceNode(node.type)) {
          const name = excaliburNameOf(ctx, node.type.typeName);
          if (name === "SoundManagerOptions") handleOptions(sf, text, node.initializer, node);
          else if (name === "SoundConfig") {
            const cfg = utils.unwrap(node.initializer);
            if (ts.isObjectLiteralExpression(cfg) && !rewriteChannelsKey(ctx, col, sf, text, cfg)) {
              col.addManual(sf, cfg, "a SoundManager sound belongs to ONE channel in v1 (`channel: 'x'`) — pick one", V1);
            }
          }
        } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "track") {
          // `manager.track(name, { sound, channels })` carries the same config shape.
          if (utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), MANAGER)) {
            const last = node.arguments[node.arguments.length - 1];
            const cfg = last ? utils.unwrap(last) : null;
            if (cfg && ts.isObjectLiteralExpression(cfg) && !rewriteChannelsKey(ctx, col, sf, text, cfg)) {
              col.addManual(sf, cfg, "a SoundManager sound belongs to ONE channel in v1 (`channel: 'x'`) — pick one", V1);
            }
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
    return `${result.edits.length} SoundManager option edit(s)${extra}`;
  },
};

/**
 * SoundManager members that moved (verified `sound-manager.ts` on main):
 * `defaultVolume` → `volume` (now the master gain), `_isMuted(x)` →
 * `isMuted(x)`, `addChannel(n, ['c'])` → `setChannel(n, 'c')`,
 * `removeChannel(n, [...])` → `setChannel(n, null)`, `getSound()` returns
 * null (not undefined) now, `new ChannelCollection(opts, mgr)` →
 * `(mgr)`, `play(name, 0.5)` → `play(name, { volume: 0.5 })`. The rest of
 * the quasi-internal surface (`_muted`, `_getEffectiveVolume`,
 * `_activeTrackCount`) and custom `SoundManagerApi` implementations get a
 * breadcrumb.
 */
export const soundManagerMembers: Migration = {
  id: "soundmanager-members",
  version: "1.0.0",
  promptType: "auto",
  title: "SoundManager members renamed/removed in v1 (defaultVolume, addChannel/removeChannel, _isMuted, getSound null, …)",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    const col = ctx.collector(this.id);
    const RENAMES: Record<string, string> = { defaultVolume: "volume", _isMuted: "isMuted" };
    const GONE: Record<string, string> = {
      _muted: "_muted was removed in v1 — use isMuted() (true for a muted sound, channel, or master)",
      _getEffectiveVolume: "_getEffectiveVolume was removed in v1 — volumes are Web Audio gain nodes now (sound.output / channel.output / manager.output)",
      _activeTrackCount: "_activeTrackCount was removed in v1 — use playingCount()",
    };
    const isManager = (expr: TS.Expression, set: ReadonlySet<string> = MANAGER_OR_CHANNELS): boolean =>
      utils.derivesFromExcalibur(checker.getTypeAtLocation(expr), set);
    const isUndefined = (expr: TS.Expression): boolean => {
      const e = utils.unwrap(expr);
      return (ts.isIdentifier(e) && e.text === "undefined") || ts.isVoidExpression(e);
    };
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (ts.isPropertyAccessExpression(node) && isManager(node.expression)) {
          const name = node.name.text;
          if (Object.hasOwn(RENAMES, name)) {
            col.addEdit(sf, { start: node.name.getStart(sf), end: node.name.end }, RENAMES[name]!, `${name} -> ${RENAMES[name]}`);
          } else if (Object.hasOwn(GONE, name)) {
            col.addManual(sf, node, GONE[name]!, V1);
          }
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && isManager(node.expression.expression)) {
          const name = node.expression.name.text;
          const args = node.arguments;
          if ((name === "addChannel" || name === "removeChannel") && args.length === 2) {
            const list = utils.unwrap(args[1]!);
            if (ts.isArrayLiteralExpression(list) && (name === "removeChannel" || list.elements.length === 1)) {
              const channel = name === "addChannel" ? list.elements[0]!.getText(sf) : "null";
              col.addEdit(sf, { start: node.expression.name.getStart(sf), end: node.end }, `setChannel(${args[0]!.getText(sf)}, ${channel})`, `${name}() -> setChannel()`);
            } else {
              col.addManual(sf, node, `${name}() was removed in v1 — a sound belongs to ONE channel: setChannel(name, 'channel') / setChannel(name, null)`, V1);
            }
          } else if (name === "play" && args.length === 2) {
            const value = utils.unwrap(args[1]!);
            if (!ts.isObjectLiteralExpression(value) && isNumberish(ctx, checker.getTypeAtLocation(value))) {
              col.addEdit(sf, args[1]!, `{ volume: ${args[1]!.getText(sf)} }`, "play(name, volume) -> play(name, { volume })");
            }
          }
        }
        if (ts.isBinaryExpression(node)) {
          const op = node.operatorToken.kind;
          if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsEqualsToken) {
            const sides = [node.left, node.right];
            const other = isUndefined(node.left) ? node.right : isUndefined(node.right) ? node.left : null;
            const call = other ? utils.unwrap(other) : null;
            if (
              sides.some(isUndefined) &&
              call &&
              ts.isCallExpression(call) &&
              ts.isPropertyAccessExpression(call.expression) &&
              call.expression.name.text === "getSound" &&
              isManager(call.expression.expression, MANAGER)
            ) {
              col.addEdit(
                sf,
                { start: node.operatorToken.getStart(sf), end: node.operatorToken.end },
                op === ts.SyntaxKind.EqualsEqualsEqualsToken ? "==" : "!=",
                "getSound() returns null in v1 — loose equality covers both"
              );
            }
          }
        }
        if (ts.isNewExpression(node) && node.arguments?.length === 2 && constructedExcaliburClass(ctx, node)?.getName() === "ChannelCollection") {
          const [opts, mgr] = node.arguments as unknown as [TS.Expression, TS.Expression];
          col.addEdit(sf, { start: opts.getStart(sf), end: mgr.end }, mgr.getText(sf), "new ChannelCollection(options, manager) -> (manager)");
        }
        if (ts.isClassDeclaration(node)) {
          for (const clause of node.heritageClauses ?? []) {
            if (clause.token !== ts.SyntaxKind.ImplementsKeyword) continue;
            for (const type of clause.types) {
              if (excaliburNameOf(ctx, type.expression) === "SoundManagerApi") {
                col.addManual(sf, type, "SoundManagerApi changed in v1: play(name, options?: number | PlayOptions) resolves to boolean (false when dropped) — update this implementation", V1);
              }
            }
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
    return `${result.edits.length} SoundManager member rewrite(s)${extra}`;
  },
};

/** Behavioral: mute/unmute no longer pause/start, SoundTrack.volume is a multiplier, channel.setVolume works now. */
export const soundMuteSemantics: Migration = {
  id: "sound-mute-semantics",
  version: "1.0.0",
  promptType: "notification",
  title: "muting is gain-based in v1: mute() no longer pauses, unmute() no longer starts playback",
  link: V1,
  check(ctx: UpgradeContext) {
    const { ts, checker, utils } = ctx;
    let sites = 0;
    for (const { sf } of ctx.files) {
      const visit = (node: TS.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          (node.expression.name.text === "mute" || node.expression.name.text === "unmute" || node.expression.name.text === "toggle") &&
          utils.derivesFromExcalibur(checker.getTypeAtLocation(node.expression.expression), MUTE_RECEIVERS)
        ) {
          sites++;
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (sites === 0) return null;
    const col = ctx.collector(this.id);
    col.addNote(
      `${sites} mute/unmute/toggle call(s): in v1 muting silences via gain instead of pausing — a muted sound keeps playing (and is mid-clip when unmuted), unmute() no longer STARTS sounds that never played, mute()/unmute() with no argument act on the master output, SoundTrack.volume is now a per-track multiplier of Sound.volume, and SoundManager.channel.setVolume() actually works (it was a no-op before).`
    );
    return col.result();
  },
  prompt(result: CheckResult) {
    return result.notes[0]!;
  },
};
