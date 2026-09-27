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
- Los precios y catálogos de servicios viven en `apps/web/index.html`
  (atributos `data-precio` de los `<select>`/checkbox) — reflejar cualquier
  cambio también en la lógica de `apps/web/src/main.ts`.

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
