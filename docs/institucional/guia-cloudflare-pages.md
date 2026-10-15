# Guía: crear el proyecto en Cloudflare Pages y conectar GitHub

Guía del Numeral 7, para quien hace la configuración. Claude no tiene acceso a Cloudflare ni a
GitHub: todo lo haces tú desde tu navegador. Nunca compartas contraseñas, tokens ni códigos de
verificación por el chat. Para pedir ayuda basta con una captura o con copiar el registro del
build, que no contiene secretos.

Los nombres de botones y menús pueden variar un poco según la versión del panel. Si una pantalla no
coincide, detente y envía una captura.

Los valores salen de [configuracion-cloudflare-pages.md](configuracion-cloudflare-pages.md)
(Numeral 6).

## Parte A. Preparar el repositorio (en tu equipo)

Hoy ninguna rama de GitHub tiene el sitio institucional. En GitHub solo está la documentación del
Numeral 2; el Numeral 3 tiene commit sin push y los Numerales 4 a 6 no tienen commit. Además,
siguen en el índice las tres entradas de submódulo que harían fallar el clonado en Cloudflare.

### A1. Decisiones antes de crear nada

- **Correo de la cuenta de Cloudflare.** La cuenta va a alojar el sitio de la empresa, así que
  conviene un correo de la empresa al que la dueña tenga acceso, con la verificación en dos pasos
  activada. Lo decide la dueña.
- **Repositorio privado.** Se recomendó en el [informe de seguridad](auditoria-seguridad.md).
  Cloudflare funciona igual con repositorios privados, y se puede cambiar antes o después de
  conectar.
- **Dueño del repositorio.** El repositorio está en la cuenta `Rodrix123`. Instalar la aplicación
  de Cloudflare en GitHub lo puede hacer quien sea dueño o administrador de esa cuenta. Si no
  eres tú, esa persona tendrá que aprobar la solicitud (paso B4).

### A2. Commit, push y rama de producción

Desde la raíz del repositorio, en la rama `feature/web-institucional-meta`:

```
git rm --cached .claude/worktrees/calendario-retrae-lista .claude/worktrees/inventario-niveles .claude/worktrees/pin-paneles-eventos
git add .gitignore apps/web/vite.config.institucional.ts apps/web/institucional docs/institucional
git status
git commit -m "Web institucional: documentos legales, auditoría y preparación para Cloudflare Pages"
git push
git switch -c produccion-institucional
git push -u origin produccion-institucional
git switch feature/web-institucional-meta
```

| Comando | Qué hace |
|---|---|
| `git rm --cached …` | Saca del índice las tres entradas de submódulo. Las carpetas de tu equipo no se borran |
| `git add …` | Prepara solo los archivos de este trabajo |
| `git status` | Revisa la lista antes del commit: no debe aparecer nada de `apps/server`, ningún `.env` ni ninguna carpeta `dist` |
| `git commit` y `git push` | Guardan y suben los Numerales 3 a 6 a la rama de trabajo |
| `git switch -c produccion-institucional` y `git push -u …` | Crean la rama de producción desde la rama de trabajo y la suben a GitHub |

### A3. Comprobar que la rama de producción es segura

```
git ls-tree -r origin/produccion-institucional | grep "^160000"
git show origin/produccion-institucional:apps/web/package.json | grep build:institucional
git show origin/produccion-institucional:apps/web/institucional/publico/_headers | grep Content-Security-Policy
```

- El primero no debe mostrar nada (ya no hay submódulos).
- El segundo debe mostrar el comando `build:institucional`.
- El tercero debe mostrar la política de seguridad.

Si algo no coincide, no sigas con la parte B.

**Por qué no usar otra rama.**
- `main`: es la rama por defecto de GitHub, y Cloudflare la va a proponer, pero no tiene el sitio
  institucional.
- `Pagina-Principal`: tampoco lo tiene, y aún conserva las entradas de submódulo.
- `feature/web-institucional-meta`: funcionaría, pero cada push intentaría publicar.

La rama de producción solo se actualiza cuando la dueña aprueba algo.

## Parte B. Cloudflare, pantalla por pantalla

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
   «Cloudflare Pages»). Elige la cuenta **Rodrix123**.
3. En **Repository access**, marca **Only select repositories**, elige
   `Rodrix123/Planet_Producciones` y pulsa **Install & Authorize** (o «Install»).
4. Si tu usuario no es dueño de esa cuenta, GitHub mostrará **Request** en lugar de Install. El
   dueño tendrá que aprobar la solicitud desde su GitHub antes de continuar.
5. Nunca elijas «All repositories». Si más adelante quieres revisar o quitar el acceso, está en
   GitHub › Settings › Applications › Installed GitHub Apps.

### B5. Elegir el repositorio

De vuelta en Cloudflare, selecciona `Planet_Producciones` y pulsa **Begin setup**.

### B6. «Set up builds and deployments»: qué significa cada campo

