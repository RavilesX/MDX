import MarkdownIt, { type PluginWithOptions } from "markdown-it";
import anchor from "markdown-it-anchor";
import abbr from "markdown-it-abbr";
import attrs from "markdown-it-attrs";
import deflist from "markdown-it-deflist";
import { full as emoji } from "markdown-it-emoji";
import footnote from "markdown-it-footnote";
import frontMatter from "markdown-it-front-matter";
import * as githubAlerts from "markdown-it-github-alerts";
import ins from "markdown-it-ins";
import mark from "markdown-it-mark";
import multimdTable from "markdown-it-multimd-table";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import yaml from "js-yaml";

import { containersPlugin } from "./plugins/containers.js";
import { fencePlugin } from "./plugins/fence.js";
import { mathPlugin } from "./plugins/math.js";
import { wikilinkPlugin } from "./plugins/wikilink.js";

/**
 * Normalises the CommonJS plugins.
 *
 * Two things need smoothing over. Some ship their own copy of the markdown-it
 * typings — resolved through the CJS entry point while this project resolves
 * the ESM one, so the types are structurally identical but nominally
 * distinct. And a module written with `export =` arrives as a namespace
 * object rather than the function itself, depending on the bundler.
 */
function asPlugin(plugin: unknown): PluginWithOptions<unknown> {
  const candidate = (plugin as { default?: unknown })?.default ?? plugin;
  return candidate as PluginWithOptions<unknown>;
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

export interface DocStats {
  words: number;
  characters: number;
  lines: number;
  readingMinutes: number;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
  frontMatter: Record<string, unknown> | null;
  frontMatterRaw: string | null;
  stats: DocStats;
}

/** Collected during a render pass; markdown-it plugins report through callbacks. */
interface RenderContext {
  headings: Heading[];
  frontMatterRaw: string | null;
}

let context: RenderContext = { headings: [], frontMatterRaw: null };

/** GitHub-compatible heading slugs, deduplicated per document. */
function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createInstance(): MarkdownIt {
  const md = new MarkdownIt({
    html: true, // raw HTML is allowed through the parser; DOMPurify is the gate
    linkify: true,
    typographer: true,
    breaks: false,
    quotes: "“”‘’",
  });

  // Front matter is captured, not rendered — the viewer shows it as a panel.
  md.use(asPlugin(frontMatter), (raw: string) => {
    context.frontMatterRaw = raw;
  });

  md.use(abbr)
    .use(deflist)
    .use(footnote)
    .use(ins)
    .use(mark)
    .use(sub)
    .use(sup)
    .use(emoji)
    .use(taskLists, { enabled: true, label: true, labelAfter: true })
    .use(asPlugin(multimdTable), {
      multiline: true,
      rowspan: true,
      headerless: true,
      multibody: true,
      autolabel: true,
    })
    .use(asPlugin(attrs), {
      leftDelimiter: "{",
      rightDelimiter: "}",
      allowedAttributes: ["id", "class", "title", "width", "height", "align", "style", /^data-.*$/],
    })
    .use(asPlugin(githubAlerts), { markers: "*" })
    .use(containersPlugin)
    .use(fencePlugin)
    .use(mathPlugin)
    .use(wikilinkPlugin);

  md.use(anchor, {
    level: [1, 2, 3, 4, 5, 6],
    slugify,
    tabIndex: false,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: "#",
      placement: "before",
      class: "heading-anchor",
      ariaHidden: true,
    }),
    callback(token, info) {
      context.headings.push({
        level: Number.parseInt(token.tag.slice(1), 10),
        text: info.title,
        slug: info.slug,
      });
    },
  });

  // Tables are the most common source of horizontal overflow; give each one
  // its own scroll container instead of letting the page scroll sideways.
  const defaultTableOpen = md.renderer.rules.table_open;
  md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
    const inner = defaultTableOpen
      ? defaultTableOpen(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return `<div class="table-scroll">${inner}`;
  };
  const defaultTableClose = md.renderer.rules.table_close;
  md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
    const inner = defaultTableClose
      ? defaultTableClose(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options);
    return `${inner}</div>`;
  };

  return md;
}

const md = createInstance();

function parseFrontMatter(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  const body = raw.replace(/^-{3,}\s*$/gm, "").trim();
  if (!body) return null;
  try {
    const parsed = yaml.load(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // TOML front matter (`+++`) and malformed YAML both land here; the raw
    // text is still shown so nothing is silently lost.
    return null;
  }
}

function computeStats(source: string): DocStats {
  const words = source.split(/\s+/).filter(Boolean).length;
  return {
    words,
    characters: source.length,
    lines: source.split("\n").length,
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

export function renderMarkdown(source: string): RenderResult {
  context = { headings: [], frontMatterRaw: null };
  const html = md.render(source);
  return {
    html,
    headings: context.headings,
    frontMatterRaw: context.frontMatterRaw,
    frontMatter: parseFrontMatter(context.frontMatterRaw),
    stats: computeStats(source),
  };
}

export { slugify };
