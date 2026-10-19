# Inventario de textos del sitio actual

Revisión del 15 de octubre de 2026 sobre la rama `feature/web-institucional-meta`
(commit `87ee5df`). Cubre las dos páginas candidatas a la versión institucional
([index.html](../../apps/web/index.html) y [galeria.html](../../apps/web/galeria.html)),
las fotos de la galería y, como referencia, las condiciones que aparecen en la cotización
y en el contrato que genera el sistema.

## Estados

| Estado | Significado |
|---|---|
| **Listo** | Texto de interfaz sin afirmaciones sobre la empresa (menús, botones, títulos genéricos). |
| **Confirmar** | Dato suministrado por el equipo (nombre, ciudad, teléfono, Instagram, servicios, eslóganes). Se publica cuando la dueña lo confirme. |
| **Autorizar** | Cifra, garantía, promesa o marca. Necesita autorización expresa de la dueña y, si es una cifra, saber de dónde sale. |
| **Fuera** | Depende del backend o de funciones que no se publican en esta etapa (cotizador, inicio de sesión, PQRS). |

## 1. Página de inicio (`index.html`)

### Metadatos y encabezado

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T01 | «Planet Producciones \| Producción Técnica & Eventos VIP» (título de la pestaña) | [6](../../apps/web/index.html#L6) | Confirmar | «Eventos VIP» es posicionamiento de marca. |
| T02 | «Sonido, iluminación, pantallas LED y efectos especiales para bodas, fiestas de 15 años, grados y eventos corporativos VIP en el Eje Cafetero.» (descripción para buscadores) | [7](../../apps/web/index.html#L7) | Confirmar | Servicios, tipos de evento y cobertura (datos D1, B3 y C3). |
| T03 | «Planet Producciones» / «Eventos VIP & Producción Técnica» | [23-24](../../apps/web/index.html#L23-L24) | Confirmar | Nombre comercial exacto (dato A1). El contrato usa otra grafía: ver sección 4. |
| T04 | Menú: Inicio, Servicios, Por Qué Elegirnos, Galería, Preguntas Frecuentes, Contacto | [29-35](../../apps/web/index.html#L29-L35) | Listo | «Servicios» lleva a la banda de cotización: no existe una sección de servicios. |
| T05 | Menú: «PQRS» | [34](../../apps/web/index.html#L34) | Fuera | El formulario envía a `/api/pqrs`. |
| T06 | «Iniciar Sesión» y «Cotizar Ahora» | [39-40](../../apps/web/index.html#L39-L40) | Fuera | Llevan a `login.html` y `cotizador.html`. |

### Inicio

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T07 | «+10 Años de Experiencia • Eventos VIP en el Eje Cafetero» | [55](../../apps/web/index.html#L55) | Autorizar | ¿Desde qué año opera la empresa? |
| T08 | «Producción Técnica de Alto Impacto para tu Evento VIP» | [58](../../apps/web/index.html#L58) | Confirmar | Eslogan. |
| T09 | «Sonido profesional, iluminación robótica, pantallas LED y efectos especiales para bodas, fiestas de 15 años, grados y eventos corporativos.» | [61-62](../../apps/web/index.html#L61-L62) | Confirmar | Servicios y tipos de evento. |
| T10 | «Equipos de primer nivel y un equipo técnico dedicado, de principio a fin.» | [62-63](../../apps/web/index.html#L62-L63) | Autorizar | Promesa de calidad y de personal. |
| T11 | Botones «Cotizar Ahora» / «Ver Servicios» | [67-68](../../apps/web/index.html#L67-L68) | Fuera / Listo | |

### Por qué elegirnos y cobertura

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T12 | «Cobertura Regional» / «Producción Técnica de Primer Nivel en el Eje Cafetero» | [84-86](../../apps/web/index.html#L84-L86) | Autorizar | «De primer nivel» es una afirmación de calidad. |
| T13 | «Cubrimos Manizales, Chinchiná - Santágueda, Pereira y Armenia» | [88](../../apps/web/index.html#L88) | Confirmar | Coincide con las ciudades de transporte del catálogo ([seed-catalogo.ts:26-31](../../apps/server/src/scripts/seed-catalogo.ts#L26-L31)). |
| T14 | «…con equipos propios, montaje profesional y un equipo técnico presente durante todo el evento.» | [88-89](../../apps/web/index.html#L88-L89) | Autorizar | El contrato prevé suplir el servicio con un «proveedor colega» ([contratoPdf.ts:151](../../apps/server/src/pdf/contratoPdf.ts#L151)). |
| T15 | «Equipos de Última Generación — Line Array RCF, iluminación robótica DMX, pantallas LED Pitch 3 y consolas digitales.» | [96-97](../../apps/web/index.html#L96-L97) | Autorizar | Marcas y especificaciones. |
| T16 | «Montaje Profesional Garantizado — Instalación, pruebas de sonido y desmonte incluidos en cada servicio contratado.» | [103-104](../../apps/web/index.html#L103-L104) | Autorizar | «Garantizado» es una promesa. |
| T17 | «Respaldo Técnico en Sitio — Técnico dedicado durante todo el evento, con equipos de respaldo inmediato.» | [110-111](../../apps/web/index.html#L110-L111) | Autorizar | El contrato dice «mínimo un (1) técnico de sonido y un (1) técnico de iluminación». |
| T18 | Tarjetas «Sonido Line Array», «Iluminación Robótica», «Pantallas LED» | [119-121](../../apps/web/index.html#L119-L121) | Confirmar | Servicios. |
| T19 | «+500 Eventos — Realizados con éxito» | [126-127](../../apps/web/index.html#L126-L127) | Autorizar | ¿De dónde sale la cifra? |

### Banda de cotización (ancla `#servicios`)

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T20 | «Cotización 100% Gratuita y Sin Compromiso» | [138](../../apps/web/index.html#L138) | Autorizar | Solo tiene sentido si se ofrece cotizar por otro canal. |
| T21 | «Cotiza tu Evento VIP en Minutos» y «Arma tu cotización a la medida… Descarga tu propuesta en PDF y Excel al instante.» | [141-145](../../apps/web/index.html#L141-L145) | Fuera | Describe el cotizador. |
| T22 | Botón «Cotizar Ahora» | [149](../../apps/web/index.html#L149) | Fuera | |
| T23 | Botón «@planet.producciones» (Instagram) | [150](../../apps/web/index.html#L150) | Confirmar | Dato E4. |
| T24 | «Sonido Profesional · Iluminación DMX · Efectos Especiales · Pantallas LED» | [154-157](../../apps/web/index.html#L154-L157) | Confirmar | Servicios. |

### Preguntas frecuentes

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T25 | Introducción: «…Si tu duda no está aquí, escríbenos en la sección de PQRS más abajo.» | [170-171](../../apps/web/index.html#L170-L171) | Fuera | Remite al formulario PQRS; hay que indicar otro canal (dato H1). |
| T26 | «¿Cómo reservo la fecha de mi evento?» → «La fecha se separa con el 30% del valor total cotizado, dentro de los 30 días siguientes a la fecha de la cotización.» | [177-181](../../apps/web/index.html#L177-L181) | Autorizar | Condición comercial (ver sección 4). |
| T27 | «¿Qué ciudades cubren?» → «Cubrimos Manizales, Chinchiná - Santágueda, Pereira y Armenia con equipos propios y montaje profesional.» | [186-190](../../apps/web/index.html#L186-L190) | Confirmar / Autorizar | Ciudades: confirmar. «Equipos propios»: autorizar. |
| T28 | «¿Hasta cuándo debo completar el pago?» → «…máximo 8 días antes de la fecha de realización.» | [195-199](../../apps/web/index.html#L195-L199) | Autorizar | **Contradice el contrato** (1 día antes). |
| T29 | «¿Qué incluye el servicio técnico?» → «Montaje previo, pruebas de sonido, técnico DMX dedicado durante todo el evento, desmonte y respaldo técnico inmediato con equipos de backup.» | [204-208](../../apps/web/index.html#L204-L208) | Autorizar | Ver T17. |
| T30 | «¿La cotización tiene algún costo?» → «No. Cotizar tu evento es 100% gratuito y sin ningún compromiso de contratación.» | [213-217](../../apps/web/index.html#L213-L217) | Autorizar | |
| T31 | «¿Qué pasa si cambio el lugar o los requerimientos después de cotizar?» → «Los precios quedan sujetos a verificación…» | [222-226](../../apps/web/index.html#L222-L226) | Autorizar | Coincide con la cotización. |

### PQRS

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T32 | Sección completa: «Peticiones, Quejas, Reclamos y Sugerencias», «¿Tienes algo que contarnos?» y el formulario | [236-266](../../apps/web/index.html#L236-L266) | Fuera | Envía a `/api/pqrs` ([home.ts:43](../../apps/web/src/home.ts#L43)). |

### Pie de página

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| T33 | «Planet Producciones» / «Eventos VIP & Producción Técnica» | [278-279](../../apps/web/index.html#L278-L279) | Confirmar | Dato A1. |
| T34 | «Producción técnica integral para eventos VIP: sonido, iluminación, pantallas LED y efectos especiales, con equipos propios y montaje profesional.» | [282-284](../../apps/web/index.html#L282-L284) | Confirmar / Autorizar | Servicios: confirmar. «Equipos propios»: autorizar. |
| T35 | «Hecho con pasión para tus momentos únicos» | [286](../../apps/web/index.html#L286) | Confirmar | Eslogan. |
| T36 | Teléfono «+57 312 781 70 72» | [291](../../apps/web/index.html#L291) | Confirmar | Dato E1. |
| T37 | Instagram «@planet.producciones» | [292](../../apps/web/index.html#L292) | Confirmar | Dato E4. |
| T38 | «Manizales - Caldas, Colombia» | [293](../../apps/web/index.html#L293) | Confirmar | Dato C2. |
| T39 | Columna «Cotiza tu Evento», «Cotizar Ahora», «Iniciar Sesión» | [297-300](../../apps/web/index.html#L297-L300) | Fuera | |
| T40 | «© 2026 Planet Producciones. Todos los derechos reservados.» | [305](../../apps/web/index.html#L305) | Confirmar | ¿Nombre comercial o razón social? |
| T41 | Enlaces inferiores: Instagram / Cotizador / Iniciar Sesión | [307-309](../../apps/web/index.html#L307-L309) | Confirmar / Fuera / Fuera | |

**Lo que falta en la página:** una sección real de servicios, el nombre legal y el NIT (si
se autorizan), un correo, el canal de consultas y reclamos, y los enlaces a privacidad,
términos y eliminación de datos.

## 2. Galería (`galeria.html`)

| ID | Texto actual | Línea | Estado | Observación |
|---|---|---|---|---|
| G01 | «Galería de Eventos \| Planet Producciones» | [6](../../apps/web/galeria.html#L6) | Listo | |
| G02 | «Fotos reales de eventos realizados por Planet Producciones, con y sin pantalla LED.» (descripción para buscadores) | [7](../../apps/web/galeria.html#L7) | Autorizar | Afirma que las fotos son de eventos de la empresa (dato F2). |
| G03 | «Eventos Realizados», «Galería de Eventos», «Una muestra real de nuestros eventos. Filtra entre montajes con pantalla LED y sin pantalla.» | [46-51](../../apps/web/galeria.html#L46-L51) | Autorizar | Igual que G02. |
| G04 | Pestañas «Eventos con pantalla» / «Eventos sin pantalla» | [54-59](../../apps/web/galeria.html#L54-L59) | Listo | Ver F-05. |
| G05 | «Todavía no hay fotos en esta categoría.» | [66](../../apps/web/galeria.html#L66) | Listo | |
| G06 | Encabezado y pie | [17-41](../../apps/web/galeria.html#L17-L41), [78-105](../../apps/web/galeria.html#L78-L105) | — | Mismos textos que T03-T06, T33, T36, T37, T39 y T40. El pie de la galería no muestra la ciudad. |

## 3. Fotos de la galería

Archivos en `apps/web/public/galeria/` y textos alternativos en
[galeriaFotos.ts](../../apps/web/src/galeriaFotos.ts#L15-L22). Revisión visual del 15 de
octubre de 2026.

| ID | Archivo | Qué se ve | Observaciones | Estado |
|---|---|---|---|---|
| F-01 | `evento-con-pantalla-1.png` | Montaje nocturno con techo de telas, lámparas en forma de flor, paneles LED en diagonal, luces robóticas y cabina de DJ. Sin personas. | El texto alternativo coincide. | Autorizar |
| F-02 | `evento-con-pantalla-2.png` | Techo de bambú y follaje con esferas de espejo y luces colgantes, marcos LED y pista con borde iluminado. | **Se ve la cara del DJ** y dos invitados al fondo. El texto alternativo habla de «flores» que no se ven. | Autorizar (uso de imagen) |
| F-03 | `evento-con-pantalla-3.png` | Salón con escenario de pantalla LED, pista de vidrio iluminada y mesa servida en primer plano. | Una persona al fondo, no identificable. | Autorizar |
| F-04 | `evento-con-pantalla-4.png` | Techo de telas blancas, pantalla LED con las iniciales «D & J» y pista con monograma. | **Muestra iniciales de clientes**; hay invitados pequeños al fondo. | Autorizar (consentimiento de los clientes) |
| F-05 | `evento-sin-pantalla-1.png` | Carpa con follaje colgante, lámparas de flecos, palmeras decorativas, mesas de postres y estructura en «A». | La estructura en «A» y el frente de la cabina parecen paneles LED con gráficos: revisar si corresponde a «sin pantalla». | Autorizar y revisar categoría |
| F-06 | `evento-sin-pantalla-2.png` | Techo de bambú con enredaderas, lámparas de araña, pista LED tipo espejo, cabina con estructura de luces y un letrero «PLANET». | Se ve la marca de la empresa. | Autorizar |
| — | `evento-sin-pantalla-3.png` y `evento-sin-pantalla-4.png` | Copias exactas de F-05 y F-06 (mismo archivo). | La categoría «sin pantalla» solo tiene 2 fotos distintas; parece contenido de prueba. | Reemplazar o quitar |

Las fotos muestran decoración (flores, telas, mobiliario) que podría ser de otros
proveedores: hay que confirmar quién las tomó y si la empresa puede usarlas. Cada PNG pesa
entre 1,6 y 2,5 MB (17 MB en total); se optimizarán, sin cambiar su aspecto, cuando la dueña
apruebe las fotos definitivas. La web institucional (Numeral 3) solo publica las fotos
marcadas como autorizadas.

## 4. Condiciones y datos que se contradicen

Fuentes: la página de inicio, el PDF de la cotización
([main.ts:360-379](../../apps/web/src/main.ts#L360-L379)) y el PDF del contrato
([contratoPdf.ts](../../apps/server/src/pdf/contratoPdf.ts)). Ninguna de estas versiones se
publica tal cual: la dueña debe decidir cuál es la correcta antes de redactar los términos
(Numeral 4).

| Tema | Página de inicio | Cotización (PDF) | Contrato (PDF) |
|---|---|---|---|
| Nombre | «Planet Producciones» | «Planet Producciones» ([360](../../apps/web/src/main.ts#L360)) | «PLANETT PRODUCCIONES S.A.S», con doble T ([53](../../apps/server/src/pdf/contratoPdf.ts#L53)) |
| Pago del total | 8 días antes ([199](../../apps/web/index.html#L199)) | 8 días antes ([377](../../apps/web/src/main.ts#L377)) | 1 día antes ([115](../../apps/server/src/pdf/contratoPdf.ts#L115)) |
| Reserva de la fecha | 30% dentro de los 30 días siguientes a la cotización ([181](../../apps/web/index.html#L181)) | 30% y máximo 30 días ([375-376](../../apps/web/src/main.ts#L375-L376)) | Habla de «anticipos» y de un «porcentaje requerido como reserva», sin cifra ([154](../../apps/server/src/pdf/contratoPdf.ts#L154)) |
| Cancelación | — | — | Sin reembolso si se cancela con menos de 8 días ([141](../../apps/server/src/pdf/contratoPdf.ts#L141)); aviso escrito con mínimo 30 días ([155](../../apps/server/src/pdf/contratoPdf.ts#L155)) |
| Personal técnico | «Técnico DMX dedicado» ([208](../../apps/web/index.html#L208)) | «Técnico DMX dedicado» ([362](../../apps/web/src/main.ts#L362)) | Mínimo un técnico de sonido y uno de iluminación ([120](../../apps/server/src/pdf/contratoPdf.ts#L120)) |
| Equipos | «Equipos propios» ([88](../../apps/web/index.html#L88), [190](../../apps/web/index.html#L190), [284](../../apps/web/index.html#L284)) | — | Puede suplirse con un «proveedor colega» ([151](../../apps/server/src/pdf/contratoPdf.ts#L151)) |

Actualización del 17 de octubre de 2026, con el certificado de la Cámara de Comercio y un
contrato firmado (julio de 2026):

- **Nombre:** el certificado confirma «PLANETT PRODUCCIONES S.A.S.», con doble T, como razón
  social. «Planet Producciones» es el nombre que se usa hacia el público.
- **Contrato:** el contrato firmado coincide con la plantilla del sistema en el pago (1 día
  antes), la cancelación (aviso escrito con 30 días y sin devolución con menos de 8), el recargo
  del 20 % si la empresa incumple, el «proveedor colega» y el personal mínimo. Por eso los
  términos resumen el contrato (sección 6).
- **Sigue pendiente:** la cotización en PDF dice que el total se paga 8 días antes y que la
  reserva es del 30 %, lo que choca con el contrato. «Equipos propios» y «técnico dedicado»
  siguen sin respaldo en el contrato. La dueña decide y se corrige la cotización, fuera de este
  sitio.

## 5. Fuera de este inventario

Las páginas internas (paneles, inicio de sesión y cotizador) no forman parte de la versión
institucional y no se revisaron.
