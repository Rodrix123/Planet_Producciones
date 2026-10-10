# CLAUDE.md

Este archivo da contexto a Claude Code al trabajar en este repositorio.
Ver también `AGENTS.md` para convenciones generales del proyecto.

## Qué es este repo

Monorepo (`apps/web` + `apps/server`) del cotizador VIP de Planet
Producciones. Originado a partir de una app de una sola página (HTML +
JS + Express) migrada a esta estructura de monorepo en TypeScript.

`apps/web` es un sitio multi-página (Vite `rollupOptions.input`): `index.html`
(landing promocional), `cotizador.html` (cotizador VIP) y `login.html`
(interfaz de acceso, sin backend de autenticación todavía).

## Dónde vive cada cosa

| Necesito...                                   | Archivo                          |
|------------------------------------------------|-----------------------------------|
| Cambiar la landing / página promocional         | `apps/web/index.html` + `apps/web/src/landing.css` + `apps/web/src/home.ts` |
| Cambiar el catálogo de precios / los servicios de la cotización | `apps/web/src/catalogo.html` (se monta en `cotizador.html`) |
| Cambiar el cálculo del total | `apps/web/src/catalogo.ts` |
| Cambiar la generación de PDF/Excel del navegador, o el guardado de la cotización junto con el evento en creación | `apps/web/src/main.ts` |
| Cambiar el formulario de nuevo evento (solo datos del evento; de ahí se pasa a cotizar) | `apps/web/src/eventos.ts` + `apps/web/src/borrador-evento.ts` |
| Cambiar cómo se guarda un evento nuevo (evento + cotización + servicios) | `packages/db/src/eventos.ts` |
| Cambiar estilos del cotizador                   | `apps/web/src/style.css`          |
| Cambiar la página de login                      | `apps/web/login.html` + `apps/web/src/login.ts` |
| Cambiar el endpoint de la API / envío de correo | `apps/server/src/index.ts`        |
| Cambiar el PDF/Excel generado en servidor       | `apps/server/src/index.ts`        |
| Variables de entorno del backend                | `apps/server/.env`                |

## Reglas para este repo

- No traducir ni cambiar los textos existentes en español.
- No cambiar el diseño visual (paleta naranja/oscura) salvo pedido expreso.
- Mantener la lógica de cálculo de precios idéntica salvo pedido expreso.
- Cualquier nueva dependencia debe añadirse al `package.json` del workspace
  correspondiente (`apps/web` o `apps/server`), no al root, salvo que sea
  una herramienta de tooling compartida.
-No hagas ninguna accion de github sina autorizacion primero
-No crees nuevas tablas en la base de datos sin primero tener autorizacion
- No modifiques la tabals existenetes sin previa autorizacion
- No insertes nuevos datos sin previa autorizacion

