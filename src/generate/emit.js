/**
 * Pure string builders for generated TypeScript files.
 * Conventions match excaliburjs/template-ts-vite: named exports, named imports
 * from bare "excalibur", extensionless relative imports, `override` + explicit
 * types on lifecycle stubs, 2-space indent.
 */

import { toCamelCase, toKebabCase } from "./names.js";

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

/**
 * `export const <Name>SpriteSheet = SpriteSheet.fromImageSource({ ... });`
 * appended after the Resources literal. Zero margins/offsets omit the
 * spacing option (or the all-zero half of it).
 * @param {object} model { name, image: {key}, grid, spacing }
 * @returns {{ text: string, excaliburImports: string[] }}
 */
export function emitSpriteSheetConst(model) {
  const g = model.grid;
  const lines = [];
  lines.push(`export const ${model.name}SpriteSheet = SpriteSheet.fromImageSource({`);
  lines.push(`  image: Resources.${model.image.key},`);
  lines.push(`  grid: { rows: ${g.rows}, columns: ${g.columns}, spriteWidth: ${g.spriteWidth}, spriteHeight: ${g.spriteHeight} },`);
  const sp = model.spacing ?? {};
  const origin = sp.originOffset && (sp.originOffset.x || sp.originOffset.y) ? sp.originOffset : null;
  const margin = sp.margin && (sp.margin.x || sp.margin.y) ? sp.margin : null;
  if (origin || margin) {
    const parts = [];
    if (origin) parts.push(`originOffset: { x: ${origin.x}, y: ${origin.y} }`);
    if (margin) parts.push(`margin: { x: ${margin.x}, y: ${margin.y} }`);
    lines.push(`  spacing: { ${parts.join(", ")} },`);
  }
  lines.push(`});`);
  return { text: lines.join("\n"), excaliburImports: ["SpriteSheet"] };
}

/**
 * `export const <Name>Animation = Animation.fromSpriteSheetCoordinates({ ... });`
 * @param {object} model { name, sheetName, frames: [{x, y, duration}], strategy }
 * @returns {{ text: string, excaliburImports: string[] }}
 */
