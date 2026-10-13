import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import type { FetchReply, Message } from '../src/ext/messages';

async function fetchText(url: string): Promise<FetchReply> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    // file: responses report status 0.
    if (!res.ok && res.status !== 0) return { ok: false };
    return { ok: true, text: await res.text() };
  } catch {
    return { ok: false };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
  });

  browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    const tab = sender.tab;
    switch (message.type) {
      case 'mdv:fetch':
        // A tab may only re-read the document it is showing.
        if (tab?.url?.replace(/#.*$/, '') !== message.url) sendResponse({ ok: false } satisfies FetchReply);
        else void fetchText(message.url).then(sendResponse);
        return true;
      case 'mdv:mermaid':
        if (tab?.id === undefined) return;
        void browser.scripting
          .executeScript({
            target: { tabId: tab.id, frameIds: [sender.frameId ?? 0] },
            files: ['/mermaid.js'],
          })
          .then(() => sendResponse());
        return true;
      case 'mdv:options':
        void browser.runtime.openOptionsPage();
        return;
    }
  });
});
