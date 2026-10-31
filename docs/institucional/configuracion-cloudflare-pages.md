# Configuración de Cloudflare Pages

Valores para conectar la web institucional a Cloudflare Pages Free (Numeral 6, 15 de octubre de
2026; actualizados el 24 de octubre con la versión preliminar y el 31 de octubre con la versión
definitiva y la rama única). Salen de los archivos del proyecto y se comprobaron con una compilación
en Linux y con el emulador oficial de Cloudflare. Las pruebas hechas son locales: que el despliegue
en Cloudflare funcione solo se sabe viendo su registro.

## Tres versiones del sitio

Una sola base de código y tres formas de compilarla (`npm run … --workspace apps/web`):

| Comando | Para qué sirve | ¿Se publica? |
|---|---|---|
| `build:institucional` | Versión **definitiva**. Se detiene mientras haya datos sin confirmar | **Sí: es el comando de producción** desde el 31 de octubre de 2026 |
| `build:institucional:preliminar` | Versión **preliminar**. Muestra lo que ya tiene valor, aunque no esté confirmado por la dueña | Fue la publicada del 24 al 31 de octubre. Ya no se usa: todo está confirmado |
| `build:institucional:borrador` | Revisión local, con todo lo pendiente resaltado en amarillo y las fotos sin autorizar | **Nunca.** Dentro de Cloudflare se niega a correr |

La versión preliminar:
- lleva en todas las páginas, arriba, una franja discreta: «Versión preliminar: la información de
  este sitio está en revisión y puede cambiar»;
- lleva `noindex`, para que los buscadores no guarden información sin confirmar;
- escribe «(por confirmar)» donde falta un dato (al 31 de octubre, solo la fecha de vigencia), en
  vez de inventarlo;
- **no incluye las fotos sin autorizar** (hoy ninguna está autorizada, así que no hay galería);
- no incluía las condiciones generales de contratación (sección 6 de los términos) mientras la
  dueña no las aprobara. `COND` se confirmó el 31 de octubre y ya aparecen en todas las versiones;
- sigue pasando los 11 controles de la auditoría. Una marca de revisión, una foto sin autorizar o
  un dato privado hacen fallar el build igual que en la definitiva.

La versión definitiva no lleva la franja ni `noindex`, y la auditoría falla si alguno aparece.

## Versión definitiva (31 de octubre de 2026)

La versión definitiva está preparada: el comando es el correcto, usa los datos aprobados por la
dueña y conserva la auditoría. Datos incorporados en `apps/web/institucional/contenido.ts`:

| ID | Dato | Respaldo |
|---|---|---|
| C1 | Dirección: `CR 17 4 33 AP 301` («Dirección del domicilio principal») | Dueña y certificado de la Cámara de Comercio (12/08/2026), con el texto exacto |
| G2 | Atiende consultas y reclamos: Mariana, asistente de Planet Producciones. Teléfono +57 310 651 3283 | Dueña |
| E3 y G3 | Correo `planet.producciones@outlook.com`, sin cambios | Dueña: el correo publicado es correcto |
| A1 y B1 | «Planet Producciones» y «producción técnica para eventos», tal como los muestra la sección «Para qué sirve este sitio» de los términos | Dueña: aprobó la sección sin cambios |
| D1 | Servicios que se anuncian | Dueña: aprobó «Nuestros servicios» |
| COND | Condiciones generales de contratación (sección 6 de los términos) | Dueña: aprobó la parte contractual |
| G4 | Fecha de entrada en vigencia de la política, los términos y el procedimiento de eliminación: 31 de octubre de 2026 | Dueña |
| TXT, B3, C3, E2, E4 | Textos del inicio, tipos de evento, cobertura, WhatsApp en el número comercial e Instagram, sin cambios | Dueña |
| PRIV, TERM, ELIM | Política de privacidad, términos y procedimiento de eliminación, sin cambios | Dueña |
| G5 | Proveedores tecnológicos de la política, sin cambios | Equipo |

El teléfono de Mariana está en la política de privacidad (ficha del responsable y sección 11,
«Cómo ejercer sus derechos») y en la página de eliminación de datos. El teléfono comercial sigue en
el inicio, el pie, los términos y la ficha del responsable.

