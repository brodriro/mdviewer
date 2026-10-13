# MD Viewer

Lector de Markdown en dos formatos que comparten el mismo núcleo:

- **Extensión de Chrome (Manifest V3):** muestra con formato cualquier URL `.md` o `.markdown` que devuelva texto, local o remota.
- **Aplicación web instalable:** abre archivos y carpetas arrastrándolos, sin instalar nada.

Incluye GFM (tablas, tareas, notas al pie), índice lateral, resaltado de código, fórmulas KaTeX, diagramas Mermaid, temas claro y oscuro, recarga automática y un diseño de impresión limpio.

## Desarrollo

```sh
pnpm install
pnpm dev          # extensión con recarga en caliente
pnpm web:dev      # aplicación web
pnpm test         # pruebas del núcleo
pnpm build && pnpm web:build && pnpm test:e2e   # pruebas en Chromium
pnpm typecheck
```

La primera vez, las pruebas e2e necesitan `pnpm exec playwright install chromium`.

## Probar la extensión en Chrome

1. `pnpm build`
2. Abre `chrome://extensions`, activa el **Modo de desarrollador** y pulsa **Cargar descomprimida**.
3. Elige la carpeta `.output/chrome-mv3`.
4. Para leer archivos de tu disco, activa **Permitir acceso a URL de archivo** en los detalles de la extensión. La página de bienvenida lo explica y detecta cuándo está activo.

## Estructura

| Ruta | Contenido |
|------|-----------|
| `src/core/` | Markdown a HTML saneado, índice y slugs. No depende del navegador ni de Chrome. |
| `src/ui/` | Visor compartido: barra, índice, estilos, ajustes y Mermaid. |
| `src/ext/` | Piezas propias de la extensión: almacenamiento, mensajes y patrones de URL. |
| `entrypoints/` | Content script, service worker, opciones y bienvenida (WXT). |
| `web/` | Aplicación web y PWA. |
| `tests/` | Pruebas unitarias (Vitest) y e2e (Playwright). |
| `store/` | Ficha y capturas para Chrome Web Store. |

## Decisiones que conviene conocer

- **Seguridad.** El Markdown es contenido no confiable: todo el HTML pasa por DOMPurify antes de llegar al DOM, y Mermaid corre con `securityLevel: 'strict'`.
- **Mermaid bajo demanda.** Pesa unos 5 MB, así que el service worker lo inyecta solo cuando el documento tiene un diagrama.
- **Estilos.** Se aplican con hojas construidas (`adoptedStyleSheets`), que funcionan aunque la página tenga una CSP estricta.
- **Recarga automática.** Solo en `file://` y `localhost`; el service worker vuelve a leer el documento cada segundo mientras la pestaña está visible.
- **Límite conocido.** En sitios con CSP `img-src 'none'`, como `raw.githubusercontent.com`, el texto se muestra bien pero el sitio bloquea las imágenes.

## Publicar

`pnpm zip` genera `.output/mdviewer-<versión>-chrome.zip`. La ficha, la justificación de permisos y las capturas están en `store/`; la política de privacidad, en `PRIVACY.md`.
