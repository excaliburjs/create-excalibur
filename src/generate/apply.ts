import * as fs from "node:fs";
import * as path from "node:path";
import { writeFileAtomic } from "../docs/cache.ts";
import { createTsEditor } from "./ts-edit.ts";
import { GenerateError, SeamNotFoundError } from "./errors.ts";
import { toCamelCase } from "./names.ts";
import { relativeSpecifier } from "./project.ts";
import {
  actorArgEntries,
  emitActorFile,
  emitMaterialFile,
  materialNames,
  emitLabelFile,
  emitSceneFile,
  emitResourcesFile,
  emitResourceExpr,
  emitMainFile,
  engineOptionEntries,
  emitSpriteSheetConst,
  emitAnimationConst,
} from "./emit.ts";
import type * as TS from "typescript";
import type { Edit, TsEditor } from "./ts-edit.ts";
import type { Project } from "./project.ts";
import type {
  ActorModel,
  ActorTarget,
  AnimationModel,
  ApplyOptions,
  EngineModel,
  GenerateReport,
  LabelModel,
  MaterialModel,
  ResourceModel,
  SceneModel,
  SpriteSheetModel,
  UpdateActorModel,
} from "./models.ts";

type Write = [string, string];
type ManualFallback = { title: string; snippet: string };
type Build = (editor: TsEditor, sf: TS.SourceFile, text: string) => { edits: Edit[] };

function newReport(): GenerateReport {
  return { created: [], modified: [], manual: [], warnings: [], hints: [] };
}

function rel(project: Project, file: string): string {
  return path.relative(project.projectDir, file);
}

function checkTargetFree(targetFile: string, project: Project, { force }: ApplyOptions): void {
  if (fs.existsSync(targetFile) && !force) {
    throw new GenerateError(`${rel(project, targetFile)} already exists`, {
      hint: "pass --force to overwrite it.",
    });
  }
}

/**
 * Build one or more splices against `file` (each pass re-parses the previous
 * pass's output — needed when edits would otherwise overlap, e.g. removing the
 * property another edit anchors on), validating the result. On SeamNotFoundError
 * (or a splice that no longer parses) returns null and records a manual entry.
 */
function trySplice(project: Project, report: GenerateReport, file: string, manualFallback: ManualFallback, ...builds: Build[]): string | null {
  return spliceText(project, report, file, fs.readFileSync(file, "utf8"), manualFallback, ...builds);
}

/** trySplice against caller-supplied base text (for files that do not exist on disk yet). */
function spliceText(project: Project, report: GenerateReport, file: string, baseText: string, manualFallback: ManualFallback, ...builds: Build[]): string | null {
  const editor = createTsEditor(project.ts);
  let text = baseText;
  try {
    for (const build of builds) {
      const sf = editor.parse(file, text);
      const { edits } = build(editor, sf, text);
      text = editor.applyEdits(text, edits);
    }
  } catch (error) {
    if (error instanceof SeamNotFoundError) {
      report.manual.push({ title: `${manualFallback.title} (${error.message})`, snippet: manualFallback.snippet });
      return null;
    }
    throw error;
  }
  if (editor.validate(file, text).length > 0) {
    report.manual.push({
      title: `${manualFallback.title} (the edit did not parse cleanly — left ${rel(project, file)} untouched)`,
      snippet: manualFallback.snippet,
    });
    return null;
  }
  return text;
}

async function commit(project: Project, report: GenerateReport, { dryRun }: ApplyOptions, files: Write[]): Promise<void> {
  for (const [file, contents] of files) {
    if (!dryRun) await writeFileAtomic(file, contents);
  }
}

/** Unique local variable name inside a file's text. */
function uniqueVar(base: string, text: string): string {
  let name = base;
  let i = 2;
  while (new RegExp(`\\b${name}\\b`).test(text)) name = `${base}${i++}`;
  return name;
}

function addToSceneSnippet(model: { className: string; fileName: string }, varName: string): string {
  return [
    `import { ${model.className} } from "./${model.fileName.replace(/\.ts$/, "")}";`,
    `// inside your scene's onInitialize:`,
    `const ${varName} = new ${model.className}();`,
    `this.add(${varName});`,
  ].join("\n");
}

