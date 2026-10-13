import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import mermaid from 'mermaid';
import { renderMermaidBlocks } from '../src/ui/mermaid';

// Injected on demand by the background so documents without diagrams never pay for it.
export default defineUnlistedScript(() => {
  (globalThis as Record<string, unknown>).__mdvMermaid = (blocks: HTMLElement[], theme: 'light' | 'dark') =>
    renderMermaidBlocks(mermaid, blocks, theme);
});
