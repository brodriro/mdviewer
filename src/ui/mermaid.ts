import type { Mermaid } from 'mermaid';

let counter = 0;

export async function renderMermaidBlocks(
  mermaid: Mermaid,
  blocks: HTMLElement[],
  theme: 'light' | 'dark',
): Promise<void> {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: theme === 'dark' ? 'dark' : 'default',
  });
  for (const block of blocks) {
    const source = block.dataset.src ?? block.textContent ?? '';
    const id = `mdv-mermaid-${counter++}`;
    try {
      const { svg } = await mermaid.render(id, source);
      block.innerHTML = svg;
      block.classList.remove('mdv-mermaid-error');
      block.removeAttribute('title');
    } catch (err) {
      // A failed render leaves its scratch element behind.
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
      block.textContent = source;
      block.classList.add('mdv-mermaid-error');
      block.title = err instanceof Error ? err.message : String(err);
    }
  }
}
