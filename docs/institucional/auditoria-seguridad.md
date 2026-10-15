# Auditoría de seguridad de la web institucional

Revisión del 15 de octubre de 2026 (Numeral 5), sobre la rama `feature/web-institucional-meta`:
commit `8682630` más los cambios de los Numerales 4 y 5, que aún no tienen commit. Cubre todo
lo que se publicará en Cloudflare Pages, es decir, la carpeta `apps/web/institucional/dist`
que genera `npm run build:institucional`.

## Cómo se repite

La auditoría corre sola al final de cada build:
[auditoria.ts](../../apps/web/institucional/auditoria.ts), conectada en
[vite.config.institucional.ts](../../apps/web/vite.config.institucional.ts).

- Si encuentra un problema, el build se detiene y muestra el detalle. En Cloudflare pasará lo
  mismo, y no se publicará nada.
- En la versión para publicar, el contenido de borrador también bloquea. En
  `build:institucional:borrador` solo se avisa.
- Nunca imprime el valor de una clave o de un dato privado, solo dónde está.

## Resultado sobre lo que se publicará

La versión publicable todavía no se puede generar, porque faltan datos y aprobaciones de la
dueña. Por eso se auditó el borrador, que contiene todo lo publicable y además las fotos sin
autorizar y las marcas de pendiente.

| # | Control del Numeral 5 | Resultado | Cómo se comprobó |
|---|---|---|---|
| 1 | Sin claves de Gemini, Meta ni n8n | OK | Se buscan patrones de claves de Google, Meta, OpenAI, JWT y Supabase, GitHub, claves privadas, URL de bases de datos y webhooks de n8n en todos los archivos de texto |
| 2 | Sin archivos `.env` | OK | No hay `.env` en la salida ni en la carpeta del sitio, y el código publicado no nombra ninguna variable del servidor. El build no usa variables de entorno |
| 3 | Sin contraseñas ni datos privados | OK | Solo aparece el teléfono comercial. No hay ningún correo, otro teléfono ni número con formato de cédula o NIT |
| 4 | Sin enlaces a paneles privados desprotegidos | OK | Ningún enlace a login, cotizador, paneles ni `/api/`, y no hay formularios. El JavaScript no hace peticiones: se quitó el polyfill de Vite que usaba `fetch` |
| 5 | Sin contratos ni cotizaciones reales | OK | No hay PDF, Excel, Word ni archivos con esos nombres. La carpeta de contratos firmados del servidor no forma parte del build |
| 6 | Sin bases de datos ni respaldos | OK | No hay `.sql`, `.db`, `.zip`, `.csv`, `.json` ni archivos similares |
| 7 | Archivos estáticos realmente públicos | OK, con avisos | Ver el detalle debajo de la tabla |
| 8 | Rutas legales que abren directamente | OK | Las 3 páginas existen, tienen título y todas las páginas las enlazan. Los enlaces y secciones internas son válidos y responden 200 en `/privacidad`, `/terminos` y `/eliminacion-datos` |
| 9 | Sin errores de compilación | OK | Los tipos no tienen errores, y cada página carga su CSS y su JS |
| 10 | Sin contenido incompleto | Bloqueado a propósito | Mientras haya datos sin confirmar, el build publicable se detiene. En el borrador se cuentan las marcas |

Detalle del control 7:
- Solo hay páginas de la lista blanca y recursos en `assets/`, y todos existen.
- No se publican mapas de código.
- No hay scripts externos. Font Awesome se carga con verificación de integridad (SRI) y ya se
  comprobó en el navegador que los íconos funcionan.
- Las fotos no tienen metadatos EXIF ni GPS.
- **Aviso:** las fotos pesan entre 1,5 y 2,4 MB cada una.

«Ocultar un botón no protege una ruta»: el sitio no oculta nada, simplemente no incluye las
páginas del aplicativo, y su backend no se publica en esta etapa.

### Pruebas de la auditoría

