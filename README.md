# create-excalibur

## Scaffolding for ExcaliburJS projects

With NPM:
```
npx create-excalibur@latest
```

![example running create excalibur](./create-excalibur.gif)

## The `ex` CLI

Installing the package globally also gives you the `ex` command:

```
npm i -g create-excalibur   # installs `ex` (and an `excalibur` alias)
ex            # interactive menu (same as create-excalibur)
ex create     # scaffold a game from a template
ex sample     # scaffold a sample project
ex inspect    # download a showcase game
ex docs       # search the Excalibur docs & API
ex generate   # generate an actor, label, scene, resource, engine settings, material, spritesheet, or animation — or update an actor's options (alias: ex g)
ex doctor     # type-aware diagnostics: actors never added to a scene, unnamed actors
ex upgrade    # migrate your game to a newer Excalibur version, codemod-style (alias: ex up)
ex mcp        # MCP server over stdio (docs + codegen tools for AI agents)
```

### `ex docs` — search the docs from your terminal

```
ex docs                         # type-as-you-search prompt
ex docs actor collision         # search, pick a result, read it in the terminal
ex docs Vector.distance -1      # open the top result immediately (no picker)
ex docs actor collision --list  # just print the matches + links (pipe friendly)
ex docs vector --json           # machine-readable results
ex docs --help                  # all options
```

Search is powered by the excaliburjs.com DocSearch (Algolia) index. Pages are rendered as
markdown in the terminal with links back to the online docs; long pages open in `$PAGER`/`less`.

**Version aware:** when run inside a project, `ex docs` detects the installed `excalibur`
version (from `node_modules` or `package.json`) and renders pages from that release's docs
(`--ref v0.32.0` to override; `--ref main` for the latest).

**Offline:**

```
ex docs offline            # download the docs for your Excalibur version (~1 MB) + plugin READMEs + build a local index
ex docs actor --offline    # search the downloaded docs only
ex docs offline --status   # what's cached and where (~/.excalibur/docs, or $EXCALIBUR_HOME)
ex docs offline --clear    # remove the cache
```

When the network is unavailable, `ex docs` falls back to the offline index automatically.

**Plugins:** `ex docs offline` also indexes the `@excaliburjs/plugin-*` READMEs (Tiled, Aseprite,
LDtk, perlin, …) from npm, so plugin usage is searchable too — filter with `--kind plugin`.

### `ex doctor` — check your game for common mistakes

```bash
ex doctor           # human-readable report, exits 1 when problems are found
ex doctor --json    # machine-readable findings (CI friendly)
```

Type-aware diagnostics powered by your project's own TypeScript and excalibur's type
declarations (run `npm install` first). Twelve rules, each grounded in bugs found in shipped
games: `actor-not-added`, `unnamed-actor`, `dont-shadow-excalibur-internals` (a field like
`isActive` on an Entity subclass shadows engine state and silently kills the entity — with a
tip to set `"noImplicitOverride": true`), `leaked-subscription` (`.on()` to an engine-lifetime
emitter with no cleanup — handlers compound across scene restarts), `dead-collision-hooks`
(collision handlers while the Engine has `physics: false`), `dont-mutate-shared-graphics`
(writes to cached `getAnimation()` results — `.clone()` first), `unknown-scene-key`
(`goToScene` typos checked against the `scenes:` map), `dont-call-lifecycle-hooks`,
`camera-pos-aliasing` (`camera.pos = actor.pos` writes through to the live vector),
`no-reserved-tags` (engine-owned `ex.*` tags), `no-reserved-uniforms` (a Material/ScreenShader
source declares a built-in like `u_time_ms` or `v_uv` with a conflicting GLSL type — the engine
sets it by name at draw time, so it silently reads as zeros or fails to link), and
`prefer-seeded-random` (`Math.random()`,
unseeded `new Random()`, and duplicate seeds that correlate streams). Run `ex doctor --help`
for the list. Only `.ts` files under `src/` are checked.

Ignore a finding case-by-case with eslint-style comments — after a report, an interactive
prompt offers to insert them for you:

```ts
// ex-doctor-ignore-next-line actor-not-added
new OffscreenHelper();
new Cursor(); // ex-doctor-ignore-line unnamed-actor
```

Omit the rule list to ignore every rule on that line.

### `ex upgrade` — codemod-style version migrations

