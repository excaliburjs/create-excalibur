import * as fs from "node:fs";
import * as path from "node:path";
import { writeFileAtomic } from "../docs/cache.js";
import { createTsEditor } from "./ts-edit.js";
import { GenerateError, SeamNotFoundError } from "./errors.js";
import { toCamelCase } from "./names.js";
import { relativeSpecifier } from "./project.js";
import {
  emitActorFile,
  emitMaterialFile,
  materialNames,
  emitLabelFile,
  emitSceneFile,
  emitResourcesFile,
  emitResourceExpr,
  emitMainFile,
  engineOptionEntries,
} from "./emit.js";

function newReport() {
  return { created: [], modified: [], manual: [], warnings: [], hints: [] };
}

function rel(project, file) {
  return path.relative(project.projectDir, file);
}

function checkTargetFree(targetFile, project, { force }) {
  if (fs.existsSync(targetFile) && !force) {
    throw new GenerateError(`${rel(project, targetFile)} already exists`, {
      hint: "pass --force to overwrite it.",
    });
  }
}

/**
 * Build a splice against `file`, validating the result. On SeamNotFoundError
 * (or a splice that no longer parses) returns null and records a manual entry.
 */
function trySplice(project, report, file, manualFallback, build) {
  const editor = createTsEditor(project.ts);
  const text = fs.readFileSync(file, "utf8");
  const sf = editor.parse(file, text);
  let edits;
  try {
    ({ edits } = build(editor, sf, text));
  } catch (error) {
    if (error instanceof SeamNotFoundError) {
      report.manual.push({ title: `${manualFallback.title} (${error.message})`, snippet: manualFallback.snippet });
      return null;
    }
    throw error;
  }
  const out = editor.applyEdits(text, edits);
  if (editor.validate(file, out).length > 0) {
    report.manual.push({
      title: `${manualFallback.title} (the edit did not parse cleanly — left ${rel(project, file)} untouched)`,
      snippet: manualFallback.snippet,
    });
    return null;
  }
  return out;
}

async function commit(project, report, { dryRun }, files) {
  for (const [file, contents] of files) {
    if (!dryRun) await writeFileAtomic(file, contents);
  }
}

/** Unique local variable name inside a file's text. */
function uniqueVar(base, text) {
  let name = base;
  let i = 2;
  while (new RegExp(`\\b${name}\\b`).test(text)) name = `${base}${i++}`;
  return name;
}

function addToSceneSnippet(model, varName) {
  return [
    `import { ${model.className} } from "./${model.fileName.replace(/\.ts$/, "")}";`,
    `// inside your scene's onInitialize:`,
    `const ${varName} = new ${model.className}();`,
    `this.add(${varName});`,
  ].join("\n");
}

/** Shared by actor + label: create the class file and wire it into a scene. */
async function applyEntity(model, project, opts, emitFile) {
  const report = newReport();
  const targetFile = path.join(project.srcDir, model.fileName);
  checkTargetFree(targetFile, project, opts);

  const fileText = emitFile();
  const writes = [[targetFile, fileText]];
  report.created.push(rel(project, targetFile));

  if (model.targetScene) {
    const sceneFile = model.targetScene.file;
    const sceneText = fs.readFileSync(sceneFile, "utf8");
    const varName = uniqueVar(toCamelCase(model.className), sceneText);
    const out = trySplice(
      project,
      report,
      sceneFile,
      {
        title: `Could not add ${model.className} to ${model.targetScene.className} automatically`,
        snippet: addToSceneSnippet(model, varName),
      },
      (editor, sf, text) =>
        editor.addToClassMethod(sf, text, {
          className: model.targetScene.className,
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
        snippet: `this.add(new ${model.className}()) in ${model.targetScene.className}.onInitialize`,
      });
    }
  } else {
    report.hints.push(`add it to a scene with: const a = new ${model.className}(); scene.add(a);`);
  }

  await commit(project, report, opts, writes);
  return report;
}

export async function applyActor(model, project, opts = {}) {
  const targetFile = path.join(project.srcDir, model.fileName);
  const resourcesSpecifier = project.resourcesFile
    ? relativeSpecifier(targetFile, project.resourcesFile)
    : "./resources";
  return applyEntity(model, project, opts, () => emitActorFile(model, { resourcesSpecifier }));
}

export async function applyLabel(model, project, opts = {}) {
  return applyEntity(model, project, opts, () => emitLabelFile(model));
}