En copias del sitio compilado se introdujeron a propósito **21 problemas**, y la auditoría
detectó los 21, cada uno en su control. Algunos de los casos:
- claves de Google y de Meta;
- un `.env`;
- un correo, un teléfono y una cédula no autorizados;
- una contraseña;
- un enlace al login, un formulario y una llamada a la API;
- un PDF de contrato y un respaldo `.sql`;
- un mapa de código, un script externo y un CSS externo sin integridad;
- una imagen con EXIF y un recurso inexistente;
- la falta de la política y una sección inexistente;
- una página sin su CSS;
- marcas de borrador en la versión para publicar.

### Prueba por HTTP del sitio compilado (`vite preview`)

| Respuesta | Rutas |
|---|---|
| 200 | `/`, `/privacidad`, `/terminos`, `/eliminacion-datos`, `/privacidad.html` y los 9 recursos de `assets/` |
| 404 | `/login.html`, `/cotizador.html`, `/panel-admin.html`, `/empleados.html`, `/.env`, `/apps/server/.env`, `/api/pqrs`, `/galeria/evento-sin-pantalla-3.png`, `/logo.png`, `/contratos-firmados/`, `/index.html.map` |

### Revisión del repositorio

- No hay claves reales ni en el código actual ni en el historial de ninguna rama. Las únicas
  coincidencias son URL de ejemplo: `usuario:password` en `.env.example` y la clave por
  defecto del Postgres local en `docker-compose.yml`.
- Nunca se subió un `.env` real.

## Lo que sí está expuesto, fuera del sitio

**Crítico.** El repositorio de GitHub es público, y en tres ramas publicadas están:
- la firma escaneada de la representante legal (`apps/server/assets/firma-maritza.png`), que
  se puede descargar sin credenciales;
- su número de cédula (`apps/server/src/pdf/contratoPdf.ts`);
- los nombres y correos del personal (`apps/server/src/scripts/seed-usuarios.ts`).

No es parte de la web institucional, pero:
- es el riesgo más alto del proyecto;
- hace que la sección de seguridad de la política no sea cierta;
- Cloudflare se conectará a este mismo repositorio en el Numeral 7.

Acciones recomendadas. Las deciden el administrador del repo y la dueña; no se ha hecho ninguna:

1. Poner el repositorio en privado (GitHub → Settings → General → Danger Zone). Cloudflare
   Pages funciona igual con repositorios privados.
2. Sacar la firma y la cédula del código: que el servidor las lea de un archivo o una variable
   fuera del repositorio. Hacer lo mismo con los datos de `seed-usuarios.ts`. Esto cambia el
   aplicativo, así que necesita autorización expresa.
3. Decidir si se limpia el historial. Reescribe ramas compartidas, así que hay que coordinarlo
   con el equipo. Lo que ya se haya descargado no se puede recuperar.
4. Contarle a la dueña: la firma y la cédula son suyas.

## Pendientes del aplicativo

No bloquean la publicación del sitio, pero sí que la política sea cierta. Están detallados en
el [inventario de datos personales](inventario-datos-personales.md).

- **Autorización:** el cotizador, el formulario de PQRS y el contrato no tienen texto de
  autorización ni enlace a la política.
- **Clave inicial:** todos los empleados nuevos reciben la misma clave inicial. Falta
  confirmar que el cambio sea obligatorio antes de usar el sistema.
- **Tabla anterior `empleados`:** guarda salario, banco y número de cuenta.
- **Al publicar el aplicativo, más adelante:**
  - las rutas públicas de cotizaciones, PQRS e inicio de sesión no tienen límite de intentos;
  - los contratos firmados quedan en el disco del servidor.

## Para el Numeral 6

Hecho en el Numeral 6; el detalle está en
[configuracion-cloudflare-pages.md](configuracion-cloudflare-pages.md):
- `_headers` con la política de contenido y los demás encabezados.
- La página `404.html`.
- Los valores de la rama, el comando y la carpeta de salida.
- La auditoría sumó el control 11, que exige todo esto y detecta código en línea que la política
  bloquearía. Las pruebas negativas pasaron de 21 a 33.

## Aprobación

- [ ] Revisé este informe y apruebo que la versión institucional se publique cuando la dueña
  confirme los datos y los documentos, y cuando se resuelva la exposición del repositorio.