/** Shared by actor + label: create the class file and wire it into a scene. */
async function applyEntity(
  model: ActorModel | LabelModel,
  project: Project,
  opts: ApplyOptions,
  emitFile: () => string
): Promise<GenerateReport> {
  const report = newReport();
  const targetFile = path.join(project.srcDir, model.fileName);
  checkTargetFree(targetFile, project, opts);

  const fileText = emitFile();
  const writes: Write[] = [[targetFile, fileText]];
  report.created.push(rel(project, targetFile));

  const targetScene = model.targetScene;
  if (targetScene) {
    const sceneFile = targetScene.file;
    const sceneText = fs.readFileSync(sceneFile, "utf8");
    const varName = uniqueVar(toCamelCase(model.className), sceneText);
    const out = trySplice(
      project,
      report,
      sceneFile,
      {
        title: `Could not add ${model.className} to ${targetScene.className} automatically`,
        snippet: addToSceneSnippet(model, varName),
      },
      (editor, sf, text) =>
        editor.addToClassMethod(sf, text, {
          className: targetScene.className,
          methodName: "onInitialize",
          methodSignature: "override onInitialize(engine: Engine): void",
          statements: [`const ${varName} = new ${model.className}();`, `this.add(${varName});`],
          imports: [{ specifier: relativeSpecifier(sceneFile, targetFile), name: model.className }],
          methodImports: [{ specifier: "excalibur", name: "Engine" }],
        })
    );
    if (out !== null) {
      writes.push([sceneFile, out]);
      report.modified.push({
        path: rel(project, sceneFile),
        snippet: `this.add(new ${model.className}()) in ${targetScene.className}.onInitialize`,
      });
    }
  } else {
    report.hints.push(`add it to a scene with: const a = new ${model.className}(); scene.add(a);`);
  }

  await commit(project, report, opts, writes);
  return report;
}

export async function applyActor(model: ActorModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const targetFile = path.join(project.srcDir, model.fileName);
  const resourcesSpecifier = project.resourcesFile
    ? relativeSpecifier(targetFile, project.resourcesFile)
    : "./resources";
  return applyEntity(model, project, opts, () => emitActorFile(model, { resourcesSpecifier }));
}

export async function applyLabel(model: LabelModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  return applyEntity(model, project, opts, () => emitLabelFile(model));
}

export async function applyMaterial(model: MaterialModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();
  const targetFile = path.join(project.srcDir, model.fileName);
  checkTargetFree(targetFile, project, opts);
  const names = materialNames(model.className);

  const writes: Write[] = [[targetFile, emitMaterialFile(model)]];
  report.created.push(rel(project, targetFile));

  const targetActor = model.targetActor;
  if (targetActor) {
    const actorFile = targetActor.file;
    const assign = (engineRef: string) => `this.graphics.material = ${names.factoryName}(${engineRef});`;
    const out = trySplice(
      project,
      report,
      actorFile,
      {
        title: `Could not assign the material in ${targetActor.className} automatically`,
        snippet: [
          `import { ${names.factoryName} } from "./${model.fileName.replace(/\.ts$/, "")}";`,
          `// inside ${targetActor.className}'s onInitialize(engine: Engine):`,
          assign("engine"),
        ].join("\n"),
      },
      (editor, sf, text) => {
        const ts = project.ts;
        const cls = sf.statements.find(
          (st): st is TS.ClassDeclaration => ts.isClassDeclaration(st) && st.name?.text === targetActor.className
        );
        if (!cls) throw new SeamNotFoundError(`class "${targetActor.className}" not found`);
        const method = cls.members.find(
          (m): m is TS.MethodDeclaration =>
            ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === "onInitialize" && Boolean(m.body)
        );

        // The material factory needs the engine. Reuse an existing parameter,
        // or add one when the method declares none (fewer params is a legal override).
        const binding = editor.excaliburBinding(sf);
        const engineType = editor.localRef(binding, "Engine");
        let engineRef = "engine";
        const preEdits: Edit[] = [];
        if (method && method.parameters.length > 0) {
          const first = method.parameters[0].name;
          if (!ts.isIdentifier(first)) {
            throw new SeamNotFoundError("onInitialize's first parameter is not a plain identifier");
          }
          engineRef = first.text;
        } else if (method) {
          engineRef = uniqueVar("engine", text.slice(method.getStart(sf), method.end));
          preEdits.push({
            start: method.parameters.pos,
            end: method.parameters.end,
            text: `${engineRef}: ${engineType}`,
          });
          if (binding?.kind !== "namespace") {
            const imp = editor.ensureNamedImport(sf, text, "excalibur", "Engine");
            if (imp) preEdits.push(imp);
          }
        }

        const { edits } = editor.addToClassMethod(sf, text, {
          className: targetActor.className,
          methodName: "onInitialize",
          methodSignature: `override onInitialize(${engineRef}: ${engineType}): void`,
          statements: [assign(engineRef)],
          imports: [{ specifier: relativeSpecifier(actorFile, targetFile), name: names.factoryName }],
          methodImports: [{ specifier: "excalibur", name: "Engine" }],
        });
        return { edits: [...edits, ...preEdits] };
      }
    );
    if (out !== null) {
      writes.push([actorFile, out]);
      report.modified.push({
        path: rel(project, actorFile),
        snippet: `this.graphics.material = ${names.factoryName}(…) in ${targetActor.className}.onInitialize`,
      });
    }
  } else {
    report.hints.push(
      `assign it in an actor's onInitialize: this.graphics.material = ${names.factoryName}(engine);`
    );
  }
  report.hints.push("materials require the WebGL renderer (Excalibur's default).");

  await commit(project, report, opts, writes);
  return report;
}

