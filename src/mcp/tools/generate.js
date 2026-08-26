import fs from "node:fs";
import path from "node:path";
import { applyActor, applyAnimation, applyEngine, applyLabel, applyMaterial, applyResource, applyScene, applySpriteSheet, applyUpdateActor } from "../../generate/apply.js";
import { MATERIAL_TEMPLATES, SCENE_LIFECYCLE_METHODS } from "../../generate/emit.js";
import { GenerateError } from "../../generate/errors.js";
import { isValidIdentifier, toCamelCase, toPascalCase } from "../../generate/names.js";
import { analyzeProject } from "../../generate/project.js";
import { COLORS, DISPLAY_MODES, RESOURCE_TYPES, detectPixelArt, pickActor, pickScene, resolveName } from "../../generate/wizards.js";
import { ANIMATION_STRATEGIES, assetDiskPath, resolveGrid } from "../../generate/wizards-sprite.js";
import { readImageSize } from "../../generate/image.js";
import { jsonResult } from "../result.js";
import { resolveProjectDir } from "./docs.js";

export const PROJECT_DIR_PROP = {
  projectDir: {
    type: "string",
    description: "Absolute path to the Excalibur project root. Defaults to the server's working directory.",
  },
};

const COMMON_WRITE_PROPS = {
  dryRun: { type: "boolean", description: "Preview only — report what would change without writing. Default false." },
  force: { type: "boolean", description: "Overwrite an existing generated file. Default false." },
  ...PROJECT_DIR_PROP,
};

const SCENE_PROP = {
  scene: {
    type: "string",
    description: "Target scene to wire it into (matched against scene class name, key, or file basename). Omit to skip wiring. Use analyze_project to list scenes.",
  },
};

async function loadProject(args, ctx) {
  const projectDir = resolveProjectDir(args, ctx);
  return analyzeProject(projectDir, ctx.ts ? { ts: ctx.ts } : {});
}

function writeOpts(args) {
  return { dryRun: args.dryRun ?? false, force: args.force ?? false };
}

async function resolveTargetScene(args, project) {
  if (!args.scene) return null;
  return pickScene({ project, sceneArg: args.scene });
}

function report(result, args) {
  return jsonResult({ dryRun: args.dryRun ?? false, ...result });
}

