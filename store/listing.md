# Ficha de Chrome Web Store

## Nombre

MD Viewer

## Resumen (máx. 132 caracteres)

Lee archivos Markdown locales y remotos con formato, índice, código resaltado, fórmulas y diagramas.

## Descripción

MD Viewer convierte cualquier archivo Markdown que abras en Chrome en un documento cómodo de leer, sin salir de la pestaña y sin enviar nada a ningún servidor.

- Markdown de GitHub: tablas, listas de tareas, notas al pie y anclas en los títulos.
- Índice lateral que marca la sección que estás leyendo.
- Resaltado de sintaxis y botón para copiar cada bloque de código.
- Fórmulas con KaTeX y diagramas con Mermaid.
- Temas claro y oscuro, cuatro anchos de lectura y tres tipografías.
- Recarga automática: edita el archivo y la vista se actualiza sola.
- Recuerda por dónde ibas en cada documento.
- Diseño de impresión limpio para guardar como PDF.
- Botón para ver el texto original en cualquier momento.

Funciona con archivos de tu disco (activa «Permitir acceso a URL de archivo» en los detalles de la extensión) y con cualquier dirección que termine en .md o .markdown.

## Categoría

Herramientas para desarrolladores

## Propósito único

Mostrar con formato los documentos Markdown que el usuario abre en el navegador.

## Justificación de permisos

| Permiso | Motivo |
|---------|--------|
| `storage` | Guardar las preferencias de lectura y la posición de desplazamiento de cada documento. |
| `scripting` | Inyectar la librería de diagramas solo en los documentos que contienen un bloque Mermaid, en lugar de cargarla siempre. |
| Acceso a `*://*/*.md`, `*://*/*.markdown` y `file:///*.md` | El content script debe ejecutarse en las direcciones que sirven Markdown para sustituir el texto plano por el documento con formato. Solo actúa si la respuesta es texto plano; las páginas HTML no se tocan. |

## Uso de datos

No se recopilan datos de usuario. Política de privacidad: `PRIVACY.md`.

## Capturas

`screenshot-light.png`, `screenshot-light-2.png`, `screenshot-dark.png` y `screenshot-dark-2.png` (1280 × 800). Se regeneran con `pnpm build && node scripts/screenshots.mjs`.
