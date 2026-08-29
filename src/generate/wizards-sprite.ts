import * as fs from "node:fs";
import * as path from "node:path";
import { confirm, input, number, select } from "@inquirer/prompts";
import { getChalk, terminal } from "../console.ts";
import { GenerateError } from "./errors.ts";
import { toPascalCase, isValidIdentifier } from "./names.ts";
import { createTsEditor } from "./ts-edit.ts";
import { detectPixelArt, pickActor, pickAssetFile, RESOURCE_TYPES } from "./wizards.ts";
import { parseImageSize } from "./image.ts";
import { createKittySession, type KittySession } from "./kitty.ts";
import type { ImageSize } from "./image.ts";
import type { Project } from "./project.ts";
import type { SpriteSheetGrid, SpriteSheetSpacing } from "./ts-edit.ts";
import type {
  AnimationModel,
  AnimationSpec,
  FrameCoord,
  SpriteSheetImageModel,
  SpriteSheetModel,
  Vec2,
} from "./models.ts";
import type { WizardContext } from "./wizards.ts";

export const ANIMATION_STRATEGIES = [
  { value: "Loop", description: "repeat from the first frame forever" },
  { value: "PingPong", description: "play forward, then backward, repeating" },
  { value: "End", description: "play once, then show nothing" },
  { value: "Freeze", description: "play once, hold the last frame" },
];

