import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { expect, SAMPLE, test } from './fixtures';

test('renders a markdown response in place', async ({ context, docs, extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  const page = await context.newPage();
  await page.goto(docs.serve('/sample.md', { body: SAMPLE }));

  await expect(page.locator('.mdv-content h1')).toHaveText(/MD Viewer/);
  await expect(page).toHaveTitle('MD Viewer');
  await expect(page.locator('.mdv-title')).toHaveText('sample.md');
  await expect(page.locator('.mdv-toc a')).toHaveCount(9);
  await expect(page.locator('.mdv-content table tbody tr')).toHaveCount(2);
  await expect(page.locator('.mdv-content .hljs-keyword').first()).toHaveText('const');
  await expect(page.locator('.mdv-content .katex-display')).toBeVisible();
  await expect(page.locator('.mdv-content pre.mermaid svg')).toBeVisible();

  // Styles reached the page: the toolbar is pinned and the KaTeX font loaded.
  await expect(page.locator('.mdv-bar')).toHaveCSS('position', 'fixed');
  expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.check('16px KaTeX_Main')))).toBe(true);
});

test('toolbar toggles raw view, index and theme', async ({ context, docs }) => {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(docs.serve('/sample.md', { body: SAMPLE }));
  const html = page.locator('html');

  await page.click('[data-act=raw]');
  await expect(page.locator('.mdv-raw')).toContainText('# MD Viewer');
  await expect(page.locator('.mdv-content')).toBeHidden();
  await page.click('[data-act=raw]');

  await expect(page.locator('.mdv-toc')).toBeVisible();
  await page.click('[data-act=toc]');
  await expect(page.locator('.mdv-toc')).toBeHidden();

  await expect(html).toHaveAttribute('data-mdv-theme', 'light');
  await page.click('[data-act=theme]'); // auto -> light
  await page.click('[data-act=theme]'); // light -> dark
  await expect(html).toHaveAttribute('data-mdv-theme', 'dark');

  // Both choices persist for the next document.
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: 'light' });
  await other.goto(docs.serve('/other.md', { body: '# Otro\n\n## Sección' }));
  await expect(other.locator('html')).toHaveAttribute('data-mdv-theme', 'dark');
  await expect(other.locator('.mdv-toc')).toBeHidden();
});

test('index links scroll to their section and mark it active', async ({ context, docs }) => {
  const body = Array.from({ length: 12 }, (_, i) => `## Parte ${i}\n\n${'texto\n\n'.repeat(30)}`).join('');
  const page = await context.newPage();
  await page.goto(docs.serve('/long.md', { body }));

  await page.click('.mdv-toc a >> text=Parte 7');
  await expect(page.locator('#parte-7')).toBeInViewport();
  await expect(page.locator('.mdv-toc a[aria-current=true]')).toHaveText('Parte 7');

});

test('restores the reading position after a reload', async ({ context, docs }) => {
  const page = await context.newPage();
  await page.goto(docs.serve('/long.md', { body: '# Largo\n\n' + 'texto\n\n'.repeat(400) }));
  await expect(page.locator('.mdv-content h1')).toBeVisible();
  await page.evaluate(() => scrollTo(0, 3000));
  await page.reload();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(3000);
});

test('hostile markdown cannot run script', async ({ context, docs }) => {
  const body = [
    '# Hola',
    '<script>window.__pwned = 1</script>',
    '<img src="x" onerror="window.__pwned = 2">',
    '[x](javascript:window.__pwned=3)',
    '<a href="javascript:window.__pwned=4" id="evil">y</a>',
  ].join('\n\n');
  const page = await context.newPage();
  await page.goto(docs.serve('/evil.md', { body }));
  await expect(page.locator('.mdv-content h1')).toHaveText(/Hola/);
  await page.locator('#evil, .mdv-content a >> text=y').first().click({ trial: true }).catch(() => {});
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(page.locator('.mdv-content script, .mdv-content [onerror]')).toHaveCount(0);
});

test('works under a restrictive, sandboxed CSP', async ({ context, docs }) => {
  const page = await context.newPage();
  await page.goto(
    docs.serve('/raw.md', {
      body: SAMPLE,
      headers: { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
    }),
  );
  await expect(page.locator('.mdv-content h1')).toHaveText(/MD Viewer/);
  await expect(page.locator('.mdv-bar')).toHaveCSS('position', 'fixed');
  await expect(page.locator('.mdv-content pre.mermaid svg')).toBeVisible();
});

test('leaves HTML pages alone even when the URL ends in .md', async ({ context, docs }) => {
  const page = await context.newPage();
  await page.goto(docs.serve('/page.md', { body: '<h1 id="keep">HTML</h1>', type: 'text/html' }));
  await expect(page.locator('#keep')).toBeVisible();
  await expect(page.locator('.mdv')).toHaveCount(0);
});

test('reloads when a localhost document changes', async ({ context, docs }) => {
  const page = await context.newPage();
  await page.goto(docs.serve('/live.md', { body: '# Antes' }));
  await expect(page.locator('.mdv-content h1')).toHaveText(/Antes/);
  docs.serve('/live.md', { body: '# Después' });
  await expect(page.locator('.mdv-content h1')).toHaveText(/Después/, { timeout: 5000 });
});

test('options page saves settings and excluded sites', async ({ context, docs, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.locator('select[name=theme]')).toHaveValue('auto');
  await options.selectOption('select[name=font]', 'serif');

  const page = await context.newPage();
  const url = docs.serve('/sample.md', { body: SAMPLE });
  await page.goto(url);
  await expect(page.locator('.mdv')).toHaveAttribute('data-font', 'serif');

  // An open document follows later changes.
  await options.selectOption('select[name=width]', 'wide');
  await expect(page.locator('.mdv')).toHaveAttribute('data-width', 'wide');

  await options.fill('textarea[name=excluded]', 'http://127.0.0.1/algo');
  await options.locator('textarea[name=excluded]').blur();
  await options.reload();
  await expect(options.locator('textarea[name=excluded]')).toHaveValue('127.0.0.1');
  await page.goto(url);
  await expect(page.locator('body > pre')).toBeVisible();
  await expect(page.locator('.mdv')).toHaveCount(0);
});

// Extensions loaded from the command line get file access without the manual switch.
test('renders a local file, its relative images, and follows edits', async ({ context }, testInfo) => {
  const file = testInfo.outputPath('local notes.md');
  await writeFile(testInfo.outputPath('pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>');
  await writeFile(file, '# Local\n\n![pixel](pixel.svg)\n');
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);

  await expect(page.locator('.mdv-content h1')).toHaveText(/Local/);
  await expect(page.locator('.mdv-title')).toHaveText('local notes.md');
  expect(await page.locator('.mdv-content img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(4);

  await writeFile(file, '# Local editado\n');
  await expect(page.locator('.mdv-content h1')).toHaveText(/Local editado/, { timeout: 5000 });
});
