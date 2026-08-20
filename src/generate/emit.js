/**
 * Pure string builders for generated TypeScript files.
 * Conventions match excaliburjs/template-ts-vite: named exports, named imports
 * from bare "excalibur", extensionless relative imports, `override` + explicit
 * types on lifecycle stubs, 2-space indent.
 */

function excaliburImportLine(names) {
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  return `import { ${sorted.join(", ")} } from "excalibur";`;
}

/** Actor / Label constructor option entries + the excalibur imports they need. */
function actorOptionEntries(model, imports) {
  const entries = [`name: "${model.className}"`];
  const adv = model.advanced ?? {};
  if (adv.pos) {
    imports.add("vec");
    entries.push(`pos: vec(${adv.pos.x}, ${adv.pos.y})`);
  }
  const col = model.collider ?? { type: "none" };
  if (col.type === "box") {
    entries.push(`width: ${col.width}`, `height: ${col.height}`);
  } else if (col.type === "circle") {
    entries.push(`radius: ${col.radius}`);
  } else if (col.type === "custom") {
    entries.push(`// collider: Shape.Box(100, 100), // TODO: provide a custom collider`);
  }
  if (model.graphic?.type === "color" && (col.type === "box" || col.type === "circle")) {
    imports.add("Color");
    entries.push(`color: Color.${model.graphic.color}`);
  }
  if (model.collisionType && model.collisionType !== "Passive") {
    imports.add("CollisionType");
    entries.push(`collisionType: CollisionType.${model.collisionType}`);
  }
  if (adv.coordPlane === "Screen") {
    imports.add("CoordPlane");
    entries.push(`coordPlane: CoordPlane.Screen`);
  }
  if (adv.anchor === "topLeft") {
    imports.add("vec");
    entries.push(`anchor: vec(0, 0)`);
  }
  if (adv.z !== undefined && adv.z !== null) entries.push(`z: ${adv.z}`);
  if (adv.rotation) entries.push(`rotation: ${adv.rotation}`);
  if (adv.collisionGroupName) {
    imports.add("CollisionGroupManager");
    entries.push(`collisionGroup: group`);
  }
  return entries;
}