| Campo | Qué significa | Qué poner |
|---|---|---|
| Project name | Nombre del proyecto. Define la dirección `<nombre>.pages.dev`, y Cloudflare no permite renombrarlo después | `planet-producciones`. Si ese nombre ya existe, Cloudflare mostrará la dirección final; anótala |
| Production branch | La rama que Cloudflare publica como sitio oficial | `produccion-institucional`. Cambia `main`, que viene preseleccionada |
| Framework preset | Plantillas que llenan el comando y la carpeta para frameworks conocidos | **None**. Si aparece «React (Vite)» u otro preset, cámbialo |
| Build command | Lo que Cloudflare ejecuta para generar el sitio | `npm run build:institucional --workspace apps/web` |
| Build output directory | La carpeta que Cloudflare sube como sitio, al terminar el comando | `apps/web/institucional/dist` |
| Root directory (advanced) › Path | Carpeta desde la que se instala y se ejecuta todo | Vacío (la raíz del repositorio). No pongas `apps/web` |
| Environment variables (advanced) | Variables disponibles durante el build | Una sola: nombre `NODE_VERSION`, valor `24.21.0`, de tipo texto (no secreto) |

- Nunca agregues aquí claves de Supabase, Gmail, Meta, n8n ni Gemini: este sitio no las usa.
- No uses `npm run build`, `npm run build:web` ni `apps/web/dist`: publicarían el aplicativo, con
  el login, el cotizador y los paneles.
- Antes de seguir, compara cada valor con esta tabla. Todavía no pulses **Save and Deploy**.

### B7. Primer despliegue (cuando lo autorices)

Al pulsar **Save and Deploy**, Cloudflare crea el proyecto y empieza el primer build. El
registro muestra estas etapas:

1. **Initializing build environment**.
2. **Cloning git repository**: debe terminar bien. Si aparece `No url found for submodule path`,
   la parte A no se aplicó en la rama de producción.
3. **Building application**: instala las dependencias y ejecuta el comando.

Mientras la dueña no confirme los datos, el build **termina en error a propósito**. Lo correcto es
ver la lista de pendientes:

```
La web institucional todavía no se puede publicar (...)
Sin confirmar (docs/institucional/datos-pendientes.md):
  · TXT  Textos de la página revisados y aprobados
  ...
```

Entonces Cloudflare marca el despliegue como fallido y **no publica nada**. La dirección
`.pages.dev` queda reservada, pero todavía no muestra el sitio.

| Si el registro muestra… | Significa |
|---|---|
| La lista de pendientes («todavía no se puede publicar») | Todo bien configurado. Falta lo de la dueña |
| `Missing script: "build:institucional"` | La rama elegida no es `produccion-institucional`, o no tiene el commit de la parte A |
| `No url found for submodule path` | Faltó el `git rm --cached` de la parte A en esa rama |
| Un error de `npm clean-install` | Envía las últimas líneas del registro |
| «Auditoría de seguridad de la web institucional» con alguna FALLA | El sitio compiló, pero la auditoría encontró un problema. No se publica nada |

### B8. Ajustes después del primer build

En el proyecto, entra a **Settings › Builds** (o «Builds & deployments»):

1. **Branch control**:
   - **Production branch**: `produccion-institucional`.
   - Despliegues automáticos de producción: activados. Solo se publica cuando esa rama cambia.
   - **Preview branch**: **None**. Así ninguna otra rama genera direcciones de prueba. Antes de
     este ajuste, una vista previa de otra rama fallaría igual: las demás ramas no tienen el
     comando, y la de trabajo tiene la misma auditoría.
2. **Build system version**: 3 (la de los proyectos nuevos).
3. **Build watch paths**: déjalo como viene.
4. Revisa que la variable `NODE_VERSION` aparezca en **Variables and Secrets** (o «Environment
   variables»).

Por ahora no hagas nada de esto:
- No actives **Web Analytics**: la política de seguridad lo bloquearía, y la política de
  privacidad no lo menciona.
- No agregues un dominio propio (Numeral 9).
- No pulses «Retry deployment» varias veces: cada intento gasta un build del mes.

## Parte C. Publicar cuando la dueña confirme

1. En la rama de trabajo, se confirman los datos en `apps/web/institucional/contenido.ts`. Se
   comprueba con `npm run build:institucional --workspace apps/web` y se hace el commit.
2. Para publicar:

   ```
   git switch produccion-institucional
   git merge --ff-only feature/web-institucional-meta
   git push
   git switch feature/web-institucional-meta
   ```

3. Cloudflare compila solo, y el sitio aparece en la dirección `.pages.dev`. La revisión de lo
   publicado es el Numeral 8.

## Qué enviar después del primer build

- La dirección `.pages.dev` que asignó Cloudflare.
- Las últimas 30 líneas del registro del build, o una captura.
- Una captura de **Settings › Builds** con el control de ramas.

Nunca envíes contraseñas, tokens ni códigos.

## Lista de comprobación

- [ ] A1: correo de la cuenta decidido con la dueña, y decisión sobre el repositorio privado.
- [ ] A2: commit y push hechos, y rama `produccion-institucional` creada.
- [ ] A3: las tres comprobaciones de la rama dan lo esperado.
- [ ] B2: plan Free, sin método de pago.
- [ ] B4: aplicación de GitHub autorizada solo para `Planet_Producciones`.
- [ ] B6: valores revisados uno por uno.
- [ ] B7: primer build ejecutado; se detiene con la lista de pendientes.
- [ ] B8: vista previa en None y rama de producción correcta.
