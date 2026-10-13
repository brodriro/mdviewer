import 'katex/dist/katex.min.css';
import '../src/ui/viewer.css';
import './web.css';
import { renderMermaidBlocks } from '../src/ui/mermaid';
import { DEFAULT_SETTINGS, type Settings } from '../src/ui/settings';
import { Viewer } from '../src/ui/viewer';
import welcome from './welcome.md?raw';

const SETTINGS_KEY = 'mdv:settings';
const MARKDOWN = /\.(md|markdown)$/i;
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', 'target', 'vendor']);
const MAX_FILES = 500;
const RELOAD_MS = 1000;

interface OpenDoc {
  /** Path inside the open folder, or just the file name. */
  path: string[];
  handle?: FileSystemFileHandle;
  lastModified?: number;
}

let settings = loadSettings();
let folder: FileSystemDirectoryHandle | null = null;
let current: OpenDoc | null = null;
let blobUrls: string[] = [];

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Resolves `href` against the folder of the open document. Null if it escapes the open folder. */
function resolvePath(href: string): string[] | null {
  const clean = decodeURIComponent(href.replace(/[?#].*$/, ''));
  const base = clean.startsWith('/') ? [] : (current?.path.slice(0, -1) ?? []);
  const out = [...base];
  for (const part of clean.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (!out.length) return null;
      out.pop();
    } else out.push(part);
  }
  return out;
}

async function fileAt(path: string[]): Promise<FileSystemFileHandle | null> {
  if (!folder || !path.length) return null;
  try {
    let dir = folder;
    for (const part of path.slice(0, -1)) dir = await dir.getDirectoryHandle(part);
    return await dir.getFileHandle(path.at(-1)!);
  } catch {
    return null;
  }
}

const viewer = new Viewer(
  document.body,
  {
    onSettingsChange(patch) {
      settings = { ...settings, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch {
        // Private windows may refuse storage; the choice still holds for this visit.
      }
    },
    async renderMermaid(blocks, theme) {
      const { default: mermaid } = await import('mermaid');
      await renderMermaidBlocks(mermaid, blocks, theme);
    },
    async resolveImage(src) {
      const path = resolvePath(src);
      const handle = path && (await fileAt(path));
      if (!handle) return null;
      const url = URL.createObjectURL(await handle.getFile());
      blobUrls.push(url);
      return url;
    },
    openLink(href) {
      const path = resolvePath(href);
      if (!folder || !path || !MARKDOWN.test(path.at(-1) ?? '')) return false;
      void fileAt(path).then((handle) => {
        if (handle) void openHandle(handle, path, href.match(/#.*$/)?.[0]);
      });
      return true;
    },
  },
  settings,
);

function show(source: string, doc: OpenDoc | null, hash?: string): void {
  const sameDoc = doc !== null && current !== null && doc.path.join('/') === current.path.join('/');
  for (const url of blobUrls) URL.revokeObjectURL(url);
  blobUrls = [];
  current = doc;
  viewer.setSource(source);
  const name = doc?.path.at(-1) ?? 'MD Viewer';
  viewer.setTitle(name);
  document.title = viewer.title ?? name;
  for (const button of viewer.extra.querySelectorAll('button')) {
    if (button.dataset.path === doc?.path.join('/')) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
  if (hash) viewer.scrollToHash(hash);
  else if (!sameDoc) scrollTo(0, 0);
}

async function openHandle(handle: FileSystemFileHandle, path: string[], hash?: string): Promise<void> {
  const file = await handle.getFile();
  show(await file.text(), { path, handle, lastModified: file.lastModified }, hash);
}

async function openFile(file: File): Promise<void> {
  closeFolder();
  show(await file.text(), { path: [file.name] });
}

function closeFolder(): void {
  folder = null;
  viewer.extra.replaceChildren();
}

async function listMarkdown(dir: FileSystemDirectoryHandle, prefix: string[], out: string[][]): Promise<void> {
  const entries: FileSystemHandle[] = [];
  for await (const entry of dir.values()) entries.push(entry);
  // Files of a folder come before its subfolders.
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'file' ? -1 : 1));
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return;
    if (entry.kind === 'file') {
      if (MARKDOWN.test(entry.name)) out.push([...prefix, entry.name]);
    } else if (!entry.name.startsWith('.') && !SKIPPED_DIRS.has(entry.name)) {
      await listMarkdown(entry as FileSystemDirectoryHandle, [...prefix, entry.name], out);
    }
  }
}

async function openFolder(dir: FileSystemDirectoryHandle): Promise<void> {
  const files: string[][] = [];
  await listMarkdown(dir, [], files);
  folder = dir;

  const label = document.createElement('p');
  label.className = 'mdv-panel-label';
  label.textContent = files.length ? dir.name : `${dir.name}: sin archivos Markdown`;
  const list = document.createElement('ul');
  list.className = 'mdv-files';
  for (const path of files) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = path.join('/');
    button.title = path.join('/');
    button.dataset.path = path.join('/');
    button.addEventListener('click', async () => {
      const handle = await fileAt(path);
      if (handle) await openHandle(handle, path);
    });
    const item = document.createElement('li');
    item.append(button);
    list.append(item);
  }
  viewer.extra.replaceChildren(label, list);

  const first = files.find((p) => p.length === 1 && /^readme\./i.test(p[0]!)) ?? files[0];
  const handle = first && (await fileAt(first));
  if (first && handle) await openHandle(handle, first);
}

async function openAny(handle: FileSystemHandle): Promise<void> {
  if (handle.kind === 'directory') return openFolder(handle as FileSystemDirectoryHandle);
  closeFolder();
  await openHandle(handle as FileSystemFileHandle, [handle.name]);
}

/** The picker rejects when the user cancels; that is not an error. */
async function pick(open: () => Promise<FileSystemHandle>): Promise<void> {
  let handle: FileSystemHandle;
  try {
    handle = await open();
  } catch {
    return;
  }
  await openAny(handle);
}

function addAction(label: string, run: () => void): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mdv-textbtn';
  button.textContent = label;
  button.addEventListener('click', run);
  viewer.actions.append(button);
}

addAction('Abrir archivo', () => {
  if (window.showOpenFilePicker) {
    void pick(async () => {
      const [handle] = await window.showOpenFilePicker!({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'] } }],
      });
      return handle!;
    });
    return;
  }
  // Browsers without file handles: no live reload, but reading still works.
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,text/markdown,text/plain';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void openFile(file);
  });
  input.click();
});

