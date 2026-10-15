# Configuración de Cloudflare Pages

Valores para conectar la web institucional a Cloudflare Pages Free (Numeral 6, 15 de octubre de
2026). Salen de los archivos del proyecto y se comprobaron con una compilación en Linux y con el
emulador oficial de Cloudflare. En este numeral no se tocó Cloudflare ni GitHub.

## Valores

| Campo en Cloudflare | Valor | De dónde sale |
|---|---|---|
| Repositorio de GitHub | `Rodrix123/Planet_Producciones` | `git remote -v` |
| Rama de producción | `produccion-institucional` (nueva, ver abajo) | Propuesta |
| Framework preset | `None` | El sitio usa su propia configuración de Vite, no un framework con preset |
| Comando de compilación | `npm run build:institucional --workspace apps/web` | Script `build:institucional` de `apps/web/package.json`, con la misma forma que los scripts de la raíz (`npm run build --workspace apps/web`) |
| Directorio de salida | `apps/web/institucional/dist` | `build.outDir` de `apps/web/vite.config.institucional.ts` |
| Directorio raíz (avanzado) | Vacío, es decir, la raíz del repositorio | Ver «Por qué la raíz del repositorio» |
| Variables de entorno | Solo `NODE_VERSION` = `24.21.0` | Versión con la que se compila en el equipo y en la simulación |
| Despliegues de vista previa (preview) | Ninguno (`None`) | Así ninguna otra rama (bot de WhatsApp, cotizador, paneles) genera direcciones públicas de prueba |
| Rutas de compilación (build watch paths) | Las que trae por defecto | La rama de producción es solo para este sitio |
| Nombre del proyecto | Sugerido: `planet-producciones` | Define la dirección `<nombre>.pages.dev`; si está libre se ve al crearlo, en el Numeral 7 |

**Variables de entorno.** El sitio no lee ninguna. Nunca se agregan claves de Supabase, Gmail,
Meta, n8n ni Gemini: este build no las usa, y una variable `VITE_` podría terminar dentro del
JavaScript publicado. `NODE_VERSION` fija la versión de Node para que el build no cambie cuando
Cloudflare actualice la suya, que hoy es la 22.16.0. El build también se probó con esa versión.

**Rama de producción.** Se recomienda una rama exclusiva, que solo se actualiza cuando la dueña
aprueba un cambio. Así publicar es un paso deliberado, y los avances en otras ramas no gastan
compilaciones (el plan gratuito permite 500 al mes). Se crea en el Numeral 7, después del commit de
los Numerales 4 a 6 y del arreglo de los submódulos. También se podría usar
`feature/web-institucional-meta`, pero cada push intentaría publicar.

## Por qué la raíz del repositorio

