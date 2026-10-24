# Guía: publicar la web institucional en Cloudflare Pages

Guía del Numeral 7, para quien hace la configuración. Claude no tiene acceso a Cloudflare ni a
GitHub: todo lo haces tú desde tu navegador. Nunca compartas contraseñas, tokens ni códigos de
verificación por el chat. Para pedir ayuda basta con una captura o con copiar el registro del
build, que no contiene secretos.

Los nombres de botones y menús pueden variar un poco según la versión del panel. Si una pantalla no
coincide, detente y envía una captura.

Los valores salen de [configuracion-cloudflare-pages.md](configuracion-cloudflare-pages.md).

## Cómo está montado

- El repositorio **original** es `Rodrix123/Planet_Producciones`. Ahí se trabaja, en la rama
  `feature/web-institucional-meta`.
- Cloudflare lee el **fork** `LuisCastillo04/Planet_Producciones_deploy`, rama
  `produccion-institucional`. Esa rama solo se actualiza cuando se decide publicar.
- Hoy se publica la **versión preliminar** (`build:institucional:preliminar`): sale en línea
  aunque falte información de la empresa, con una franja que lo avisa y sin indexar. Cuando la
  dueña confirme todo, se cambia el comando a la **versión definitiva**
  (`build:institucional`). Las diferencias están en la configuración.
- El `borrador` (`build:institucional:borrador`) es solo para revisar en el equipo. No se pone
  nunca en Cloudflare: allí se niega a correr.

## Parte A. Preparar el repositorio

El sitio ya está en la rama de trabajo del original. Para que Cloudflare pueda construirlo falta
que el commit incluya dos cosas:

- **La corrección de los submódulos.** Tres entradas de `.claude/worktrees/` estaban registradas
  como submódulos sin `.gitmodules`, y Cloudflare falla al clonar con
  `No url found for submodule path`. La corrección es quitarlas del índice de Git (`git rm
  --cached`); las carpetas locales no se borran, y `.gitignore` ya las ignora.
