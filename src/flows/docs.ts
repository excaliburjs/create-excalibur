import { confirm, search, select } from "@inquirer/prompts";
import { getChalk, setColorLevel, success, terminal, textBlue, textGray, textMagenta, textYellow } from "../console.ts";
import { DOCS_USAGE, parseDocsArgs } from "../docs/args.ts";
import { HIGHLIGHT_POST, HIGHLIGHT_PRE, plainSnippet } from "../docs/algolia.ts";
import { cachedRefs, clearCache, docsCacheRoot, hasIndex } from "../docs/cache.ts";
import { DocsError, DocsNotFoundError } from "../docs/errors.ts";
import { syncApiSymbols, syncDocs } from "../docs/fetch-docs.ts";
import { loadPage, pageSectionMarkdown } from "../docs/page.ts";
import { loadPluginPage, readPluginsManifest, syncPlugins } from "../docs/plugins.ts";
import { runDocsSearch } from "../docs/search.ts";
import { printPaged } from "../docs/pager.ts";
import { renderMarkdown, stripAnsi, supportsHyperlinks, hyperlink } from "../docs/render.ts";
import { detectExcaliburVersion, refForVersion, type ExcaliburVersion } from "../docs/version.ts";
import type { ChalkInstance } from "chalk";
import type { DocsArgs } from "../docs/args.ts";
import type { LocalHit } from "../docs/local-index.ts";
import type { DocsPage } from "../docs/page.ts";

interface DocsCtx {
  args: DocsArgs;
  ref: string;
  detected: ExcaliburVersion;
}

/**
 * `ex docs` entry point. `argv` is everything after `docs`.
 */
