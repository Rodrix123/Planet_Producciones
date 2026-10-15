# Web institucional: documentos de trabajo

Material de apoyo para publicar la versión institucional de Planet Producciones en
Cloudflare Pages. Esta carpeta no forma parte del sitio: el build de Vite solo compila
`apps/web`.

| Documento | Contenido | Para quién |
|---|---|---|
| [inventario-textos.md](inventario-textos.md) | Estado de cada texto y foto del sitio actual (listo, por confirmar, por autorizar o fuera de la versión institucional) y las contradicciones entre la página, la cotización y el contrato. | Equipo |
| [datos-pendientes.md](datos-pendientes.md) | Datos oficiales que faltan, dónde se usará cada uno y con qué documento se comprueba. | Equipo |
| [solicitud-a-la-duena.md](solicitud-a-la-duena.md) | Mensaje listo para enviar a la dueña con las preguntas y los textos que debe aprobar. | Dueña |
| [inventario-datos-personales.md](inventario-datos-personales.md) | Qué datos personales trata el sistema, dónde quedan, qué proveedores intervienen y qué debe resolverse antes de publicar la política. | Equipo y abogado |
| [notas-revision-juridica.md](notas-revision-juridica.md) | Normas en que se basan los documentos legales, decisiones de redacción y puntos para revisar. | Abogado y dueña |
| [auditoria-seguridad.md](auditoria-seguridad.md) | Resultado de la auditoría de seguridad de lo que se publicará, pruebas hechas y lo que sigue expuesto fuera del sitio. | Equipo (lo aprueba) |
| [configuracion-cloudflare-pages.md](configuracion-cloudflare-pages.md) | Valores para conectar el sitio a Cloudflare Pages, por qué se compila desde la raíz del monorepo, rutas, encabezados de seguridad y pruebas hechas. | Equipo (revisa los valores) |
| [guia-cloudflare-pages.md](guia-cloudflare-pages.md) | Pasos para preparar la rama de producción, crear el proyecto en Cloudflare, conectar GitHub y leer el primer build. | Quien configura Cloudflare |

El sitio se construye en [apps/web/institucional/](../../apps/web/institucional/README.md).

## Reglas

- **El repositorio es público.** Todo lo que se suba a esta carpeta lo puede leer cualquiera.
- El RUT, los certificados de Cámara de Comercio, las cédulas, las firmas y los datos
  bancarios se revisan **fuera del repositorio**. Aquí solo se anotan los datos que la
  dueña autorice publicar.
- Ningún dato se da por bueno hasta que la dueña lo confirme. Lo que aparece en el código
  se marca como «sin confirmar».
- No se agregan afirmaciones comerciales (cifras, garantías, marcas) sin su autorización.
