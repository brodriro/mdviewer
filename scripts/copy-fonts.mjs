// The extension serves KaTeX's fonts itself; they must match the installed KaTeX.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const source = join(dirname(createRequire(import.meta.url).resolve('katex/package.json')), 'dist/fonts');
const target = resolve(import.meta.dirname, '../public/fonts');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) {
  if (file.endsWith('.woff2')) cpSync(join(source, file), join(target, file));
}