export async function applyScene(model: SceneModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();
  const targetFile = path.join(project.srcDir, model.fileName);
  checkTargetFree(targetFile, project, opts);

  const writes: Write[] = [[targetFile, emitSceneFile(model)]];
  report.created.push(rel(project, targetFile));

  const mainFile = project.mainFile;
  if (model.register && mainFile) {
    const out = trySplice(
      project,
      report,
      mainFile,
      {
        title: `Could not register ${model.className} in the engine automatically`,
        snippet: [
          `import { ${model.className} } from "${relativeSpecifier(mainFile, targetFile)}";`,
          `// inside new Engine({ ... }):`,
          `scenes: { ${model.key}: ${model.className} }`,
        ].join("\n"),
      },
      (editor, sf, text) =>
        editor.addSceneToEngine(sf, text, {
          key: model.key,
          className: model.className,
          specifier: relativeSpecifier(mainFile, targetFile),
        })
    );
    if (out !== null) {
      writes.push([mainFile, out]);
      report.modified.push({
        path: rel(project, mainFile),
        snippet: `scenes: { ${model.key}: ${model.className} }`,
      });
      report.hints.push(`switch to it with: game.goToScene("${model.key}")`);
    }
  } else if (model.register && !mainFile) {
    report.warnings.push("no engine found to register the scene in — try `ex generate engine`");
  }

  await commit(project, report, opts, writes);
  return report;
}