```bash
ex upgrade --dry-run       # preview the full migration plan, write nothing
ex upgrade                 # plan preview + one confirm, then apply + bump package.json
ex upgrade --to next       # target v1 (the `next` prerelease); default is latest
ex upgrade --migrate-only  # rewrite code but leave package.json alone
```

Chained migrations (v0.29.3 onward, ng-update style) rewrite your source with
formatting-preserving splices, classified against your project's *installed* excalibur types —
so run it **before** installing the new version. Automated: `ex.Input.*` flattening, event
`.delta` → `.elapsed`, `goto` → `goToScene`, `Vector.size` → `magnitude`,
`EventDispatcher` → `EventEmitter`, antialiasing accessors, `easeTo/easeBy` → `moveTo/moveBy`,
Particle option renames, shader `v_texcoord` → `v_uv`, TileMap `compositeStrategy` pinning, and
more. Changes that need human judgment (collision events now yield `Collider`, the v1
screen-space rooting change) get `// ex-upgrade(<id>): …` comments inserted at each site with a
link and recipe. Requires a clean git tree (your undo) unless `--allow-dirty`; never runs
`npm install` for you.

### `ex mcp` — MCP server for AI agents

Exposes the CLI's capabilities as [Model Context Protocol](https://modelcontextprotocol.io) tools
over stdio, so agents like Claude Code and OpenCode can search the Excalibur docs, scaffold
projects, and generate code in your project.

Claude Code (add `-s user` to register it globally instead of per-project):

```
claude mcp add excalibur -- npx -y create-excalibur mcp
```

OpenCode — add to `opencode.json` in your project (or `~/.config/opencode/opencode.json`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "excalibur": {
      "type": "local",
      "command": ["npx", "-y", "create-excalibur", "mcp"],
      "enabled": true
    }
  }
}
```

```
ex mcp                      # serve, tools operate on the current directory by default
ex mcp --project <dir>      # point the tools at a specific project
ex mcp --help
```

Tools: `docs_search`, `docs_get_page`, `docs_sync`, `analyze_project`, `generate_actor`,
`generate_label`, `generate_scene`, `generate_resource`, `generate_material`, `generate_spritesheet`, `generate_animation`, `update_actor`,
`update_engine`, `list_templates`, `create_project`, `doctor`, `upgrade`. Docs tools also cover the `@excaliburjs/plugin-*` READMEs
(`kind: "plugin"`, `/plugins/<name>` slugs), and `analyze_project` reports installed plugins. Generation tools accept `dryRun` for previews; `create_project` skips
`npm install`/`git init` unless asked. Errors come back with actionable hints so agents can
self-correct.

> Note: `ex` shadows the rarely-used system `ex` (vi's line-editor mode) while the
> npm global bin dir is first on your PATH. Use the `excalibur` alias if that bothers you.

## Architecture

How the pieces fit together. Everything is TypeScript ESM; each command is a "flow"
registered in `src/constants.ts` and dispatched from `index.ts`. Development runs the
sources directly (Node's type stripping — no build step in the dev loop); publishing
compiles to `dist/` via `tsc`, which is what the bins run on end-user machines.

### Command dispatch

Both bins point at the compiled `dist/index.js`. Dispatch is persona-aware: the create persona treats a bare
positional as a project name, while `ex`/`excalibur` stay strict so a typo never scaffolds.

```mermaid
flowchart LR
    A["npm create excalibur my-game"] --> D
    B["create-excalibur bin"] --> D
    C["ex / excalibur bins"] --> D
    D["resolveInvocation<br/>src/dispatch.ts"]
    D -->|"no args"| MENU["interactive menu<br/>FLOW_CHOICES"]
    D -->|"known command"| FLOWS["FLOWS lookup<br/>src/constants.ts"]
    D -->|"create persona + positional"| CREATE["create flow<br/>name pre-filled"]
    D -->|"ex persona + unknown"| ERR["error: unknown command"]
    MENU --> FLOWS
    FLOWS --> F1["create / sample / inspect"]
    FLOWS --> F2["docs"]
    FLOWS --> F3["generate"]
    FLOWS --> F4["doctor"]
    FLOWS --> F5["mcp<br/>dynamic import, stdout = protocol only"]
    F5 -.->|"16 tools reuse the same cores:<br/>search, apply, doctor, scaffold"| F2