if (window.showDirectoryPicker) {
  addAction('Abrir carpeta', () => void pick(() => window.showDirectoryPicker!()));
}

const drop = document.createElement('div');
drop.className = 'mdv-drop';
drop.textContent = 'Suelta el archivo o la carpeta para abrirlo';
viewer.root.append(drop);

let dragDepth = 0;
const setDragging = (on: boolean) => document.documentElement.classList.toggle('mdv-dragging', on);

addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types.includes('Files')) return;
  dragDepth++;
  setDragging(true);
});
addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    setDragging(false);
  }
});
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  setDragging(false);
  const item = e.dataTransfer?.items[0];
  if (!item) return;
  const file = item.getAsFile();
  const handle = await item.getAsFileSystemHandle?.();
  if (handle) await openAny(handle);
  else if (file) await openFile(file);
});

addEventListener('paste', (e) => {
  const text = e.clipboardData?.getData('text/plain');
  if (!text?.trim()) return;
  closeFolder();
  show(text, null);
});

// Files opened from the system "Open with" menu once the app is installed.
window.launchQueue?.setConsumer((params) => {
  const handle = params.files[0];
  if (handle) void openAny(handle);
});

setInterval(async () => {
  const doc = current;
  if (document.hidden || !settings.autoReload || !doc?.handle) return;
  try {
    const file = await doc.handle.getFile();
    if (file.lastModified === doc.lastModified || current !== doc) return;
    show(await file.text(), { ...doc, lastModified: file.lastModified });
  } catch {
    // The file was moved or deleted; keep showing the last version.
  }
}, RELOAD_MS);

show(welcome, null);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register('./sw.js');
}
