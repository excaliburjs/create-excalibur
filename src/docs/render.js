import { marked } from "marked";
import { getChalk } from "../console.js";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------
const ANSI_RE = /[][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

export function stripAnsi(s) {
  return String(s).replace(ANSI_RE, "");
}

export function visibleWidth(s) {
  // Good enough for docs text: count code points, wide East Asian chars as 2.
  let w = 0;
  for (const ch of stripAnsi(s)) {
    const cp = ch.codePointAt(0);
    if (cp === 0x200b || (cp >= 0x300 && cp <= 0x36f)) continue; // zero-width / combining
    w += cp >= 0x1100 && isWide(cp) ? 2 : 1;
  }
  return w;
}
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1f64f) ||
    (cp >= 0x1f900 && cp <= 0x1f9ff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  );
}

/** Detect OSC-8 hyperlink support (subset of the `supports-hyperlinks` heuristics). */
export function supportsHyperlinks(stream = process.stdout, env = process.env) {
  if (env.FORCE_HYPERLINK) return !["0", "false"].includes(env.FORCE_HYPERLINK);
  if (!stream?.isTTY) return false;
  if (env.TERM === "dumb") return false;
  if (env.WT_SESSION || env.KONSOLE_VERSION || env.WEZTERM_EXECUTABLE || env.KITTY_WINDOW_ID) return true;
  if (env.TERM === "xterm-kitty" || env.TERM === "xterm-ghostty") return true;
  if (env.VTE_VERSION && Number(env.VTE_VERSION) >= 5000) return true;
  if (["iTerm.app", "WezTerm", "vscode", "Hyper", "ghostty", "Tabby", "rio"].includes(env.TERM_PROGRAM)) return true;
  return false;
}

export function hyperlink(text, url) {
  return `]8;;${url}${text}]8;;`;
}

