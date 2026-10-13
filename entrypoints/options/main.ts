import '../../src/ext/page.css';
import { describeFileAccess } from '../../src/ext/file-access';
import { loadSettings, saveSettings } from '../../src/ext/storage';
import type { Settings } from '../../src/ui/settings';

const form = document.querySelector<HTMLFormElement>('#form')!;

function field(name: keyof Settings): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}

function fill(settings: Settings): void {
  for (const [name, value] of Object.entries(settings) as [keyof Settings, Settings[keyof Settings]][]) {
    const el = field(name);
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = value === true;
    else el.value = Array.isArray(value) ? value.join('\n') : String(value);
  }
}

function read(name: keyof Settings): Partial<Settings> {
  const el = field(name);
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return { [name]: el.checked };
  if (name === 'fontSize') {
    const size = Math.min(24, Math.max(12, Number(el.value) || 16));
    return { fontSize: size };
  }
  if (name === 'excluded') {
    const hosts = el.value
      .split(/\s+/)
      .map((line) => line.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '').toLowerCase())
      .filter(Boolean);
    return { excluded: [...new Set(hosts)] };
  }
  return { [name]: el.value };
}

form.addEventListener('change', (e) => {
  const name = (e.target as HTMLInputElement).name as keyof Settings;
  if (name) void saveSettings(read(name));
});

void loadSettings().then(fill);
void describeFileAccess(document.querySelector('#file-access')!);
