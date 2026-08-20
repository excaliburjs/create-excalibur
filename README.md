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
ex docs offline            # download the docs for your Excalibur version (~1 MB) + build a local index
ex docs actor --offline    # search the downloaded docs only
ex docs offline --status   # what's cached and where (~/.excalibur/docs, or $EXCALIBUR_HOME)
ex docs offline --clear    # remove the cache
```

When the network is unavailable, `ex docs` falls back to the offline index automatically.

> Note: `ex` shadows the rarely-used system `ex` (vi's line-editor mode) while the
> npm global bin dir is first on your PATH. Use the `excalibur` alias if that bothers you.

## Running this project locally

Run `npm run dev`, or `node index.js docs <query>`.

Tests: `npm test`