// ---------------------------------------------------------------------------
// Word wrap (ANSI-aware)
// ---------------------------------------------------------------------------
export function wrap(text, width, { indent = "", firstIndent = indent } = {}) {
  const lines = [];
  for (const para of String(text).split("\n")) {
    const words = para.split(/ +/).filter((w) => w !== "");
    let line = "";
    let lineWidth = 0;
    let prefix = lines.length === 0 ? firstIndent : indent;
    let first = true;
    for (const word of words) {
      const ww = visibleWidth(word);
      const avail = width - visibleWidth(prefix);
      if (!first && lineWidth + 1 + ww > avail) {
        lines.push(prefix + line);
        prefix = indent;
        line = word;
        lineWidth = ww;
      } else {
        line = first ? word : `${line} ${word}`;
        lineWidth += first ? ww : 1 + ww;
        first = false;
      }
    }
    lines.push(prefix + line);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tiny syntax highlighter for code blocks (ts/js/json/sh/html/css)
// ---------------------------------------------------------------------------
const KEYWORDS = new Set(
  "abstract as async await break case catch class const constructor continue debugger declare default delete do else enum export extends false finally for from function get if implements import in instanceof interface let new null of package private protected public readonly return set static super switch this throw true try type typeof undefined var void while with yield".split(" ")
);
const CODE_TOKEN_RE = /(\/\/.*$|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/gm;

export function highlightCode(code, lang, c) {
  if (!c.level || !/^(ts|typescript|js|javascript|jsx|tsx|json|mjs|cjs)$/.test(lang ?? "")) {
    return code;
  }
  return code.replace(CODE_TOKEN_RE, (m, comment, str, num, ident) => {
    if (comment) return c.gray(m);
    if (str) return c.green(m);
    if (num) return c.yellow(m);
    if (ident) {
      if (KEYWORDS.has(ident)) return c.magenta(ident);
      if (/^[A-Z]/.test(ident)) return c.cyan(ident);
      return ident;
    }
    return m;
  });
}

// ---------------------------------------------------------------------------
// Markdown → ANSI
// ---------------------------------------------------------------------------
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
function unescapeEntities(s) {
  return String(s).replace(/&(#?\w+);/g, (m, name) => {
    if (name in ENTITIES) return ENTITIES[name];
    if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(parseInt(name.slice(1), 10));
    return m;
  });
}

/**
 * Render markdown to a terminal string.
 * @param {string} markdown
 * @param {{ width?: number, hyperlinks?: boolean, color?: boolean }} opts
 */
export function renderMarkdown(markdown, opts = {}) {
  const c = getChalk();
  const width = Math.max(40, Math.min(opts.width ?? process.stdout.columns ?? 80, 120));
  const links = opts.hyperlinks ?? supportsHyperlinks();
  const ctx = { c, width, links, footnotes: [], footnoteIndex: new Map() };
  const tokens = marked.lexer(markdown, { gfm: true });
  let out = renderBlocks(tokens, ctx, "");
  if (ctx.footnotes.length) {
    out += "\n\n" + c.gray("Links:") + "\n" + ctx.footnotes.map((href, i) => `  ${c.gray(`[${i + 1}]`)} ${c.blue(href)}`).join("\n");
  }
  return out.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "") + "\n";
}

function renderBlocks(tokens, ctx, indent) {
  const parts = [];
  for (const token of tokens) {
    const rendered = renderBlock(token, ctx, indent);
    if (rendered != null) parts.push(rendered);
  }
  return parts.join("\n");
}

function renderBlock(token, ctx, indent) {
  const { c, width } = ctx;
  const innerWidth = width - visibleWidth(indent);
  switch (token.type) {
    case "space":
      return null;
    case "heading": {
      const text = renderInline(token.tokens, ctx);
      let styled;
      if (token.depth === 1) styled = c.bold.whiteBright.underline(text);
      else if (token.depth === 2) styled = c.bold.yellow(text);
      else if (token.depth === 3) styled = c.bold.whiteBright(text);
      else styled = c.bold(text);
      const hashes = c.gray("#".repeat(token.depth)) + " ";
      return `\n${indent}${hashes}${styled}\n`;
    }
    case "paragraph":
      return wrap(renderInline(token.tokens, ctx), width, { indent }) + "\n";
    case "text":
      // loose list items / blockquote text
      return wrap(token.tokens ? renderInline(token.tokens, ctx) : unescapeEntities(token.text), width, { indent });
    case "code": {
      const lang = (token.lang ?? "").split(/\s+/)[0];
      const body = highlightCode(token.text, lang, c);
      const label = lang ? c.gray(`╭─ ${lang}`) : c.gray("╭─");
      const lines = body.split("\n").map((l) => `${indent}${c.gray("│")} ${l}`);
      return [`${indent}${label}`, ...lines, `${indent}${c.gray("╰─")}`, ""].join("\n");
    }
    case "blockquote": {
      const inner = renderBlocks(token.tokens, ctx, "").replace(/\n{3,}/g, "\n\n").trim();
      const bar = c.gray("┃ ");
      return inner
        .split("\n")
        .map((l) => `${indent}${bar}${l}`)
        .join("\n") + "\n";
    }
    case "list": {
      const lines = [];
      let n = typeof token.start === "number" ? token.start : 1;
      for (const item of token.items) {
        const bullet = token.ordered ? c.gray(`${n++}.`) + " " : c.gray("•") + " ";
        const sub = indent + " ".repeat(visibleWidth(bullet));
        let body;
        if (item.task) {
          body = (item.checked ? c.green("☑ ") : c.gray("☐ ")) + renderListItemBody(item, ctx, sub);
        } else {
          body = renderListItemBody(item, ctx, sub);
        }
        const [first, ...rest] = body.split("\n");
        lines.push(`${indent}${bullet}${first}`);
        for (const r of rest) lines.push(r === "" ? "" : r.startsWith(sub) ? r : `${sub}${r}`);
      }
      return lines.join("\n").replace(/\n+$/, "") + "\n";
    }
    case "table":
      return renderTable(token, ctx, indent) + "\n";
    case "hr":
      return `${indent}${c.gray("─".repeat(Math.min(innerWidth, 60)))}\n`;
    case "html": {
      const text = unescapeEntities(token.text.replace(/<[^>]+>/g, "")).trim();
      return text ? wrap(text, width, { indent }) + "\n" : "";
    }
    case "def":
      return "";
    default:
      if (token.tokens) return wrap(renderInline(token.tokens, ctx), width, { indent });
      return token.raw ? wrap(token.raw, width, { indent }) : "";
  }
}

function renderListItemBody(item, ctx, sub) {
  const parts = [];
  for (const t of item.tokens) {
    if (t.type === "text" || t.type === "paragraph") {
      const text = t.tokens ? renderInline(t.tokens, ctx) : unescapeEntities(t.text);
      parts.push(wrap(text, ctx.width, { indent: sub, firstIndent: "" }));
    } else if (t.type === "space") {
      continue;
    } else {
      const r = renderBlock(t, ctx, sub);
      if (r != null && r !== "") parts.push(r.replace(/\n+$/, ""));
    }
  }
  return parts.join("\n");
}

function renderTable(token, ctx, indent) {
  const { c } = ctx;
  const header = token.header.map((cell) => renderInline(cell.tokens, ctx));
  const rows = token.rows.map((row) => row.map((cell) => renderInline(cell.tokens, ctx)));
  const cols = header.length;
  const widths = Array.from({ length: cols }, (_, i) =>
    Math.max(visibleWidth(header[i] ?? ""), ...rows.map((r) => visibleWidth(r[i] ?? "")))
  );
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - visibleWidth(s)));
  const line = (cells, bold) =>
    indent + cells.map((cell, i) => pad(bold ? c.bold(cell) : cell, widths[i])).join(c.gray("  │  "));
  const sep = indent + widths.map((w) => "─".repeat(w)).join("──┼──");
  return [line(header, true), c.gray(sep), ...rows.map((r) => line(r, false))].join("\n");
}