export const generateTools = [
  {
    name: "analyze_project",
    description:
      "Inspect an Excalibur project: detected scenes (with registration keys), actors, resource keys, SpriteSheet consts, main/resources files, installed excalibur version, and installed @excaliburjs/* plugins. Use it to discover valid `scene`, `actor`, `resourceKey`, and `spriteSheet` values for the generate tools.",
    inputSchema: { type: "object", properties: { ...PROJECT_DIR_PROP } },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const rel = (f) => (f ? path.relative(project.projectDir, f).split(path.sep).join("/") : null);
      return jsonResult({
        projectDir: project.projectDir,
        srcDir: rel(project.srcDir),
        viteShaped: project.viteShaped,
        publicDir: rel(project.publicDir),
        mainFile: rel(project.mainFile),
        resourcesFile: rel(project.resourcesFile),
        resourceKeys: project.resourceKeys,
        scenes: project.scenes.map((s) => ({ className: s.className, file: rel(s.file), key: s.key })),
        actors: project.actors.map((a) => ({ className: a.className, file: rel(a.file) })),
        spriteSheets: project.spriteSheets.map((s) => ({ name: s.name, file: rel(s.file), grid: s.grid })),
        plugins: project.plugins,
        excalibur: { version: project.excalibur.version, range: project.excalibur.range },
        warnings: project.warnings,
      });
    },
  },
  {
    name: "generate_actor",
    description:
      "Generate a new Excalibur Actor class in src/ and optionally add it to a scene's onInitialize. The class name and file name are derived from `name` (e.g. \"BigBoss\" → class BigBoss in src/big-boss.ts).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Actor name, e.g. "Player" or "big boss".' },
        ...SCENE_PROP,
        collider: {
          type: "object",
          description: 'Collision geometry. Default: {"type":"box","width":100,"height":100}.',
          properties: {
            type: { type: "string", enum: ["box", "circle", "custom", "none"] },
            width: { type: "number", description: "Box width in px (default 100)." },
            height: { type: "number", description: "Box height in px (default 100)." },
            radius: { type: "number", description: "Circle radius in px (default 50)." },
          },
          required: ["type"],
        },
        graphic: {
          type: "object",
          description: 'Default graphic. "color" fills the box/circle geometry; "sprite" uses a Resources key. Default: {"type":"color","color":"ExcaliburBlue"} when the collider is box/circle, else {"type":"none"}.',
          properties: {
            type: { type: "string", enum: ["color", "sprite", "none"] },
            color: { type: "string", enum: COLORS },
            resourceKey: { type: "string", description: "A key from the project's Resources (see analyze_project)." },
          },
          required: ["type"],
        },
        collisionType: {
          type: "string",
          enum: ["Active", "Passive", "Fixed", "PreventCollision"],
          description: "Default Active (moves and collides). Passive = events only, Fixed = immovable.",
        },
        pos: {
          type: "object",
          description: "Initial position.",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
        },
        z: { type: "number", description: "z index." },
        anchor: { type: "string", enum: ["center", "topLeft"] },
        coordPlane: { type: "string", enum: ["World", "Screen"], description: "Screen = fixed to the viewport (UI)." },
        rotation: { type: "number", description: "Rotation in radians." },
        collisionGroupName: { type: "string" },
        ...COMMON_WRITE_PROPS,
      },
      required: ["name"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const { className, fileName } = await resolveName({ project, name: args.name, force: args.force ?? false }, "Actor");

      const collider = args.collider ?? { type: "box", width: 100, height: 100 };
      if (collider.type === "box") {
        collider.width = collider.width ?? 100;
        collider.height = collider.height ?? 100;
      } else if (collider.type === "circle") {
        collider.radius = collider.radius ?? 50;
      }

      const colorable = collider.type === "box" || collider.type === "circle";
      const graphic = args.graphic ?? (colorable ? { type: "color", color: "ExcaliburBlue" } : { type: "none" });
      if (graphic.type === "color") {
        graphic.color = graphic.color ?? "ExcaliburBlue";
        if (!colorable) {
          throw new GenerateError('a "color" graphic needs a box or circle collider to give it a shape.', {
            hint: 'Use graphic {"type":"none"} or {"type":"sprite"} with custom/none colliders.',
          });
        }
      } else if (graphic.type === "sprite") {
        if (!graphic.resourceKey) {
          throw new GenerateError('a "sprite" graphic needs resourceKey.', {
            hint: project.resourceKeys.length
              ? `available resource keys: ${project.resourceKeys.join(", ")}`
              : "no Resources found — add one with generate_resource first.",
          });
        }
        if (!project.resourceKeys.includes(graphic.resourceKey)) {
          throw new GenerateError(`resource key "${graphic.resourceKey}" not found in Resources.`, {
            hint: project.resourceKeys.length
              ? `available resource keys: ${project.resourceKeys.join(", ")}`
              : "no Resources found — add one with generate_resource first.",
          });
        }
      }

      const advanced = {};
      if (args.pos) advanced.pos = args.pos;
      if (args.z != null) advanced.z = args.z;
      if (args.anchor) advanced.anchor = args.anchor;
      if (args.coordPlane) advanced.coordPlane = args.coordPlane;
      if (args.rotation != null) advanced.rotation = args.rotation;
      if (args.collisionGroupName) advanced.collisionGroupName = args.collisionGroupName;

      const model = {
        kind: "actor",
        className,
        fileName,
        collider,
        graphic,
        collisionType: args.collisionType ?? "Active",
        advanced,
        targetScene: await resolveTargetScene(args, project),
      };
      return report(await applyActor(model, project, writeOpts(args)), args);
    },
  },
  {
    name: "generate_label",
    description:
      "Generate an Excalibur Label (text) class in src/ and optionally add it to a scene's onInitialize. Omitting `pos` leaves the label unpositioned (unlike the interactive wizard, which defaults to 10,10).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Label name, e.g. "ScoreLabel".' },
        text: { type: "string", description: "Displayed text. Defaults to the class name." },
        font: {
          type: "object",
          description: "Custom font. Omit for the engine default.",
          properties: {
            family: { type: "string", description: 'Default "sans-serif".' },
            size: { type: "number", description: "Size in px (default 24)." },
            bold: { type: "boolean" },
            color: { type: "string", enum: COLORS },
          },
        },
        pos: {
          type: "object",
          description: "Position. Omit for none.",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
        },
        ...SCENE_PROP,
        ...COMMON_WRITE_PROPS,
      },
      required: ["name"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const { className, fileName } = await resolveName({ project, name: args.name, force: args.force ?? false }, "Label");
      let font = null;
      if (args.font) {
        font = {
          family: args.font.family ?? "sans-serif",
          size: args.font.size ?? 24,
          bold: args.font.bold ?? false,
          ...(args.font.color ? { color: args.font.color } : {}),
        };
      }
      const model = {
        kind: "label",
        className,
        fileName,
        text: args.text ?? className,
        font,
        pos: args.pos ?? null,
        targetScene: await resolveTargetScene(args, project),
      };
      return report(await applyLabel(model, project, writeOpts(args)), args);
    },
  },
  {
    name: "generate_scene",
    description:
      "Generate an Excalibur Scene class in src/ and (by default) register it in the engine's scenes map so it can be shown with goToScene.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Scene name, e.g. "Level1".' },
        lifecycle: {
          type: "array",
          items: { type: "string", enum: SCENE_LIFECYCLE_METHODS },
          description: 'Lifecycle methods to stub. Default ["onInitialize"].',
        },
        register: { type: "boolean", description: "Register in the engine's scenes map. Default true (skipped with a warning when no main file exists)." },
        key: { type: "string", description: "Scenes-map key. Default: camelCase of the class name." },
        ...COMMON_WRITE_PROPS,
      },
      required: ["name"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const { className, fileName } = await resolveName({ project, name: args.name, force: args.force ?? false }, "Scene");

      let register = args.register ?? true;
      const preWarnings = [];
      if (register && !project.mainFile) {
        register = false;
        preWarnings.push("no engine main file found — scene not registered; wire it up manually.");
      }

      const key = args.key ?? toCamelCase(className);
      if (!isValidIdentifier(key)) {
        throw new GenerateError(`invalid scene key "${key}"`, { hint: "use a valid identifier (e.g. level1)." });
      }
      if (register) {
        const taken = new Set(project.scenes.map((s) => s.key).filter(Boolean));
        if (taken.has(key)) {
          throw new GenerateError(`scene key "${key}" is already registered.`, {
            hint: `taken keys: ${[...taken].join(", ")} — pass a different \`key\`.`,
          });
        }
      }

      const model = {
        kind: "scene",
        className,
        fileName,
        lifecycle: args.lifecycle?.length ? args.lifecycle : ["onInitialize"],
        register,
        key,
      };
      const result = await applyScene(model, project, writeOpts(args));
      result.warnings = [...preWarnings, ...result.warnings];
      return report(result, args);
    },
  },
  {
    name: "generate_resource",
    description:
      "Register a game asset (image, sound, font, or other file) in the resource loader. By default it's added to the root Resources loader (loaded at boot); pass `scene` to load it in that scene's onPreLoad instead.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: Object.keys(RESOURCE_TYPES), description: "image → ImageSource, sound → Sound, font → FontSource, other → Resource." },
        assetPath: { type: "string", description: 'Asset path as served, e.g. "./images/hero.png" (files live under public/).' },
        key: { type: "string", description: "Resource key (Resources.<key>). Default: PascalCase of the file basename." },
        pixelFiltering: { type: "boolean", description: "Images only: crisp pixel-art filtering. Default: auto-detected from the engine's pixelArt option." },
        family: { type: "string", description: "Fonts only: font family name. Default: the resource key." },
        responseType: { type: "string", enum: ["json", "text", "arraybuffer", "blob", "document"], description: 'Type "other" only. Default "json".' },
        scene: { type: "string", description: "Load scene-scoped via onPreLoad instead of the root loader (matched like the other tools' scene param)." },
        ...COMMON_WRITE_PROPS,
      },
      required: ["type", "assetPath"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const spec = RESOURCE_TYPES[args.type];

      let key = args.key;
      if (!key) {
        key = toPascalCase(path.basename(args.assetPath, path.extname(args.assetPath)));
        if (!isValidIdentifier(key)) {
          throw new GenerateError(`could not derive a valid resource key from "${args.assetPath}".`, {
            hint: "pass an explicit `key` (e.g. HeroSprite).",
          });
        }
      }
      if (!isValidIdentifier(key)) {
        throw new GenerateError(`invalid resource key "${key}"`, { hint: "use a valid identifier (e.g. HeroSprite)." });
      }
      if (project.resourceKeys.includes(key)) {
        throw new GenerateError(`resource key "${key}" already exists in Resources.`, {
          hint: `existing keys: ${project.resourceKeys.join(", ")} — pass a different \`key\`.`,
        });
      }

      const preWarnings = [];
      if (project.publicDir) {
        const onDisk = path.join(project.publicDir, args.assetPath.replace(/^\.\//, ""));
        if (!fs.existsSync(onDisk)) {
          preWarnings.push(`${args.assetPath} not found under ${path.basename(project.publicDir)}/ — the loader will 404 until the file exists.`);
        }
      }

      const model = { kind: "resource", key, resourceClass: spec.class, assetPath: args.assetPath };
      if (args.type === "image") model.pixelFiltering = args.pixelFiltering ?? detectPixelArt(project);
      if (args.type === "font") model.family = args.family ?? key;
      if (args.type === "other") model.responseType = args.responseType ?? "json";

      const targetScene = await resolveTargetScene(args, project);
      model.target = targetScene ? { scene: targetScene } : { root: true };

      const result = await applyResource(model, project, writeOpts(args));
      result.warnings = [...preWarnings, ...result.warnings];
      return report(result, args);
    },
  },
  {
    name: "generate_material",
    description:
      "Generate an Excalibur Material (custom WebGL fragment shader) in src/ and optionally assign it to an actor's graphics in onInitialize. Emits the GLSL source plus a create<Name>Material(engine) factory. Pick a canned `template`, or pass `fragmentSource` for fully custom GLSL (#version 300 es).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Material name, e.g. "Ripple" (→ createRippleMaterial in src/ripple.ts).' },
        template: {
          type: "string",
          enum: Object.keys(MATERIAL_TEMPLATES),
          description: `Shader template: ${Object.entries(MATERIAL_TEMPLATES).map(([k, t]) => `"${k}" = ${t.description}`).join("; ")}. Default "tint". Ignored when fragmentSource is given.`,
        },
        fragmentSource: {
          type: "string",
          description: "Custom GLSL ES 300 fragment shader. Must start with `#version 300 es` and declare an `out vec4` output; excalibur provides v_uv/v_screenuv and uniforms like u_graphic, u_color, u_time_ms, u_screen_texture.",
        },
        actor: {
          type: "string",
          description: "Target actor to assign the material to (matched against actor class name or file basename). Omit to skip wiring. Use analyze_project to list actors.",
        },
        ...COMMON_WRITE_PROPS,
      },
      required: ["name"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const { className, fileName } = await resolveName({ project, name: args.name, force: args.force ?? false }, "Material");
      const model = {
        kind: "material",
        className,
        fileName,
        template: args.template ?? "tint",
        fragmentSource: args.fragmentSource ?? null,
        pixelArt: detectPixelArt(project),
        targetActor: args.actor ? await pickActor({ project, actorArg: args.actor }) : null,
      };
      return report(await applyMaterial(model, project, writeOpts(args)), args);
    },
  },
  {
    name: "update_actor",
    description:
      "Change ActorArgs on an existing Actor class's `super({ ... })` constructor options (pos, size, color, collisionType, …). Only the options you pass are touched; other options and comments are preserved. When switching between width/height and radius, put the old properties in `remove`.",
    inputSchema: {
      type: "object",
      properties: {
        actor: {
          type: "string",
          description: "Target actor (matched against class name or file basename). Use analyze_project to list actors.",
        },
        options: {
          type: "object",
          description: "ActorArgs to set or replace.",
          properties: {
            name: { type: "string", description: "Actor display name." },
            pos: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
              required: ["x", "y"],
            },
            width: { type: "number" },
            height: { type: "number" },
            radius: { type: "number" },
            color: { type: "string", enum: COLORS },
            collisionType: { type: "string", enum: ["Active", "Passive", "Fixed", "PreventCollision"] },
            anchor: { type: "string", enum: ["center", "topLeft"] },
            coordPlane: { type: "string", enum: ["World", "Screen"] },
            rotation: { type: "number", description: "Rotation in radians." },
            z: { type: "number" },
          },
        },
        remove: {
          type: "array",
          items: { type: "string" },
          description: 'ActorArgs names to delete, e.g. ["width", "height"] when switching to radius.',
        },
        ...COMMON_WRITE_PROPS,
      },
      required: ["actor"],
    },
    async handler(args, ctx) {
      const options = args.options ?? {};
      const remove = args.remove ?? [];
      if (Object.keys(options).length === 0 && remove.length === 0) {
        throw new GenerateError("nothing to change — pass `options` and/or `remove`.", {
          hint: 'e.g. {"options": {"collisionType": "Fixed"}} or {"remove": ["rotation"]}.',
        });
      }
      const project = await loadProject(args, ctx);
      const actor = await pickActor({ project, actorArg: args.actor });
      const model = { kind: "update-actor", actor, options, remove };
      return report(await applyUpdateActor(model, project, writeOpts(args)), args);
    },
  },
  {
    name: "update_engine",
    description:
      "Change EngineOptions on the project's `new Engine(...)` call (creates src/main.ts if the project has none). Only the options you pass are touched; existing options and comments are preserved. When setting width/height on a project that uses viewport/resolution, include those in `remove`.",
    inputSchema: {
      type: "object",
      properties: {
        options: {
          type: "object",
          description: "Engine options to set or replace.",
          properties: {
            width: { type: "integer" },
            height: { type: "integer" },
            displayMode: { type: "string", enum: DISPLAY_MODES },
            backgroundColor: { type: "string", enum: COLORS },
            pixelArt: { type: "boolean" },
            antialiasing: { type: "boolean" },
            suppressPlayButton: { type: "boolean" },
            fixedUpdateFps: { type: "number" },
            physics: {
              type: "object",
              properties: {
                solver: { type: "string", enum: ["Arcade", "Realistic"] },
                gravity: {
                  type: "object",
                  properties: { x: { type: "number" }, y: { type: "number" } },
                  required: ["x", "y"],
                },
                substep: { type: "integer" },
              },
            },
          },
        },
        remove: {
          type: "array",
          items: { type: "string" },
          description: 'Engine option names to delete, e.g. ["viewport", "resolution"].',
        },
        ...COMMON_WRITE_PROPS,
      },
    },
    async handler(args, ctx) {
      const options = args.options ?? {};
      const remove = args.remove ?? [];
      if (Object.keys(options).length === 0 && remove.length === 0) {
        throw new GenerateError("nothing to change — pass `options` and/or `remove`.", {
          hint: 'e.g. {"options": {"pixelArt": true}} or {"remove": ["antialiasing"]}.',
        });
      }
      const project = await loadProject(args, ctx);
      const model = { kind: "engine", options, remove, scenes: project.scenes };
      return report(await applyEngine(model, project, writeOpts(args)), args);
    },
  },
  {
    name: "generate_spritesheet",
    description:
      "Slice a sheet image into an ex.SpriteSheet: registers the ImageSource in Resources (or reuses an existing key) and appends `export const <Name>SpriteSheet = SpriteSheet.fromImageSource(...)` to resources.ts. Provide rows+columns and/or spriteWidth+spriteHeight — when the image file is readable, the missing pair is derived from its pixel dimensions.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'SpriteSheet name, e.g. "PlayerRun" (\u2192 const PlayerRunSpriteSheet).' },
        assetPath: {
          type: "string",
          description: 'Sheet image path as served, e.g. "./images/run.png" (files live under public/). Pass exactly one of assetPath / resourceKey.',
        },
        resourceKey: {
          type: "string",
          description: "Reuse an existing Resources image instead of adding one (see analyze_project's resourceKeys).",
        },
        rows: { type: "integer", minimum: 1, description: "Sprite rows in the sheet." },
        columns: { type: "integer", minimum: 1, description: "Sprite columns in the sheet." },
        spriteWidth: { type: "integer", minimum: 1, description: "Width of one sprite in px." },
        spriteHeight: { type: "integer", minimum: 1, description: "Height of one sprite in px." },
        margin: {
          type: "object",
          description: "Space between sprites in px. Default {x:0,y:0}.",
          properties: { x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 } },
          required: ["x", "y"],
        },
        originOffset: {
          type: "object",
          description: "Offset of the first sprite from the sheet's top-left in px. Default {x:0,y:0}.",
          properties: { x: { type: "integer", minimum: 0 }, y: { type: "integer", minimum: 0 } },
          required: ["x", "y"],
        },
        key: { type: "string", description: "Resources key when adding a new image. Default: PascalCase of the file basename." },
        pixelFiltering: {
          type: "boolean",
          description: "Crisp pixel-art filtering on the new ImageSource. Default: auto-detected from the engine's pixelArt option.",
        },
        ...COMMON_WRITE_PROPS,
      },
      required: ["name"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      if (Boolean(args.assetPath) === Boolean(args.resourceKey)) {
        throw new GenerateError("pass exactly one of `assetPath` or `resourceKey`.", {
          hint: "assetPath adds a new image to Resources; resourceKey reuses one from analyze_project.",
        });
      }
      const name = toPascalCase(args.name);
      if (!isValidIdentifier(name)) {
        throw new GenerateError(`invalid spritesheet name "${args.name}"`, {
          hint: "use letters/numbers, starting with a letter (e.g. PlayerRun).",
        });
      }

      const preWarnings = [];
      let image;
      let assetPath;
      if (args.resourceKey) {
        if (!project.resourceKeys.includes(args.resourceKey)) {
          throw new GenerateError(`resource key "${args.resourceKey}" not found in Resources.`, {
            hint: project.resourceKeys.length
              ? `available keys: ${project.resourceKeys.join(", ")}`
              : "no Resources found — pass assetPath instead.",
          });
        }
        assetPath = project.resourceAssetPaths.get(args.resourceKey) ?? null;
        image = { key: args.resourceKey, reuseExisting: true, assetPath, pixelFiltering: false };
      } else {
        assetPath = args.assetPath;
        let key = args.key ?? toPascalCase(path.basename(assetPath, path.extname(assetPath)));
        if (!isValidIdentifier(key)) {
          throw new GenerateError(`could not derive a valid resource key from "${assetPath}".`, {
            hint: "pass an explicit `key` (e.g. HeroSheet).",
          });
        }
        if (project.resourceKeys.includes(key)) {
          throw new GenerateError(`resource key "${key}" already exists in Resources.`, {
            hint: `pass a different \`key\`, or reuse it via \`resourceKey\`.`,
          });
        }
        if (!fs.existsSync(assetDiskPath(project, assetPath))) {
          preWarnings.push(`${assetPath} not found under public/ — the loader will 404 until the file exists.`);
        }
        image = { key, reuseExisting: false, assetPath, pixelFiltering: args.pixelFiltering ?? detectPixelArt(project) };
      }

      const dimensions = assetPath ? readImageSize(assetDiskPath(project, assetPath)) : null;
      const margin = args.margin ?? { x: 0, y: 0 };
      const originOffset = args.originOffset ?? { x: 0, y: 0 };
      const { grid, warnings } = resolveGrid({
        dimensions,
        rows: args.rows ?? null,
        columns: args.columns ?? null,
        spriteWidth: args.spriteWidth ?? null,
        spriteHeight: args.spriteHeight ?? null,
        margin,
        originOffset,
      });
      if (!grid) {
        throw new GenerateError("could not resolve the sprite grid.", {
          hint: dimensions
            ? "pass rows+columns and/or spriteWidth+spriteHeight (the numbers may not fit the image)."
            : "the image could not be read — pass all of rows, columns, spriteWidth, and spriteHeight.",
        });
      }

      const model = {
        kind: "spritesheet",
        name,
        image,
        dimensions,
        grid,
        spacing: { margin, originOffset },
        animations: [],
        wire: null,
      };
      const result = await applySpriteSheet(model, project, writeOpts(args));
      result.warnings = [...preWarnings, ...warnings, ...result.warnings];
      return report(result, args);
    },
  },
  {
    name: "generate_animation",
    description:
      "Build an ex.Animation from an existing SpriteSheet const: appends `export const <Name>Animation = Animation.fromSpriteSheetCoordinates(...)` next to the sheet in resources.ts and optionally wires `this.graphics.use(<Name>Animation)` into an actor's onInitialize. Use analyze_project's spriteSheets to find valid `spriteSheet` values.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: 'Animation name, e.g. "PlayerIdle" (\u2192 const PlayerIdleAnimation).' },
        spriteSheet: {
          type: "string",
          description: "SpriteSheet const name (see analyze_project). Optional when the project has exactly one.",
        },
        frames: {
          type: "array",
          description: "Sprite coordinates in play order (x = column, y = row, 0-based).",
          items: {
            type: "object",
            properties: {
              x: { type: "integer", minimum: 0 },
              y: { type: "integer", minimum: 0 },
              duration: { type: "integer", minimum: 1, description: "Milliseconds for this frame. Default: the top-level `duration`." },
            },
            required: ["x", "y"],
          },
        },
        duration: { type: "integer", minimum: 1, description: "Default frame duration in ms for frames without their own. Default 100." },
        strategy: {
          type: "string",
          enum: ANIMATION_STRATEGIES.map((s) => s.value),
          description: `Playback: ${ANIMATION_STRATEGIES.map((s) => `${s.value} = ${s.description}`).join("; ")}. Default Loop.`,
        },
        actor: {
          type: "string",
          description: "Actor to wire the animation into (matched against class name or file basename). Omit to skip wiring.",
        },
        ...COMMON_WRITE_PROPS,
      },
      required: ["name", "frames"],
    },
    async handler(args, ctx) {
      const project = await loadProject(args, ctx);
      const name = toPascalCase(args.name);
      if (!isValidIdentifier(name)) {
        throw new GenerateError(`invalid animation name "${args.name}"`, {
          hint: "use letters/numbers, starting with a letter (e.g. PlayerIdle).",
        });
      }
      if (!args.frames.length) {
        throw new GenerateError("frames must contain at least one coordinate.", {
          hint: 'e.g. [{"x": 0, "y": 0}, {"x": 1, "y": 0}]',
        });
      }
      const sheets = project.spriteSheets;
      let sheet;
      if (args.spriteSheet) {
        sheet = sheets.find((s) => s.name === args.spriteSheet);
        if (!sheet) {
          throw new GenerateError(`no SpriteSheet const named "${args.spriteSheet}" found.`, {
            hint: sheets.length
              ? `available: ${sheets.map((s) => s.name).join(", ")}`
              : "create one first with generate_spritesheet.",
          });
        }
      } else if (sheets.length === 1) {
        sheet = sheets[0];
      } else if (sheets.length === 0) {
        throw new GenerateError("no SpriteSheet consts found in the project.", {
          hint: "create one first with generate_spritesheet.",
        });
      } else {
        throw new GenerateError("multiple SpriteSheets found — pass `spriteSheet`.", {
          hint: `available: ${sheets.map((s) => s.name).join(", ")}`,
        });
      }

      const defaultMs = args.duration ?? 100;
      const frames = args.frames.map((f) => ({ x: f.x, y: f.y, duration: f.duration ?? defaultMs }));
      if (sheet.grid) {
        const bad = frames.find((f) => f.x >= sheet.grid.columns || f.y >= sheet.grid.rows);
        if (bad) {
          throw new GenerateError(`frame ${bad.x},${bad.y} is outside the sheet's grid.`, {
            hint: `${sheet.name} is ${sheet.grid.columns} columns \u00d7 ${sheet.grid.rows} rows (0-based).`,
          });
        }
      }

      const model = {
        kind: "animation",
        name,
        sheet: { name: sheet.name, file: sheet.file, grid: sheet.grid },
        frames,
        strategy: args.strategy ?? "Loop",
        targetActor: args.actor ? await pickActor({ project, actorArg: args.actor }) : null,
      };
      return report(await applyAnimation(model, project, writeOpts(args)), args);
    },
  },
];
