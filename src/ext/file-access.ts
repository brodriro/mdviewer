import { browser } from 'wxt/browser';

/** Fills `box` with the current state of the "allow access to file URLs" switch. */
export async function describeFileAccess(box: HTMLElement): Promise<boolean> {
  const allowed = await browser.extension.isAllowedFileSchemeAccess();
  box.dataset.ok = String(allowed);
  box.replaceChildren();

  const text = document.createElement('p');
  text.textContent = allowed
    ? 'El acceso a archivos locales está activado. Arrastra un archivo .md a una pestaña para leerlo.'
    : 'El acceso a archivos locales está desactivado. Chrome lo exige para leer archivos .md de tu disco.';
  box.append(text);

  if (!allowed) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.textContent = 'Abrir los ajustes de la extensión';
    button.addEventListener('click', () => {
      void browser.tabs.create({ url: `chrome://extensions/?id=${browser.runtime.id}` });
    });
    box.append(button);
  }
  return allowed;
}
