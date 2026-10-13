import { renderMarkdown, type RenderResult } from '../core';
import { resolveTheme, THEMES, type Settings, type Width } from './settings';

export interface ViewerHost {
  /** The user changed a setting from the toolbar; the host persists it. */
  onSettingsChange(patch: Partial<Settings>): void;
  /** Turns `pre.mermaid` blocks into diagrams. Their source is in `data-src`. */
  renderMermaid?(blocks: HTMLElement[], theme: 'light' | 'dark'): Promise<void>;
  openOptions?(): void;
  /** Maps a relative image path to a loadable URL. */
  resolveImage?(src: string): Promise<string | null>;
  /** Handles a click on a relative link. Return true if handled. */
  openLink?(href: string): boolean;
}

const WIDTHS: Width[] = ['narrow', 'medium', 'wide', 'full'];

const ICONS = {
  toc: '<path d="M2 4h12M2 8h12M2 12h8"/>',
  raw: '<path d="M5.5 4 2 8l3.5 4M10.5 4 14 8l-3.5 4"/>',
  width: '<path d="M2 8h12M5 5 2 8l3 3M11 5l3 3-3 3"/>',
  theme: '<circle cx="8" cy="8" r="5.5"/><path d="M8 2.5v11a5.5 5.5 0 0 0 0-11z" fill="currentColor"/>',
  print: '<path d="M4.5 6V2.5h7V6M4.5 11.5h-2V6h11v5.5h-2M4.5 9.5h7v4h-7z"/>',
  options:
    '<circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>',
};

const LABELS: Record<keyof typeof ICONS, string> = {
  toc: 'Mostrar u ocultar el índice',
  raw: 'Ver el texto original',
  width: 'Cambiar el ancho de lectura',
  theme: 'Cambiar el tema',
  print: 'Imprimir o guardar como PDF',
  options: 'Opciones',
};

function isRelative(url: string): boolean {
  return !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url);
}

export class Viewer {
  readonly root: HTMLElement;
  /** Slot at the top of the side panel for host content (e.g. a file list). */
  readonly extra: HTMLElement;
  /** Slot in the toolbar for host buttons. */
  readonly actions: HTMLElement;
  private readonly content: HTMLElement;
  private readonly raw: HTMLElement;
  private readonly tocList: HTMLElement;
  private readonly titleEl: HTMLElement;
  private source = '';
  private result: RenderResult | null = null;
  private showRaw = false;
  private tocOpen: boolean;
  private headings: HTMLElement[] = [];
  private scrollQueued = false;

