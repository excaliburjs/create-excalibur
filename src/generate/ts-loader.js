import { createRequire } from "node:module";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { GenerateError } from "./errors.js";

/**
 * Load the TypeScript compiler API from the *target project's* node_modules.
 * We deliberately do not bundle typescript with create-excalibur — the
 * project's own copy is version-matched and already installed by every
 * official template.
 *
 * Only the syntactic API is used (createSourceFile + AST walking); no
 * Program / type checker, so any TypeScript 4/5/6 works.
 *
 * @param {string} projectDir absolute path of the directory containing package.json
 * @returns {Promise<object>} the `ts` module namespace
 */
export async function loadTypescript(projectDir) {
  let resolved;
  try {
    const require = createRequire(path.join(projectDir, "package.json"));
    resolved = require.resolve("typescript");
  } catch (cause) {
    throw new GenerateError("TypeScript compiler not found in your project", {
      hint: "ex generate uses your project's own TypeScript to edit files safely — run `npm install` first.",
      cause,
    });
  }
  const mod = await import(pathToFileURL(resolved).href);
  const ts = mod.default ?? mod;
  if (typeof ts.createSourceFile !== "function") {
    throw new GenerateError(
      `Your project's TypeScript (${ts.version ?? "unknown version"}) does not expose the compiler API`,
      {
        hint: "TypeScript 7+ removed the JS compiler API that ex generate relies on. Install typescript 5.x or 6.x as a devDependency (e.g. `npm i -D typescript@6`).",
      }
    );
  }
  return ts;
}
