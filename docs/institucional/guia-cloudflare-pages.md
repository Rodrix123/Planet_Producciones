# Guía: publicar la web institucional en Cloudflare Pages

Guía del Numeral 7, para quien hace la configuración. Claude no tiene acceso a Cloudflare ni a
GitHub: todo lo haces tú desde tu navegador. Nunca compartas contraseñas, tokens ni códigos de
verificación por el chat. Para pedir ayuda basta con una captura o con copiar el registro del
build, que no contiene secretos.

Los nombres de botones y menús pueden variar un poco según la versión del panel. Si una pantalla no
coincide, detente y envía una captura.

Los valores salen de [configuracion-cloudflare-pages.md](configuracion-cloudflare-pages.md).

## Cómo está montado

- **Una sola rama** para desarrollar, verificar y publicar: `feature/web-institucional-meta`. No
  se crean otras ramas ni se fusionan ramas.
- El repositorio **original** es `Rodrix123/Planet_Producciones`. Ahí trabaja el equipo, en esa
  rama.
- Cloudflare lee el **fork** `LuisCastillo04/Planet_Producciones_deploy`, en la **misma rama**
  `feature/web-institucional-meta`. Se publica cuando esa rama del fork se sincroniza con la del
  original ([Sincronizar el fork](#sincronizar-el-fork)).
- El proyecto de Cloudflare ya existe: `planet-producciones-deploy`, en
  `https://planet-producciones-deploy.pages.dev`. Se publica actualizándolo; no se crea otro.
- El comando de producción es la **versión definitiva** (`build:institucional`). Se detiene, sin
  publicar nada, mientras haya datos sin confirmar.
- Del 24 al 31 de octubre de 2026 se publicó la **versión preliminar**
  (`build:institucional:preliminar`) desde la rama `produccion-institucional` del fork, que ya no
  se usa. Las diferencias entre versiones están en la configuración.
- El `borrador` (`build:institucional:borrador`) es solo para revisar en el equipo. No se pone
  nunca en Cloudflare: allí se niega a correr.

## Parte A. Preparar el repositorio

Esto ya está hecho en `feature/web-institucional-meta` (commits `6b69ad3` y `c857268`). Se deja
como referencia:

- **La corrección de los submódulos.** Tres entradas de `.claude/worktrees/` estaban registradas
  como submódulos sin `.gitmodules`, y Cloudflare falla al clonar con
  `No url found for submodule path`. La corrección es quitarlas del índice de Git (`git rm
  --cached`); las carpetas locales no se borran, y `.gitignore` ya las ignora.
- **El comando de la versión preliminar** (`build:institucional:preliminar` en
  `apps/web/package.json`) y los cambios del sitio que la hacen posible.

La versión definitiva solo necesita que su commit llegue a la rama del original y del fork.

### A1. Decisiones antes de crear nada

- **Correo de la cuenta de Cloudflare.** La cuenta va a alojar el sitio de la empresa, así que
  conviene un correo de la empresa al que la dueña tenga acceso, con la verificación en dos pasos
  activada. Lo decide la dueña.
- **Repositorios privados.** Se recomendó en el [informe de seguridad](auditoria-seguridad.md).
  Cloudflare funciona igual con repositorios privados, y se puede cambiar antes o después de
  conectar.

### A2. Comprobar el fork antes de publicar

Con el remoto `deploy` configurado (ver [Sincronizar el fork](#sincronizar-el-fork)):

```
git fetch origin
git fetch deploy
git rev-parse origin/feature/web-institucional-meta deploy/feature/web-institucional-meta
git ls-tree -r deploy/feature/web-institucional-meta | grep "^160000"
git show deploy/feature/web-institucional-meta:apps/web/package.json | grep '"build:institucional"'
git show deploy/feature/web-institucional-meta:apps/web/institucional/publico/_headers | grep Content-Security-Policy
```

- `rev-parse` debe mostrar dos veces el mismo código: el fork tiene lo último del original.
- `ls-tree` no debe mostrar nada (ya no hay submódulos).
- El primer `show` debe mostrar el comando `build:institucional`.
- El segundo `show` debe mostrar la política de seguridad.

Si algo no coincide, no sigas con la parte B.

**Por qué esta rama y no otra.** `main` no tiene el sitio institucional y `Pagina-Principal` aún
conserva las entradas de submódulo. `feature/web-institucional-meta` tiene el sitio, la corrección
de los submódulos y el trabajo de Meta. Publicar es deliberado porque la rama del fork solo cambia
cuando la sincronizas.

## Sincronizar el fork

El fork es un repositorio independiente: no recibe solo los cambios del original. Cada vez que
publiques en el original, lleva la **misma rama** `feature/web-institucional-meta` al fork, con el
mismo nombre. No se crea ninguna rama ni se hace merge. Desde una copia local del proyecto.

**Una sola vez**, agrega el fork como segundo remoto (el remoto `origin` sigue siendo el
original):

```
git remote add deploy https://github.com/LuisCastillo04/Planet_Producciones_deploy.git
```

**Cada vez que publiques en el original** (después de tu commit y tu `git push origin`):

```
git fetch origin
git push deploy origin/feature/web-institucional-meta:refs/heads/feature/web-institucional-meta
```

Esto sube al fork exactamente lo que está en `feature/web-institucional-meta` del original. Si el
fork todavía no tiene esa rama, la crea con el mismo nombre; si la tiene, la adelanta. Con la rama
de producción de Cloudflare apuntando a ella, Cloudflare compila solo.

**En la web de GitHub**, si el fork ya tiene la rama: abre el fork, elige la rama
`feature/web-institucional-meta` y pulsa **Sync fork › Update branch**. Úsalo solo si GitHub dice
que la rama está atrás («behind») de `Rodrix123/Planet_Producciones:feature/web-institucional-meta`
y no adelante («ahead»). Si ofrece descartar commits («Discard») o abrir un pull request, detente
y sigue el párrafo siguiente.

**Si Git responde `rejected … non-fast-forward`**, la rama del fork tiene commits que el original
no tiene (por ejemplo, un arreglo hecho directamente en el fork). No uses `--force` ni hagas merge.
Mira qué tiene de más:

```
git fetch deploy
git log --oneline origin/feature/web-institucional-meta..deploy/feature/web-institucional-meta
```

- Si esos commits hacen falta, deben llegar primero a `feature/web-institucional-meta` del
  original (quien los hizo los sube allí) y después se repite la sincronización.
- Si no hacen falta, reemplazarlos borra esos commits del fork: hazlo solo con el acuerdo del
  equipo, con `git push --force-with-lease deploy origin/feature/web-institucional-meta:refs/heads/feature/web-institucional-meta`.

Para que no ocurra: nunca hagas commits directamente en el fork.

**Comprobación después de sincronizar:** repite las comprobaciones de A2.

## Parte B. Cloudflare, pantalla por pantalla

El proyecto ya está creado: `planet-producciones-deploy`. **No crees otro proyecto.** Los pasos B1
a B5 se dejan como referencia de cómo se creó. Para pasar a la versión definitiva ve a la
[parte C](#parte-c-pasar-a-la-versión-definitiva); los valores son los de **B6**.

### B1. Entrar a Cloudflare

1. Abre `https://dash.cloudflare.com` y entra con la cuenta decidida en A1, o créala con
   «Sign up» y verifica el correo.
2. Si Cloudflare propone agregar un dominio o comprar uno, sáltalo: no hace falta para Pages, y
   el dominio propio es opcional (Numeral 9).

### B2. Comprobar el plan gratuito

1. En el menú lateral entra a **Workers & Pages**. Si existe la sección **Plans**, debe decir
   **Free**.
2. En **Manage Account › Billing** (o «Facturación») no debe haber suscripciones activas.
3. Pages Free no pide tarjeta. Si en algún paso te piden un método de pago o un plan, detente: no
   hace falta y no se debe activar nada de pago. Este sitio cabe en el plan gratuito (500 builds
   al mes, 20.000 archivos y 25 MiB por archivo).

### B3. Crear el proyecto de Pages (no de Workers)

1. En **Workers & Pages**, pulsa **Create** (o «Create application»).
2. Elige **Pages**: puede ser una pestaña «Pages» o un enlace del tipo «Looking to deploy
   Pages? Get started».
3. Elige **Import an existing Git repository** (o «Connect to Git»).

Cuidado: si el formulario pide un **Deploy command** (`npx wrangler deploy`), estás en el flujo
de **Workers**, no de Pages. Vuelve atrás.

### B4. Conectar GitHub y autorizar solo este repositorio

1. Pulsa **Connect GitHub**. Se abre GitHub en otra pestaña; inicia sesión ahí, en github.com,
   nunca dentro de Cloudflare.
2. GitHub pide instalar la aplicación de Cloudflare («Cloudflare Workers and Pages», antes
   «Cloudflare Pages»). Elige la cuenta **LuisCastillo04**.
3. En **Repository access**, marca **Only select repositories**, elige
   `LuisCastillo04/Planet_Producciones_deploy` y pulsa **Install & Authorize** (o «Install»).
4. Nunca elijas «All repositories». Si más adelante quieres revisar o quitar el acceso, está en
   GitHub › Settings › Applications › Installed GitHub Apps.

### B5. Elegir el repositorio

De vuelta en Cloudflare, selecciona `Planet_Producciones_deploy` y pulsa **Begin setup**.

### B6. «Set up builds and deployments»: qué significa cada campo

| Campo | Qué significa | Qué poner |
|---|---|---|
| Project name | Nombre del proyecto. Define la dirección `<nombre>.pages.dev`, y Cloudflare no permite renombrarlo después | `planet-producciones-deploy` (ya creado; la dirección es `https://planet-producciones-deploy.pages.dev`) |
| Production branch | La rama que Cloudflare publica como sitio oficial | `feature/web-institucional-meta`. Antes era `produccion-institucional`; se cambia en la parte C |
| Framework preset | Plantillas que llenan el comando y la carpeta para frameworks conocidos | **None**. Si aparece «React (Vite)» u otro preset, cámbialo |
| Build command | Lo que Cloudflare ejecuta para generar el sitio | **Versión definitiva:** `npm run build:institucional --workspace apps/web`. (Del 24 al 31 de octubre fue `npm run build:institucional:preliminar --workspace apps/web`) |
| Build output directory | La carpeta que Cloudflare sube como sitio, al terminar el comando | `apps/web/institucional/dist` |
| Root directory (advanced) › Path | Carpeta desde la que se instala y se ejecuta todo | Vacío o `/` (la raíz del repositorio). No pongas `apps/web` |
| Environment variables (advanced) | Variables disponibles durante el build | Una sola: nombre `NODE_VERSION`, valor `24.21.0`, de tipo texto (no secreto) |

- Nunca agregues aquí claves de Supabase, Gmail, Meta, n8n ni Gemini: este sitio no las usa.
- **No uses** `npm run build`, `npm run build:web` ni `apps/web/dist`: publicarían el aplicativo,
  con el login, el cotizador y los paneles.
- **No uses** `npm run build:institucional:borrador`: es la revisión local, con marcas amarillas y
  fotos sin autorizar. En Cloudflare se niega a correr y el build falla, a propósito.
- Antes de seguir, compara cada valor con esta tabla.

### B7. Despliegue (cuando lo autorices)

Al pulsar **Save and Deploy** (o **Retry deployment**, si el proyecto ya existe), Cloudflare
compila. El registro muestra estas etapas:

1. **Initializing build environment**.
2. **Cloning git repository**: debe terminar bien. Si aparece `No url found for submodule path`,
   la corrección de los submódulos no llegó a la rama de producción del fork.
3. **Building application**: instala las dependencias y ejecuta el comando.

Con el comando definitivo y todo confirmado, el build **termina bien y publica**. El registro
muestra «Auditoría de seguridad de la web institucional (versión para publicar)», los 11 controles
en `OK` y «Sin problemas de seguridad», sin lista de pendientes.

Con el comando preliminar (el que se usó del 24 al 31 de octubre), el build también termina bien y
publica. El registro muestra:

```
Versión preliminar: se publica con información pendiente (…)
Sin confirmar (docs/institucional/datos-pendientes.md):
  · TXT  Textos de la página revisados y aprobados
  ...
Datos que faltan (la página dice «por confirmar»):
  · C1  Domicilio y dirección del responsable
  ...
Auditoría de seguridad de la web institucional (versión preliminar para publicar)
  OK  1. …
  Sin problemas de seguridad.
```

Esa lista es un aviso, no un error: es lo que todavía hay que confirmar con la dueña. El sitio
queda en `https://<nombre>.pages.dev`.

| Si el registro muestra… | Significa |
|---|---|
| «(versión para publicar)» y «Sin problemas de seguridad» | Todo bien. Se publicó la versión definitiva |
| «Versión preliminar: se publica con información pendiente» y la auditoría sin problemas | Se publicó la versión preliminar: el comando todavía es el preliminar |
| `El borrador de revisión no se publica` | El comando es `build:institucional:borrador`. Cámbialo por el definitivo (B6) |
| `La web institucional todavía no se puede publicar` | El comando es el definitivo y faltan datos o aprobaciones (la lista viene debajo). No se publicó nada y sigue en línea el último despliegue que funcionó. Hay que confirmar esa lista con la dueña |
| `Missing script: "build:institucional…"` | La rama de producción del fork no tiene el commit que trae ese comando. Sincroniza el fork |
| `No url found for submodule path` | La corrección de los submódulos no llegó al fork |
| Un error de `npm clean-install` | Envía las últimas líneas del registro |
| La auditoría con alguna FALLA | El sitio compiló, pero la auditoría encontró un problema (un dato privado, una foto sin autorizar, una marca de revisión…). No se publica nada |

### B8. Ajustes después del primer build

En el proyecto, entra a **Settings › Builds** (o «Builds & deployments»):

1. **Branch control**:
   - **Production branch**: `feature/web-institucional-meta` (antes `produccion-institucional`).
   - Despliegues automáticos de producción: activados. Solo se publica cuando esa rama del fork
     cambia.
   - **Preview branch**: **None**. Así ninguna otra rama genera direcciones de prueba.
2. **Build system version**: 3 (la de los proyectos nuevos).
3. **Build watch paths**: déjalo como viene.
4. Revisa que la variable `NODE_VERSION` aparezca en **Variables and Secrets** (o «Environment
   variables»).

Por ahora no hagas nada de esto:
- No actives **Web Analytics**: la política de seguridad lo bloquearía, y la política de
  privacidad no lo menciona.
- No agregues un dominio propio (Numeral 9).
- No pulses «Retry deployment» varias veces: cada intento gasta un build del mes.

## Parte C. Pasar a la versión definitiva

Se hace sobre el proyecto existente `planet-producciones-deploy`, sin crear otro y sin cambiar la
dirección `https://planet-producciones-deploy.pages.dev`.

### C1. Confirmar los datos

1. Con la dueña, confirma lo que muestra la lista del build definitivo y márcalo en
   `apps/web/institucional/contenido.ts` (`confirmado: true`; los datos en `null` se completan).
   El 31 de octubre se incorporaron la dirección, Mariana y su teléfono, el correo, los servicios
   y las condiciones de contratación. Lo que falta está en
   [configuracion-cloudflare-pages.md, «Versión definitiva»](configuracion-cloudflare-pages.md#versión-definitiva-31-de-octubre-de-2026),
   incluida la fecha de vigencia.
2. Comprueba en local: `npm run build:institucional --workspace apps/web`. Debe terminar con
   «Sin problemas de seguridad». Si no compila, muestra qué falta.
3. Haz commit y push en `feature/web-institucional-meta` del original.

### C2. Cambiar la rama de producción y el comando en Cloudflare

1. Entra a `https://dash.cloudflare.com` › **Workers & Pages** y abre el proyecto
   `planet-producciones-deploy`.
2. Pestaña **Settings** › sección **Build** (o «Builds & deployments»).
3. En **Branch control**, pulsa **Edit** (o el lápiz):
   - **Production branch**: elige `feature/web-institucional-meta`. Si no aparece en la lista, el
     fork todavía no tiene esa rama: haz primero [Sincronizar el fork](#sincronizar-el-fork) y
     vuelve.
   - Deja activados los despliegues automáticos de producción.
   - **Preview branch**: **None**.
   - Pulsa **Save**.
4. En **Build configuration**, pulsa **Edit** y comprueba:
   - **Build command**: `npm run build:institucional --workspace apps/web`;
   - **Build output directory**: `apps/web/institucional/dist`;
   - **Root directory**: vacío o `/`;
   - **Framework preset**: None.
   - Pulsa **Save**.
5. En **Variables and Secrets** debe seguir solo `NODE_VERSION` = `24.21.0`.

Cambiar la configuración no despliega nada por sí solo: el próximo despliegue sale del siguiente
cambio en esa rama del fork.

### C3. Publicar

1. Sincroniza el fork ([Sincronizar el fork](#sincronizar-el-fork)). Cloudflare compila la rama
   `feature/web-institucional-meta` como producción.
2. Si la rama del fork ya estaba al día antes de C2 y no hay nada nuevo que subir, el despliegue
   llega con el siguiente cambio. Si no quieres esperar, en **Settings › Build › Deploy hooks**
   puedes crear un enlace para la rama `feature/web-institucional-meta` y llamarlo una vez
   (`curl -X POST <enlace>`). Ese enlace permite compilar a quien lo tenga: no lo compartas y
   bórralo después.
3. Revisa el registro (B7) y el sitio. La franja de «versión preliminar» y el `noindex`
   desaparecen.

Mientras la lista de pendientes no esté vacía, el build definitivo se detiene y Cloudflare sigue
mostrando el último despliegue que funcionó (la versión preliminar). Si quieres que lo ya
confirmado salga en línea mientras tanto, en C2 deja por un tiempo el comando
`npm run build:institucional:preliminar --workspace apps/web` con la nueva rama, y cámbialo al
definitivo cuando todo esté confirmado.

### Actualizar el sitio después

1. Haz el cambio en `feature/web-institucional-meta` del original y compruébalo en local con
   `npm run build:institucional --workspace apps/web`.
2. Commit y push en el original, y sincroniza la misma rama en el fork.
3. Cloudflare compila solo y actualiza `https://planet-producciones-deploy.pages.dev`.

La revisión de lo publicado es el Numeral 8.

## Qué enviar después del despliegue

- La dirección `.pages.dev` que asignó Cloudflare.
- Las últimas 30 líneas del registro del build, o una captura.
- Una captura de **Settings › Builds** con el control de ramas.

Nunca envíes contraseñas, tokens ni códigos.

## Lista de comprobación

- [ ] A1: correo de la cuenta decidido con la dueña, y decisión sobre los repositorios privados.
- [ ] Commit con la corrección de los submódulos y la versión preliminar, publicado en el original.
- [ ] Fork sincronizado y las tres comprobaciones de A2 dan lo esperado.
- [ ] B2: plan Free, sin método de pago.
- [ ] B4: aplicación de GitHub autorizada solo para `Planet_Producciones_deploy`.
- [ ] B6: valores revisados uno por uno (comando preliminar, no el borrador).
- [ ] B7: despliegue ejecutado; el registro muestra «Versión preliminar» y la auditoría sin problemas.
- [ ] B8: vista previa en None y rama de producción correcta.
- [ ] C1: pendientes confirmados con la dueña (incluida la fecha de vigencia) y build definitivo
  sin problemas en local.
- [ ] C2: en `planet-producciones-deploy`, rama de producción `feature/web-institucional-meta` y
  comando `npm run build:institucional --workspace apps/web`.
- [ ] C3: misma rama sincronizada en el fork; el registro muestra «(versión para publicar)» y «Sin
  problemas de seguridad».
