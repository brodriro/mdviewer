import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import katexCss from 'katex/dist/katex.min.css?raw';
import viewerCss from '../src/ui/viewer.css?inline';
import { Viewer } from '../src/ui/viewer';
import { MATCHES } from '../src/ext/matches';
import type { FetchReply, Message } from '../src/ext/messages';
import { loadSettings, onSettingsChanged, saveSettings } from '../src/ext/storage';

const TEXT_TYPES = ['text/markdown', 'text/x-markdown', 'text/plain'];
const SCROLL_PREFIX = 'scroll:';
const SCROLL_ENTRIES = 200;
const RELOAD_MS = 1000;

type MermaidRunner = (blocks: HTMLElement[], theme: 'light' | 'dark') => Promise<void>;
type ScrollEntry = [y: number, savedAt: number];

function send<T = void>(message: Message): Promise<T> {
  return browser.runtime.sendMessage(message);
}

/** Chrome shows text responses as a lone <pre>; anything else is a real page. */
function findSourceElement(): HTMLPreElement | null {
  if (!TEXT_TYPES.includes(document.contentType)) return null;
  const pre = document.body?.querySelector<HTMLPreElement>(':scope > pre');
  return pre && document.body.querySelectorAll(':scope > :not(pre)').length === 0 ? pre : null;
}

function injectStyles(css: string): void {
  try {
    // Constructed sheets are not subject to the page's style-src policy.
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
  }
}

function pageKey(): string {
  return location.href.replace(/#.*$/, '');
}

/** One storage key per document, so tabs never overwrite each other's position. */
function scrollKey(): string {
  return SCROLL_PREFIX + pageKey();
}

async function restoreScroll(): Promise<void> {
  const all = (await browser.storage.local.get(null)) as Record<string, ScrollEntry>;
  const y = all[scrollKey()]?.[0];
  if (y) scrollTo(0, y);

  const stale = Object.entries(all)
    .filter(([key]) => key.startsWith(SCROLL_PREFIX))
    .sort((a, b) => b[1][1] - a[1][1])
    .slice(SCROLL_ENTRIES)
    .map(([key]) => key);
  if (stale.length) await browser.storage.local.remove(stale);
}

function trackScroll(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saved = Math.round(scrollY);
  const save = () => {
    clearTimeout(timer);
    const y = Math.round(scrollY);
    if (y === saved) return;
    saved = y;
    void browser.storage.local.set({ [scrollKey()]: [y, Date.now()] satisfies ScrollEntry });
  };
  addEventListener(
    'scroll',
    () => {
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    },
    { passive: true },
  );
  // Leaving right after scrolling must not lose the position.
  addEventListener('pagehide', save);
}

function canAutoReload(): boolean {
  return location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

export default defineContentScript({
  matches: MATCHES,
  runAt: 'document_end',
  async main() {
    const pre = findSourceElement();
    if (!pre) return;
    let settings = await loadSettings();
    if (settings.excluded.includes(location.hostname)) return;

    const fontBase = browser.runtime.getURL('/fonts/' as never);
    injectStyles(viewerCss + katexCss.replaceAll('url(fonts/', `url(${fontBase}`));

    let mermaidReady: Promise<MermaidRunner> | undefined;
    const viewer = new Viewer(
      document.body,
      {
        onSettingsChange: (patch) => void saveSettings(patch),
        openOptions: () => void send({ type: 'mdv:options' }),
        renderMermaid: async (blocks, theme) => {
          // The background injects the diagram bundle into this same isolated world.
          mermaidReady ??= send({ type: 'mdv:mermaid' }).then(
            () => (globalThis as { __mdvMermaid?: MermaidRunner }).__mdvMermaid!,
          );
          await (await mermaidReady)(blocks, theme);
        },
      },
      settings,
    );
    pre.hidden = true;

    const fileName = decodeURIComponent(location.pathname.split('/').pop() ?? '');
    const show = (source: string) => {
      viewer.setSource(source);
      viewer.setTitle(fileName);
      document.title = viewer.title ?? fileName;
    };
    show(pre.textContent ?? '');

    if (location.hash) viewer.scrollToHash(location.hash);
    else await restoreScroll();
    trackScroll();

    onSettingsChanged((next) => {
      settings = next;
      viewer.setSettings(next);
    });

    if (!canAutoReload()) return;
    let failures = 0;
    const timer = setInterval(async () => {
      if (document.hidden || !settings.autoReload) return;
      let reply: FetchReply;
      try {
        reply = await send<FetchReply>({ type: 'mdv:fetch', url: pageKey() });
      } catch {
        // The extension was reloaded or removed; this script is orphaned.
        clearInterval(timer);
        return;
      }
      if (reply.ok) {
        failures = 0;
        show(reply.text);
      } else if (++failures >= 5) {
        clearInterval(timer);
      }
    }, RELOAD_MS);
  },
});
