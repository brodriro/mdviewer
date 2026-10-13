import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve } from 'node:path';
import { expect, test as base } from '@playwright/test';

// Drives the built web app: run `pnpm web:build` first.
const ROOT = resolve(import.meta.dirname, '../../dist/web');
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const test = base.extend<{ app: string }>({
  app: async ({}, use) => {
    const server = createServer(async (req, res) => {
      const path = new URL(req.url!, 'http://x').pathname;
      const file = join(ROOT, path.endsWith('/') ? path + 'index.html' : path);
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    server.close();
  },
});

test('shows the welcome document with its diagram', async ({ page, app }) => {
  await page.goto(app);
  await expect(page.locator('.mdv-content h1')).toHaveText(/MD Viewer/);
  await expect(page.locator('.mdv-content pre.mermaid svg')).toBeVisible();
  await expect(page.locator('.mdv-content .katex')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir archivo' })).toBeVisible();
});

test('renders pasted markdown', async ({ page, app }) => {
  await page.goto(app);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', '# Pegado\n\n- [x] hecho');
    dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  });
  await expect(page.locator('.mdv-content h1')).toHaveText(/Pegado/);
  await expect(page.locator('.mdv-content input[type=checkbox]')).toBeChecked();
});

test('opens a dropped file', async ({ page, app }) => {
  await page.goto(app);
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['# Soltado\n\n## Dos'], 'notas.md', { type: 'text/markdown' }));
    dispatchEvent(new DragEvent('drop', { dataTransfer: data, cancelable: true }));
  });
  await expect(page.locator('.mdv-content h1')).toHaveText(/Soltado/);
  await expect(page.locator('.mdv-title')).toHaveText('notas.md');
  await expect(page).toHaveTitle('Soltado');
});

test('browses a folder: file list, relative links, images and live reload', async ({ page, app }) => {
  await page.goto(app);
  // The origin private file system stands in for the folder the user would pick.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const write = async (dir: FileSystemDirectoryHandle, name: string, data: string) => {
      const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await writable.write(data);
      await writable.close();
    };
    const docs = await root.getDirectoryHandle('docs', { create: true });
    await root.getDirectoryHandle('node_modules', { create: true }).then((d) => write(d, 'oculto.md', '# No'));
    await write(root, 'README.md', '# Inicio\n\n[Guía](docs/guia.md#detalle)\n');
    await write(docs, 'guia.md', '# Guía\n\n![pixel](../pixel.svg)\n\n' + 'relleno\n\n'.repeat(80) + '## Detalle\n');
    await write(root, 'pixel.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
    window.showDirectoryPicker = () => navigator.storage.getDirectory();
  });

  await page.getByRole('button', { name: 'Abrir carpeta' }).click();
  await expect(page.locator('.mdv-content h1')).toHaveText(/Inicio/);
  await expect(page.locator('.mdv-files button')).toHaveText(['README.md', 'docs/guia.md']);
  await expect(page.locator('.mdv-files button[aria-current=true]')).toHaveText('README.md');

  await page.locator('.mdv-content a', { hasText: 'Guía' }).click();
  await expect(page.locator('.mdv-content h1')).toHaveText(/Guía/);
  await expect(page.locator('#detalle')).toBeInViewport();
  await expect(page.locator('.mdv-content img')).toHaveAttribute('src', /^blob:/);
  expect(await page.locator('.mdv-content img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(4);

  await page.evaluate(async () => {
    const docs = await (await navigator.storage.getDirectory()).getDirectoryHandle('docs');
    const writable = await (await docs.getFileHandle('guia.md')).createWritable();
    await writable.write('# Guía editada');
    await writable.close();
  });
  await expect(page.locator('.mdv-content h1')).toHaveText(/Guía editada/, { timeout: 5000 });
});

test('remembers toolbar choices', async ({ page, app }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(app);
  await page.click('[data-act=theme]');
  await page.click('[data-act=theme]');
  await expect(page.locator('html')).toHaveAttribute('data-mdv-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-mdv-theme', 'dark');
});
