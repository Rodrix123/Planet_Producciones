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
  Antes de pasar a cotizar se comprueba la fecha y la hora con
  `GET /api/eventos/fecha?fecha=…&hora=…`, que aplica la regla de la base
  (`config.fecha_maxima_separacion_evento`, días máximos desde hoy) y que el
  evento no se solape con otro (misma fecha y hora); `crearEvento` lo vuelve a
  comprobar.
- La cotización no depende del inventario: se puede hacer siempre, haya o no
  stock en bodega de lo cotizado. La única restricción es del evento: no puede
  solaparse con otro.
- Modelo de eventos y cotizaciones: `quote` guarda los datos del evento (fecha,
  hora, tipo, sede `venue_id` o lugar escrito a mano con `venue_nombre_manual` /
  `venue_direccion_manual`, dirección, cliente, transporte), su `estado`
  (`recibida`, `en_revision`, `finalizada`, `cancelada`) y sus servicios
  (`quote_items`, con `nota` opcional); `events` solo guarda lo propio del evento
  (confirmación, pagos, contrato) y apunta a su cotización con `events.quote_id`.
  `events` ya no tiene fecha, hora, lugar ni dirección: no se deben leer ni escribir ahí.
- El menú de eventos solo muestra los eventos vigentes: `listarEventos` devuelve los
  de hoy en adelante (fecha de la cotización, hora de Colombia) y los que ya pasaron
  no se envían al navegador. Un evento de hoy sigue vigente todo el día.
  `listarEventos` (`packages/db/src/eventos.ts`) une ambas tablas y ordena por
  fecha y hora de la cotización.

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
