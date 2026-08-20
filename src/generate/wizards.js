import * as fs from "node:fs";
import * as path from "node:path";
import { checkbox, confirm, input, number, search, select } from "@inquirer/prompts";
import { getChalk } from "../console.js";
import { GenerateError } from "./errors.js";
import { toCamelCase, toKebabCase, toPascalCase, isValidIdentifier } from "./names.js";
import { createTsEditor } from "./ts-edit.js";
import { MATERIAL_TEMPLATES, SCENE_LIFECYCLE_METHODS } from "./emit.js";

export const COLORS = [
  "Red",
  "Orange",
  "Yellow",
  "Green",
  "Blue",
  "Cyan",
  "Magenta",
  "Violet",
  "White",
  "Gray",
  "Black",
  "ExcaliburBlue",
];

export const DISPLAY_MODES = [
  "FitScreenAndFill",
  "FitScreen",
  "FillScreen",
  "Fixed",
  "FitContainer",
  "FillContainer",
  "FitContainerAndFill",
  "FitScreenAndZoom",
  "FitContainerAndZoom",
];

/** Resolve/prompt the generated class name, returning { className, fileName }. */
export async function resolveName(ctx, kindLabel) {
  const validateName = (value) => {
    const pascal = toPascalCase(value);
    if (!value.trim() || !isValidIdentifier(pascal)) {
      return "use letters/numbers, starting with a letter (e.g. BigBoss)";
    }
    const file = path.join(ctx.project.srcDir, `${toKebabCase(value)}.ts`);
    if (!ctx.force && fs.existsSync(file)) {
      return `src/${toKebabCase(value)}.ts already exists (use --force to overwrite)`;
    }
    return true;
  };
  let name = ctx.name;
  if (name) {
    const valid = validateName(name);
    if (valid !== true) throw new GenerateError(`invalid ${kindLabel} name "${name}"`, { hint: valid });
  } else {
    name = await input({ message: `${kindLabel} name:`, validate: validateName });
  }
  return { className: toPascalCase(name), fileName: `${toKebabCase(name)}.ts` };
}

/** Pick a target scene (or null). Honors --scene. */
export async function pickScene(ctx, message) {
  const c = getChalk();
  const { scenes } = ctx.project;
  if (ctx.sceneArg) {
    const want = ctx.sceneArg.toLowerCase();
    const match = scenes.find(
      (s) =>
        s.className.toLowerCase() === want ||
        s.key?.toLowerCase() === want ||
        path.basename(s.file, ".ts").toLowerCase() === want
    );
    if (!match) {
      throw new GenerateError(`no scene matching "${ctx.sceneArg}" found`, {
        hint: scenes.length
          ? `available scenes: ${scenes.map((s) => s.className).join(", ")}`
          : "no Scene subclasses found in src/ — try `ex generate scene` first.",
      });
    }
    return match;
  }
  if (!scenes.length) return null;
  return select({
    message,
    choices: [
      ...scenes.map((s) => ({
        name: s.className,
        value: s,
        description: c.gray(path.relative(ctx.project.projectDir, s.file)),
      })),
      { name: "Skip (wire it up later)", value: null },
    ],
  });
}

/** Pick a target actor (or null). Honors --actor. */
export async function pickActor(ctx, message) {
  const c = getChalk();
  const { actors } = ctx.project;
  if (ctx.actorArg) {
    const want = ctx.actorArg.toLowerCase();
    const match = actors.find(
      (a) =>
        a.className.toLowerCase() === want ||
        path.basename(a.file, ".ts").toLowerCase() === want
    );
    if (!match) {
      throw new GenerateError(`no actor matching "${ctx.actorArg}" found`, {
        hint: actors.length
          ? `available actors: ${actors.map((a) => a.className).join(", ")}`
          : "no Actor subclasses found in src/ — try `ex generate actor` first.",
      });
    }
    return match;
  }
  if (!actors.length) return null;
  return select({
    message,
    choices: [
      ...actors.map((a) => ({
        name: a.className,
        value: a,
        description: c.gray(path.relative(ctx.project.projectDir, a.file)),
      })),
      { name: "Skip (assign it later)", value: null },
    ],
  });
}

