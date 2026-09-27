# CLAUDE.md

Este archivo da contexto a Claude Code al trabajar en este repositorio.
Ver también `AGENTS.md` para convenciones generales del proyecto.

## Qué es este repo

Monorepo (`apps/web` + `apps/server`) del cotizador VIP de Planet
Producciones. Originado a partir de una app de una sola página (HTML +
JS + Express) migrada a esta estructura de monorepo en TypeScript.

## Dónde vive cada cosa

| Necesito...                                   | Archivo                          |
|------------------------------------------------|-----------------------------------|
| Cambiar el formulario / catálogo de precios     | `apps/web/index.html`             |
| Cambiar el cálculo del total o la generación de PDF/Excel del navegador | `apps/web/src/main.ts` |
| Cambiar estilos                                 | `apps/web/src/style.css`          |
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