/** Where a served asset path ("./images/x.png") lives on disk. */
export function assetDiskPath(project: Project, assetPath: string): string {
  return path.join(project.publicDir, assetPath.replace(/^\.\//, ""));
}

function readAsset(project: Project, assetPath: string): Buffer | null {
  try {
    return fs.readFileSync(assetDiskPath(project, assetPath));
  } catch {
    return null;
  }
}

/**
 * Complete a partial grid spec from the image dimensions. Provide
 * rows+columns to derive the sprite size, or spriteWidth+spriteHeight to
 * derive the counts (floor, with a warning when the division isn't exact).
 */
export function resolveGrid({
  dimensions,
  rows = null,
  columns = null,
  spriteWidth = null,
  spriteHeight = null,
  margin,
  originOffset,
}: {
  dimensions?: Pick<ImageSize, "width" | "height"> | null;
  rows?: number | null;
  columns?: number | null;
  spriteWidth?: number | null;
  spriteHeight?: number | null;
  margin?: Vec2 | null;
  originOffset?: Vec2 | null;
}): { grid: SpriteSheetGrid | null; warnings: string[] } {
  const warnings: string[] = [];
  const m = margin ?? { x: 0, y: 0 };
  const o = originOffset ?? { x: 0, y: 0 };
  let r = rows;
  let c = columns;
  let w = spriteWidth;
  let h = spriteHeight;
  const deriveSize = (axis: string, total: number, offset: number, gap: number, count: number): number => {
    const exact = (total - offset - (count - 1) * gap) / count;
    const size = Math.floor(exact);
    if (exact !== size) {
      warnings.push(
        `the grid does not divide evenly on ${axis}: (${total} − ${offset} offset − ${count - 1}×${gap} margin) / ${count} = ${exact}px — using ${size}px`
      );
    }
    return size;
  };
  const deriveCount = (axis: string, total: number, offset: number, gap: number, size: number): number => {
    const count = Math.floor((total - offset + gap) / (size + gap));
    const used = offset + count * size + Math.max(0, count - 1) * gap;
    if (count >= 1 && used < total) {
      warnings.push(`${total - used}px unused on the ${axis} edge of the sheet`);
    }
    return count;
  };
  if (dimensions) {
    if (w == null && c != null) w = deriveSize("x", dimensions.width, o.x, m.x, c);
    if (h == null && r != null) h = deriveSize("y", dimensions.height, o.y, m.y, r);
    if (c == null && w != null) c = deriveCount("right", dimensions.width, o.x, m.x, w);
    if (r == null && h != null) r = deriveCount("bottom", dimensions.height, o.y, m.y, h);
  }
  if (r == null || c == null || w == null || h == null || ![r, c, w, h].every((v) => Number.isFinite(v) && v >= 1)) {
    return { grid: null, warnings };
  }
  return { grid: { rows: r, columns: c, spriteWidth: w, spriteHeight: h }, warnings };
}

/** Names of every top-level const/let/var declared in `file` (best effort). */
function collectModuleConsts(project: Project, file: string | null | undefined): Set<string> {
  const names = new Set<string>();
  if (!file) return names;
  try {
    const ts = project.ts;
    const editor = createTsEditor(ts);
    const sf = editor.parse(file, fs.readFileSync(file, "utf8"));
    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    }
  } catch {
    // unreadable — duplicate checks happen again in apply
  }
  return names;
}

/** Prompt for (or validate a preset) PascalCase name whose `${name}${suffix}` const is free. */
async function resolveConstName({
  preset,
  message,
  defaultValue,
  suffix,
  taken,
}: {
  preset?: string | null;
  message: string;
  defaultValue?: string;
  suffix: string;
  taken: Set<string>;
}): Promise<string> {
  const validate = (value: string): string | true => {
    const pascal = toPascalCase(value);
    if (!value.trim() || !isValidIdentifier(pascal)) {
      return "use letters/numbers, starting with a letter (e.g. PlayerRun)";
    }
    if (taken.has(`${pascal}${suffix}`)) return `${pascal}${suffix} already exists`;
    return true;
  };
  if (preset) {
    const valid = validate(preset);
    if (valid !== true) throw new GenerateError(`invalid name "${preset}"`, { hint: valid });
    return toPascalCase(preset);
  }
  const name = await input({ message, default: defaultValue, validate });
  return toPascalCase(name);
}

/**
 * Shared frame-builder: name → default duration → coordinate loop (with a
 * kitty preview of each picked sprite) → strategy.
 */
async function animationSubFlow(
  sheetInfo: { grid: SpriteSheetGrid | null; spacing?: SpriteSheetSpacing | null },
  session: KittySession,
  buf: Buffer | null,
  taken: Set<string>,
  presetName: string | null = null
): Promise<AnimationSpec> {
  const c = getChalk();
  const { grid } = sheetInfo;
  const spacing = sheetInfo.spacing ?? { margin: null, originOffset: null };
  const m = spacing.margin ?? { x: 0, y: 0 };
  const o = spacing.originOffset ?? { x: 0, y: 0 };

  const name = await resolveConstName({
    preset: presetName,
    message: "Animation name:",
    suffix: "Animation",
    taken,
  });
  const defaultMs = (await number({ message: "Default frame duration (ms):", default: 100, min: 1 })) ?? 100;

  const parseCoord = (value: string): Vec2 | null => {
    const match = value.trim().match(/^(\d+)\s*[,\s]\s*(\d+)$/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  };
  const frames: FrameCoord[] = [];
  for (;;) {
    const answer = await input({
      message: `Frame ${frames.length + 1} — column,row${frames.length ? " (empty to finish)" : ""}:`,
      validate: (value) => {
        if (!value.trim()) return frames.length ? true : "enter at least one frame, e.g. 0,0";
        const coord = parseCoord(value);
        if (!coord) return "use column,row — e.g. 2,0";
        if (grid && (coord.x >= grid.columns || coord.y >= grid.rows)) {
          return `the sheet is ${grid.columns} columns × ${grid.rows} rows (0-based) — max ${grid.columns - 1},${grid.rows - 1}`;
        }
        return true;
      },
    });
    if (!answer.trim()) break;
    const { x, y } = parseCoord(answer)!;
    if (grid && buf) {
      session.show(buf, {
        sourceRect: {
          x: o.x + x * (grid.spriteWidth + m.x),
          y: o.y + y * (grid.spriteHeight + m.y),
          w: grid.spriteWidth,
          h: grid.spriteHeight,
        },
        maxCols: 16,
        maxRows: 6,
        upscale: true,
      });
    }
    const duration = await number({ message: `Duration for ${x},${y} (ms):`, default: defaultMs, min: 1 });
    frames.push({ x, y, duration: duration ?? defaultMs });
  }

  const strategy = await select({
    message: "Play strategy:",
    choices: ANIMATION_STRATEGIES.map((s) => ({
      name: s.value,
      value: s.value,
      description: c.gray(s.description),
    })),
  });
  return { name, frames, strategy };
}

export async function spritesheetWizard(ctx: WizardContext): Promise<SpriteSheetModel & { kind: "spritesheet"; dimensions: ImageSize | null }> {
  const c = getChalk();
  const { project } = ctx;
  const session = createKittySession();
  try {
    const assetPath = await pickAssetFile(ctx, RESOURCE_TYPES.image.exts, "Sheet image (under public/):");
    const buf = readAsset(project, assetPath);
    const dimensions = buf ? parseImageSize(buf) : null;
    if (!buf) {
      terminal.print(` ${c.yellow("!")} ${assetPath} not found under public/ — no preview or dimension detection`);
    } else if (dimensions) {
      terminal.print(c.gray(` detected ${dimensions.width} × ${dimensions.height} px ${dimensions.format}`));
      session.show(buf, { maxCols: 60, maxRows: 16 });
    } else {
      terminal.print(c.gray(" could not read the image dimensions — enter the full grid explicitly"));
    }

    // Resources entry: reuse an existing key for the same path, or add one.
    let image: SpriteSheetImageModel;
    const existing = [...project.resourceAssetPaths.entries()].find(([, p]) => p === assetPath);
    if (
      existing &&
      (await confirm({ message: `${assetPath} is already Resources.${existing[0]} — reuse it?`, default: true }))
    ) {
      image = { key: existing[0], reuseExisting: true, assetPath, pixelFiltering: false };
    } else {
      const defaultKey = toPascalCase(path.basename(assetPath, path.extname(assetPath)));
      const key = await input({
        message: "Resource key (Resources.<key>):",
        default: isValidIdentifier(defaultKey) ? defaultKey : "",
        validate: (v) =>
          !isValidIdentifier(v)
            ? "use a valid identifier (e.g. HeroSheet)"
            : project.resourceKeys.includes(v)
              ? `Resources.${v} already exists`
              : true,
      });
      const pixelFiltering = await confirm({
        message: "Pixel-art filtering (crisp pixels, no smoothing)?",
        default: detectPixelArt(project),
      });
      image = { key, reuseExisting: false, assetPath, pixelFiltering };
    }

    const takenConsts = collectModuleConsts(project, project.resourcesFile);
    const name = await resolveConstName({
      preset: ctx.name,
      message: "SpriteSheet name:",
      defaultValue: image.key,
      suffix: "SpriteSheet",
      taken: takenConsts,
    });
    takenConsts.add(`${name}SpriteSheet`);

    // Grid geometry.
    const mode: "counts" | "size" | "all" = dimensions
      ? await select<"counts" | "size">({
          message: "Define the grid by:",
          choices: [
            { name: "Rows × columns (sprite size is derived)", value: "counts" },
            { name: "Sprite width × height (counts are derived)", value: "size" },
          ],
        })
      : "all";
    const partial: { columns?: number | null; rows?: number | null; spriteWidth?: number | null; spriteHeight?: number | null } = {};
    if (mode === "counts" || mode === "all") {
      partial.columns = (await number({ message: "Columns:", default: 1, min: 1 })) ?? 1;
      partial.rows = (await number({ message: "Rows:", default: 1, min: 1 })) ?? 1;
    }
    if (mode === "size" || mode === "all") {
      partial.spriteWidth = (await number({ message: "Sprite width (px):", default: 16, min: 1 })) ?? 16;
      partial.spriteHeight = (await number({ message: "Sprite height (px):", default: 16, min: 1 })) ?? 16;
    }
    const spacing = {
      margin: {
        x: (await number({ message: "Margin between sprites — x (px):", default: 0, min: 0 })) ?? 0,
        y: (await number({ message: "Margin between sprites — y (px):", default: 0, min: 0 })) ?? 0,
      },
      originOffset: {
        x: (await number({ message: "Origin offset from the top-left — x (px):", default: 0, min: 0 })) ?? 0,
        y: (await number({ message: "Origin offset from the top-left — y (px):", default: 0, min: 0 })) ?? 0,
      },
    };
    const { grid, warnings } = resolveGrid({
      dimensions,
      ...partial,
      margin: spacing.margin,
      originOffset: spacing.originOffset,
    });
    for (const warning of warnings) terminal.print(` ${c.yellow("!")} ${warning}`);
    if (!grid) {
      throw new GenerateError("could not resolve the sprite grid", {
        hint: "the margins/offset leave no room for sprites — check the numbers against the image size.",
      });
    }
    terminal.print(
      c.gray(` grid: ${grid.columns} × ${grid.rows} sprites of ${grid.spriteWidth} × ${grid.spriteHeight}px`)
    );
    if (warnings.length && !(await confirm({ message: "Continue anyway?", default: true }))) {
      throw new GenerateError("cancelled — nothing was written");
    }

    // Optional animations, straight from this sheet.
    const animations: AnimationSpec[] = [];
    if (await confirm({ message: "Build animations from this sheet now?", default: false })) {
      const sheetInfo = { grid, spacing };
      do {
        const anim = await animationSubFlow(sheetInfo, session, buf, takenConsts);
        animations.push(anim);
        takenConsts.add(`${anim.name}Animation`);
      } while (await confirm({ message: "Add another animation?", default: false }));
    }

    let wire: SpriteSheetModel["wire"] = null;
    if (animations.length) {
      const actor = await pickActor(ctx, "Use an animation in an actor's onInitialize?");
      if (actor) {
        const animationName =
          animations.length === 1
            ? animations[0].name
            : await select({
                message: "Which animation?",
                choices: animations.map((a) => ({ name: `${a.name}Animation`, value: a.name })),
              });
        wire = { animationName, actor: { className: actor.className, file: actor.file } };
      }
    }

    return { kind: "spritesheet", name, image, dimensions, grid, spacing, animations, wire };
  } finally {
    session.dispose();
  }
}

export async function animationWizard(ctx: WizardContext): Promise<AnimationModel & { kind: "animation"; sheet: { name: string; file: string; grid: SpriteSheetGrid | null } }> {
  const c = getChalk();
  const { project } = ctx;
  const sheets = project.spriteSheets;
  if (!sheets.length) {
    throw new GenerateError("no SpriteSheet consts found in the project", {
      hint: "create one first with `ex generate spritesheet`.",
    });
  }
  let sheet: (typeof sheets)[number];
  if (sheets.length === 1) {
    sheet = sheets[0];
    terminal.print(c.gray(` using ${sheet.name} (${path.relative(project.projectDir, sheet.file)})`));
  } else {
    sheet = await select({
      message: "Which spritesheet?",
      choices: sheets.map((s) => ({
        name: s.name,
        value: s,
        description: c.gray(path.relative(project.projectDir, s.file)),
      })),
    });
  }
  if (!sheet.grid) {
    terminal.print(
      ` ${c.yellow("!")} could not read ${sheet.name}'s grid — frame coordinates won't be validated or previewed`
    );
  }
  const buf = sheet.assetPath ? readAsset(project, sheet.assetPath) : null;
  const session = createKittySession();
  try {
    if (buf && sheet.grid) session.show(buf, { maxCols: 60, maxRows: 16 });
    const taken = collectModuleConsts(project, sheet.file);
    const spacing = {
      margin: sheet.spacing?.margin ?? { x: 0, y: 0 },
      originOffset: sheet.spacing?.originOffset ?? { x: 0, y: 0 },
    };
    const anim = await animationSubFlow({ grid: sheet.grid, spacing }, session, buf, taken, ctx.name ?? null);
    const targetActor = await pickActor(ctx, "Use it in an actor's onInitialize?");
    return {
      kind: "animation",
      name: anim.name,
      sheet: { name: sheet.name, file: sheet.file, grid: sheet.grid },
      frames: anim.frames,
      strategy: anim.strategy,
      targetActor: targetActor ? { className: targetActor.className, file: targetActor.file } : null,
    };
  } finally {
    session.dispose();
  }
}
