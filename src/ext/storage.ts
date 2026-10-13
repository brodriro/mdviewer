import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, type Settings } from '../ui/settings';

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.sync.get(DEFAULT_SETTINGS as unknown as Record<string, unknown>);
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings>) };
}

export function saveSettings(patch: Partial<Settings>): Promise<void> {
  return browser.storage.sync.set(patch);
}

export function onSettingsChanged(listener: (settings: Settings) => void): void {
  browser.storage.onChanged.addListener((_changes, area) => {
    if (area === 'sync') void loadSettings().then(listener);
  });
}
