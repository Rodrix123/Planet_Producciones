# Configuración de Cloudflare Pages

Valores para conectar la web institucional a Cloudflare Pages Free (Numeral 6, 15 de octubre de
2026; actualizados el 24 de octubre con la versión preliminar). Salen de los archivos del proyecto y
se comprobaron con una compilación en Linux y con el emulador oficial de Cloudflare. Las pruebas
hechas son locales: que el despliegue en Cloudflare funcione solo se sabe viendo su registro.

## Tres versiones del sitio

Una sola base de código y tres formas de compilarla (`npm run … --workspace apps/web`):

| Comando | Para qué sirve | ¿Se publica? |
|---|---|---|
| `build:institucional:preliminar` | Versión **preliminar**. Muestra lo que ya tiene valor, aunque no esté confirmado por la dueña | **Sí, es la que usa Cloudflare por ahora** |
| `build:institucional` | Versión **definitiva**. Se detiene mientras haya datos sin confirmar | Sí, cuando todo esté confirmado |
| `build:institucional:borrador` | Revisión local, con todo lo pendiente resaltado en amarillo y las fotos sin autorizar | **Nunca.** Dentro de Cloudflare se niega a correr |

La versión preliminar:
- lleva en todas las páginas, arriba, una franja discreta: «Versión preliminar: la información de
  este sitio está en revisión y puede cambiar»;
- lleva `noindex`, para que los buscadores no guarden información sin confirmar;
- escribe «(por confirmar)» donde falta un dato (hoy: dirección, área que atiende reclamos y fecha
  de vigencia), en vez de inventarlo;
- **no incluye las fotos sin autorizar** (hoy ninguna está autorizada, así que no hay galería);
- **no incluye las condiciones generales de contratación** (sección 6 de los términos), porque son
  compromisos que la dueña todavía no aprobó. Aparecen cuando se confirma `COND`;
- sigue pasando los 11 controles de la auditoría. Una marca de revisión, una foto sin autorizar o
  un dato privado hacen fallar el build igual que en la definitiva.

## Valores

| Campo en Cloudflare | Valor | De dónde sale |
|---|---|---|
| Repositorio de GitHub | `LuisCastillo04/Planet_Producciones_deploy` (fork). El original es `Rodrix123/Planet_Producciones` | Cloudflare lee el fork; los cambios llegan del original con los pasos de la [guía](guia-cloudflare-pages.md#sincronizar-el-fork) |
| Rama de producción | `produccion-institucional` | Rama exclusiva del fork para publicar |
| Framework preset | `None` | El sitio usa su propia configuración de Vite, no un framework con preset |
| Comando de compilación | `npm run build:institucional:preliminar --workspace apps/web` | Script de `apps/web/package.json`. **No es** `build:institucional:borrador`: ese es de revisión local y publicaría marcas amarillas y fotos sin autorizar |
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
compilaciones (el plan gratuito permite 500 al mes). Vive en el fork, y se actualiza desde el
original con los pasos de la [guía](guia-cloudflare-pages.md#sincronizar-el-fork). También se
podría publicar directamente `feature/web-institucional-meta`, pero cada push a esa rama
publicaría.

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
- Si el comando es el correcto, el registro del build en Cloudflare muestra «Versión preliminar: se
  publica con información pendiente» con la lista de lo que falta, y después «Auditoría de
  seguridad de la web institucional (versión preliminar para publicar)».
- El registro de instalación muestra avisos de `npm audit` sobre dependencias de desarrollo del
  monorepo. No llegan al sitio, que solo publica archivos estáticos.

## Qué pasa en cada build

- **Preliminar** (la de hoy): compila y publica aunque falten datos. El registro de Cloudflare
  muestra la lista de pendientes como aviso. Esa lista es la tarea pendiente con la dueña.
- **Definitiva**: mientras falten datos o aprobaciones, se detiene con la misma lista y Cloudflare
  no publica nada. Es la protección para no dar por definitivo algo sin confirmar.
- Un build que falla no publica nada nuevo.

### Pasar de la preliminar a la definitiva

1. Confirmar con la dueña los pendientes de la lista y marcarlos en
   `apps/web/institucional/contenido.ts` (`confirmado: true`; los datos en `null` se completan).
   Ver «Cómo se publica un dato» en el [README del sitio](../../apps/web/institucional/README.md).
2. Comprobar en local que la definitiva compila:
   `npm run build:institucional --workspace apps/web`. Si no compila, muestra qué falta.
3. Publicar el cambio en la rama de producción del fork (ver la guía).
4. En Cloudflare, **Settings › Builds**, cambiar el comando de compilación a
   `npm run build:institucional --workspace apps/web` y relanzar el despliegue. La franja de
   «versión preliminar» y el `noindex` desaparecen solos.

## Submódulos sin `.gitmodules` (resuelto en el índice)

El repositorio tenía tres entradas de submódulo (gitlinks), sin el archivo `.gitmodules` que
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

Eso fue lo que ocurrió en el primer despliegue: el build falló al clonar, antes de compilar.

**Arreglo**: sacar las tres entradas del índice con `git rm --cached`. Las carpetas del equipo
no se borran, y `.gitignore` ya ignora `.claude/worktrees/` para que no se vuelvan a subir. El
24 de octubre se aplicó en el índice de `feature/web-institucional-meta`: `git ls-files --stage`
ya no muestra ninguna entrada de modo 160000 y `git submodule status` ya no da error. **Queda
pendiente el commit y su llegada al fork.** Conviene hacer lo mismo en `Pagina-Principal`, pero
solo la rama que se publica afecta a Cloudflare.

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

Verificación de la versión preliminar (24 de octubre, en el equipo; no es una prueba del
despliegue remoto):

| Prueba | Resultado |
|---|---|
| `build:institucional:preliminar` | Compila: 5 páginas, `_headers`, CSS, JS y logo. 11 de 11 controles. Ninguna foto, ninguna marca amarilla, ningún «Pendiente:» |
| Con el entorno de Cloudflare (`CF_PAGES=1 CI=true NODE_VERSION=24.21.0`) | Compila igual |
| `build:institucional` (definitiva) | Sigue deteniéndose con la lista de pendientes |
| `build:institucional:borrador` | Igual que antes. Con `CF_PAGES=1` se niega y dice qué comando usar |
| Pruebas negativas de la auditoría | 40 de 40 detectadas: los controles 1 a 9 y 11 de antes, más marca de revisión, texto «Pendiente:», aviso o `noindex` ausentes, foto sin autorizar y aviso de preliminar dentro de la definitiva |
| Datos sensibles en lo publicado | La dirección y las cédulas no aparecen. Sí aparecen la razón social, el NIT, el teléfono y el correo comercial |
| Edge sobre `vite preview` | Franja visible de 30 px (46 px en celular), `noindex`, «(por confirmar)» en cursiva gris, sin desbordes ni errores |
| Aplicativo (cotizador, login, paneles) | No se modificó ningún archivo suyo; `typecheck` y `vite build` completos siguen bien |

## Pendiente para otros numerales

- **Numeral 7**:
  - commit del arreglo de los submódulos y de la versión preliminar, y su llegada al fork;
  - cambiar el comando de compilación en Cloudflare y comprobar el primer despliegue real;
  - la vista previa de otras ramas, en `None`.
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
