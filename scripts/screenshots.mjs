// Captures the Chrome Web Store screenshots (1280x800) from the built extension.
// Usage: pnpm build && node scripts/screenshots.mjs
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const extension = resolve(root, '.output/chrome-mv3');
const body = readFileSync(resolve(root, 'tests/fixtures/sample.md'));

const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(body);
}).listen(0, '127.0.0.1');

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  ignoreDefaultArgs: ['--disable-extensions'],
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});

for (const scheme of ['light', 'dark']) {
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(`http://127.0.0.1:${server.address().port}/README.md`);
  await page.bringToFront();
  await page.locator('pre.mermaid svg').waitFor();
  await page.screenshot({ path: resolve(root, `store/screenshot-${scheme}.png`) });
  await page.locator('#matemáticas').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.getElementById('matemáticas').scrollIntoView());
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(root, `store/screenshot-${scheme}-2.png`) });
  await page.close();
}

await context.close();
server.close();
