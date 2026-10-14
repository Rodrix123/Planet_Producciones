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
  y nombre. El precio de cada variante está en `inventory_variants.price_variants`
  (antes `price`); las variantes que solo cambiaban por cantidad de piezas ya no
  existen: la cantidad se pone al cotizar (`quote_items.quantity`).
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
- Modelo de eventos y cotizaciones: `quote` y `events` guardan las mismas columnas de
  logística (fecha, hora, tipo de evento, sede `venue_id` o lugar escrito a mano con
  `venue_nombre_manual` / `venue_direccion_manual`, dirección, cliente y transporte).
  Todas son opcionales: un evento o una cotización puede no tener fecha u hora todavía.
  `quote` además tiene su `estado` (`recibida`, `en_revision`, `finalizada`, `cancelada`) y sus
  servicios (`quote_items`, con `nota` opcional); `events` guarda lo propio del evento
  (confirmación, pagos, contrato) y apunta a su cotización con `events.quote_id`.
  Al leer, cada dato sale del evento y, si falta ahí, de su cotización; al crear un evento
  se escribe en las dos tablas (así los triggers de la base sobre `events` también aplican).
- El menú de eventos solo muestra los eventos vigentes: `listarEventos` devuelve los
  de hoy en adelante (hora de Colombia) más los que aún no tienen fecha; los que ya pasaron
  no se envían al navegador. Un evento de hoy sigue vigente todo el día. Los eventos sin
  fecha aparecen en la lista (como "sin fecha") pero no en el calendario, y los que no
  tienen hora muestran "Hora por definir". `listarEventos`
  (`packages/db/src/eventos.ts`) los ordena por fecha y hora.

## Comandos útiles

```bash
npm install          # instala todos los workspaces
npm run dev           # backend + frontend en paralelo
npm run build          # build de producción de ambos
npm run typecheck      # chequeo de tipos de ambos workspaces
```

### Desarrollo local: puertos y conexión web ↔ API

- La web corre en `http://localhost:5173` con `strictPort`: si ese puerto lo tiene el
  Vite de otra rama, Vite falla en vez de saltar a otro puerto. Detén el otro Vite
  antes de levantar este.
- La API corre en el `PORT` de `apps/server/.env` (3000 por defecto).
- La web llama a `/api` en su mismo origen (`VITE_API_URL` vacío en `apps/web/.env`) y
  Vite lo reenvía al `PORT` de esa misma rama (`apps/web/vite.config.ts`). Por eso no hay
  CORS ni URLs fijas que se crucen entre ramas. Si dos ramas corren a la vez, cada una
  necesita su propio `PORT` en `apps/server/.env`, y la web de cada una usa el suyo.
- El mismo proxy sirve `vite preview`. El servidor Express también sirve `apps/web/dist`;
  tras cambiar código de la web hay que recompilar con `npm run build:web`.

## Antes de abrir un PR

1. `npm run typecheck`
2. `npm run build`
3. Verificar manualmente el flujo de cotización en `apps/web`.