export async function applyResource(model: ResourceModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();
  const { expr, excaliburImports } = emitResourceExpr(model);

  if (!project.viteShaped) {
    report.warnings.push(
      "this project does not look like the vite template — resource paths may need adjusting"
    );
    report.manual.push({
      title: "Add this resource yourself",
      snippet: [
        `// in resources.ts:`,
        `import { ${excaliburImports.join(", ")} } from "excalibur";`,
        `${model.key}: ${expr},`,
      ].join("\n"),
    });
    return report;
  }

  const targetScene = model.target?.scene;
  if (targetScene) {
    // Scene-scoped: declare the resource in the scene file + load it in onPreLoad
    // (keeping it out of the root Resources literal, which the boot loader loads eagerly).
    const sceneFile = targetScene.file;
    const sceneText = fs.readFileSync(sceneFile, "utf8");
    const varName = uniqueVar(toCamelCase(model.key), sceneText);
    const manual = {
      title: `Could not wire the resource into ${targetScene.className} automatically`,
      snippet: [
        `const ${varName} = ${expr};`,
        `// inside the scene:`,
        `override onPreLoad(loader: DefaultLoader): void {`,
        `  loader.addResource(${varName});`,
        `}`,
      ].join("\n"),
    };
    const out = trySplice(project, report, sceneFile, manual, (editor, sf, text) => {
      const { edits } = editor.addToClassMethod(sf, text, {
        className: targetScene.className,
        methodName: "onPreLoad",
        methodSignature: "override onPreLoad(loader: DefaultLoader): void",
        statements: [`loader.addResource(${varName});`],
        imports: [],
        methodImports: [{ specifier: "excalibur", name: "DefaultLoader" }],
      });
      // module-level const after the imports
      const lastImport = [...sf.statements].reverse().find((s) => project.ts.isImportDeclaration(s));
      let pos = 0;
      if (lastImport) {
        const nl = text.indexOf("\n", lastImport.end);
        pos = nl === -1 ? text.length : nl + 1;
      }
      const { eol } = editor.detectFormat(text);
      edits.push({ start: pos, end: pos, text: `${eol}const ${varName} = ${expr};${eol}` });
      const binding = editor.excaliburBinding(sf);
      if (binding?.kind !== "namespace") {
        for (const name of excaliburImports) {
          const imp = editor.ensureNamedImport(sf, text, "excalibur", name);
          if (imp) edits.push(imp);
        }
      }
      return { edits };
    });
    if (out !== null) {
      await commit(project, report, opts, [[sceneFile, out]]);
      report.modified.push({
        path: rel(project, sceneFile),
        snippet: `${varName} loaded in ${targetScene.className}.onPreLoad`,
      });
    }
    return report;
  }

  // Root resources.ts (create it if missing)
  let resourcesFile = project.resourcesFile;
  let baseText: string;
  let creating = false;
  if (!resourcesFile) {
    resourcesFile = path.join(project.srcDir, "resources.ts");
    if (fs.existsSync(resourcesFile)) {
      throw new GenerateError("src/resources.ts exists but has no `Resources` object literal", {
        hint: "add the entry manually or restructure resources.ts like the template.",
      });
    }
    baseText = emitResourcesFile();
    creating = true;
  } else {
    baseText = fs.readFileSync(resourcesFile, "utf8");
  }

  const editor = createTsEditor(project.ts);
  const sf = editor.parse(resourcesFile, baseText);
  const { edits } = editor.addResource(sf, baseText, { key: model.key, expr, excaliburImports });
  const out = editor.applyEdits(baseText, edits);
  if (editor.validate(resourcesFile, out).length > 0) {
    throw new GenerateError("editing resources.ts produced invalid code — nothing was written", {
      hint: `add manually: ${model.key}: ${expr},`,
    });
  }
  await commit(project, report, opts, [[resourcesFile, out]]);
  if (creating) report.created.push(rel(project, resourcesFile));
  else
    report.modified.push({
      path: rel(project, resourcesFile),
      snippet: `${model.key}: ${expr}`,
    });
  report.hints.push(`use it with: Resources.${model.key}`);
  return report;
}

/** Edit an existing actor class's super({ ... }) ActorArgs in place. */
export async function applyUpdateActor(model: UpdateActorModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();
  const { entries, imports } = actorArgEntries(model.options);
  const remove = model.remove ?? [];
  const actorFile = model.actor.file;
  const manualSnippet = [
    `// inside ${model.actor.className}'s constructor super({ ... }):`,
    ...entries.map((e) => `${e.name}: ${e.expr},`),
    ...remove.map((name) => `// remove: ${name}`),
  ].join("\n");

  const out = trySplice(
    project,
    report,
    actorFile,
    { title: `Could not edit ${model.actor.className}'s options automatically`, snippet: manualSnippet },
    // pass 1: removals (separate pass so inserts can't anchor on a removed property)
    (editor, sf, text) => {
      const lit = editor.actorSuperOptionsLiteral(sf, model.actor.className);
      const edits: Edit[] = [];
      for (const name of remove) {
        const e = editor.removeObjectProperty(sf, text, lit, name);
        if (e) edits.push(e);
      }
      return { edits };
    },
    // pass 2: set/replace + imports
    (editor, sf, text) => {
      const lit = editor.actorSuperOptionsLiteral(sf, model.actor.className);
      const edits: Edit[] = [];
      for (const { name, expr } of entries) {
        if (editor.findProperty(lit, name)) {
          edits.push(editor.replaceInitializer(sf, text, lit, name, expr));
        } else {
          edits.push(...editor.insertObjectProperty(sf, text, lit, `${name}: ${expr}`));
        }
      }
      const binding = editor.excaliburBinding(sf);
      if (binding?.kind !== "namespace") {
        for (const name of imports) {
          const imp = editor.ensureNamedImport(sf, text, "excalibur", name);
          if (imp) edits.push(imp);
        }
      }
      return { edits };
    }
  );
  if (out !== null) {
    await commit(project, report, opts, [[actorFile, out]]);
    report.modified.push({
      path: rel(project, actorFile),
      snippet:
        [...entries.map((e) => e.name), ...remove.map((n) => `-${n}`)].join(", ") || "(no changes)",
    });
  }
  return report;
}