function renderInline(tokens, ctx) {
  if (!tokens) return "";
  const { c, links } = ctx;
  let out = "";
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out += t.tokens ? renderInline(t.tokens, ctx) : unescapeEntities(t.text).replace(/\s*\n\s*/g, " ");
        break;
      case "escape":
        out += t.text;
        break;
      case "strong":
        out += c.bold(renderInline(t.tokens, ctx));
        break;
      case "em":
        out += c.italic(renderInline(t.tokens, ctx));
        break;
      case "del":
        out += c.strikethrough(renderInline(t.tokens, ctx));
        break;
      case "codespan":
        out += c.cyan(unescapeEntities(t.text));
        break;
      case "br":
        out += "\n";
        break;
      case "link": {
        const text = renderInline(t.tokens, ctx);
        const href = t.href ?? "";
        if (text === href || text === href.replace(/^https?:\/\//, "")) {
          out += c.blue.underline(links ? hyperlink(href, href) : href);
        } else if (links) {
          out += hyperlink(c.blue.underline(text), href);
        } else {
          let n = ctx.footnoteIndex.get(href);
          if (!n) {
            ctx.footnotes.push(href);
            n = ctx.footnotes.length;
            ctx.footnoteIndex.set(href, n);
          }
          out += `${c.blue.underline(text)}${c.gray(`[${n}]`)}`;
        }
        break;
      }
      case "image":
        out += c.gray(`[image: ${t.text || t.href}]`);
        break;
      case "html":
        out += unescapeEntities(t.text.replace(/<[^>]+>/g, ""));
        break;
      default:
        out += t.tokens ? renderInline(t.tokens, ctx) : unescapeEntities(t.raw ?? t.text ?? "");
    }
  }
  return out;
}
