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
| Cambiar el formulario / catálogo de precios     | `apps/web/cotizador.html`         |
| Cambiar el cálculo del total o la generación de PDF/Excel del navegador | `apps/web/src/main.ts` |
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