export async function applyMaterial(model, project, opts = {}) {
  const report = newReport();
  const targetFile = path.join(project.srcDir, model.fileName);
  checkTargetFree(targetFile, project, opts);
  const names = materialNames(model.className);

  const writes = [[targetFile, emitMaterialFile(model)]];
  report.created.push(rel(project, targetFile));

  if (model.targetActor) {
    const actorFile = model.targetActor.file;
    const assign = (engineRef) => `this.graphics.material = ${names.factoryName}(${engineRef});`;
    const out = trySplice(
      project,
      report,
      actorFile,
      {
        title: `Could not assign the material in ${model.targetActor.className} automatically`,
        snippet: [
          `import { ${names.factoryName} } from "./${model.fileName.replace(/\.ts$/, "")}";`,
          `// inside ${model.targetActor.className}'s onInitialize(engine: Engine):`,
          assign("engine"),
        ].join("\n"),
      },
      (editor, sf, text) => {
        const ts = project.ts;
        const cls = sf.statements.find(
          (st) => ts.isClassDeclaration(st) && st.name?.text === model.targetActor.className
        );
        if (!cls) throw new SeamNotFoundError(`class "${model.targetActor.className}" not found`);
        const method = cls.members.find(
          (m) => ts.isMethodDeclaration(m) && ts.isIdentifier(m.name) && m.name.text === "onInitialize" && m.body
        );

        // The material factory needs the engine. Reuse an existing parameter,
        // or add one when the method declares none (fewer params is a legal override).
        const binding = editor.excaliburBinding(sf);
        const engineType = editor.localRef(binding, "Engine");
        let engineRef = "engine";
        const preEdits = [];
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
          className: model.targetActor.className,
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
        snippet: `this.graphics.material = ${names.factoryName}(…) in ${model.targetActor.className}.onInitialize`,
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

export async function applyScene(model, project, opts = {}) {
  const report = newReport();
  const targetFile = path.join(project.srcDir, model.fileName);
  checkTargetFree(targetFile, project, opts);

  const writes = [[targetFile, emitSceneFile(model)]];
  report.created.push(rel(project, targetFile));

  if (model.register && project.mainFile) {
    const out = trySplice(
      project,
      report,
      project.mainFile,
      {
        title: `Could not register ${model.className} in the engine automatically`,
        snippet: [
          `import { ${model.className} } from "${relativeSpecifier(project.mainFile, targetFile)}";`,
          `// inside new Engine({ ... }):`,
          `scenes: { ${model.key}: ${model.className} }`,
        ].join("\n"),
      },
      (editor, sf, text) =>
        editor.addSceneToEngine(sf, text, {
          key: model.key,
          className: model.className,
          specifier: relativeSpecifier(project.mainFile, targetFile),
        })
    );
    if (out !== null) {
      writes.push([project.mainFile, out]);
      report.modified.push({
        path: rel(project, project.mainFile),
        snippet: `scenes: { ${model.key}: ${model.className} }`,
      });
      report.hints.push(`switch to it with: game.goToScene("${model.key}")`);
    }
  } else if (model.register && !project.mainFile) {
    report.warnings.push("no engine found to register the scene in — try `ex generate engine`");
  }

  await commit(project, report, opts, writes);
  return report;
}

export async function applyResource(model, project, opts = {}) {
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

  if (model.target?.scene) {
    // Scene-scoped: declare the resource in the scene file + load it in onPreLoad
    // (keeping it out of the root Resources literal, which the boot loader loads eagerly).
    const sceneFile = model.target.scene.file;
    const sceneText = fs.readFileSync(sceneFile, "utf8");
    const varName = uniqueVar(toCamelCase(model.key), sceneText);
    const manual = {
      title: `Could not wire the resource into ${model.target.scene.className} automatically`,
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
        className: model.target.scene.className,
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
        snippet: `${varName} loaded in ${model.target.scene.className}.onPreLoad`,
      });
    }
    return report;
  }

  // Root resources.ts (create it if missing)
  let resourcesFile = project.resourcesFile;
  let baseText;
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

export async function applyEngine(model, project, opts = {}) {
  const report = newReport();

  if (project.mainFile) {
    const { entries, imports } = engineOptionEntries(model.options);
    const manualSnippet = entries.map((e) => `${e.name}: ${e.expr},`).join("\n");
    const out = trySplice(
      project,
      report,
      project.mainFile,
      { title: "Could not edit the engine options automatically", snippet: manualSnippet },
      (editor, sf, text) => {
        const engine = editor.findEngineNews(sf)[0];
        if (!engine) throw new SeamNotFoundError("no `new Engine(...)` found");
        const optsLit = editor.engineOptionsLiteral(sf, engine);
        const edits = [];
        for (const name of model.remove ?? []) {
          const e = editor.removeObjectProperty(sf, text, optsLit, name);
          if (e) edits.push(e);
        }
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
      await commit(project, report, opts, [[project.mainFile, out]]);
      report.modified.push({
        path: rel(project, project.mainFile),
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
