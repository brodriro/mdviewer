import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { test as base, chromium, type BrowserContext } from '@playwright/test';

const EXTENSION = resolve(import.meta.dirname, '../../.output/chrome-mv3');
export const SAMPLE = readFileSync(resolve(import.meta.dirname, '../fixtures/sample.md'), 'utf8');

interface Doc {
  body: string;
  type?: string;
  headers?: Record<string, string>;
}

export interface DocServer {
  origin: string;
  /** Serves `doc` at `path` and returns its URL. */
  serve(path: string, doc: Doc): string;
}

export const test = base.extend<{ context: BrowserContext; extensionId: string; docs: DocServer }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      // Playwright disables extensions unless told otherwise.
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    // The install tab steals focus, and Chrome throttles the pages left in the background.
    const isWelcome = (page: { url(): string }) => page.url().endsWith('/welcome.html');
    const welcome = context.pages().find(isWelcome) ?? (await context.waitForEvent('page', isWelcome));
    await welcome.close();
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
  docs: async ({}, use) => {
    const routes = new Map<string, Doc>();
    const server: Server = createServer((req, res) => {
      const doc = routes.get(new URL(req.url!, 'http://x').pathname);
      if (!doc) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': doc.type ?? 'text/plain; charset=utf-8', ...doc.headers });
      res.end(doc.body);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await use({
      origin,
      serve(path, doc) {
        routes.set(path, doc);
        return origin + path;
      },
    });
    server.close();
  },
});

export { expect } from '@playwright/test';
