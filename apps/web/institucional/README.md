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

Cloudflare Pages compila desde la raíz del repositorio con
`npm run build:institucional --workspace apps/web`, que es el mismo build. La configuración y el
porqué están en `docs/institucional/configuracion-cloudflare-pages.md`.

## Dónde se cambia cada cosa

| Necesito… | Archivo |
|---|---|
| Cambiar textos o secciones de la página de inicio | `index.html` |
| Cambiar la política de privacidad, los términos o el procedimiento de eliminación | `privacidad.html`, `terminos.html`, `eliminacion-datos.html` |
| Cambiar la página que se muestra en direcciones que no existen | `404.html` (enlaces y recursos siempre desde `/`) |
| Cambiar los encabezados de seguridad (CSP y demás) | `publico/_headers` (Vite lo copia tal cual a `dist`) |
| Cambiar el encabezado, el pie o las etiquetas comunes del `<head>` (las usan las 4 páginas) | `parciales/encabezado.html`, `parciales/pie.html`, `parciales/cabeza.html` |
| Confirmar un dato o cambiar su valor | `contenido.ts` (`PENDIENTES` y `DATOS`) |
| Autorizar o quitar fotos de la galería | `contenido.ts` (`FOTOS`) |
| Estilos propios de este sitio | `src/institucional.css` |
| Menú móvil y visor de fotos | `src/main.ts` |
| Cómo se llenan los marcadores del HTML | `plugin-contenido.ts` |
| Qué revisa la auditoría de seguridad de cada build | `auditoria.ts` (la conecta `plugin-auditoria.ts`; resultados en `docs/institucional/auditoria-seguridad.md`) |

## Cómo se publica un dato

1. La dueña lo confirma por escrito (`docs/institucional/solicitud-a-la-duena.md`).
2. Si el valor cambia, se corrige en `DATOS`; si falta (`null`), se completa.
3. Su ID se pone en `confirmado: true` dentro de `PENDIENTES`. `TXT` se confirma cuando
   la dueña aprueba los textos de la página de inicio; `PRIV`, `TERM` y `ELIM`, cuando aprueba
   cada documento legal (ver `docs/institucional/notas-revision-juridica.md`). `G5` lo confirma
   el equipo cuando verifica qué proveedores intervienen.
4. Las fotos se autorizan una por una con `autorizada: true` en `FOTOS`. Sin ninguna
   autorizada, la galería no aparece en la versión publicada y sus archivos no se copian.

Mientras quede algo pendiente, `npm run build:institucional` muestra la lista y no genera
la versión publicable.

## Marcadores del HTML

`{{parcial:nombre}}` inserta `parciales/nombre.html` · `{{dato:campo}}` texto visible ·
`{{valor:campo}}` valor plano (atributos y `<head>`) ·
`{{lista:campo}}` elementos `<li>` · `{{recurso:archivo}}` logo o foto de `apps/web/public` ·
`{{legal:pagina}}` enlace a una página legal · `<!-- pendiente:ID --> … <!-- /pendiente:ID -->`
bloque que depende de un pendiente · `<!-- si-hay-fotos --> … <!-- /si-hay-fotos -->` solo
aparece si hay fotos que mostrar. El detalle está al inicio de `plugin-contenido.ts`.

## Auditoría de seguridad

Cada build termina con una auditoría de la carpeta compilada. Revisa claves, `.env`, datos
privados, enlaces a partes privadas, documentos, bases de datos, recursos, páginas legales,
compilación y contenido de borrador. El control 11 exige `_headers` y `404.html`, y no deja
pasar scripts ni estilos en línea, porque la política de seguridad los bloquearía en Cloudflare.
Si algo falla, el build se detiene y la carpeta no debe publicarse. Si se agrega una página, un
dominio externo o un correo autorizado, hay que actualizar la configuración en
`../vite.config.institucional.ts`. Si es un recurso externo, también hay que permitirlo en
`publico/_headers`.

## Pendiente para otros numerales
- URL canónica, imagen para redes, `robots.txt` y `sitemap.xml`, cuando exista la dirección
  definitiva (Numerales 8 y 9).
- Reducir el peso de las fotos cuando la dueña apruebe las definitivas.
