import { DOCS_URL, GITHUB_REPO, SITE_URL } from "./constants.js";

/**
 * Parse Docusaurus frontmatter. The body is everything after the closing `---`.
 * @returns {{ slug: string|null, title: string|null, section: string|null, meta: object, body: string }}
 */
export function parseFrontmatter(src) {
  const text = src.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const meta = {};
  let body = text;
  const match = text.match(/^---\n([\s\S]*?)\n---[ \t]*\n?/);
  if (match) {
    for (const line of match[1].split("\n")) {
      const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!kv) continue;
      let value = kv[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      meta[kv[1]] = value;
    }
    body = text.slice(match[0].length);
  }
  const slug = meta.slug ? normalizeSlug(meta.slug) : null;
  const title = meta.title ?? firstHeading(body);
  return { slug, title, section: meta.section ?? null, meta, body };
}

export function normalizeSlug(slug) {
  let s = String(slug).trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s;
}

export function docsUrlForSlug(slug) {
  if (!slug || slug === "/") return `${DOCS_URL}/`;
  return `${DOCS_URL}${slug}`;
}

/** Derive a slug from a docs file path when frontmatter has none (Docusaurus strips number prefixes). */
export function slugFromPath(relPath) {
  const parts = relPath
    .replace(/\.mdx?$/, "")
    .split("/")
    .map((p) => p.replace(/^\d+(?:\.\d+)?[-.]?[a-z]?-/, "").replace(/^\d+(?:\.\d+)?-/, ""));
  return "/" + parts.map((p) => p.trim().toLowerCase().replace(/\s+/g, "-")).join("/");
}

function firstHeading(body) {
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^#\s+(.+?)\s*#*\s*$/);
    if (m) return stripInline(m[1]);
  }
  return null;
}