export async function applyEngine(model: EngineModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();

  const mainFile = project.mainFile;
  if (mainFile) {
    const { entries, imports } = engineOptionEntries(model.options);
    const manualSnippet = entries.map((e) => `${e.name}: ${e.expr},`).join("\n");
    const out = trySplice(
      project,
      report,
      mainFile,
      { title: "Could not edit the engine options automatically", snippet: manualSnippet },
      // pass 1: removals (separate pass so inserts can't anchor on a removed property)
      (editor, sf, text) => {
        const engine = editor.findEngineNews(sf)[0];
        if (!engine) throw new SeamNotFoundError("no `new Engine(...)` found");
        const optsLit = editor.engineOptionsLiteral(sf, engine);
        const edits: Edit[] = [];
        for (const name of model.remove ?? []) {
          const e = editor.removeObjectProperty(sf, text, optsLit, name);
          if (e) edits.push(e);
        }
        return { edits };
      },
      // pass 2: set/replace + imports
      (editor, sf, text) => {
        const engine = editor.findEngineNews(sf)[0];
        if (!engine) throw new SeamNotFoundError("no `new Engine(...)` found");
        const optsLit = editor.engineOptionsLiteral(sf, engine);
        const edits: Edit[] = [];
        for (const { name, expr } of entries) {
          if (editor.findProperty(optsLit, name)) {
            edits.push(editor.replaceInitializer(sf, text, optsLit, name, expr));
          } else {
            edits.push(...editor.insertObjectProperty(sf, text, optsLit, `${name}: ${expr}`));
          }
        }
        const binding = editor.excaliburBinding(sf);
        if (binding?.kind !== "namespace") {
          for (const name of imports) {
            const imp = editor.ensureNamedImport(sf, text, "excalibur", name);
            if (imp) edits.push(imp);
          }
        }
        return { edits };
      }
    );
    if (out !== null) {
      await commit(project, report, opts, [[mainFile, out]]);
      report.modified.push({
        path: rel(project, mainFile),
        snippet: entries.map((e) => e.name).join(", ") || "(no changes)",
      });
    }
    return report;
  }

  // No engine anywhere — generate a fresh main.ts
  const targetFile = path.join(project.srcDir, "main.ts");
  if (fs.existsSync(targetFile)) {
    throw new GenerateError("src/main.ts exists but no `new Engine(...)` was found in the project", {
      hint: "only one engine per project — construct the Engine in main.ts or edit it manually.",
    });
  }
  const scenes = (model.scenes ?? []).map((s) => ({
    key: s.key ?? toCamelCase(s.className),
    className: s.className,
    specifier: relativeSpecifier(targetFile, s.file),
  }));
  const text = emitMainFile(
    { options: model.options, scenes },
    { hasResources: Boolean(project.resourcesFile) }
  );
  await commit(project, report, opts, [[targetFile, text]]);
  report.created.push(rel(project, targetFile));
  return report;
}

