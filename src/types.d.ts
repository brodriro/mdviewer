type MarkdownItPlugin<Options> = (md: import('markdown-it').MarkdownIt, options?: Options) => void;

declare module 'markdown-it-task-lists' {
  const plugin: MarkdownItPlugin<{ enabled?: boolean; label?: boolean; labelAfter?: boolean }>;
  export default plugin;
}

declare module 'markdown-it-front-matter' {
  const plugin: MarkdownItPlugin<(raw: string) => void>;
  export default plugin;
}

declare module 'markdown-it-footnote' {
  const plugin: MarkdownItPlugin<never>;
  export default plugin;
}

declare module '*.css?inline' {
  const css: string;
  export default css;
}

declare module '*.css?raw' {
  const css: string;
  export default css;
}
