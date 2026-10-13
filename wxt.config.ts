import { defineConfig } from 'wxt';
import type { Plugin } from 'vite';
import { MATCHES } from './src/ext/matches';

/**
 * Chrome refuses to load a content script that contains Unicode noncharacters
 * ("It isn't UTF-8 encoded"). KaTeX ships a literal U+FFFF inside a regex, so
 * they are rewritten as escapes, which mean the same in strings and regexes.
 */
function escapeNoncharacters(): Plugin {
  return {
    name: 'mdv:escape-noncharacters',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        chunk.code = chunk.code.replace(
          /[﷐-﷯￾￿]/g,
          (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
        );
      }
    },
  };
}

export default defineConfig({
  manifest: {
    name: 'MD Viewer',
    description: 'Lee archivos Markdown locales y remotos con formato, índice, código resaltado, fórmulas y diagramas.',
    permissions: ['storage', 'scripting'],
    host_permissions: MATCHES,
    web_accessible_resources: [{ resources: ['fonts/*'], matches: ['<all_urls>'] }],
  },
  vite: () => ({ plugins: [escapeNoncharacters()] }),
});