  constructor(
    mount: HTMLElement,
    private readonly host: ViewerHost,
    private settings: Settings,
  ) {
    document.documentElement.classList.add('mdv-page');
    this.tocOpen = settings.showToc && innerWidth > 900;

    this.root = document.createElement('div');
    this.root.className = 'mdv';
    this.root.innerHTML = `
      <header class="mdv-bar">
        ${this.button('toc')}
        <span class="mdv-title"></span>
        <div class="mdv-actions"></div>
        ${this.button('raw')}${this.button('width')}${this.button('theme')}${this.button('print')}
        ${host.openOptions ? this.button('options') : ''}
      </header>
      <nav class="mdv-toc" aria-label="Índice"><div class="mdv-extra"></div><ul></ul></nav>
      <main class="mdv-main">
        <article class="mdv-content"></article>
        <pre class="mdv-raw" hidden></pre>
      </main>`;
    this.content = this.root.querySelector('.mdv-content')!;
    this.raw = this.root.querySelector('.mdv-raw')!;
    this.tocList = this.root.querySelector('.mdv-toc ul')!;
    this.extra = this.root.querySelector('.mdv-extra')!;
    this.actions = this.root.querySelector('.mdv-actions')!;
    this.titleEl = this.root.querySelector('.mdv-title')!;

    this.root.querySelector('.mdv-bar')!.addEventListener('click', (e) => this.onBarClick(e));
    this.content.addEventListener('click', (e) => this.onContentClick(e));
    addEventListener('scroll', () => this.queueActiveUpdate(), { passive: true });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.settings.theme === 'auto') this.applyTheme();
    });

    mount.append(this.root);
    this.applySettings();
  }

  get title(): string | null {
    return this.result?.title ?? null;
  }

  setTitle(text: string): void {
    this.titleEl.textContent = text;
  }

  /** Renders `source`, keeping the scroll position when it is a refresh. */
  setSource(source: string): void {
    if (source === this.source && this.result) return;
    const y = scrollY;
    this.source = source;
    this.raw.textContent = source;
    this.render();
    scrollTo(0, y);
  }

  setSettings(next: Settings): void {
    const prev = this.settings;
    this.settings = next;
    if (next.showToc !== prev.showToc) this.tocOpen = next.showToc;
    this.applySettings();
    if (next.math !== prev.math || next.mermaid !== prev.mermaid) this.render();
  }

  scrollToHash(hash: string): void {
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (id) document.getElementById(id)?.scrollIntoView();
  }

  private button(name: keyof typeof ICONS): string {
    return `<button class="mdv-btn" type="button" data-act="${name}" title="${LABELS[name]}" aria-label="${LABELS[name]}"><svg viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg></button>`;
  }

  private applySettings(): void {
    const { root, settings } = this;
    root.dataset.width = settings.width;
    root.dataset.font = settings.font;
    root.dataset.toc = this.tocOpen ? 'open' : 'closed';
    root.style.setProperty('--mdv-font-size', `${settings.fontSize}px`);
    root.querySelector('[data-act=toc]')!.setAttribute('aria-pressed', String(this.tocOpen));
    root.querySelector('[data-act=raw]')!.setAttribute('aria-pressed', String(this.showRaw));
    this.content.hidden = this.showRaw;
    this.raw.hidden = !this.showRaw;
    this.applyTheme();
  }

  private applyTheme(): void {
    const theme = resolveTheme(this.settings.theme);
    const changed = document.documentElement.dataset.mdvTheme !== theme;
    document.documentElement.dataset.mdvTheme = theme;
    if (changed && this.result) void this.renderDiagrams();
  }

  private render(): void {
    const result = renderMarkdown(this.source, { math: this.settings.math });
    this.result = result;
    this.content.innerHTML = result.html;

    this.tocList.replaceChildren(
      ...result.toc.map((item) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `#${encodeURIComponent(item.id)}`;
        a.textContent = item.text;
        a.style.setProperty('--level', String(item.level));
        li.append(a);
        return li;
      }),
    );
    this.root.toggleAttribute('data-empty-toc', result.toc.length === 0 && !this.extra.hasChildNodes());
    this.headings = result.toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);

    for (const pre of this.content.querySelectorAll<HTMLElement>('pre.hljs')) this.addCopyButton(pre);
    for (const pre of this.content.querySelectorAll<HTMLElement>('pre.mermaid')) {
      pre.dataset.src = pre.textContent ?? '';
    }
    void this.resolveImages();
    void this.renderDiagrams();
    this.updateActive();
  }

  private addCopyButton(pre: HTMLElement): void {
    const wrap = document.createElement('div');
    wrap.className = 'mdv-codewrap';
    pre.replaceWith(wrap);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mdv-copy';
    btn.textContent = 'Copiar';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent ?? '');
        btn.textContent = 'Copiado';
      } catch {
        btn.textContent = 'No se pudo copiar';
      }
      setTimeout(() => (btn.textContent = 'Copiar'), 1500);
    });
    wrap.append(pre, btn);
  }

  private async resolveImages(): Promise<void> {
    const resolve = this.host.resolveImage;
    if (!resolve) return;
    for (const img of this.content.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (!src || !isRelative(src)) continue;
      const url = await resolve(src);
      if (url) img.src = url;
    }
  }

  private async renderDiagrams(): Promise<void> {
    if (!this.settings.mermaid || !this.host.renderMermaid) return;
    const blocks = [...this.content.querySelectorAll<HTMLElement>('pre.mermaid')];
    if (blocks.length) await this.host.renderMermaid(blocks, resolveTheme(this.settings.theme));
  }

  private onBarClick(e: Event): void {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    const { settings } = this;
    switch (act) {
      case 'toc':
        this.tocOpen = !this.tocOpen;
        this.applySettings();
        // On narrow screens the panel is a transient overlay, not a preference.
        if (innerWidth > 900) this.host.onSettingsChange({ showToc: this.tocOpen });
        break;
      case 'raw':
        this.showRaw = !this.showRaw;
        this.applySettings();
        break;
      case 'width':
        this.change({ width: WIDTHS[(WIDTHS.indexOf(settings.width) + 1) % WIDTHS.length]! });
        break;
      case 'theme':
        this.change({ theme: THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length]! });
        break;
      case 'print':
        print();
        break;
      case 'options':
        this.host.openOptions?.();
        break;
    }
  }

  private change(patch: Partial<Settings>): void {
    this.setSettings({ ...this.settings, ...patch });
    this.host.onSettingsChange(patch);
  }

  private onContentClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const href = (e.target as Element).closest('a')?.getAttribute('href');
    if (href && isRelative(href) && this.host.openLink?.(href)) e.preventDefault();
  }

  private queueActiveUpdate(): void {
    if (this.scrollQueued) return;
    this.scrollQueued = true;
    requestAnimationFrame(() => {
      this.scrollQueued = false;
      this.updateActive();
    });
  }

  private updateActive(): void {
    let current: HTMLElement | undefined;
    for (const h of this.headings) {
      if (h.getBoundingClientRect().top > 80) break;
      current = h;
    }
    current ??= this.headings[0];
    for (const a of this.tocList.querySelectorAll('a')) {
      const active = current !== undefined && a.getAttribute('href') === `#${encodeURIComponent(current.id)}`;
      if (active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }
}