```

### `ex docs` — search and the offline index

Searches hit the site's Algolia index first and fall back to a locally built index; `ex docs
offline` builds that index straight from the Excalibur repo's docs source, pinned to your
installed version.

```mermaid
flowchart TD
    Q["ex docs query"] --> RS["runDocsSearch<br/>src/docs/search.ts"]
    RS -->|"online"| ALG["Algolia DocSearch<br/>public search-only key"]
    RS -->|"--offline"| LOCAL["MiniSearch index<br/>one doc per page section"]
    ALG -->|"network error"| LOCAL
    ALG --> MERGE["merge plugin README hits<br/>up to 3 tail slots"]
    LOCAL --> MERGE
    MERGE --> RENDER["markdown to ANSI renderer<br/>pager for long pages"]

    subgraph SYNC["ex docs offline — sync and indexing"]
        V["detect installed excalibur<br/>node_modules or package.json"] --> REF["pick ref: release tag v0.32.0<br/>or main for old/no version"]
        REF --> TREE["GitHub trees API, one call<br/>list site/docs/**"]
        TREE --> RAW["fetch raw files by commit sha<br/>raw.githubusercontent.com"]
        RAW --> MDX["mdx.ts: frontmatter slugs, admonitions,<br/>playground embeds, wiki links"]
        MDX --> IDX["cache ~/.excalibur/docs/ref:<br/>index.json + slugs.json + manifest"]
        NPM["npm registry:<br/>@excaliburjs/plugin-* readmes"] --> PIDX["plugin index<br/>sibling plugins/ cache"]
        ALG2["Algolia symbol sweep"] --> SYM["api-symbols.json<br/>resolves wiki links"]
    end
    IDX --> LOCAL
    PIDX --> MERGE
```

### `ex generate` — what it looks for in your TypeScript

Generation is a wizard/apply split: the wizard only builds an option model, and `apply*()` does
the edits. Edits are minimal text splices validated by re-parsing — never a full AST reprint, so
your formatting and comments survive. It uses **your project's own TypeScript** (never bundled;
TypeScript 7 removed the compiler API, so it asks for 5.x/6.x).

```mermaid
flowchart TD
    G["ex generate actor / label / scene / resource /<br/>engine / material / update-actor / spritesheet / animation"] --> AP["analyzeProject"]
    AP --> TSL["load the project's TypeScript<br/>from its node_modules"]
    AP --> SCAN
    subgraph SCAN["syntactic AST scan of src/**/*.ts"]
        S1["new Engine and its<br/>scenes map keys"]
        S2["Resources literal:<br/>keys + asset paths"]
        S3["classes extending Scene"]
        S4["classes extending<br/>Actor / Label / ScreenElement"]
        S5["SpriteSheet consts:<br/>grid, spacing, image key"]
        S6["package.json:<br/>@excaliburjs/* plugins"]
    end
    SCAN --> W["wizard prompts<br/>build an option model"]
    W --> APPLY["apply: minimal text splices<br/>insert option property, add import,<br/>add to a scene's onInitialize"]
    APPLY --> VAL["re-parse: zero syntax errors<br/>or the edit is abandoned"]
    VAL -->|"ok"| WRITE["write files"]
    VAL -->|"seam not found"| MANUAL["print a manual snippet<br/>instead of guessing"]
```

### `ex doctor` — type-aware diagnostics

Doctor is the one place a full `ts.Program` + TypeChecker is used (generate stays syntactic):
the checker is what catches `class Boss extends Monster extends Actor`. Rules are kind-keyed
listeners over a single AST walk per file, the same shape typescript-eslint uses.

```mermaid
flowchart LR
    D["ex doctor --json"] --> AP["analyzeProject"]
    AP --> PROG["ts.createProgram + TypeChecker<br/>tsconfig.json or vite-flavored defaults"]
    PROG --> PROBE["probe: excalibur .d.ts resolvable?<br/>no: run npm install"]
    PROBE --> WALK["one AST walk per src file<br/>dispatch to rule listeners"]
    WALK --> R1["actor-not-added:<br/>Actor-derived new never traced<br/>to add or addChild"]
    WALK --> R2["unnamed-actor:<br/>super options or new Actor<br/>without a name"]
    R1 --> OUT["findings: rule, file:line, message, hint<br/>exit 1 when any are found"]
    R2 --> OUT
```

## Running this project locally

Run `npm run dev`, or `node index.ts docs <query>` (Node 22.18+/24 — the dev loop runs
the TypeScript sources directly via type stripping; end users only ever run compiled JS).

Tests: `npm test` · Typecheck: `npm run typecheck` · Build: `npm run build` ·
Publish smoke test: `npm run smoke:pack`
