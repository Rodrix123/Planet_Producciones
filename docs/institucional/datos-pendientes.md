# Datos oficiales pendientes

Información que hace falta para la web institucional, la política de privacidad, los
términos y, más adelante, la configuración en Meta. Los datos que respalda el certificado de la
Cámara de Comercio (expedido el 12/08/2026) están confirmados; los demás vienen del código y se
marcan como «sin confirmar» hasta que la dueña los confirme.

**Uso:** S = sitio web · P = política de privacidad · T = términos y condiciones ·
M = formularios de Meta (Numeral 10).

**Estado:** Pendiente (no se tiene) · Confirmar (se tiene, falta que la dueña lo confirme) ·
Sin confirmar (aparece en el código) · Decidir (depende de una decisión de la dueña) ·
Confirmado (lo comprueba un documento oficial o la dueña).

Cuando la dueña confirme un dato, se marca también en `apps/web/institucional/contenido.ts`.
Mientras quede alguno sin confirmar, la versión publicable de la web no se genera.

**31 de octubre de 2026:** la dueña y el equipo confirmaron todos los datos y documentos que usa la
web, y la versión definitiva compila. Lo que sigue pendiente aquí (fotos, pirotecnia, cifras,
horario, otras redes, dominio y cuentas) no aparece en el sitio.

