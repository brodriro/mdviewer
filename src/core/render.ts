import createMarkdownIt, { type MarkdownIt, type Token } from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import frontMatter from 'markdown-it-front-matter';
import taskLists from 'markdown-it-task-lists';
import katex from '@vscode/markdown-it-katex';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';
import { slugify } from './slug';

export interface TocItem {
  level: number;
  id: string;
  text: string;
}

export interface RenderResult {
  /** Sanitized HTML, safe to assign to innerHTML. */
  html: string;
  toc: TocItem[];
  /** Text of the first heading, if any. */
  title: string | null;
  hasMermaid: boolean;
}

export interface RenderOptions {
  /** Render `$…$` and `$$…$$` with KaTeX. Default true. */
  math?: boolean;
}

interface Env {
  [key: PropertyKey]: unknown;
  frontMatter?: string;
  hasMermaid?: boolean;
}

/** CommonJS plugins arrive as the function or as `{ default }` depending on the bundler. */
function plugin<T>(mod: T): T {
  return typeof mod === 'function' ? mod : (mod as { default: T }).default;
}

function highlight(md: MarkdownIt, env: Env, code: string, lang: string): string {
  if (lang === 'mermaid') {
    env.hasMermaid = true;
    return `<pre class="mermaid">${md.utils.escapeHtml(code)}</pre>`;
  }
  if (lang && hljs.getLanguage(lang)) {
    const { value } = hljs.highlight(code, { language: lang, ignoreIllegals: true });
    return `<pre class="hljs"><code class="language-${md.utils.escapeHtml(lang)}">${value}</code></pre>`;
  }
  return `<pre class="hljs"><code>${md.utils.escapeHtml(code)}</code></pre>`;
}

function createParser(env: Env, math: boolean): MarkdownIt {
  const md: MarkdownIt = createMarkdownIt({
    html: true,
    linkify: true,
    highlight: (code, lang) => highlight(md, env, code, lang.trim().split(/\s+/)[0] ?? ''),
  });
  md.use(plugin(anchor), {
    slugify,
    permalink: anchor.permalink.linkInsideHeader({
      symbol: '#',
      placement: 'before',
      class: 'mdv-anchor',
      ariaHidden: true,
    }),
  });
  md.use(plugin(footnote));
  md.use(plugin(taskLists), { label: true });
  md.use(plugin(frontMatter), (raw: string) => {
    env.frontMatter = raw;
  });
  // The plugin is typed against an older markdown-it; the runtime contract is the same.
  if (math) md.use(plugin(katex) as unknown as (md: MarkdownIt, options: object) => void, { throwOnError: false });
  return md;
}

function collectToc(tokens: Token[]): TocItem[] {
  const toc: TocItem[] = [];
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open') return;
    const inline = tokens[i + 1];
    const text = (inline?.children ?? [])
      .filter((t) => t.type === 'text' || t.type === 'code_inline')
      .map((t) => t.content)
      .join('')
      .trim();
    const id = token.attrGet('id');
    if (id && text) toc.push({ level: Number(token.tag.slice(1)), id: String(id), text });
  });
  return toc;
}

function renderFrontMatter(raw: string): string {
  const body = hljs.highlight(raw, { language: 'yaml', ignoreIllegals: true }).value;
  return (
    `<details class="mdv-frontmatter"><summary>Front matter</summary>` +
    `<pre class="hljs"><code class="language-yaml">${body}</code></pre></details>`
  );
}

let hooksInstalled = false;

function sanitize(html: string): string {
  if (!hooksInstalled) {
    hooksInstalled = true;
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && /^(https?:)?\/\//i.test(node.getAttribute('href') ?? '')) {
        node.setAttribute('rel', 'noopener noreferrer');
      }
      // Only the disabled checkboxes of task lists survive.
      if (node.tagName === 'INPUT') {
        if (node.getAttribute('type') !== 'checkbox') node.remove();
        else node.setAttribute('disabled', '');
      }
    });
  }
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'button', 'select', 'textarea', 'dialog'],
    FORBID_ATTR: ['srcset', 'ping', 'autofocus'],
  });
}

export function renderMarkdown(source: string, options: RenderOptions = {}): RenderResult {
  const env: Env = {};
  const md = createParser(env, options.math ?? true);
  const tokens = md.parse(source, env);
  const toc = collectToc(tokens);
  let html = md.renderer.render(tokens, md.options, env);
  if (env.frontMatter) html = renderFrontMatter(env.frontMatter) + html;
  return {
    html: sanitize(html),
    toc,
    title: toc[0]?.text ?? null,
    hasMermaid: env.hasMermaid === true,
  };
}