/** Wire `this.graphics.use(<animConst>)` into an actor's onInitialize. */
function wireAnimationToActor(
  project: Project,
  report: GenerateReport,
  writes: Write[],
  { actor, animConst, fromFile }: { actor: ActorTarget; animConst: string; fromFile: string }
): void {
  const actorFile = actor.file;
  const specifier = relativeSpecifier(actorFile, fromFile);
  const out = trySplice(
    project,
    report,
    actorFile,
    {
      title: `Could not use ${animConst} in ${actor.className} automatically`,
      snippet: [
        `import { ${animConst} } from "${specifier}";`,
        `// inside ${actor.className}'s onInitialize:`,
        `this.graphics.use(${animConst});`,
      ].join("\n"),
    },
    (editor, sf, text) =>
      editor.addToClassMethod(sf, text, {
        className: actor.className,
        methodName: "onInitialize",
        methodSignature: "override onInitialize(engine: Engine): void",
        statements: [`this.graphics.use(${animConst});`],
        imports: [{ specifier, name: animConst }],
        methodImports: [{ specifier: "excalibur", name: "Engine" }],
      })
  );
  if (out !== null) {
    writes.push([actorFile, out]);
    report.modified.push({
      path: rel(project, actorFile),
      snippet: `this.graphics.use(${animConst}) in ${actor.className}.onInitialize`,
    });
  }
}

/**
 * Add an ImageSource to Resources (unless reusing an existing key), a
 * SpriteSheet const after the Resources literal, and optional Animation
 * consts after that — all in resources.ts. Optionally wires one animation
 * into an actor's onInitialize.
 */
export async function applySpriteSheet(model: SpriteSheetModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();
  const sheetConst = `${model.name}SpriteSheet`;
  const animations = model.animations ?? [];
  const sheet = emitSpriteSheetConst(model);
  const animEmits = animations.map((a) => emitAnimationConst({ ...a, sheetName: sheetConst }));
  const resource = model.image.reuseExisting
    ? null
    : emitResourceExpr({
        resourceClass: "ImageSource",
        assetPath: model.image.assetPath ?? "",
        pixelFiltering: model.image.pixelFiltering,
      });

  const manualSnippet = [
    ...(resource ? [`// in the Resources literal:`, `${model.image.key}: ${resource.expr},`, ``] : []),
    `// after the Resources literal:`,
    sheet.text,
    ...animEmits.flatMap((a) => ["", a.text]),
  ].join("\n");

  if (!project.viteShaped && resource) {
    report.warnings.push(
      "this project does not look like the vite template — resource paths may need adjusting"
    );
    report.manual.push({ title: "Add the spritesheet yourself", snippet: manualSnippet });
    return report;
  }

  // Root resources.ts (create it if missing) — same guards as applyResource.
  let resourcesFile = project.resourcesFile;
  let baseText: string;
  let creating = false;
  if (!resourcesFile) {
    resourcesFile = path.join(project.srcDir, "resources.ts");
    if (fs.existsSync(resourcesFile)) {
      throw new GenerateError("src/resources.ts exists but has no `Resources` object literal", {
        hint: "add the entries manually or restructure resources.ts like the template.",
      });
    }
    if (model.image.reuseExisting) {
      throw new GenerateError("no Resources literal found to reuse an image from", {
        hint: "pass an assetPath instead so the ImageSource can be created.",
      });
    }
    baseText = emitResourcesFile();
    creating = true;
  } else {
    baseText = fs.readFileSync(resourcesFile, "utf8");
  }

  // Pre-flight duplicate checks before any edit is built.
  const editor = createTsEditor(project.ts);
  const sf0 = editor.parse(resourcesFile, baseText);
  if (editor.findVariableStatement(sf0, sheetConst)) {
    throw new GenerateError(`${sheetConst} already exists in ${rel(project, resourcesFile)}`, {
      hint: "pick a different spritesheet name.",
    });
  }
  for (const a of animations) {
    if (editor.findVariableStatement(sf0, `${a.name}Animation`)) {
      throw new GenerateError(`${a.name}Animation already exists in ${rel(project, resourcesFile)}`, {
        hint: "pick a different animation name.",
      });
    }
  }

  const builds: Build[] = [];
  if (resource) {
    builds.push((ed, sf, text) =>
      ed.addResource(sf, text, {
        key: model.image.key,
        expr: resource.expr,
        excaliburImports: resource.excaliburImports,
      })
    );
  }
  const appendConst = (anchorName: string, emitted: { text: string; excaliburImports: string[] }): Build => (ed, sf, text) => {
    const anchor = ed.findVariableStatement(sf, anchorName);
    if (!anchor) throw new SeamNotFoundError(`no \`${anchorName}\` declaration found`);
    const edits: Edit[] = [ed.insertStatementAfter(sf, text, anchor, emitted.text)];
    if (ed.excaliburBinding(sf)?.kind !== "namespace") {
      for (const name of emitted.excaliburImports) {
        const imp = ed.ensureNamedImport(sf, text, "excalibur", name);
        if (imp) edits.push(imp);
      }
    }
    return { edits };
  };
  builds.push(appendConst("Resources", sheet));
  let prevConst = sheetConst;
  for (let i = 0; i < animEmits.length; i++) {
    builds.push(appendConst(prevConst, animEmits[i]));
    prevConst = `${animations[i].name}Animation`;
  }

  const out = spliceText(
    project,
    report,
    resourcesFile,
    baseText,
    { title: "Could not edit resources.ts automatically", snippet: manualSnippet },
    ...builds
  );

  const writes: Write[] = [];
  if (out !== null) {
    writes.push([resourcesFile, out]);
    const parts: string[] = [
      ...(resource ? [`Resources.${model.image.key}`] : []),
      sheetConst,
      ...(animations.length ? [`${animations.length} animation${animations.length === 1 ? "" : "s"}`] : []),
    ];
    if (creating) report.created.push(rel(project, resourcesFile));
    else report.modified.push({ path: rel(project, resourcesFile), snippet: parts.join(" + ") });
    report.hints.push(`sprites: ${sheetConst}.getSprite(0, 0)`);

    if (model.wire) {
      wireAnimationToActor(project, report, writes, {
        actor: model.wire.actor,
        animConst: `${model.wire.animationName}Animation`,
        fromFile: resourcesFile,
      });
    } else if (animations.length) {
      report.hints.push(`use an animation in an actor: this.graphics.use(${animations[0].name}Animation);`);
    }
  }

  await commit(project, report, opts, writes);
  return report;
}