export function emitAnimationConst(model) {
  const lines = [];
  lines.push(`export const ${model.name}Animation = Animation.fromSpriteSheetCoordinates({`);
  lines.push(`  spriteSheet: ${model.sheetName},`);
  lines.push(`  frameCoordinates: [`);
  for (const f of model.frames) lines.push(`    { x: ${f.x}, y: ${f.y}, duration: ${f.duration} },`);
  lines.push(`  ],`);
  lines.push(`  strategy: AnimationStrategy.${model.strategy},`);
  lines.push(`});`);
  return { text: lines.join("\n"), excaliburImports: ["Animation", "AnimationStrategy"] };
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
 * ActorArgs entries (only options that were set) + needed imports.
 * Used by `update-actor` to edit an existing class's super({ ... }) options.
 */
export function actorArgEntries(options, imports = new Set()) {
  const entries = [];
  const o = options ?? {};
  if (o.name != null) entries.push({ name: "name", expr: JSON.stringify(o.name) });
  if (o.pos) {
    imports.add("vec");
    entries.push({ name: "pos", expr: `vec(${o.pos.x}, ${o.pos.y})` });
  }
  if (o.width != null) entries.push({ name: "width", expr: String(o.width) });
  if (o.height != null) entries.push({ name: "height", expr: String(o.height) });
  if (o.radius != null) entries.push({ name: "radius", expr: String(o.radius) });
  if (o.color) {
    imports.add("Color");
    entries.push({ name: "color", expr: `Color.${o.color}` });
  }
  if (o.collisionType) {
    imports.add("CollisionType");
    entries.push({ name: "collisionType", expr: `CollisionType.${o.collisionType}` });
  }
  if (o.anchor) {
    imports.add("vec");
    entries.push({ name: "anchor", expr: o.anchor === "topLeft" ? "vec(0, 0)" : "vec(0.5, 0.5)" });
  }
  if (o.coordPlane) {
    imports.add("CoordPlane");
    entries.push({ name: "coordPlane", expr: `CoordPlane.${o.coordPlane}` });
  }
  if (o.rotation != null) entries.push({ name: "rotation", expr: String(o.rotation) });
  if (o.z != null) entries.push({ name: "z", expr: String(o.z) });
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

/* ---------------------------------------------------------------- materials

GLSL templates target released Excalibur (<= 0.32): raw `#version 300 es`
shaders (the `ex.glsl` tagged-template helper is unreleased 0.33+). The
`#version` directive must be the very first characters of the source.
Bodies must stay free of backticks and `${` — they are emitted inside a
TypeScript template literal. */

const GLSL_PIXEL_ART_SAMPLER = `// Inigo Quilez pixel art filter https://jorenjoestar.github.io/post/pixel_art_filtering/
vec2 uv_iq(in vec2 uv, in vec2 texture_size) {
  vec2 pixel = uv * texture_size;
  vec2 seam = floor(pixel + 0.5);
  vec2 dudv = fwidth(pixel);
  pixel = seam + clamp((pixel - seam) / dudv, -0.5, 0.5);
  return pixel / texture_size;
}`;

/** Custom materials bypass the engine's pixel-art sampler, so re-include it. */
function graphicUvPrelude(pixelArt) {
  if (pixelArt) {
    return {
      uniforms: "uniform vec2 u_graphic_resolution;\n",
      helpers: `\n${GLSL_PIXEL_ART_SAMPLER}\n`,
      uv: "vec2 uv = uv_iq(v_uv, u_graphic_resolution);",
    };
  }
  return { uniforms: "", helpers: "", uv: "vec2 uv = v_uv;" };
}

function tintGlsl(pixelArt) {
  const p = graphicUvPrelude(pixelArt);
  return `#version 300 es
precision mediump float;

uniform sampler2D u_graphic;
uniform vec4 u_color;
${p.uniforms}
in vec2 v_uv;
out vec4 fragColor;
${p.helpers}
void main() {
  ${p.uv}
  vec4 color = texture(u_graphic, uv);
  // color is premultiplied-alpha — scaling rgb by the tint keeps it premultiplied
  fragColor = vec4(color.rgb * u_color.rgb, color.a);
}`;
}

function outlineGlsl(pixelArt) {
  const p = graphicUvPrelude(pixelArt);
  return `#version 300 es
precision mediump float;

uniform float u_time_ms;
uniform sampler2D u_graphic;
${p.uniforms}
in vec2 v_uv;
out vec4 fragColor;

vec3 hsv2rgb(vec3 c) {
  vec4 k = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  return c.z * mix(k.xxx, clamp(abs(fract(c.x + k.xyz) * 6.0 - k.w) - k.x, 0.0, 1.0), c.y);
}
${p.helpers}
void main() {
  const float TAU = 6.28318530;
  const float steps = 4.0; // sample up/down/left/right
  float radius = 2.0;
  float time_sec = u_time_ms / 1000.0;
  ${p.uv}

  vec3 outline_color_hsl = vec3(sin(time_sec / 2.0), 1.0, 1.0);
  vec2 aspect = 1.0 / vec2(textureSize(u_graphic, 0));

  fragColor = vec4(0.0);
  for (float i = 0.0; i < TAU; i += TAU / steps) {
    // sample the graphic in a circular pattern
    vec2 offset = vec2(sin(i), cos(i)) * aspect * radius;
    vec4 col = texture(u_graphic, uv + offset);

    // lay the outline color down wherever the neighboring sample is opaque
    float alpha = smoothstep(0.5, 0.7, col.a);
    fragColor = mix(fragColor, vec4(hsv2rgb(outline_color_hsl), 1.0), alpha);
  }

  // overlay the original graphic
  vec4 mat = texture(u_graphic, uv);
  float factor = smoothstep(0.5, 0.7, mat.a);
  fragColor = mix(fragColor, mat, factor);
}`;
}

function waterGlsl() {
  return `#version 300 es
precision mediump float;

uniform float u_time_ms;
uniform vec4 u_color;
uniform sampler2D u_screen_texture;

in vec2 v_uv;
in vec2 v_screenuv;
out vec4 fragColor;

// hash/noise adapted from https://www.shadertoy.com/view/4djSRW
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.13);
  p3 += dot(p3, p3.yzx + 3.333);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 x) {
  vec2 i = floor(x);
  vec2 f = fract(x);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  float time_sec = u_time_ms / 1000.0;
  float wave_amplitude = 0.525;
  float wave_speed = 1.8;
  float wave_period = 0.175;
  vec2 scale = vec2(2.5, 8.5);

  float waves = v_uv.y * scale.y +
    sin(v_uv.x * scale.x / wave_period - time_sec * wave_speed) *
    cos(0.2 * v_uv.x * scale.x / wave_period + time_sec * wave_speed) *
    wave_amplitude - wave_amplitude;

  float distortion = noise(v_uv * scale * vec2(2.1, 1.05) + time_sec * 0.12) * 0.25 - 0.125;

  vec2 reflected_screenuv = vec2(v_screenuv.x - distortion, v_screenuv.y);
  vec4 screen_color = texture(u_screen_texture, reflected_screenuv);

  vec4 wave_crest_color = vec4(1.0);
  float wave_crest = clamp(smoothstep(0.1, 0.14, waves) - smoothstep(0.018, 0.99, waves), 0.0, 1.0);

  fragColor.a = smoothstep(0.1, 0.12, waves);
  vec3 mix_color = u_color.rgb * u_color.a; // premultiplied alpha
  fragColor.rgb = mix(screen_color.rgb, mix_color, u_color.a) * fragColor.a + wave_crest_color.rgb * wave_crest;
}`;
}

/**
 * Canned fragment shaders (from the excaliburjs.com /docs/materials examples).
 * `color` (when set) is passed to createMaterial and surfaces as u_color.
 */
export const MATERIAL_TEMPLATES = {
  tint: {
    label: "Color tint",
    description: "multiply the sprite by a color (u_color)",
    color: "Color.Red",
    colorComment: "the tint color — exposed to the shader as u_color",
    glsl: tintGlsl,
  },
  outline: {
    label: "Animated outline",
    description: "rainbow outline traced around the sprite's edges",
    color: null,
    glsl: outlineGlsl,
  },
  water: {
    label: "Water reflection",
    description: "screen-space reflection with waves (u_screen_texture)",
    color: "Color.fromRGB(55, 0, 200, 0.6)",
    colorComment: "the water color — exposed to the shader as u_color",
    glsl: waterGlsl,
  },
};

/** Names derived from the class-style name: "GlowMaterial" → createGlowMaterial etc. */
export function materialNames(className) {
  const base = className.replace(/Material$/, "") || className;
  return {
    factoryName: `create${base}Material`,
    sourceConst: `${toCamelCase(base)}FragmentSource`,
    materialName: toKebabCase(base),
  };
}

/** Escape user-provided GLSL so it is safe inside a TS template literal. */
function escapeTemplateLiteral(src) {
  return src.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

export function emitMaterialFile(model) {
  const names = materialNames(model.className);
  const template = MATERIAL_TEMPLATES[model.template] ?? MATERIAL_TEMPLATES.tint;
  const glsl = model.fragmentSource
    ? escapeTemplateLiteral(model.fragmentSource.trim())
    : template.glsl(Boolean(model.pixelArt));
  const imports = new Set(["Engine", "Material"]);
  const entries = [`name: ${JSON.stringify(names.materialName)}`, `fragmentSource: ${names.sourceConst}`];
  if (!model.fragmentSource && template.color) {
    imports.add("Color");
    if (template.colorComment) entries.push(`// ${template.colorComment}`);
    entries.push(`color: ${template.color}`);
  }
  const lines = [excaliburImportLine(imports), ""];
  lines.push(`export const ${names.sourceConst} = /* glsl */ \`${glsl}\`;`);
  lines.push("");
  lines.push(`// Materials need a live graphics context, so create one once the engine`);
  lines.push(`// exists (e.g. in onInitialize): this.graphics.material = ${names.factoryName}(engine);`);
  lines.push(`export function ${names.factoryName}(engine: Engine): Material {`);
  lines.push(`  return engine.graphicsContext.createMaterial({`);
  for (const e of entries) lines.push(e.startsWith("//") ? `    ${e}` : `    ${e},`);
  lines.push(`  });`);
  lines.push(`}`);
  return lines.join("\n") + "\n";
}