El proyecto es un monorepo con npm workspaces, y Cloudflare instala las dependencias desde el
directorio raíz que se configure: «The entire build pipeline, including the installation steps,
will begin from this location»
([documentación](https://developers.cloudflare.com/pages/get-started/guide/)).

- El único `package-lock.json` está en la raíz. Desde ahí, Cloudflare instala exactamente lo que
  dice el lockfile (`npm clean-install`).
- Con `apps/web` como raíz no habría lockfile. Además, el sitio usa `@types/node`, que hoy solo
  está declarado en `apps/server`, así que con una instalación parcial fallaría la revisión de
  tipos. Declararlo también en `apps/web` sería lo correcto; queda como recomendación, porque
  implica cambiar el lockfile.
- Instalar no es compilar. Se instalan las dependencias de todo el monorepo, pero el comando solo
  compila las 5 páginas de la lista blanca (`index`, `privacidad`, `terminos`,
  `eliminacion-datos` y `404`), y Cloudflare solo sube `apps/web/institucional/dist`. El servidor,
  el cotizador y los paneles no se compilan ni se publican.
- Nunca se debe usar `npm run build`, `npm run build:web` ni `apps/web/dist`: generan el aplicativo
  completo, con el inicio de sesión, el cotizador y los paneles.
- Si el comando es el correcto, el registro del build en Cloudflare muestra la lista «La web
  institucional todavía no se puede publicar» mientras falten datos. Cuando el sitio compile,
  mostrará «Auditoría de seguridad de la web institucional».
- El registro de instalación muestra avisos de `npm audit` sobre dependencias de desarrollo del
  monorepo. No llegan al sitio, que solo publica archivos estáticos.

## Qué pasará en el primer build

Mientras falten los datos y aprobaciones de la dueña, el build se detendrá con la lista de
pendientes (14 sin confirmar y 7 faltantes) y Cloudflare no publicará nada. Es lo esperado: es la
misma protección que en el equipo. Cuando todo esté confirmado en
`apps/web/institucional/contenido.ts`, el mismo comando genera la versión publicable. Se comprobó
con una simulación con datos ficticios, hecha solo en una carpeta temporal y ya borrada.

## Bloqueo encontrado: submódulos sin `.gitmodules`

El repositorio tiene tres entradas de submódulo (gitlinks), sin el archivo `.gitmodules` que
debería describirlas:

- `.claude/worktrees/calendario-retrae-lista`
- `.claude/worktrees/inventario-niveles`
- `.claude/worktrees/pin-paneles-eventos`

Son carpetas de trabajo locales que entraron por error en los commits `f8b0d35` y `52f2acb`. Están
en `Pagina-Principal` y en esta rama, no en `main`.

Cloudflare inicializa los submódulos al clonar, y su documentación exige que cada uno tenga `path`
y `url` en `.gitmodules`
([depuración](https://developers.cloudflare.com/pages/configuration/debugging-pages/)). En un clon
de prueba, `git submodule update --init --recursive` falla con:

```
fatal: No url found for submodule path '.claude/worktrees/calendario-retrae-lista' in .gitmodules
```

Con esto, lo más probable es que el primer build falle al clonar, antes de compilar.

**Arreglo**, probado en el mismo clon, donde la inicialización termina sin error: sacar las tres
entradas del índice. Las carpetas del equipo no se borran. `.gitignore` ya ignora
`.claude/worktrees/` para que no se vuelvan a subir. Se ejecuta en la raíz del repositorio y
entra en el próximo commit:

```
git rm --cached .claude/worktrees/calendario-retrae-lista .claude/worktrees/inventario-niveles .claude/worktrees/pin-paneles-eventos
```

Conviene hacer lo mismo en `Pagina-Principal`, pero solo esta rama, y la de producción que salga
de ella, afectan a Cloudflare.

## Rutas

Cloudflare sirve `privacidad.html` en `/privacidad` sin configuración extra, así que no hace falta
`_redirects`. Lo que sí faltaba era la página `404.html`. Sin ella, Pages trata el sitio como una
aplicación de una sola página y responde con el inicio, y código 200, a cualquier dirección
([documentación](https://developers.cloudflare.com/pages/configuration/serving-pages/)).

Resultado en el emulador oficial (`wrangler pages dev` 4.146.0):

| Dirección | Respuesta |
|---|---|
| `/`, `/privacidad`, `/terminos`, `/eliminacion-datos` | 200, también con `?utm_source=…` o `#seccion` |
| `/privacidad.html`, `/privacidad/`, `/terminos.html`, `/eliminacion-datos/` | 308 a la dirección sin `.html` ni barra final |
| `/index.html` | 308 a `/` |
| `/no-existe`, `/una/ruta/anidada/que/no-existe`, `/PRIVACIDAD` | 404 con la página nueva |
| `/login`, `/login.html`, `/cotizador.html`, `/panel-admin.html`, `/empleados.html`, `/api/pqrs`, `/.env`, `/apps/server/.env`, `/galeria/evento-sin-pantalla-3.png` | 404 |
| `/404` | 200, la misma página. Nadie enlaza esa dirección |
| `/_headers` | 502, por una falla del emulador (intenta leer `_headers/index.html`). Se comprueba en el sitio publicado, en el Numeral 8. El archivo no tiene nada secreto |

La página 404 se muestra en cualquier dirección (`/a/b/c`), así que todos sus enlaces y recursos
empiezan por `/`. La auditoría lo exige.

## Encabezados de seguridad

Están en [apps/web/institucional/publico/_headers](../../apps/web/institucional/publico/_headers).
Vite lo copia tal cual a la raíz de `dist`, y Cloudflare aplica esos encabezados a todas las
respuestas, también a la 404.

| Encabezado | Para qué |
|---|---|
| `Content-Security-Policy` | El navegador solo carga lo del propio sitio, más la hoja de estilos y las fuentes de Font Awesome desde cdnjs. Bloquea scripts y estilos en línea, peticiones a servidores, formularios y que otro sitio muestre estas páginas en un marco |
| `X-Frame-Options: DENY` | Lo mismo que `frame-ancestors`, para navegadores antiguos (evita el clickjacking) |
| `X-Content-Type-Options: nosniff` | El navegador no adivina el tipo de los archivos |
| `Referrer-Policy: strict-origin-when-cross-origin` | Al salir hacia Instagram o WhatsApp solo se envía el dominio, no la página |
| `Permissions-Policy` | Desactiva cámara, micrófono, ubicación, pagos y USB |
| `Cross-Origin-Opener-Policy: same-origin` | Aísla la página de las ventanas que se abren desde ella |

- No se configuró caché propia, porque Cloudflare recomienda no hacerlo
  ([documentación](https://developers.cloudflare.com/pages/configuration/serving-pages/)).
- La política no permite código en línea. Por eso, la regla que muestra el menú cuando no hay
  JavaScript pasó de un `<style>` dentro de `<noscript>` a `@media (scripting: none)`, en
  `src/institucional.css`.
- La auditoría tiene un control nuevo, el 11. Detiene el build si falta `_headers` o `404.html`,
  si la política se debilita o si aparece código en línea.
- Si más adelante se agrega un recurso externo, o se activa Web Analytics de Cloudflare, el
  navegador lo bloqueará hasta que se autorice en `_headers` y en `vite.config.institucional.ts`.
  En ese caso, la política de privacidad debería mencionarlo.

## Verificación hecha

| Prueba | Resultado |
|---|---|
| Revisión de tipos y comando de Cloudflare en Windows | Tipos sin errores. El build publicable se detiene con la lista de pendientes |
| Borrador (`build:institucional:borrador`) | Auditoría sin problemas, con los avisos de siempre (peso de las fotos y marcas de borrador) |
| Pruebas negativas de la auditoría | 33 de 33 problemas detectados: los 21 del Numeral 5 y 12 nuevos del control 11 |
| Linux (WSL Debian, como el entorno Ubuntu de Cloudflare) | Copia limpia del repositorio, con lo que quedaría tras el commit y fin de línea LF. Con Node 24.21.0 (npm 11.19.0) y con Node 22.16.0 (npm 10.9.2), `npm clean-install` en la raíz termina en 14 a 21 s y da los mismos resultados y los mismos archivos |
| Versión publicable simulada (todo confirmado con datos ficticios, solo en `/tmp`) | 11 de 11 controles en modo estricto. Genera 5 páginas, `_headers`, el CSS, el JS, el logo y solo las fotos autorizadas |
| Emulador de Cloudflare, rutas y encabezados | Ver las tablas anteriores |
| Edge con la política aplicada | Ninguna violación de la política en las 5 páginas. Font Awesome carga con su verificación de integridad, y funcionan los estilos, el logo, el menú del celular, la galería y el visor. Sin JavaScript, a 360 px, el menú se ve completo y sin desbordes |

## Pendiente para otros numerales

- **Numeral 7**:
  - commit de los Numerales 4 a 6 y del arreglo de los submódulos;
  - crear la rama de producción;
  - conectar el repositorio con los valores de arriba, con vista previa en `None`.
  - La aplicación de Cloudflare en GitHub la tiene que autorizar alguien con permisos de
    administración sobre `Rodrix123/Planet_Producciones`.
  - Pages también funciona con repositorios privados, como se recomendó en el
    [informe de seguridad](auditoria-seguridad.md).
- **Numeral 8**:
  - repetir las pruebas de rutas y encabezados en el sitio publicado, incluido `/_headers`;
  - comprobar que la política de privacidad abre sin bloqueos.
- **Numeral 9**, si hay dominio propio:
  - definir HSTS (`pages.dev` ya obliga HTTPS);
  - agregar la URL canónica, `robots.txt` y `sitemap.xml`;
  - revisar que la ofuscación de correos de Cloudflare (Email Address Obfuscation) no oculte el
    correo de la política.

## Revisión

- [ ] Revisé los valores de configuración y apruebo usarlos en el Numeral 7.