/**
 * Add an Animation const after an existing SpriteSheet const, optionally
 * wiring it into an actor's onInitialize.
 */
export async function applyAnimation(model: AnimationModel, project: Project, opts: ApplyOptions = {}): Promise<GenerateReport> {
  const report = newReport();
  const animConst = `${model.name}Animation`;
  const emitted = emitAnimationConst({
    name: model.name,
    sheetName: model.sheet.name,
    frames: model.frames,
    strategy: model.strategy,
  });
  const file = model.sheet.file;

  const editor = createTsEditor(project.ts);
  const baseText = fs.readFileSync(file, "utf8");
  const sf0 = editor.parse(file, baseText);
  if (!editor.findVariableStatement(sf0, model.sheet.name)) {
    throw new GenerateError(`${model.sheet.name} not found in ${rel(project, file)}`, {
      hint: "create the spritesheet first with `ex generate spritesheet`.",
    });
  }
  if (editor.findVariableStatement(sf0, animConst)) {
    throw new GenerateError(`${animConst} already exists in ${rel(project, file)}`, {
      hint: "pick a different animation name.",
    });
  }

  const out = trySplice(
    project,
    report,
    file,
    { title: "Could not add the animation automatically", snippet: emitted.text },
    (ed, sf, text) => {
      const anchor = ed.findVariableStatement(sf, model.sheet.name);
      if (!anchor) throw new SeamNotFoundError(`no \`${model.sheet.name}\` declaration found`);
      const edits = [ed.insertStatementAfter(sf, text, anchor, emitted.text)];
      if (ed.excaliburBinding(sf)?.kind !== "namespace") {
        for (const name of emitted.excaliburImports) {
          const imp = ed.ensureNamedImport(sf, text, "excalibur", name);
          if (imp) edits.push(imp);
        }
      }
      return { edits };
    }
  );

  const writes: Write[] = [];
  if (out !== null) {
    writes.push([file, out]);
    report.modified.push({
      path: rel(project, file),
      snippet: `${animConst} (${model.frames.length} frame${model.frames.length === 1 ? "" : "s"}, ${model.strategy})`,
    });
    if (model.targetActor) {
      wireAnimationToActor(project, report, writes, {
        actor: model.targetActor,
        animConst,
        fromFile: file,
      });
    } else {
      report.hints.push(`use it in an actor: this.graphics.use(${animConst});`);
    }
  }

  await commit(project, report, opts, writes);
  return report;
}