export function emitActorFile(model, { resourcesSpecifier = "./resources" } = {}) {
  const imports = new Set(["Actor", "Engine"]);
  const entries = actorOptionEntries(model, imports);
  const lines = [];
  const initBody = [];
  if (model.graphic?.type === "sprite") {
    initBody.push(`this.graphics.use(Resources.${model.graphic.resourceKey}.toSprite());`);
  }
  lines.push(excaliburImportLine(imports));
  if (model.graphic?.type === "sprite") {
    lines.push(`import { Resources } from "${resourcesSpecifier}";`);
  }
  lines.push("");
  if (model.advanced?.collisionGroupName) {
    lines.push(`const group = CollisionGroupManager.create("${model.advanced.collisionGroupName}");`, "");
  }
  lines.push(`export class ${model.className} extends Actor {`);
  lines.push(`  constructor() {`);
  lines.push(`    super({`);
  for (const e of entries) lines.push(e.startsWith("//") ? `      ${e}` : `      ${e},`);
  lines.push(`    });`);
  lines.push(`  }`);
  lines.push("");
  if (initBody.length) {
    lines.push(`  override onInitialize(engine: Engine): void {`);
    for (const s of initBody) lines.push(`    ${s}`);
    lines.push(`  }`);
  } else {
    lines.push(`  override onInitialize(engine: Engine): void {`);
    lines.push(`    // Recommended place to set up your actor (runs before the first update)`);
    lines.push(`  }`);
  }
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

export function emitLabelFile(model) {
  const imports = new Set(["Label"]);
  const entries = [`text: ${JSON.stringify(model.text ?? model.className)}`];
  if (model.pos) {
    imports.add("vec");
    entries.push(`pos: vec(${model.pos.x}, ${model.pos.y})`);
  }
  if (model.font) {
    imports.add("Font");
    const f = model.font;
    const fontEntries = [];
    if (f.family) fontEntries.push(`family: ${JSON.stringify(f.family)}`);
    if (f.size) {
      fontEntries.push(`size: ${f.size}`);
      if (f.unit && f.unit !== "Px") {
        imports.add("FontUnit");
        fontEntries.push(`unit: FontUnit.${f.unit}`);
      }
    }
    if (f.bold) fontEntries.push(`bold: true`);
    if (f.color) {
      imports.add("Color");
      fontEntries.push(`color: Color.${f.color}`);
    }
    entries.push(`font: new Font({ ${fontEntries.join(", ")} })`);
  }
  const lines = [excaliburImportLine(imports), ""];
  lines.push(`export class ${model.className} extends Label {`);
  lines.push(`  constructor() {`);
  lines.push(`    super({`);
  for (const e of entries) lines.push(`      ${e},`);
  lines.push(`    });`);
  lines.push(`  }`);
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

const SCENE_LIFECYCLE = {
  onInitialize: {
    signature: "override onInitialize(engine: Engine): void",
    imports: ["Engine"],
    comment: "// Recommended place to compose your scene (add actors with this.add)",
  },
  onPreLoad: {
    signature: "override onPreLoad(loader: DefaultLoader): void",
    imports: ["DefaultLoader"],
    comment: "// Add any scene specific resources to load",
  },
  onActivate: {
    signature: "override onActivate(context: SceneActivationContext): void",
    imports: ["SceneActivationContext"],
    comment: "// Called when Excalibur transitions to this scene",
  },
  onDeactivate: {
    signature: "override onDeactivate(context: SceneActivationContext): void",
    imports: ["SceneActivationContext"],
    comment: "// Called when Excalibur transitions away from this scene",
  },
  onPreUpdate: {
    signature: "override onPreUpdate(engine: Engine, elapsed: number): void",
    imports: ["Engine"],
    comment: "// Called before anything updates in the scene",
  },
  onPostUpdate: {
    signature: "override onPostUpdate(engine: Engine, elapsed: number): void",
    imports: ["Engine"],
    comment: "// Called after everything updates in the scene",
  },
};

export const SCENE_LIFECYCLE_METHODS = Object.keys(SCENE_LIFECYCLE);

export function emitSceneFile(model) {
  const lifecycle = model.lifecycle?.length ? model.lifecycle : ["onInitialize"];
  const imports = new Set(["Scene"]);
  for (const m of lifecycle) {
    for (const i of SCENE_LIFECYCLE[m]?.imports ?? []) imports.add(i);
  }
  const lines = [excaliburImportLine(imports), ""];
  lines.push(`export class ${model.className} extends Scene {`);
  lifecycle.forEach((m, idx) => {
    const spec = SCENE_LIFECYCLE[m];
    if (!spec) return;
    if (idx > 0) lines.push("");
    lines.push(`  ${spec.signature} {`);
    lines.push(`    ${spec.comment}`);
    lines.push(`  }`);
  });
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

export function emitResourcesFile() {
  return [
    `import { Loader } from "excalibur";`,
    "",
    `// It is convenient to put your resources in one place`,
    `export const Resources = {} as const;`,
    "",
    `// We build a loader and add all of our resources to the boot loader`,
    `export const loader = new Loader();`,
    `for (const res of Object.values(Resources)) {`,
    `  loader.addResource(res);`,
    `}`,
    "",
  ].join("\n");
}

/**
 * The expression for one Resources entry.
 * @returns {{ expr: string, excaliburImports: string[] }}
 */
export function emitResourceExpr(model) {
  const p = JSON.stringify(model.assetPath);
  switch (model.resourceClass) {
    case "ImageSource":
      return model.pixelFiltering
        ? {
            expr: `new ImageSource(${p}, { filtering: ImageFiltering.Pixel })`,
            excaliburImports: ["ImageSource", "ImageFiltering"],
          }
        : { expr: `new ImageSource(${p})`, excaliburImports: ["ImageSource"] };
    case "Sound":
      return { expr: `new Sound(${p})`, excaliburImports: ["Sound"] };
    case "FontSource":
      return {
        expr: `new FontSource(${p}, ${JSON.stringify(model.family ?? "MyFont")})`,
        excaliburImports: ["FontSource"],
      };
    default:
      return {
        expr: `new Resource(${p}, ${JSON.stringify(model.responseType ?? "text")})`,
        excaliburImports: ["Resource"],
      };
  }
}

/** Engine option entries (only options that were set) + needed imports. */
export function engineOptionEntries(options, imports = new Set()) {
  const entries = [];
  const o = options ?? {};
  if (o.width != null) entries.push({ name: "width", expr: String(o.width) });
  if (o.height != null) entries.push({ name: "height", expr: String(o.height) });
  if (o.displayMode) {
    imports.add("DisplayMode");
    entries.push({ name: "displayMode", expr: `DisplayMode.${o.displayMode}` });
  }
  if (o.backgroundColor) {
    imports.add("Color");
    entries.push({ name: "backgroundColor", expr: `Color.${o.backgroundColor}` });
  }
  if (o.pixelArt != null) entries.push({ name: "pixelArt", expr: String(o.pixelArt) });
  if (o.antialiasing != null) entries.push({ name: "antialiasing", expr: String(o.antialiasing) });
  if (o.suppressPlayButton) entries.push({ name: "suppressPlayButton", expr: "true" });
  if (o.fixedUpdateFps != null) entries.push({ name: "fixedUpdateFps", expr: String(o.fixedUpdateFps) });
  if (o.physics) {
    const parts = [];
    if (o.physics.solver) {
      imports.add("SolverStrategy");
      parts.push(`solver: SolverStrategy.${o.physics.solver}`);
    }
    if (o.physics.gravity) {
      imports.add("vec");
      parts.push(`gravity: vec(${o.physics.gravity.x}, ${o.physics.gravity.y})`);
    }
    if (o.physics.substep != null) parts.push(`substep: ${o.physics.substep}`);
    if (parts.length) entries.push({ name: "physics", expr: `{ ${parts.join(", ")} }` });
  }
  return { entries, imports };
}

/**
 * A fresh template-conform main.ts.
 * @param {object} model { options, scenes: [{key, className, specifier}] }
 * @param {object} ctx { hasResources: boolean }
 */
export function emitMainFile(model, { hasResources = false } = {}) {
  const imports = new Set(["Engine"]);
  const { entries } = engineOptionEntries(model.options, imports);
  const lines = [];
  const scenes = model.scenes ?? [];
  lines.push(excaliburImportLine(imports));
  if (hasResources) lines.push(`import { loader } from "./resources";`);
  for (const s of scenes) lines.push(`import { ${s.className} } from "${s.specifier}";`);
  lines.push("");
  lines.push(`const game = new Engine({`);
  for (const e of entries) lines.push(`  ${e.name}: ${e.expr},`);
  if (scenes.length) {
    lines.push(`  scenes: {`);
    for (const s of scenes) lines.push(`    ${s.key}: ${s.className},`);
    lines.push(`  },`);
  }
  lines.push(`});`);
  lines.push("");
  if (scenes.length) {
    lines.push(
      hasResources
        ? `game.start("${scenes[0].key}", { loader });`
        : `game.start("${scenes[0].key}");`
    );
  } else {
    lines.push(hasResources ? `game.start(loader);` : `game.start();`);
  }
  return lines.join("\n") + "\n";
}