/** GitHub/Docusaurus-style heading anchor. */
export function slugifyHeading(text, seen) {
  let slug = stripInline(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-");
  if (seen) {
    const base = slug;
    let n = 1;
    while (seen.has(slug)) slug = `${base}-${n++}`;
    seen.add(slug);
  }
  return slug;
}

/** Remove inline markdown/wiki/link syntax, leaving plain text. */
export function stripInline(text) {
  return String(text)
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, sym, alias) => (alias ?? sym).trim())
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[*_`~]/g, "")
    .trim();
}

// `// ---cut---`, `// @include: ex`, `// @noErrors` … twoslash-only lines inside fences
const TWOSLASH_DIRECTIVE = /^\s*\/\/\s*(---cut(-before|-after)?---|@[a-zA-Z-]+(:.*)?)\s*$/;

const ADMONITION_LABELS = {
  note: "ℹ Note",
  tip: "💡 Tip",
  info: "ℹ Info",
  warning: "⚠ Warning",
  caution: "⚠ Caution",
  danger: "🛑 Danger",
};

/**
 * Build the API link for a `[[Symbol]]` / `[[Class.member]]` reference.
 * `symbols` is an optional map of symbol name → typedoc page URL.
 */
export function apiLinkFor(symbolPath, symbols) {
  const clean = symbolPath.trim();
  const [head, ...rest] = clean.split(/[.#]/);
  const member = rest.join(".");
  const base = symbols?.[head] ?? symbols?.get?.(head);
  if (base) {
    return member ? `${base.replace(/\/?$/, "/")}#${member}` : base;
  }
  // Unknown kind (class/interface/function…) — fall back to the site search page.
  return `${SITE_URL}/search/?q=${encodeURIComponent(clean)}`;
}

/**
 * Convert the MDX body into plain markdown the terminal renderer understands.
 *
 * @param {string} body          frontmatter-less MDX
 * @param {object} options
 * @param {(relPath:string)=>string|null} [options.resolveImport]  contents of a raw-loader import target
 * @param {object|Map} [options.symbols]   API symbol → URL map for [[wiki]] links
 * @param {string} [options.docRelPath]    site/docs-relative path (for GitHub fallbacks)
 * @param {string} [options.ref]           git ref (for GitHub fallbacks)
 */
export function toMarkdown(body, options = {}) {
  const { resolveImport, symbols, docRelPath = "", ref = "main" } = options;
  const rawImports = new Map(); // identifier -> relative path
  const out = [];
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  let inFence = false;
  let fenceMarker = "";
  let skipFence = false; // twoslash include blocks
  let admonition = null; // { label }
  let i = 0;

  const githubBase = `https://github.com/${GITHUB_REPO}/blob/${ref}/site/docs/`;
  const docDir = docRelPath.includes("/") ? docRelPath.slice(0, docRelPath.lastIndexOf("/") + 1) : "";
  const githubUrlFor = (rel) => githubBase + encodeURI(joinRel(docDir, rel));

  const push = (line) => {
    if (admonition) {
      out.push(line === "" ? ">" : `> ${line}`);
    } else {
      out.push(line);
    }
  };

  while (i < lines.length) {
    let line = lines[i];

    // ---- fenced code -------------------------------------------------------
    const fence = line.match(/^(\s*)(```+|~~~+)(.*)$/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[2];
        const info = fence[3].trim();
        if (/^twoslash\s+include\b/.test(info)) {
          skipFence = true;
        } else {
          skipFence = false;
          const lang = normalizeFenceInfo(info);
          push(`${fence[1]}${fenceMarker}${lang}`);
        }
      } else if (fence[2][0] === fenceMarker[0] && fence[2].length >= fenceMarker.length) {
        inFence = false;
        if (!skipFence) push(`${fence[1]}${fenceMarker}`);
        skipFence = false;
      } else {
        push(line);
      }
      i++;
      continue;
    }
    if (inFence) {
      if (!skipFence && !TWOSLASH_DIRECTIVE.test(line)) push(line);
      i++;
      continue;
    }

    // ---- MDX ESM: imports / exports ---------------------------------------
    const rawImport = line.match(/^import\s+(\w+)\s+from\s+['"]!!raw-loader!(.+?)['"];?\s*$/);
    if (rawImport) {
      rawImports.set(rawImport[1], rawImport[2]);
      i++;
      continue;
    }
    if (/^import\s.+\sfrom\s+['"].+['"];?\s*$/.test(line) || /^import\s+['"].+['"];?\s*$/.test(line)) {
      i++;
      continue;
    }
    if (/^export\s/.test(line)) {
      // drop the export statement through the next blank line
      while (i < lines.length && lines[i].trim() !== "") i++;
      continue;
    }

    // ---- admonitions -------------------------------------------------------
    const admOpen = line.match(/^:::([a-z]+)\s*(.*)$/);
    if (admOpen && !admonition) {
      const label = ADMONITION_LABELS[admOpen[1]] ?? capitalize(admOpen[1]);
      const title = admOpen[2].trim();
      if (out.length && out[out.length - 1] !== "") out.push("");
      admonition = { label };
      out.push(`> **${label}${title ? `: ${title}` : ""}**`);
      out.push(">");
      i++;
      continue;
    }
    if (/^:::\s*$/.test(line) && admonition) {
      admonition = null;
      out.push("");
      i++;
      continue;
    }

    // ---- JSX components (may span multiple lines) --------------------------
    if (/^\s*<(PlaygroundEmbed|IFrameEmbed|CodeSandboxEmbed|Example|Player|img|iframe)\b/.test(line)) {
      let block = line;
      let j = i;
      while (!/\/>\s*$|<\/\w+>\s*$/.test(block) && j + 1 < lines.length && j - i < 30) {
        j++;
        block += "\n" + lines[j];
      }
      i = j + 1;
      for (const l of renderComponent(block, { rawImports, resolveImport, githubUrlFor })) push(l);
      continue;
    }

    // ---- plain line: inline rewrites ---------------------------------------
    push(rewriteInline(line, { symbols, githubUrlFor }));
    i++;
  }

  // Collapse 3+ blank lines and repeated empty blockquote lines.
  return (
    out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/(\n>\s*){2,}\n/g, "\n>\n")
      .trim() + "\n"
  );
}

function normalizeFenceInfo(info) {
  if (!info) return "";
  let lang = info.split(/\s+/)[0];
  lang = lang.replace(/\{.*$/, "");
  if (lang === "mdx") lang = "md";
  return lang;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinRel(dir, rel) {
  const parts = (dir + rel).split("/");
  const outParts = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") outParts.pop();
    else outParts.push(p);
  }
  return outParts.join("/");
}

function attr(block, name) {
  const quoted = block.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`)) || block.match(new RegExp(`\\b${name}\\s*=\\s*'([^']*)'`));
  if (quoted) return { value: quoted[1], expr: false };
  const expr = block.match(new RegExp(`\\b${name}\\s*=\\s*\\{([^}]*)\\}`));
  if (expr) return { value: expr[1].trim(), expr: true };
  return null;
}

function renderComponent(block, { rawImports, resolveImport, githubUrlFor }) {
  const tag = block.match(/^\s*<(\w+)/)[1];
  const title = attr(block, "title")?.value;
  const src = attr(block, "src");
  const lines = [];

  switch (tag) {
    case "PlaygroundEmbed": {
      const code = attr(block, "code");
      const ident = code?.expr ? code.value : null;
      const rel = ident ? rawImports.get(ident) : null;
      const contents = rel && resolveImport ? resolveImport(rel) : null;
      lines.push("");
      lines.push(`**▶ ${title ?? "Example"}**`);
      lines.push("");
      if (contents != null) {
        const lang = rel.endsWith(".js") ? "js" : "ts";
        lines.push("```" + lang);
        lines.push(...contents.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n"));
        lines.push("```");
      } else if (rel) {
        lines.push(`> Source: ${githubUrlFor(rel)}`);
      } else if (code && !code.expr) {
        lines.push("```ts");
        lines.push(...code.value.split("\n"));
        lines.push("```");
      }
      lines.push("");
      return lines;
    }
    case "IFrameEmbed":
    case "iframe": {
      const url = src && !src.expr ? src.value : null;
      lines.push("", `> ▶ Live example: ${url ?? "(see online docs)"}`, "");
      return lines;
    }
    case "CodeSandboxEmbed": {
      const url = src && !src.expr ? src.value : null;
      lines.push("", `> ▶ CodeSandbox${title ? ` — ${title}` : ""}: ${url ?? "(see online docs)"}`, "");
      return lines;
    }
    case "Example": {
      const story = attr(block, "story")?.value;
      lines.push("", `> ▶ Storybook example${story ? `: ${story}` : ""} (see online docs)`, "");
      return lines;
    }
    case "Player": {
      lines.push("", `> ▶ Video player${src && !src.expr ? `: ${src.value}` : ""} (see online docs)`, "");
      return lines;
    }
    case "img": {
      const alt = attr(block, "alt")?.value ?? "image";
      const url = src && !src.expr ? src.value : null;
      lines.push("", `> 🖼 ${alt}${url ? ` — ${url.startsWith("http") ? url : githubUrlFor(url)}` : ""}`, "");
      return lines;
    }
    default:
      return [stripTags(block)];
  }
}

function stripTags(text) {
  if (!text.includes("<")) return text;
  return text
    .replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_, href, inner) => `[${inner.trim()}](${absoluteUrl(href)})`)
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/^\s*<li\b[^>]*>/, "- ")
    .replace(/<li\b[^>]*>/g, " • ")
    .replace(/<\/li>/g, " ")
    .replace(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/g, "_$1_")
    .replace(/<audio\b[^>]*>/g, "> 🔊 Audio clip (see online docs)")
    .replace(/<\/?[a-z][\w-]*\b[^>]*\/?>/g, "")
    .replace(/<\/?[A-Z][\w.]*\b[^>]*\/?>/g, "")
    .replace(/ +• /g, " • ")
    .replace(/[ \t]+$/gm, "");
}

function absoluteUrl(href) {
  if (/^https?:\/\//.test(href) || href.startsWith("#") || href.startsWith("mailto:")) return href;
  if (href.startsWith("/")) return SITE_URL + href;
  return href;
}

/** Inline rewrites for a single non-code line. */
export function rewriteInline(line, { symbols, githubUrlFor } = {}) {
  let result = line;

  // Protect inline code spans from rewriting.
  const codeSpans = [];
  result = result.replace(/`+[^`]*`+/g, (m) => {
    codeSpans.push(m);
    return ` ${codeSpans.length - 1} `;
  });

  // [[Symbol|text]] → [text](api url)
  result = result.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, sym, alias) => {
    const text = (alias ?? sym).trim();
    return `[${text}](${apiLinkFor(sym, symbols)})`;
  });

  // relative markdown links → absolute site links
  result = result.replace(/\]\((\/[^)\s]*)\)/g, (_, href) => `](${SITE_URL}${href})`);
  // relative image links → GitHub raw-ish links
  if (githubUrlFor) {
    result = result.replace(/!\[([^\]]*)\]\((\.{1,2}\/[^)\s]*)\)/g, (_, alt, rel) => `![${alt}](${githubUrlFor(rel)})`);
  }

  result = stripTags(result);

  result = result.replace(/ (\d+) /g, (_, n) => codeSpans[Number(n)]);
  return result;
}

/**
 * Split markdown into sections by heading. The preamble before the first heading
 * is returned with anchor `null`.
 * @returns {Array<{ anchor: string|null, heading: string|null, level: number, markdown: string }>}
 */
export function splitSections(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  const seen = new Set();
  let current = { anchor: null, heading: null, level: 0, lines: [] };
  let inFence = false;
  let fenceMarker = "";

  for (const line of lines) {
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
      } else if (fence[1][0] === fenceMarker[0] && fence[1].length >= fenceMarker.length) {
        inFence = false;
      }
      current.lines.push(line);
      continue;
    }
    const heading = !inFence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      sections.push(current);
      const text = heading[2];
      current = {
        anchor: slugifyHeading(text, seen),
        heading: stripInline(text),
        level: heading[1].length,
        lines: [line],
      };
      continue;
    }
    current.lines.push(line);
  }
  sections.push(current);

  return sections
    .map((s) => ({ anchor: s.anchor, heading: s.heading, level: s.level, markdown: s.lines.join("\n").trim() }))
    .filter((s, idx) => !(idx === 0 && s.anchor === null && s.markdown === ""));
}

/**
 * Given a section list and a target anchor, return the markdown for that section
 * plus its sub-sections (deeper headings) until the next heading of the same or higher level.
 */
export function extractSection(sections, anchor) {
  if (!anchor) return null;
  const idx = sections.findIndex((s) => s.anchor === anchor);
  if (idx === -1) return null;
  const level = sections[idx].level;
  const parts = [sections[idx].markdown];
  for (let i = idx + 1; i < sections.length; i++) {
    if (sections[i].level <= level && sections[i].anchor !== null) break;
    parts.push(sections[i].markdown);
  }
  return parts.join("\n\n");
}