## 1. Nombre comercial y nombre legal

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| A1 | Nombre comercial exacto | «Planet Producciones» (sitio) | Confirmado (dueña, 31/10/2026) | Sí | S P T M | Dueña |
| A2 | Razón social o nombre legal | «PLANETT PRODUCCIONES S.A.S.», con doble T. Coincide con el contrato del sistema ([contratoPdf.ts:53](../../apps/server/src/pdf/contratoPdf.ts#L53)) | Confirmado (certificado de la Cámara de Comercio) | Sí | P T M | Cámara de Comercio o RUT |
| A3 | Tipo de persona (natural o jurídica) y tipo de sociedad | Persona jurídica: sociedad por acciones simplificada (S.A.S.), constituida por accionista único | Confirmado (certificado) | Sí | P T M | Cámara de Comercio |
| A4 | NIT con dígito de verificación | 901.668.571-1. El certificado lo trae como 901668571-1 y el contrato ([contratoPdf.ts:54](../../apps/server/src/pdf/contratoPdf.ts#L54)) con puntos | Confirmado (certificado) | Sí | P T M | RUT |
| A5 | Representante legal | El gerente y su suplente figuran en el certificado; no se copian aquí | Confirmado (certificado) | No hace falta | M | Cámara de Comercio |

## 2. Actividad económica

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| B1 | Descripción pública de la actividad | «Producción técnica para eventos» (dato del equipo). El objeto social del certificado incluye alquiler de equipos de sonido, iluminación, pantallas, pistas, efectos de alto impacto, carpas, tarimas y mobiliario, y organización de eventos | Confirmado (dueña, 31/10/2026) | Sí | S P | Dueña |
| B2 | Actividad registrada (código CIIU) | Principal N7729, secundaria N8230 y otra R9007 (certificado) | Confirmado (certificado) | No | M | RUT |
| B3 | Tipos de evento que atiende | Bodas, 15 años, grados y corporativos ([cotizador.html:93-96](../../apps/web/cotizador.html#L93-L96)) | Confirmado (dueña, 31/10/2026) | Sí | S | Dueña |

## 3. Ubicación y cobertura

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| C1 | Domicilio registrado | CR 17 4 33 AP 301, la «Dirección del domicilio principal» del certificado, escrita igual | Confirmado (dueña, 31/10/2026, y certificado) | Sí, completa: lo decidió la dueña | P T M | Cámara de Comercio |
| C2 | Ciudad y departamento | Manizales, Caldas (domicilio del certificado) | Confirmado (certificado) | Sí | S P T | RUT |
| C3 | Cobertura | Manizales, Chinchiná - Santágueda, Pereira y Armenia (sitio y catálogo); «Eje Cafetero» (dato del equipo) | Confirmado (dueña, 31/10/2026): la lista del sitio | Sí | S | Dueña |
| C4 | Horario de atención | — | Pendiente (opcional) | Si existe | S | Dueña |

## 4. Servicios

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| D1 | Servicios que se pueden anunciar (sin precios) | Dato del equipo: sonido profesional, iluminación robótica, pantallas LED, efectos especiales y servicios complementarios. Catálogo del cotizador: sonido (principal, ceremonia y cóctel), iluminación profesional y de ambientación, pantalla LED, piso de pista de baile, tarima, estructura truss, montaje y carpas, controladores DJ, efectos especiales, plantas eléctricas y mobiliario lounge. | Confirmado (dueña, 31/10/2026): los servicios del sitio, sin cambios | Sí | S T | Dueña |
| D2 | Pirotecnia | En el catálogo hay pirotecnia de interior y al aire ([seed-catalogo.ts:256-258](../../apps/server/src/scripts/seed-catalogo.ts#L256-L258)). El objeto social del certificado no la nombra (habla de «efectos de alto impacto») | Decidir | Decidir | S T | Dueña |
| D3 | Marcas y especificaciones que se pueden nombrar | «Line Array RCF», «pantallas LED Pitch 3», «DMX», «consolas digitales» (sitio) | Decidir | Solo si se aprueban | S | Dueña |
| D4 | Cifras y promesas | «+10 años», «+500 eventos», «garantizado», «100% gratuita», «equipos propios», «respaldo inmediato» ([inventario](inventario-textos.md)) | Decidir | Solo si se aprueban | S | Dueña (origen de cada cifra) |
| D5 | Condiciones comerciales que se mostrarán | El contrato firmado coincide con la plantilla del sistema; la cotización en PDF dice otra cosa ([inventario, sección 4](inventario-textos.md#4-condiciones-y-datos-que-se-contradicen)). Los términos ya resumen el contrato (sección 6, bloque COND) | Confirmado (dueña, 31/10/2026): aprobó el bloque COND | Sí | T | Dueña |

## 5. Contacto

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| E1 | Teléfono comercial | +57 312 781 70 72; el certificado lo registra como teléfono comercial 1 | Confirmado (certificado) | Sí | S P T M | Dueña |
| E2 | ¿Ese número atiende WhatsApp y se puede enlazar en el sitio? | Sí: el sitio enlaza WhatsApp al +57 312 781 70 72 | Confirmado (dueña, 31/10/2026) | Sí | S | Dueña |
| E3 | Correo comercial | planet.producciones@outlook.com, el correo comercial y de notificación del certificado; ya está cargado en el código. (Los correos `@planetproducciones.com` de los datos de prueba del código no se han comprobado) | Confirmado (dueña, 31/10/2026) | Sí | S T M | Dueña |
| E4 | Instagram oficial | https://www.instagram.com/planet.producciones/ | Confirmado (dueña, 31/10/2026) | Sí | S M | Dueña |
| E5 | Página de Facebook u otras redes | — | Pendiente | Si existen | S M | Dueña |

## 6. Fotografías y videos

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| F1 | Aprobación de cada foto (F-01 a F-06 del [inventario](inventario-textos.md#3-fotos-de-la-galería)) | 6 fotos distintas en 8 archivos | Decidir | Solo las aprobadas | S | Dueña |
| F2 | Autoría y permiso de uso (quién tomó las fotos) | — | Pendiente | — | S | Dueña |
| F3 | Autorización de personas o clientes identificables (DJ en F-02, iniciales en F-04) | — | Pendiente | — | S P | Dueña |
| F4 | Fotos nuevas para «sin pantalla» (hoy hay 2 fotos repetidas) | — | Pendiente | — | S | Dueña |
| F5 | Videos | No hay en el repositorio | Pendiente (opcional) | — | S | Dueña |
| F6 | Logo vigente | [logo.png](../../apps/web/public/logo.png) | Confirmar | Sí | S | Dueña |

## 7. Responsable del tratamiento de datos

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| G1 | Identificación del responsable | Se completa con A2, A4, C1, C2, E1 y E3 | Confirmado (31/10/2026) | Sí | P | Cámara de Comercio |
| G2 | Cargo o área que atiende consultas y reclamos sobre datos personales | Mariana, asistente de Planet Producciones. Teléfono +57 310 651 3283 | Confirmado (dueña, 31/10/2026) | Sí (nombre, cargo y teléfono) | P | Dueña |
| G3 | Correo para solicitudes sobre datos personales | El mismo de E3. Se revisa con frecuencia: la ley da plazos para responder | Confirmado (dueña, 31/10/2026) | Sí | P M | Dueña |
| G4 | Fecha de entrada en vigencia de los documentos legales | 31 de octubre de 2026 | Confirmado (dueña, 31/10/2026) | Sí | P T | Dueña |
| G5 | Proveedores tecnológicos que intervienen | Supabase, Google (Gmail) y Cloudflare; Meta y n8n en preparación | Confirmado (equipo, 31/10/2026) | Sí | P | Equipo |

Los datos personales que trata el sistema y la evidencia de cada proveedor están en el
[inventario de datos personales](inventario-datos-personales.md).

## 8. Canal para consultas y reclamos

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| H1 | Canal mientras el formulario PQRS no esté publicado | Correo de G3 y teléfono de G2 (Mariana) | Confirmado (dueña, 31/10/2026) | Sí | S P | Dueña |
| H2 | Horario y medio de respuesta | — | Pendiente (opcional) | Sí | S P | Dueña |

## 9. Dominio y cuentas de la empresa

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| I1 | ¿La empresa tiene dominio propio? ¿A nombre de quién está? | — | Pendiente | — | S M | Dueña (Numeral 9) |
| I2 | Correo de la empresa que será titular de las cuentas de Cloudflare y Meta | — | Pendiente | No | — | Dueña |
| I3 | ¿Ya existe un portafolio en Meta Business Suite? ¿Quién lo administra y con qué nombre se creó? | — | Pendiente | No | M | Dueña |

## 10. Aprobación de los textos y documentos legales

| ID | Documento | Página | Estado | Quién aprueba |
|---|---|---|---|---|
| TXT | Textos de la página de inicio | `/` ([index.html](../../apps/web/institucional/index.html)) | Aprobado (31/10/2026) | Dueña |
| PRIV | Política de privacidad y tratamiento de datos personales | `/privacidad` ([privacidad.html](../../apps/web/institucional/privacidad.html)) | Aprobado (31/10/2026) | Dueña, idealmente con revisión jurídica |
| TERM | Términos y condiciones de uso del sitio | `/terminos` ([terminos.html](../../apps/web/institucional/terminos.html)) | Aprobado (31/10/2026) | Dueña, idealmente con revisión jurídica |
| COND | Condiciones generales de contratación: pago, cancelaciones, daños, suspensión, proveedores externos e incumplimiento de la empresa. Resumen del contrato firmado | `/terminos#condiciones` (sección 6) | Aprobado (31/10/2026) | Dueña, con revisión jurídica. Si decide no publicarlas, se borra esa sección y su ID |
| ELIM | Procedimiento de eliminación de datos | `/eliminacion-datos` ([eliminacion-datos.html](../../apps/web/institucional/eliminacion-datos.html)) | Aprobado (31/10/2026) | Dueña, idealmente con revisión jurídica |

Antes de aprobarlos conviene leer las [notas para la revisión jurídica](notas-revision-juridica.md).

## Documentos de respaldo

Solo sirven para comprobar los datos. **No se suben al repositorio ni al sitio.**

- Certificado de existencia y representación legal de la Cámara de Comercio de Manizales:
  **recibido**, expedido el 12/08/2026. Su verificación en línea dura 60 días y venció hacia el
  11 de octubre de 2026. Basta como respaldo de estos datos; si alguna plataforma pide un
  certificado vigente (Numeral 10), hay que solicitar uno nuevo.
- Contrato firmado de ejemplo (julio de 2026): **recibido**. Coincide con la plantilla del
  sistema y de él salen las condiciones generales de los términos. Trae datos del cliente y de
  las partes, así que no se sube.
- RUT actualizado: pendiente (no es indispensable para el sitio).

## Datos que no se publican

Cédulas y firma de la gerente y de su suplente, cuentas bancarias, datos de trabajadores, cotizaciones y contratos de clientes
(nombres, cédulas, precios y lugares de cada evento).
