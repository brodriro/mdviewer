// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderMarkdown, slugify } from '../src/core';

const sample = readFileSync(resolve(import.meta.dirname, 'fixtures/sample.md'), 'utf8');

function dom(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

describe('slugify', () => {
  it('follows GitHub conventions', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  Año 2026: ¿qué sigue?  ')).toBe('año-2026-qué-sigue');
    expect(slugify('snake_case and kebab-case')).toBe('snake_case-and-kebab-case');
  });
});

describe('renderMarkdown', () => {
  const result = renderMarkdown(sample);
  const root = dom(result.html);

  it('renders GFM tables and task lists', () => {
    expect(root.querySelectorAll('table tbody tr')).toHaveLength(2);
    const boxes = root.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.checked).toBe(true);
    expect([...boxes].every((b) => b.disabled)).toBe(true);
  });

  it('highlights fenced code', () => {
    const code = root.querySelector('pre.hljs code.language-ts');
    expect(code?.querySelector('.hljs-keyword')?.textContent).toBe('const');
  });

  it('builds a table of contents with unique ids', () => {
    expect(result.title).toBe('MD Viewer');
    expect(result.toc.map((t) => t.id)).toEqual([
      'md-viewer',
      'tabla',
      'tareas',
      'código',
      'matemáticas',
      'diagrama',
      'notas',
      'subsección',
      'tabla-1',
    ]);
    expect(result.toc.find((t) => t.id === 'subsección')?.level).toBe(3);
    for (const item of result.toc) expect(root.querySelector(`[id="${item.id}"]`)).not.toBeNull();
  });

  it('renders front matter as a collapsed block instead of content', () => {
    const fm = root.querySelector('details.mdv-frontmatter');
    expect(fm?.textContent).toContain('Documento de prueba');
    expect(root.querySelector('hr:not(.footnotes-sep)')).toBeNull();
  });

  it('renders footnotes', () => {
    expect(root.querySelector('section.footnotes li')?.textContent).toContain('La nota.');
    expect(root.querySelector('sup.footnote-ref a')?.getAttribute('href')).toBe('#fn1');
  });

  it('renders math with KaTeX', () => {
    expect(root.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.katex-display')).not.toBeNull();
  });

  it('leaves mermaid blocks as source for the diagram renderer', () => {
    expect(result.hasMermaid).toBe(true);
    expect(root.querySelector('pre.mermaid')?.textContent).toContain('A[Markdown] --> B[HTML]');
  });

  it('can disable math', () => {
    const plain = renderMarkdown('precio $5 y $6', { math: false });
    expect(plain.html).not.toContain('katex');
  });
});

describe('sanitization', () => {
  const cases: [string, string][] = [
    ['script tag', '<script>alert(1)</script>'],
    ['event handler', '<img src="x" onerror="alert(1)">'],
    ['javascript link', '[x](javascript:alert(1))'],
    ['raw javascript link', '<a href="javascript:alert(1)">x</a>'],
    ['iframe', '<iframe src="https://example.com"></iframe>'],
    ['style tag', '<style>body{display:none}</style>'],
    ['form', '<form action="https://evil.test"><input name="q"><button>go</button></form>'],
    ['svg script', '<svg><script>alert(1)</script></svg>'],
    ['code fence language', '```"><img/src/onerror=alert(1)>\nx\n```'],
  ];

  it.each(cases)('neutralizes %s', (_name, source) => {
    const root = dom(renderMarkdown(source).html);
    expect(root.querySelector('script, iframe, style, form, button, input:not([type=checkbox])')).toBeNull();
    for (const el of root.querySelectorAll('*')) {
      for (const attr of el.attributes) {
        expect(attr.name.startsWith('on')).toBe(false);
        expect(attr.value.toLowerCase()).not.toContain('javascript:');
      }
    }
  });

  it('keeps safe inline HTML and marks external links', () => {
    const root = dom(renderMarkdown('<kbd>Ctrl</kbd> y [sitio](https://example.com) y [local](./otro.md)').html);
    expect(root.querySelector('kbd')?.textContent).toBe('Ctrl');
    expect(root.querySelector('a[href^="https"]')?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(root.querySelector('a[href="./otro.md"]')?.hasAttribute('rel')).toBe(false);
  });
});
