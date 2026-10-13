export type Theme = 'auto' | 'light' | 'dark';
export type Width = 'narrow' | 'medium' | 'wide' | 'full';
export type Font = 'sans' | 'serif' | 'mono';

export interface Settings {
  theme: Theme;
  width: Width;
  font: Font;
  fontSize: number;
  showToc: boolean;
  math: boolean;
  mermaid: boolean;
  autoReload: boolean;
  /** Hostnames where the extension leaves the page untouched. */
  excluded: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  width: 'medium',
  font: 'sans',
  fontSize: 16,
  showToc: true,
  math: true,
  mermaid: true,
  autoReload: true,
  excluded: [],
};

export const THEMES: Theme[] = ['auto', 'light', 'dark'];

export function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'auto') return theme;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
