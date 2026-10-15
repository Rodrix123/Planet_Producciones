# Inventario de datos personales del sistema

Lo que muestra el código sobre los datos personales que trata Planet Producciones. Se revisó
el 15 de octubre de 2026 en la rama `feature/web-institucional-meta`. Es la base de la
política de privacidad ([privacidad.html](../../apps/web/institucional/privacidad.html)): si
el sistema cambia, hay que actualizar este inventario y la política.

El código no muestra lo que se hace fuera del sistema: WhatsApp en el celular, hojas de
cálculo, papel, Google Drive. Eso lo confirma la dueña (preguntas 30 a 38 de la
[solicitud](solicitud-a-la-duena.md)).

## Datos por grupo

| Grupo | Datos | De dónde salen | Dónde quedan | Estado |
|---|---|---|---|---|
| Clientes que cotizan | Nombre, correo, teléfono o WhatsApp, documento (opcional), tipo de evento, ciudad, lugar o dirección, fecha, servicios y valores | Cotizador ([cotizador.html](../../apps/web/cotizador.html)) y panel de cotizaciones | Base de datos en Supabase; correo de aviso a gerencia | Activo en el aplicativo. La web institucional no lo publica |
| Clientes con contrato | Nombre, cédula, datos del evento y valor; PDF del contrato y copia firmada | Panel de contratos ([contratos.routes.ts](../../apps/server/src/routes/contratos.routes.ts)) | Supabase; la copia firmada en el disco del servidor (`apps/server/uploads/contratos-firmados`); correo al cliente con copia a la administradora | Activo en el aplicativo |
| PQRS | Nombre, correo, teléfono (opcional), mensaje y respuesta | Formulario de la landing del aplicativo ([index.html](../../apps/web/index.html)) | Supabase (tabla `pqrs`); correo de aviso a secretaría | Activo en el aplicativo. La web institucional no lo publica |
| Cuentas del sistema interno | Nombre, correo, cargo y contraseña (la gestiona Supabase Auth) | Panel de cuentas de acceso | Supabase Auth y tabla `profiles`; el nombre también queda en el historial de cotizaciones | Activo |
| Trabajadores | Nombre, cédula, teléfono, correo, cargo, cuenta bancaria o llave de pago, días no disponibles | Panel de empleados ([empleados.ts](../../packages/db/src/empleados.ts)) | Supabase (`auth.users`, `profiles`, `unavailability_users`). Una tabla anterior, `empleados`, también tiene salario, banco y número de cuenta | Activo. De las incapacidades solo se guardan fechas, sin motivo ni diagnóstico |
| Convocatorias por WhatsApp | Nombre del trabajador, teléfono, estado del envío por Meta, respuesta (confirmado o rechazado) y mensajes entrantes | Modelo de datos ([0010_disponibilidad_personal_whatsapp.sql](../../supabase/migrations/0010_disponibilidad_personal_whatsapp.sql)) | Supabase, cuando se aplique la migración | En desarrollo. En esta rama no hay rutas, integración con n8n ni envío real por WhatsApp |
| Visitantes de la web institucional | Datos técnicos de la conexión, como la IP, que procesa el hosting | Cloudflare Pages (Numerales 6 y 7) | Cloudflare | Cuando se publique. El sitio no tiene formularios, cookies propias ni analítica |

## Proveedores que intervienen (dato G5)

| Proveedor | Para qué | Evidencia | Estado |
|---|---|---|---|
| Supabase | Base de datos y autenticación del sistema interno | `apps/server/.env.example` (`DATABASE_URL`, `SUPABASE_URL`), `apps/server/src/supabaseAdmin.ts` | Activo |
| Google (Gmail) | Correos de cotizaciones, PQRS y contratos | `apps/server/.env.example` (`EMAIL_SERVICE=gmail`), `apps/server/src/mailer.ts` | Activo según la configuración de ejemplo. El equipo confirma el proveedor real |
| Cloudflare | Hosting de la web institucional y entrega de Font Awesome (cdnjs) | Numerales 6 y 7; [cabeza.html](../../apps/web/institucional/parciales/cabeza.html) | cdnjs ya se usa; el hosting, al publicar |
| jsDelivr | SweetAlert2 en el aplicativo | `apps/web/index.html` del aplicativo | Solo en el aplicativo |
| Meta (WhatsApp Business Platform) | Enviar y recibir convocatorias | Migración 0010 | En desarrollo, no activo |
| n8n | Automatizar ese envío | Rama `feature/disponibilidad-personal-whatsapp` | En desarrollo, no activo. Falta saber si es n8n en la nube o instalado por el equipo |
| Google Gemini | Inteligencia artificial | No aparece en el código | No activo |

## Lo que debe estar resuelto antes de publicar la política

La política promete cosas que hoy no se cumplen del todo. Corregirlas no es parte de la web
institucional, pero sí condición para publicarla:

1. **Datos personales en el repositorio público.** La plantilla del contrato
   (`apps/server/src/pdf/contratoPdf.ts`) incluye la cédula de la representante legal; la firma
   escaneada está en `apps/server/assets/`; `apps/server/src/scripts/seed-usuarios.ts` tiene
   nombres y correos del personal. La sección de seguridad no sería cierta mientras sigan
   publicados (Numeral 5).
2. **Autorización.** El cotizador, el formulario de PQRS y el contrato no tienen texto de
   autorización ni enlace a la política, y la política dice que la autorización se pide.
3. **WhatsApp.** Antes de activar las convocatorias hay que registrar que cada trabajador
   aceptó recibir esos mensajes.
4. **Clave inicial.** Todo empleado nuevo recibe la misma clave inicial y el sistema marca que
   debe cambiarla. Hay que confirmar que el cambio sea obligatorio antes de usar el sistema
   (Numeral 5).
5. **Minimización.** La tabla anterior `empleados` guarda salario, banco y número de cuenta:
   si ya no se usa, conviene retirar esos datos.