- **El comando de la versión preliminar** (`build:institucional:preliminar` en
  `apps/web/package.json`) y los cambios del sitio que la hacen posible.

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
git fetch deploy
git ls-tree -r deploy/produccion-institucional | grep "^160000"
git show deploy/produccion-institucional:apps/web/package.json | grep build:institucional:preliminar
git show deploy/produccion-institucional:apps/web/institucional/publico/_headers | grep Content-Security-Policy
```

- El primero no debe mostrar nada (ya no hay submódulos).
- El segundo debe mostrar el comando `build:institucional:preliminar`.
- El tercero debe mostrar la política de seguridad.

Si algo no coincide, no sigas con la parte B.

**Por qué no usar otra rama.** `main` no tiene el sitio institucional y `Pagina-Principal` aún
conserva las entradas de submódulo. Publicar directamente `feature/web-institucional-meta`
funcionaría, pero cada push a esa rama publicaría. La rama de producción solo se actualiza cuando
se decide.

## Sincronizar el fork

Cada vez que publiques cambios en el original, llévalos a la rama `produccion-institucional` del
fork. Desde una copia local del proyecto.

**Una sola vez**, agrega el fork como segundo remoto (el remoto `origin` sigue siendo el
original):

```
git remote add deploy https://github.com/LuisCastillo04/Planet_Producciones_deploy.git
```

**Cada vez que publiques en el original:**

```
git fetch origin
git push deploy origin/feature/web-institucional-meta:refs/heads/produccion-institucional
```

Esto sube al fork exactamente lo que acabas de publicar en el original y lo deja como rama
`produccion-institucional`. Cloudflare detecta el cambio y compila solo. Con la rama de producción
sincronizada, el fork no necesita más cambios manuales.

**Si Git responde `rejected … non-fast-forward`**, la rama del fork tiene commits que el original
no tiene (por ejemplo, un arreglo hecho directamente en el fork). No uses `--force`. Mira qué tiene
de más, y si hay que conservarlo, mézclalo antes de subir:

```
git fetch deploy
git log --oneline origin/feature/web-institucional-meta..deploy/produccion-institucional
git switch -c sincronizar-deploy deploy/produccion-institucional
git merge origin/feature/web-institucional-meta
git push deploy sincronizar-deploy:refs/heads/produccion-institucional
```

Si el merge muestra conflictos, resuélvelos antes del `push`. Si prefieres hacerlo en la web de
GitHub: en el fork, abre un Pull request con base `produccion-institucional` y comparación
`feature/web-institucional-meta`, y combínalo. El botón «Sync fork» solo sirve para ramas que
también existen en el original, y `produccion-institucional` solo existe en el fork.

**Comprobación después de sincronizar:** repite las tres comprobaciones de A2.

## Parte B. Cloudflare, pantalla por pantalla

Si el proyecto ya está creado (el primer despliegue ya se intentó), salta a **B6** y revisa los
valores en **Settings › Builds**.

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
| Project name | Nombre del proyecto. Define la dirección `<nombre>.pages.dev`, y Cloudflare no permite renombrarlo después | `planet-producciones`. Si ese nombre ya existe, Cloudflare mostrará la dirección final; anótala |
| Production branch | La rama que Cloudflare publica como sitio oficial | `produccion-institucional`. Cambia `main`, que viene preseleccionada |
| Framework preset | Plantillas que llenan el comando y la carpeta para frameworks conocidos | **None**. Si aparece «React (Vite)» u otro preset, cámbialo |
| Build command | Lo que Cloudflare ejecuta para generar el sitio | **Versión preliminar (hoy):** `npm run build:institucional:preliminar --workspace apps/web` |
| Build output directory | La carpeta que Cloudflare sube como sitio, al terminar el comando | `apps/web/institucional/dist` |
| Root directory (advanced) › Path | Carpeta desde la que se instala y se ejecuta todo | Vacío (la raíz del repositorio). No pongas `apps/web` |
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

Con el comando preliminar, el build **termina bien y publica**. El registro muestra:

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
| «Versión preliminar: se publica con información pendiente» y la auditoría sin problemas | Todo bien. Se publicó la versión preliminar |
| `El borrador de revisión no se publica` | El comando es `build:institucional:borrador`. Cámbialo por el preliminar (B6) |
| `La web institucional todavía no se puede publicar` | El comando es el de la versión definitiva y faltan datos. Usa el preliminar hasta que la dueña confirme |
| `Missing script: "build:institucional:preliminar"` | La rama de producción del fork no tiene el commit de la versión preliminar. Sincroniza el fork |
| `No url found for submodule path` | La corrección de los submódulos no llegó al fork |
| Un error de `npm clean-install` | Envía las últimas líneas del registro |
| La auditoría con alguna FALLA | El sitio compiló, pero la auditoría encontró un problema (un dato privado, una foto sin autorizar, una marca de revisión…). No se publica nada |

### B8. Ajustes después del primer build

En el proyecto, entra a **Settings › Builds** (o «Builds & deployments»):

1. **Branch control**:
   - **Production branch**: `produccion-institucional`.
   - Despliegues automáticos de producción: activados. Solo se publica cuando esa rama cambia.
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

## Parte C. Actualizar y pasar a la versión definitiva

### Actualizar la versión preliminar

1. Haz el cambio en la rama de trabajo del original y compruébalo en local:
   `npm run build:institucional:preliminar --workspace apps/web`.
2. Publica el cambio en el original y sincroniza el fork ([Sincronizar el fork](#sincronizar-el-fork)).
3. Cloudflare compila solo y actualiza `https://<nombre>.pages.dev`.

### Pasar a la versión definitiva

1. Con la dueña, confirma lo que muestra la lista del registro y márcalo en
   `apps/web/institucional/contenido.ts` (`confirmado: true`; los datos en `null` se completan).
   Cuando se confirma `COND`, aparecen las condiciones generales de contratación; las fotos
   aparecen al autorizarlas en `FOTOS`.
2. Comprueba en local: `npm run build:institucional --workspace apps/web`. Si no compila, muestra
   qué falta.
3. Publica el cambio y sincroniza el fork.
4. En Cloudflare, **Settings › Builds**, cambia el comando de compilación a
   `npm run build:institucional --workspace apps/web` y relanza el despliegue. La franja de
   «versión preliminar» y el `noindex` desaparecen solos.

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
- [ ] Al confirmar todo: comando definitivo en Cloudflare (Parte C).