export async function actorWizard(ctx) {
  const { className, fileName } = await resolveName(ctx, "Actor");

  const geometry = await select({
    message: "Collision geometry:",
    choices: [
      { name: "Box (width × height)", value: "box" },
      { name: "Circle (radius)", value: "circle" },
      { name: "Custom collider (stub)", value: "custom" },
      { name: "None", value: "none" },
    ],
  });
  let collider = { type: geometry };
  if (geometry === "box") {
    collider.width = await number({ message: "Width (px):", default: 100 });
    collider.height = await number({ message: "Height (px):", default: 100 });
  } else if (geometry === "circle") {
    collider.radius = await number({ message: "Radius (px):", default: 50 });
  }

  const graphicChoices = [];
  if (geometry === "box" || geometry === "circle") {
    graphicChoices.push({ name: `Colored ${geometry} (matches geometry)`, value: "color" });
  }
  if (ctx.project.resourceKeys.length) {
    graphicChoices.push({
      name: `Sprite from Resources (${ctx.project.resourceKeys.length} available)`,
      value: "sprite",
    });
  }
  graphicChoices.push({ name: "None (add graphics later)", value: "none" });
  const graphicType = graphicChoices.length === 1 ? "none" : await select({ message: "Default graphic:", choices: graphicChoices });
  let graphic = { type: graphicType };
  if (graphicType === "color") {
    graphic.color = await select({
      message: "Color:",
      choices: COLORS.map((name) => ({ name, value: name })),
    });
  } else if (graphicType === "sprite") {
    graphic.resourceKey = await select({
      message: "Resource:",
      choices: ctx.project.resourceKeys.map((k) => ({ name: k, value: k })),
    });
  }

  const collisionType = await select({
    message: "Collision type:",
    choices: [
      { name: "Active (moves and collides — most gameplay actors)", value: "Active" },
      { name: "Passive (raises events only — the Excalibur default)", value: "Passive" },
      { name: "Fixed (immovable, e.g. walls and platforms)", value: "Fixed" },
      { name: "PreventCollision (no collisions at all)", value: "PreventCollision" },
    ],
  });

  const advanced = {};
  if (await confirm({ message: "More options? (position, z, anchor, coordinate plane…)", default: false })) {
    const picks = await checkbox({
      message: "Configure:",
      choices: [
        { name: "position (pos)", value: "pos" },
        { name: "z index", value: "z" },
        { name: "anchor", value: "anchor" },
        { name: "coordinate plane", value: "coordPlane" },
        { name: "rotation", value: "rotation" },
        { name: "collision group", value: "collisionGroup" },
      ],
    });
    if (picks.includes("pos")) {
      advanced.pos = {
        x: await number({ message: "x:", default: 0 }),
        y: await number({ message: "y:", default: 0 }),
      };
    }
    if (picks.includes("z")) advanced.z = await number({ message: "z index:", default: 0 });
    if (picks.includes("anchor")) {
      advanced.anchor = await select({
        message: "Anchor:",
        choices: [
          { name: "Center (0.5, 0.5) — the default", value: "center" },
          { name: "Top-left (0, 0)", value: "topLeft" },
        ],
      });
    }
    if (picks.includes("coordPlane")) {
      advanced.coordPlane = await select({
        message: "Coordinate plane:",
        choices: [
          { name: "World (moves with the camera — the default)", value: "World" },
          { name: "Screen (fixed to the viewport, e.g. UI)", value: "Screen" },
        ],
      });
    }
    if (picks.includes("rotation")) advanced.rotation = await number({ message: "Rotation (radians):", default: 0 });
    if (picks.includes("collisionGroup")) {
      advanced.collisionGroupName = await input({
        message: "Collision group name:",
        default: toCamelCase(className),
        validate: (v) => (v.trim() ? true : "enter a group name"),
      });
    }
  }

  const targetScene = await pickScene(ctx, "Add it to a scene's onInitialize?");
  return { kind: "actor", className, fileName, collider, graphic, collisionType, advanced, targetScene };
}

export async function labelWizard(ctx) {
  const { className, fileName } = await resolveName(ctx, "Label");
  const text = await input({ message: "Text:", default: className });
  let font = null;
  if (await confirm({ message: "Customize the font?", default: false })) {
    font = {
      family: await input({ message: "Font family:", default: "sans-serif" }),
      size: await number({ message: "Size (px):", default: 24 }),
      bold: await confirm({ message: "Bold?", default: false }),
      color: await select({ message: "Color:", choices: COLORS.map((n) => ({ name: n, value: n })) }),
    };
  }
  let pos = null;
  if (await confirm({ message: "Set a position?", default: true })) {
    pos = {
      x: await number({ message: "x:", default: 10 }),
      y: await number({ message: "y:", default: 10 }),
    };
  }
  const targetScene = await pickScene(ctx, "Add it to a scene's onInitialize?");
  return { kind: "label", className, fileName, text, font, pos, targetScene };
}

