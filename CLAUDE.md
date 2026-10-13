# MD Viewer

Lector de Markdown con dos destinos que comparten el mismo núcleo: una extensión de Chrome (Manifest V3, construida con WXT) y una aplicación web instalable (Vite). La interfaz está en español.

## Comandos

```sh
pnpm dev            # extensión con recarga en caliente
pnpm web:dev        # aplicación web
pnpm typecheck      # tsc --noEmit
pnpm test           # Vitest: núcleo de renderizado
pnpm test:e2e       # Playwright contra los artefactos ya compilados
pnpm build          # extensión -> .output/chrome-mv3
pnpm web:build      # web -> dist/web
pnpm zip            # paquete para Chrome Web Store
```

Las pruebas e2e no compilan nada: ejecuta `pnpm build && pnpm web:build` antes de `pnpm test:e2e`, o probarás una versión vieja. Una sola prueba: `pnpm playwright test -g "texto del nombre"`.

## Arquitectura

- `src/core/`: `renderMarkdown()` convierte Markdown en HTML saneado y devuelve el índice. No usa APIs de Chrome; solo necesita un DOM para DOMPurify.
- `src/ui/`: clase `Viewer` (barra, índice, vista), estilos y ajustes. Recibe un `ViewerHost` con lo que depende del destino: persistencia, Mermaid, imágenes y enlaces relativos.
- `src/ext/` y `entrypoints/`: la extensión. `content.ts` sustituye el `<pre>` de Chrome por el visor; `background.ts` relee documentos e inyecta Mermaid; `mermaid.ts` es el paquete de diagramas.
- `web/`: la aplicación web, que implementa su propio `ViewerHost` con File System Access.

Una función nueva del visor va en `src/ui/` y llega a los dos destinos. Solo lo que necesita APIs de Chrome va en `src/ext/` o `entrypoints/`.

## Reglas que no se ven en el código

- **Todo HTML derivado de Markdown pasa por `sanitize()`** en `src/core/render.ts` antes de tocar el DOM. El content script tiene privilegios de extensión, así que un XSS aquí es grave. Cualquier sintaxis nueva necesita un caso en el bloque `sanitization` de `tests/core.test.ts`.
- **El content script no puede importar Mermaid.** WXT lo empaqueta en un único archivo y cada página `.md` cargaría 5 MB. Se inyecta bajo demanda con `chrome.scripting.executeScript`.
- **Los estilos de la extensión se aplican con `adoptedStyleSheets`**, no con CSS declarado en el manifiesto: así sobreviven a CSP estrictas y no afectan a páginas HTML cuya URL termina en `.md`.
- **Todo el CSS del visor va bajo `.mdv` o `html.mdv-page`.** KaTeX necesita `box-sizing: content-box`; no quites esa excepción.
- **`katex` debe ser la misma versión que usa `@vscode/markdown-it-katex`.** Si difieren, el CSS y las fuentes no cuadran con el HTML generado y las fórmulas salen descolocadas.
- **`public/fonts/` es generado** por `scripts/copy-fonts.mjs` en `postinstall`; no se versiona.
- **Chrome rechaza content scripts con no-caracteres Unicode** ("It isn't UTF-8 encoded"). El plugin `escapeNoncharacters` de `wxt.config.ts` los escapa; KaTeX trae uno.
- **Los plugins CommonJS de markdown-it** pasan por `plugin()` en `render.ts`, porque el bundler los entrega a veces como `{ default }`.

## Pruebas e2e

- Playwright arranca con `--disable-extensions`; el fixture lo quita con `ignoreDefaultArgs`.
- El fixture cierra la pestaña de bienvenida: si queda abierta roba el foco y Chrome limita a 1 fps las pestañas en segundo plano, lo que vuelve lentas las pruebas.
- Las extensiones cargadas por línea de comandos tienen acceso a `file://` sin el interruptor manual, por eso la prueba de archivos locales funciona.