export async function searchDocs(argv: string[] = []): Promise<void> {
  const args = parseDocsArgs(argv);
  if (args.noColor) setColorLevel(0);
  if (args.help) {
    process.stdout.write(DOCS_USAGE);
    return;
  }

  const detected = detectExcaliburVersion();
  const ref = args.ref ?? refForVersion(detected.version);
  const ctx: DocsCtx = { args, ref, detected };

  try {
    if (args.subcommand === "offline") {
      await offlineCommand(ctx);
      return;
    }
    await searchCommand(ctx);
  } catch (error) {
    if (error instanceof DocsError) {
      reportDocsError(error);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// offline
// ---------------------------------------------------------------------------
async function offlineCommand({ args, ref, detected }: DocsCtx): Promise<void> {
  if (args.status) {
    printStatus();
    return;
  }
  if (args.clear) {
    const refs = cachedRefs();
    if (refs.length === 0) {
      terminal.print(textGray(`Nothing to clear (${docsCacheRoot()})`));
      return;
    }
    const ok = await confirm({
      message: `Delete the offline docs cache at ${docsCacheRoot()}?`,
      default: false,
    });
    if (!ok) return;
    await clearCache();
    terminal.print(success(" Offline docs removed. "));
    return;
  }

  printHeader({ ref, detected, mode: "sync" });
  const spinner = terminal.spinner(`Fetching docs file list for ${ref}…`);
  let result;
  try {
    result = await syncDocs(ref, {
      force: args.force,
      onProgress: (done, total) => {
        spinner.text = `Downloading docs (${done}/${total})…`;
      },
    });
    spinner.text = "Fetching API symbol map…";
    await syncApiSymbols().catch(() => null);
    spinner.text = "Fetching plugin READMEs…";
    const pluginsResult = await syncPlugins().catch(() => null);
    const pluginsNote = pluginsResult ? ` Plus ${pluginsResult.plugins} plugin READMEs.` : "";
    spinner.succeed(
      (result.fetched === 0
        ? `Docs for ${ref} already up to date (${result.pages} pages).`
        : `Downloaded ${result.fetched} file(s) — ${result.pages} pages indexed for ${ref}.`) + pluginsNote
    );
  } catch (error) {
    spinner.fail(`Couldn't download docs for ${ref}`);
    throw error;
  }
  terminal.blank();
  terminal.listItem({ text: "Location:", textRelevant: docsCacheRoot() });
  terminal.listItem({ text: "Search offline:", textRelevant: "ex docs <query> --offline" });
  terminal.blank();
}

function printStatus(): void {
  const refs = cachedRefs();
  terminal.blank();
  terminal.title("Offline docs", textMagenta);
  terminal.listItem({ text: "Location:", textRelevant: docsCacheRoot() });
  const pluginsManifest = readPluginsManifest();
  if (pluginsManifest) {
    const when = pluginsManifest.syncedAt ? new Date(pluginsManifest.syncedAt).toLocaleString() : "unknown";
    terminal.listItem({
      text: "plugins:",
      textRelevant: `${pluginsManifest.plugins?.length ?? 0} READMEs, synced ${when}`,
      colorRelevant: textBlue,
    });
  }
  if (refs.length === 0) {
    terminal.listItem({ text: "Downloaded:", textRelevant: "nothing yet — run `ex docs offline`", colorRelevant: textYellow });
    terminal.blank();
    return;
  }
  for (const entry of refs) {
    const m = entry.manifest;
    const when = m?.syncedAt ? new Date(m.syncedAt).toLocaleString() : "unknown";
    terminal.listItem({
      text: `${entry.ref}:`,
      textRelevant: m
        ? `${m.pages?.length ?? 0} pages, ${m.files?.length ?? 0} files, synced ${when}${entry.hasIndex ? "" : " (no index)"}`
        : "incomplete",
      colorRelevant: m && entry.hasIndex ? textBlue : textYellow,
    });
  }
  terminal.blank();
}

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------
async function searchCommand(ctx: DocsCtx): Promise<void> {
  const { args } = ctx;
  const interactive = process.stdout.isTTY && process.stdin.isTTY && !args.list && !args.json;

  if (!args.query && !interactive) {
    process.stdout.write(DOCS_USAGE);
    process.exitCode = 1;
    return;
  }

  if (!args.json) printHeader({ ...ctx, mode: args.offline ? "offline" : "live" });

  let hit: LocalHit | null | undefined;
  if (!args.query) {
    hit = await interactiveSearch(ctx);
  } else {
    const { hits, source } = await runSearch(ctx, args.query);
    if (args.json) {
      const plain = hits.map((h) => ({ ...h, snippet: plainSnippet(h.snippet) }));
      process.stdout.write(JSON.stringify({ query: args.query, ref: ctx.ref, source, hits: plain }, null, 2) + "\n");
      return;
    }
    if (hits.length === 0) {
      terminal.print(textYellow(`No results for "${args.query}"${source === "local" ? " in the offline docs" : ""}.`));
      if (args.first) process.exitCode = 1;
      return;
    }
    if (args.first) {
      hit = hits[0];
    } else if (!interactive) {
      printHitList(hits, source);
      return;
    } else {
      hit = await pickHit(hits, args.query, source);
    }
  }
  if (!hit) return;
  await showHit(ctx, hit);
}

/** Search live, falling back to the offline index when the network is unavailable. */
function runSearch({ args, ref }: DocsCtx, query: string, { signal }: { signal?: AbortSignal | null } = {}) {
  return runDocsSearch({ query, ref, limit: args.limit, kind: args.kind, offline: args.offline, signal });
}

async function interactiveSearch(ctx: DocsCtx): Promise<LocalHit | null> {
  const c = getChalk();
  const { args, ref } = ctx;
  if (args.offline && !hasIndex(ref)) {
    throw new DocsError(`No offline docs for ${ref}.`, { hint: `Run \`ex docs offline${ref !== "main" ? ` --ref ${ref}` : ""}\` first.` });
  }
  let fellBack = false;
  const choice = await search<LocalHit | null>({
    message: "Search the Excalibur docs:",
    pageSize: 12,
    source: async (term, { signal }) => {
      const q = (term ?? "").trim();
      if (q.length < 2) return [];
      let result;
      try {
        result = await runSearch(ctx, q, { signal });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return [];
        if (error instanceof DocsError) {
          // Surface the problem inside the prompt instead of crashing out of it.
          return [{ name: c.red(error.message), value: null, disabled: error.hint ? c.gray(error.hint) : true }];
        }
        throw error;
      }
      if (result.fallback && !fellBack) fellBack = true;
      return result.hits.map((hit) => ({
        name: formatHitLine(hit, c),
        value: hit,
        description: hit.snippet ? c.gray(truncate(decorateSnippet(hit.snippet, c), 160)) : undefined,
      }));
    },
  });
  if (fellBack) terminal.print(textYellow("  (network unavailable — showed offline results)"));
  return choice;
}

async function pickHit(hits: LocalHit[], query: string, source: string): Promise<LocalHit> {
  const c = getChalk();
  if (source === "local") terminal.print(textGray("  (offline results)"));
  return select({
    message: `Results for "${query}":`,
    pageSize: 12,
    choices: hits.map((hit) => ({
      name: formatHitLine(hit, c),
      value: hit,
      description: hit.snippet ? c.gray(truncate(decorateSnippet(hit.snippet, c), 160)) : undefined,
    })),
  });
}

function printHitList(hits: LocalHit[], source: string): void {
  const c = getChalk();
  const links = supportsHyperlinks();
  if (source === "local") terminal.print(textGray("  (offline results)"));
  hits.forEach((hit, i) => {
    const n = c.gray(`${String(i + 1).padStart(2)}.`);
    console.log(`${n} ${formatHitLine(hit, c)}`);
    if (hit.snippet) console.log(`    ${c.gray(truncate(decorateSnippet(hit.snippet, c), 140))}`);
    console.log(`    ${c.blue(links ? hyperlink(hit.url, hit.url) : hit.url)}`);
  });
  terminal.blank();
}

function formatHitLine(hit: LocalHit, c: ChalkInstance): string {
  const tag =
    hit.kind === "api" ? c.magenta("[API] ") : hit.kind === "plugin" ? c.cyan("[Plugin] ") : c.green("[Docs] ");
  const crumb = hit.breadcrumb ? c.gray(`  ${hit.breadcrumb}`) : "";
  return `${tag}${c.whiteBright(hit.title)}${crumb}`;
}

function decorateSnippet(snippet: string, c: ChalkInstance): string {
  const parts = snippet.split(HIGHLIGHT_PRE);
  return parts
    .map((part, i) => {
      if (i === 0) return part.split(HIGHLIGHT_POST).join("");
      const end = part.indexOf(HIGHLIGHT_POST);
      if (end === -1) return part;
      return c.bold(part.slice(0, end)) + part.slice(end + HIGHLIGHT_POST.length);
    })
    .join("");
}

function truncate(s: string, n: number): string {
  const plain = stripAnsi(s);
  return plain.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

// ---------------------------------------------------------------------------
// show a hit
// ---------------------------------------------------------------------------
async function showHit(ctx: DocsCtx, hit: LocalHit): Promise<void> {
  const { args, ref } = ctx;
  const c = getChalk();
  const links = supportsHyperlinks();
  const linkify = (url: string) => c.blue.underline(links ? hyperlink(url, url) : url);

  if ((hit.kind !== "docs" && hit.kind !== "plugin") || !hit.slug) {
    // API reference entry: we only have the indexed snippet; point at the typedoc page.
    const out = [
      "",
      ` ${c.magenta("[API]")} ${c.bold.whiteBright(hit.title)}${hit.breadcrumb ? c.gray(`  ${hit.breadcrumb}`) : ""}`,
      "",
      hit.snippet ? `   ${decorateSnippet(hit.snippet, c)}` : "",
      "",
      `   ${c.gray("Reference:")} ${linkify(hit.url)}`,
      `   ${c.gray("Tip:")} API pages are rendered from TypeDoc; open the link for signatures and members.`,
      "",
    ].join("\n");
    process.stdout.write(out);
    return;
  }

  const spinner = process.stdout.isTTY ? terminal.spinner("Loading page…") : null;
  let page: DocsPage;
  let pageRef = ref;
  try {
    try {
      page = hit.kind === "plugin" ? loadPluginPage(hit.slug) : await loadPage(ref, { slug: hit.slug, path: hit.path ?? null });
    } catch (error) {
      // The page may not exist at the project's version (or the tag has no docs) — fall back to main.
      if (error instanceof DocsNotFoundError && ref !== "main" && hit.source === "algolia") {
        pageRef = "main";
        page = await loadPage("main", { slug: hit.slug });
      } else {
        throw error;
      }
    }
    spinner?.stop();
  } catch (error) {
    spinner?.fail("Couldn't load the page");
    throw error;
  }
  if (pageRef !== ref) terminal.print(textYellow(`  (page not found at ${ref}; showing the latest version from main)`));

  const { markdown, partial } = pageSectionMarkdown(page, hit.anchor, { full: args.full });
  const width = args.width ?? Math.min(process.stdout.columns ?? 80, 100);
  const body = renderMarkdown(markdown, { width, hyperlinks: links });

  const crumb = [page.section, partial ? page.title : null].filter(Boolean).join(" › ");
  const header = [
    c.gray("─".repeat(Math.min(width, 65))),
    ` ${c.bold.whiteBright(partial ? hit.title : page.title)}${crumb ? c.gray(`  ${crumb}`) : ""}`,
    ` ${c.gray("Online:")} ${linkify(hit.anchor && partial ? `${page.url}#${hit.anchor}` : page.url)}   ${c.gray(hit.kind === "plugin" ? `plugin @ ${page.version ?? "latest"}` : `docs @ ${pageRef}`)}`,
    partial ? ` ${c.gray("Showing the matched section — add --full for the whole page")}` : "",
    c.gray("─".repeat(Math.min(width, 65))),
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const footer = `\n${c.gray("Read online:")} ${linkify(page.url)}\n`;
  await printPaged(`${header}\n${body}${footer}`, { noPager: args.noPager });
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------
function printHeader({ ref, detected, mode }: { ref: string; detected: ExcaliburVersion; mode: string }): void {
  const c = getChalk();
  const version = detected.version
    ? `Excalibur ${detected.version} ${c.gray(`(${detected.source})`)}`
    : detected.range
      ? `Excalibur ${detected.range} ${c.gray("(package.json, unresolved)")}`
      : c.gray("no Excalibur project detected");
  const modeLabel =
    mode === "live"
      ? c.green("live search") + c.gray(" · latest docs")
      : mode === "offline"
        ? c.yellow("offline search")
        : c.cyan("sync");
  terminal.blank();
  terminal.title(`${c.bold("Excalibur docs")}  ${c.gray("·")}  ${version}  ${c.gray("·")}  docs @ ${c.cyan(ref)}  ${c.gray("·")}  ${modeLabel}`, (t) => t);
  if (mode === "live" && detected.version && ref !== "main") {
    terminal.subtitle(c.gray(`Live results reflect the latest published docs; pages are rendered from ${ref}.`));
  }
  terminal.blank();
}

function reportDocsError(error: DocsError): void {
  terminal.blank();
  terminal.warning(" Error ");
  terminal.print(` ${error.message}`);
  if (error.hint) terminal.print(textGray(` ${error.hint}`));
  terminal.blank();
}