**Compila.** Con todo confirmado, `npm run build:institucional --workspace apps/web` termina con
la auditoría estricta en 11 de 11 y sin lista de pendientes. Ninguna foto está autorizada, así que
el sitio no tiene galería. Una foto se agrega autorizándola en `FOTOS`.

## Valores

| Campo en Cloudflare | Valor | De dónde sale |
|---|---|---|
| Repositorio de GitHub | `LuisCastillo04/Planet_Producciones_deploy` (fork). El original es `Rodrix123/Planet_Producciones` | Cloudflare lee el fork; los cambios llegan del original con los pasos de la [guía](guia-cloudflare-pages.md#sincronizar-el-fork) |
| Rama de producción | `feature/web-institucional-meta` | La única rama de desarrollo y despliegue, con el mismo nombre en el original y en el fork. Antes era `produccion-institucional`, que ya no se usa |
| Framework preset | `None` | El sitio usa su propia configuración de Vite, no un framework con preset |
| Comando de compilación | `npm run build:institucional --workspace apps/web` | Versión definitiva, script de `apps/web/package.json`. Si en el futuro algo queda sin confirmar, se detiene sin publicar. **No es** `build:institucional:borrador`: ese es de revisión local y publicaría marcas amarillas y fotos sin autorizar |
| Directorio de salida | `apps/web/institucional/dist` | `build.outDir` de `apps/web/vite.config.institucional.ts` |
| Directorio raíz (avanzado) | Vacío o `/`, es decir, la raíz del repositorio | Ver «Por qué la raíz del repositorio» |
| Variables de entorno | Solo `NODE_VERSION` = `24.21.0` | Versión con la que se compila en el equipo y en la simulación |
| Despliegues de vista previa (preview) | Ninguno (`None`) | Así ninguna otra rama (bot de WhatsApp, cotizador, paneles) genera direcciones públicas de prueba |
| Rutas de compilación (build watch paths) | Las que trae por defecto | Cada push a la rama del fork compila; con el plan gratuito (500 builds al mes) alcanza |
| Nombre del proyecto | `planet-producciones-deploy`, ya creado: `https://planet-producciones-deploy.pages.dev` | Se publica actualizando este proyecto. No se crea otro ni se cambia la dirección |

**Variables de entorno.** El sitio no lee ninguna. Nunca se agregan claves de Supabase, Gmail,
Meta, n8n ni Gemini: este build no las usa, y una variable `VITE_` podría terminar dentro del
JavaScript publicado. `NODE_VERSION` fija la versión de Node para que el build no cambie cuando
Cloudflare actualice la suya, que hoy es la 22.16.0. El build también se probó con esa versión.

**Rama de producción.** Desde el 31 de octubre se desarrolla, se verifica y se publica desde una
sola rama, `feature/web-institucional-meta`. No se usan ramas adicionales ni se fusionan ramas.
Publicar sigue siendo un paso deliberado: el equipo trabaja en esa rama del original, y Cloudflare
solo compila cuando esa misma rama del fork se sincroniza con los pasos de la
[guía](guia-cloudflare-pages.md#sincronizar-el-fork). Además, la versión definitiva se detiene sola
si algo no está confirmado.

Del 24 al 31 de octubre se publicó la rama `produccion-institucional` del fork con la versión
preliminar. Esa rama ya no se actualiza ni se usa para publicar.

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
- Con el comando definitivo y todo confirmado, el registro del build en Cloudflare muestra
  «Auditoría de seguridad de la web institucional (versión para publicar)» y «Sin problemas de
  seguridad». Si falta algo, muestra «La web institucional todavía no se puede publicar» con la
  lista. Con el comando preliminar mostraba «Versión preliminar: se publica con información
  pendiente» y «(versión preliminar para publicar)».
- El registro de instalación muestra avisos de `npm audit` sobre dependencias de desarrollo del
  monorepo. No llegan al sitio, que solo publica archivos estáticos.

## Qué pasa en cada build

- **Definitiva** (el comando de producción): mientras falten datos o aprobaciones, se detiene con
  la lista y Cloudflare no publica nada. Es la protección para no dar por definitivo algo sin
  confirmar. Con todo confirmado, publica sin franja ni `noindex`.
- **Preliminar** (la publicada hasta el 31 de octubre): compila y publica aunque falten datos. El
  registro de Cloudflare muestra la lista de pendientes como aviso.
- Un build que falla no publica nada nuevo: queda en línea el último despliegue que funcionó.

### Pasar de la preliminar a la definitiva

1. Confirmar con la dueña los pendientes de la lista y marcarlos en
   `apps/web/institucional/contenido.ts` (`confirmado: true`; los datos en `null` se completan).
   Ver «Cómo se publica un dato» en el [README del sitio](../../apps/web/institucional/README.md).
   **Hecho el 31 de octubre** (ver «Versión definitiva»).
2. Comprobar en local que la definitiva compila:
   `npm run build:institucional --workspace apps/web`. Si no compila, muestra qué falta.
3. En el proyecto existente `planet-producciones-deploy`, **Settings › Builds**: rama de producción
   `feature/web-institucional-meta` y comando `npm run build:institucional --workspace apps/web`
   (pasos en la [guía, parte C](guia-cloudflare-pages.md#parte-c-pasar-a-la-versión-definitiva)).
4. Hacer commit y push en `feature/web-institucional-meta` del original y sincronizar esa misma rama
   en el fork. Cloudflare compila solo. La franja de «versión preliminar» y el `noindex`
   desaparecen.

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
ya no muestra ninguna entrada de modo 160000 y `git submodule status` ya no da error. El arreglo
quedó en el commit `6b69ad3` de `feature/web-institucional-meta` y llega al fork al sincronizar esa
rama. Conviene hacer lo mismo en `Pagina-Principal`, pero solo la rama que se publica afecta a
Cloudflare.

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

Verificación de la versión definitiva (31 de octubre, en el equipo; no es una prueba del
despliegue remoto, y no se hizo ningún despliegue):

| Prueba | Resultado |
|---|---|
| `typecheck:institucional` | Sin errores |
| `build:institucional` antes de las últimas confirmaciones | Se detenía, como debe, con 9 pendientes sin confirmar y la fecha de vigencia |
| `build:institucional` con todo confirmado (con `CF_PAGES=1 CI=true` y Node 24.21.0) | Compila. 11 de 11 controles en modo estricto. 5 páginas, `_headers`, CSS, JS y logo. Ninguna franja, `noindex`, «(por confirmar)», «Pendiente» ni marca de borrador. «Vigente desde: 31 de octubre de 2026» en las 3 páginas legales |
| `build:institucional:preliminar` (antes de las últimas confirmaciones) | Compilaba, 11 de 11 controles, con la dirección, Mariana y su teléfono y la sección 6 de los términos |
| `build:institucional:borrador` | Compila con sus avisos de siempre. Con `CF_PAGES=1` se sigue negando |
| Pruebas negativas de la auditoría | 40 de 40 detectadas, con la lista de teléfonos ya ampliada (un teléfono no autorizado sigue bloqueando) |
| Edge sin ventana sobre la definitiva, servida como Pages (rutas sin `.html`, 404 y `_headers`) | Inicio, privacidad, términos y eliminación responden 200; `/no-existe`, rutas anidadas, `/cotizador.html` y `/login` responden 404 con la página propia. Sin violaciones de la CSP, Font Awesome carga, sin desbordes a 360 px. Un solo correo en todo el sitio; enlaces `tel:` al comercial y al de reclamos según la sección |
| Aplicativo, servidor y paquetes | Ningún archivo suyo cambió. `typecheck` de `apps/web` y `apps/server` y `check-types` de `packages/api` sin errores; `vite build` del aplicativo bien; pruebas del servidor (migración de WhatsApp) 30 de 30. `check-types` de `packages/db` ya fallaba antes, por una variable sin usar en `packages/db/src/eventos.ts` (commit `cfe7617`) |

## Pendiente para otros numerales

- **Numeral 7**:
  - commit y push de la versión definitiva en `feature/web-institucional-meta` y sincronización de
    esa misma rama en el fork;
  - en el proyecto existente, rama de producción `feature/web-institucional-meta` y comando
    definitivo, y comprobar el primer despliegue real;
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