export async function sceneWizard(ctx) {
  const { className, fileName } = await resolveName(ctx, "Scene");
  const lifecycle = await checkbox({
    message: "Lifecycle methods to stub:",
    choices: SCENE_LIFECYCLE_METHODS.map((m) => ({ name: m, value: m, checked: m === "onInitialize" })),
  });
  let register = false;
  let key = toCamelCase(className);
  if (ctx.project.mainFile) {
    register = await confirm({ message: `Register it in the engine's scenes map as "${key}"?`, default: true });
    if (register) {
      const taken = new Set(ctx.project.scenes.map((s) => s.key).filter(Boolean));
      if (taken.has(key)) {
        key = await input({
          message: `Key "${key}" is taken — scene key:`,
          validate: (v) => (isValidIdentifier(v) && !taken.has(v) ? true : "pick an unused identifier"),
        });
      }
    }
  }
  return { kind: "scene", className, fileName, lifecycle, register, key };
}

export const RESOURCE_TYPES = {
  image: { label: "Image", class: "ImageSource", exts: [".png", ".jpg", ".jpeg", ".webp", ".svg", ".bmp", ".gif"] },
  sound: { label: "Sound", class: "Sound", exts: [".mp3", ".wav", ".ogg", ".m4a", ".flac"] },
  font: { label: "Font", class: "FontSource", exts: [".ttf", ".otf", ".woff", ".woff2"] },
  other: { label: "Other file", class: "Resource", exts: null },
};

