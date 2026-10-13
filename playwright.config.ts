import { defineConfig } from '@playwright/test';

// The suite drives the built extension: run `pnpm build` first.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  reporter: 'list',
  use: { viewport: { width: 1280, height: 800 } },
});
