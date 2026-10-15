# Datos oficiales pendientes

Información que hace falta para la web institucional, la política de privacidad, los
términos y, más adelante, la configuración en Meta. Ningún valor está confirmado: los que
vienen del código se marcan como «sin confirmar».

**Uso:** S = sitio web · P = política de privacidad · T = términos y condiciones ·
M = formularios de Meta (Numeral 10).

**Estado:** Pendiente (no se tiene) · Confirmar (se tiene, falta que la dueña lo confirme) ·
Sin confirmar (aparece en el código) · Decidir (depende de una decisión de la dueña).

## 1. Nombre comercial y nombre legal

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| A1 | Nombre comercial exacto | «Planet Producciones» (sitio) | Confirmar | Sí | S P T M | Dueña |
| A2 | Razón social o nombre legal | «PLANETT PRODUCCIONES S.A.S», en el contrato del sistema ([contratoPdf.ts:53](../../apps/server/src/pdf/contratoPdf.ts#L53)) | Sin confirmar | Decidir | P T M | Cámara de Comercio o RUT |
| A3 | Tipo de persona (natural o jurídica) y tipo de sociedad | El contrato dice S.A.S; no se asume | Sin confirmar | Decidir | P T M | Cámara de Comercio |
| A4 | NIT con dígito de verificación | 901.668.571-1, en el contrato ([contratoPdf.ts:54](../../apps/server/src/pdf/contratoPdf.ts#L54)). El dígito de verificación es coherente con el cálculo de la DIAN; eso no prueba que sea el de la empresa. | Sin confirmar | Decidir | P T M | RUT |
| A5 | Representante legal | Figura en el contrato; no se copia aquí | Sin confirmar | No hace falta | M | Cámara de Comercio |

## 2. Actividad económica

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| B1 | Descripción pública de la actividad | «Producción técnica para eventos» (dato del equipo) | Confirmar | Sí | S P | Dueña |
| B2 | Actividad registrada (código CIIU) | — | Pendiente | No | M | RUT |
| B3 | Tipos de evento que atiende | Bodas, 15 años, grados y corporativos ([cotizador.html:93-96](../../apps/web/cotizador.html#L93-L96)) | Confirmar | Sí | S | Dueña |

## 3. Ubicación y cobertura

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| C1 | Domicilio registrado | — | Pendiente | Decidir (si es una vivienda, puede publicarse solo la ciudad) | P T M | RUT o Cámara de Comercio |
| C2 | Ciudad y departamento | Manizales, Caldas (sitio) | Confirmar | Sí | S P T | RUT |
| C3 | Cobertura | Manizales, Chinchiná - Santágueda, Pereira y Armenia (sitio y catálogo); «Eje Cafetero» (dato del equipo) | Confirmar | Sí | S | Dueña |
| C4 | Horario de atención | — | Pendiente (opcional) | Si existe | S | Dueña |

## 4. Servicios

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| D1 | Servicios que se pueden anunciar (sin precios) | Dato del equipo: sonido profesional, iluminación robótica, pantallas LED, efectos especiales y servicios complementarios. Catálogo del cotizador: sonido (principal, ceremonia y cóctel), iluminación profesional y de ambientación, pantalla LED, piso de pista de baile, tarima, estructura truss, montaje y carpas, controladores DJ, efectos especiales, plantas eléctricas y mobiliario lounge. | Confirmar uno por uno | Sí | S T | Dueña |
| D2 | Pirotecnia | En el catálogo hay pirotecnia de interior y al aire ([seed-catalogo.ts:256-258](../../apps/server/src/scripts/seed-catalogo.ts#L256-L258)) | Decidir | Decidir | S T | Dueña |
| D3 | Marcas y especificaciones que se pueden nombrar | «Line Array RCF», «pantallas LED Pitch 3», «DMX», «consolas digitales» (sitio) | Decidir | Solo si se aprueban | S | Dueña |
| D4 | Cifras y promesas | «+10 años», «+500 eventos», «garantizado», «100% gratuita», «equipos propios», «respaldo inmediato» ([inventario](inventario-textos.md)) | Decidir | Solo si se aprueban | S | Dueña (origen de cada cifra) |
| D5 | Condiciones comerciales que se mostrarán | Hay contradicciones entre la página, la cotización y el contrato ([inventario, sección 4](inventario-textos.md#4-condiciones-y-datos-que-se-contradicen)) | Decidir | Sí | S T | Dueña |

## 5. Contacto

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| E1 | Teléfono comercial | +57 312 781 70 72 (dato del equipo y sitio) | Confirmar | Sí | S P T M | Dueña |
| E2 | ¿Ese número atiende WhatsApp y se puede enlazar en el sitio? | — | Pendiente | Decidir | S | Dueña |
| E3 | Correo comercial | — (en datos de prueba del código aparecen correos `@planetproducciones.com`; no se ha comprobado que ese dominio exista) | Pendiente | Sí | S T M | Dueña |
| E4 | Instagram oficial | https://www.instagram.com/planet.producciones/ | Confirmar (que es de la empresa y quién la administra) | Sí | S M | Dueña |
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
| G1 | Identificación del responsable | Se completa con A2, A4, C1, E1 y E3 | Pendiente | Sí | P | RUT |
| G2 | Cargo o área que atiende consultas y reclamos sobre datos personales | — | Pendiente | Sí (el cargo; el nombre es opcional) | P | Dueña |
| G3 | Correo para solicitudes sobre datos personales | — (puede ser el mismo de E3) | Pendiente | Sí | P M | Dueña |
| G4 | Fecha desde la que rige la política | — | Pendiente | Sí | P | Dueña |

Los datos personales que recoge el sistema y los proveedores tecnológicos que intervienen se
documentarán desde el código al redactar la política (Numeral 4).

## 8. Canal para consultas y reclamos

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| H1 | Canal mientras el formulario PQRS no esté publicado | — (correo, WhatsApp o teléfono) | Pendiente | Sí | S P | Dueña |
| H2 | Horario y medio de respuesta | — | Pendiente (opcional) | Sí | S P | Dueña |

## 9. Dominio y cuentas de la empresa

| ID | Dato | Valor conocido | Estado | ¿Se publica? | Uso | Se comprueba con |
|---|---|---|---|---|---|---|
| I1 | ¿La empresa tiene dominio propio? ¿A nombre de quién está? | — | Pendiente | — | S M | Dueña (Numeral 9) |
| I2 | Correo de la empresa que será titular de las cuentas de Cloudflare y Meta | — | Pendiente | No | — | Dueña |
| I3 | ¿Ya existe un portafolio en Meta Business Suite? ¿Quién lo administra y con qué nombre se creó? | — | Pendiente | No | M | Dueña |

## Documentos de respaldo

Solo sirven para comprobar los datos. **No se suben al repositorio ni al sitio.**

- RUT actualizado.
- Certificado de existencia y representación legal de la Cámara de Comercio (si es persona
  jurídica) o certificado de matrícula mercantil (si es persona natural comerciante).

## Datos que no se publican

Cédula y firma de la representante legal, cuentas bancarias, datos de trabajadores,
cotizaciones y contratos de clientes.
