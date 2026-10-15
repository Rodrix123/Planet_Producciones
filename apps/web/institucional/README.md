# Web institucional

Sitio estático de Planet Producciones para Cloudflare Pages. Es independiente del
aplicativo: no usa el backend, el cotizador ni el inicio de sesión, y su build solo
incluye las páginas de esta carpeta (lista blanca en `../vite.config.institucional.ts`).
Reutiliza el diseño de `../src/style.css` y `../src/landing.css` sin modificarlos.

## Comandos (desde `apps/web`)

| Comando | Qué hace |
|---|---|
| `npm run dev:institucional` | Vista local en http://localhost:5174 con lo pendiente resaltado en amarillo. |
| `npm run dev:institucional -- --host` | Igual, y además muestra una dirección de red para abrirla desde el celular (misma red Wi-Fi). |
| `npm run build:institucional` | Versión para publicar en `institucional/dist/`. **Se detiene** mientras haya datos sin confirmar o páginas legales que no existan. |
| `npm run build:institucional:borrador` | Compila con lo pendiente resaltado, solo para revisar en local. Nunca se publica. |
| `npm run preview:institucional` | Sirve la última compilación en http://localhost:4174. |
| `npm run typecheck:institucional` | Revisa los tipos de esta carpeta. |

## Dónde se cambia cada cosa

| Necesito… | Archivo |
|---|---|
| Cambiar textos o secciones | `index.html` |
| Confirmar un dato o cambiar su valor | `contenido.ts` (`PENDIENTES` y `DATOS`) |
| Autorizar o quitar fotos de la galería | `contenido.ts` (`FOTOS`) |
| Estilos propios de este sitio | `src/institucional.css` |
| Menú móvil y visor de fotos | `src/main.ts` |
| Cómo se llenan los marcadores del HTML | `plugin-contenido.ts` |

## Cómo se publica un dato

1. La dueña lo confirma por escrito (`docs/institucional/solicitud-a-la-duena.md`).
2. Si el valor cambia, se corrige en `DATOS`; si falta (`null`), se completa.
3. Su ID se pone en `confirmado: true` dentro de `PENDIENTES`. `TXT` se confirma cuando
   la dueña aprueba los textos de la página.
4. Las fotos se autorizan una por una con `autorizada: true` en `FOTOS`. Sin ninguna
   autorizada, la galería no aparece en la versión publicada y sus archivos no se copian.

Mientras quede algo pendiente, `npm run build:institucional` muestra la lista y no genera
la versión publicable.

## Marcadores del HTML

`{{dato:campo}}` texto visible · `{{valor:campo}}` valor plano (atributos y `<head>`) ·
`{{lista:campo}}` elementos `<li>` · `{{recurso:archivo}}` logo o foto de `apps/web/public` ·
`{{legal:pagina}}` enlace a una página legal · `<!-- pendiente:ID --> … <!-- /pendiente:ID -->`
bloque que depende de un pendiente · `<!-- si-hay-fotos --> … <!-- /si-hay-fotos -->` solo
aparece si hay fotos que mostrar. El detalle está al inicio de `plugin-contenido.ts`.

## Pendiente para otros numerales

- Páginas `/privacidad`, `/terminos` y `/eliminacion-datos` (Numeral 4).
- `404.html`, URL canónica, imagen para redes y configuración de Cloudflare Pages
  (Numeral 6; la URL canónica depende del dominio).
- Reducir el peso de las fotos cuando la dueña apruebe las definitivas.
