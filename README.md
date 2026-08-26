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

### `ex mcp` — MCP server for AI agents

Exposes the CLI's capabilities as [Model Context Protocol](https://modelcontextprotocol.io) tools
over stdio, so agents like Claude Code can search the Excalibur docs, scaffold projects, and
generate code in your project:

```
claude mcp add excalibur -- npx create-excalibur mcp
```

```
ex mcp                      # serve, tools operate on the current directory by default
ex mcp --project <dir>      # point the tools at a specific project
ex mcp --help
```

Tools: `docs_search`, `docs_get_page`, `docs_sync`, `analyze_project`, `generate_actor`,
`generate_label`, `generate_scene`, `generate_resource`, `generate_material`, `generate_spritesheet`, `generate_animation`, `update_actor`,
`update_engine`, `list_templates`, `create_project`. Docs tools also cover the `@excaliburjs/plugin-*` READMEs
(`kind: "plugin"`, `/plugins/<name>` slugs), and `analyze_project` reports installed plugins. Generation tools accept `dryRun` for previews; `create_project` skips
`npm install`/`git init` unless asked. Errors come back with actionable hints so agents can
self-correct.

> Note: `ex` shadows the rarely-used system `ex` (vi's line-editor mode) while the
> npm global bin dir is first on your PATH. Use the `excalibur` alias if that bothers you.

## Running this project locally

Run `npm run dev`, or `node index.js docs <query>`.

Tests: `npm test`
