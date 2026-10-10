# AGENTS.md

Guía para agentes de IA (Claude Code, Copilot, etc.) que trabajen en este
repositorio.

## Resumen del proyecto

Cotizador VIP de **Planet Producciones**, empresa de producción técnica de
eventos (Manizales, Caldas). Monorepo con dos workspaces:

- `apps/web` — Frontend estático (Vite + TypeScript). Formulario de
  cotización, cálculo de precios en vivo, generación de PDF/Excel en el
  navegador (html2pdf.js, SheetJS).
- `apps/server` — API Express (TypeScript). Recibe la cotización, genera
  PDF (pdfkit) y Excel (exceljs), y los envía por correo (nodemailer) a la
  gerencia.

## Convenciones

- Idioma del código de negocio (nombres de variables, textos UI, correos):
  **español**. 
- No modificar el diseño visual (colores, layout, textos) ni el
  comportamiento funcional existente sin que se pida explícitamente.
- TypeScript estricto donde sea razonable; no romper la compilación.
- Los precios y catálogos de servicios viven en `apps/web/src/catalogo.html`
  (atributos `data-precio` de los `<select>`/checkbox) — reflejar cualquier
  cambio también en la lógica de `apps/web/src/catalogo.ts`. Los nombres y
  precios deben coincidir con `inventory` / `inventory_variants` en la base:
  un evento nuevo guarda sus servicios buscándolos por categoría (`data-tag`)
  y nombre.
- Un evento nuevo se crea desde la página de cotizaciones: el formulario de
  `eventos.html` solo recoge los datos del evento (queda como borrador en
  `sessionStorage`) y `cotizador.html` lo guarda junto con la cotización.
  Antes de pasar a cotizar se comprueba la fecha con `GET /api/eventos/fecha`,
  que aplica la regla de la base (`config.fecha_maxima_separacion_evento`,
  días máximos desde hoy); `crearEvento` la vuelve a comprobar.

## Comandos útiles

```bash
npm install          # instala todos los workspaces
npm run dev           # backend + frontend en paralelo
npm run build          # build de producción de ambos
npm run typecheck      # chequeo de tipos de ambos workspaces
```

## Antes de abrir un PR

1. `npm run typecheck`
2. `npm run build`
3. Verificar manualmente el flujo de cotización en `apps/web`.