function scanFiles(root, exts, cap = 2000, depth = 8) {
  const out = [];
  const walk = (dir, d) => {
    if (out.length >= cap || d > depth || !fs.existsSync(dir)) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, d + 1);
      else if (!exts || exts.includes(path.extname(e.name).toLowerCase())) out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

export async function resourceWizard(ctx) {
  const c = getChalk();
  const type = await select({
    message: "Resource type:",
    choices: Object.entries(RESOURCE_TYPES).map(([value, t]) => ({ name: t.label, value })),
  });
  const spec = RESOURCE_TYPES[type];

  const files = scanFiles(ctx.project.publicDir, spec.exts);
  const MANUAL = Symbol("manual");
  const toChoice = (f) => {
    const relPath = path.relative(ctx.project.publicDir, f).split(path.sep).join("/");
    return { name: relPath, value: `./${relPath}` };
  };
  let assetPath = await search({
    message: `File (under public/):`,
    source: async (term) => {
      const lower = (term ?? "").toLowerCase();
      const matches = files.filter((f) => f.toLowerCase().includes(lower)).slice(0, 20).map(toChoice);
      if (!matches.length && !files.length) {
        matches.push({
          name: c.gray("(no matching files under public/ — drop assets there, or enter a path)"),
          value: MANUAL,
          disabled: true,
        });
      }
      matches.push({ name: c.gray("Enter a path manually…"), value: MANUAL });
      return matches;
    },
  });
  if (assetPath === MANUAL) {
    assetPath = await input({
      message: `Path (as served, e.g. ./images/hero.png):`,
      validate: (v) => (v.trim() ? true : "enter a path"),
    });
  }

  const defaultKey = toPascalCase(path.basename(assetPath, path.extname(assetPath)));
  const key = await input({
    message: "Resource key (Resources.<key>):",
    default: isValidIdentifier(defaultKey) ? defaultKey : "",
    validate: (v) =>
      !isValidIdentifier(v)
        ? "use a valid identifier (e.g. HeroSprite)"
        : ctx.project.resourceKeys.includes(v)
          ? `Resources.${v} already exists`
          : true,
  });

  const model = { kind: "resource", key, resourceClass: spec.class, assetPath };
  if (type === "image") {
    model.pixelFiltering = await confirm({
      message: "Pixel-art filtering (crisp pixels, no smoothing)?",
      default: detectPixelArt(ctx.project),
    });
  } else if (type === "font") {
    model.family = await input({ message: "Font family name:", default: key });
  } else if (type === "other") {
    model.responseType = await select({
      message: "Response type:",
      choices: ["json", "text", "arraybuffer", "blob", "document"].map((v) => ({ name: v, value: v })),
    });
  }

  const targets = [{ name: "Root loader (resources.ts — loads at boot)", value: { root: true } }];
  for (const s of ctx.project.scenes) {
    targets.push({ name: `${s.className} (loads in onPreLoad)`, value: { scene: s } });
  }
  model.target =
    targets.length === 1 ? { root: true } : await select({ message: "Load it where?", choices: targets });
  return model;
}

export async function materialWizard(ctx) {
  const c = getChalk();
  const { className, fileName } = await resolveName(ctx, "Material");
  const template = await select({
    message: "Shader template:",
    choices: Object.entries(MATERIAL_TEMPLATES).map(([value, t]) => ({
      name: t.label,
      value,
      description: c.gray(t.description),
    })),
  });
  const targetActor = await pickActor(ctx, "Assign it to an actor's graphics?");
  return {
    kind: "material",
    className,
    fileName,
    template,
    pixelArt: detectPixelArt(ctx.project),
    targetActor,
  };
}

export async function updateActorWizard(ctx) {
  const { project } = ctx;
  const actor = await pickActor(
    { ...ctx, actorArg: ctx.actorArg ?? ctx.name },
    "Which actor do you want to update?"
  );
  if (!actor) {
    throw new GenerateError("no Actor subclasses found in src/", {
      hint: "generate one first with `ex generate actor`.",
    });
  }

  // Current option values (best effort) so the checkbox can show them.
  let current = new Map();
  try {
    const editor = createTsEditor(project.ts);
    const text = fs.readFileSync(actor.file, "utf8");
    const sf = editor.parse(actor.file, text);
    const lit = editor.actorSuperOptionsLiteral(sf, actor.className);
    for (const prop of lit.properties) {
      const name = editor.propertyName(prop);
      if (name && prop.initializer) current.set(name, text.slice(prop.initializer.getStart(sf), prop.initializer.end));
    }
  } catch {
    // options not a literal — apply will surface the manual fallback
  }

  const label = (name) => (current.has(name) ? `${name} (currently ${current.get(name)})` : `${name} (not set)`);
  const picks = await checkbox({
    message: `Which of ${actor.className}'s options do you want to change?`,
    choices: [
      { name: label("pos"), value: "pos" },
      { name: `${label("width")} / ${label("height")}`, value: "size" },
      { name: label("radius"), value: "radius" },
      { name: label("color"), value: "color" },
      { name: label("collisionType"), value: "collisionType" },
      { name: label("anchor"), value: "anchor" },
      { name: label("coordPlane"), value: "coordPlane" },
      { name: label("rotation"), value: "rotation" },
      { name: label("z"), value: "z" },
      { name: label("name"), value: "name" },
    ],
  });

  const options = {};
  const remove = [];
  if (picks.includes("pos")) {
    options.pos = {
      x: await number({ message: "x:", default: 0 }),
      y: await number({ message: "y:", default: 0 }),
    };
  }
  if (picks.includes("size")) {
    options.width = await number({ message: "width:", default: 100 });
    options.height = await number({ message: "height:", default: 100 });
    if (current.has("radius")) remove.push("radius");
  }
  if (picks.includes("radius")) {
    options.radius = await number({ message: "radius:", default: 50 });
    for (const name of ["width", "height"]) if (current.has(name)) remove.push(name);
  }
  if (picks.includes("color")) {
    options.color = await select({ message: "color:", choices: COLORS.map((n) => ({ name: n, value: n })) });
  }
  if (picks.includes("collisionType")) {
    options.collisionType = await select({
      message: "collisionType:",
      choices: ["Active", "Passive", "Fixed", "PreventCollision"].map((v) => ({ name: v, value: v })),
    });
  }
  if (picks.includes("anchor")) {
    options.anchor = await select({
      message: "anchor:",
      choices: [
        { name: "Center (0.5, 0.5) — the default", value: "center" },
        { name: "Top-left (0, 0)", value: "topLeft" },
      ],
    });
  }
  if (picks.includes("coordPlane")) {
    options.coordPlane = await select({
      message: "coordPlane:",
      choices: [
        { name: "World (moves with the camera — the default)", value: "World" },
        { name: "Screen (fixed to the viewport, e.g. UI)", value: "Screen" },
      ],
    });
  }
  if (picks.includes("rotation")) options.rotation = await number({ message: "rotation (radians):", default: 0 });
  if (picks.includes("z")) options.z = await number({ message: "z index:", default: 0 });
  if (picks.includes("name")) {
    options.name = await input({ message: "name:", default: current.has("name") ? undefined : actor.className });
  }

  return { kind: "update-actor", actor, options, remove };
}

export function detectPixelArt(project) {
  try {
    return /pixelArt:\s*true/.test(fs.readFileSync(project.mainFile, "utf8"));
  } catch {
    return false;
  }
}

export async function engineWizard(ctx) {
  const { project } = ctx;
  const options = {};
  const remove = [];

  let current = new Map();
  if (project.mainFile) {
    const editor = createTsEditor(project.ts);
    const text = fs.readFileSync(project.mainFile, "utf8");
    const sf = editor.parse(project.mainFile, text);
    const engine = editor.findEngineNews(sf)[0];
    try {
      const lit = editor.engineOptionsLiteral(sf, engine);
      for (const prop of lit.properties) {
        const name = editor.propertyName(prop);
        if (name && prop.initializer) current.set(name, text.slice(prop.initializer.getStart(sf), prop.initializer.end));
      }
    } catch {
      // options not a literal — apply will surface the manual fallback
    }
  }

  const label = (name) => (current.has(name) ? `${name} (currently ${current.get(name)})` : `${name} (not set)`);
  const fixedTimestepPresent = current.has("fixedUpdateTimestep");
  const picks = await checkbox({
    message: project.mainFile ? "Which engine options do you want to change or add?" : "Which engine options do you want to set?",
    choices: [
      { name: label("width") + " / " + label("height"), value: "size" },
      { name: label("displayMode"), value: "displayMode" },
      { name: label("backgroundColor"), value: "backgroundColor" },
      { name: label("pixelArt"), value: "pixelArt" },
      { name: label("antialiasing"), value: "antialiasing" },
      { name: label("suppressPlayButton"), value: "suppressPlayButton" },
      ...(fixedTimestepPresent ? [] : [{ name: label("fixedUpdateFps"), value: "fixedUpdateFps" }]),
      { name: label("physics"), value: "physics" },
    ],
  });

  if (picks.includes("size")) {
    options.width = await number({ message: "width:", default: 800 });
    options.height = await number({ message: "height:", default: 600 });
    for (const name of ["viewport", "resolution"]) if (current.has(name)) remove.push(name);
  }
  if (picks.includes("displayMode")) {
    options.displayMode = await select({
      message: "displayMode:",
      choices: DISPLAY_MODES.map((m) => ({ name: m, value: m })),
    });
  }
  if (picks.includes("backgroundColor")) {
    options.backgroundColor = await select({
      message: "backgroundColor:",
      choices: COLORS.map((n) => ({ name: n, value: n })),
    });
  }
  if (picks.includes("pixelArt")) options.pixelArt = await confirm({ message: "pixelArt?", default: true });
  if (picks.includes("antialiasing")) options.antialiasing = await confirm({ message: "antialiasing?", default: true });
  if (picks.includes("suppressPlayButton")) {
    options.suppressPlayButton = await confirm({ message: "suppressPlayButton?", default: false });
  }
  if (picks.includes("fixedUpdateFps")) options.fixedUpdateFps = await number({ message: "fixedUpdateFps:", default: 60 });
  if (picks.includes("physics")) {
    const physics = {};
    physics.solver = await select({
      message: "physics solver:",
      choices: [
        { name: "Arcade (fast, axis-aligned — the default)", value: "Arcade" },
        { name: "Realistic (rotation + friction)", value: "Realistic" },
      ],
    });
    if (await confirm({ message: "Set gravity?", default: false })) {
      physics.gravity = {
        x: await number({ message: "gravity x:", default: 0 }),
        y: await number({ message: "gravity y:", default: 800 }),
      };
    }
    options.physics = physics;
  }

  const model = { kind: "engine", options, remove };
  if (!project.mainFile && project.scenes.length) {
    const chosen = await checkbox({
      message: "Register these scenes in the new engine:",
      choices: project.scenes.map((s) => ({ name: s.className, value: s, checked: true })),
    });
    model.scenes = chosen.map((s) => ({ className: s.className, file: s.file, key: toCamelCase(s.className) }));
  }
  return model;
}
