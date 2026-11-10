-- Datos del cliente propios de cada cotización - Planet Producciones
--
-- Problema: la cotización no guardaba el nombre, teléfono ni documento de quien la pidió; los
-- leía de public.users, donde el cliente se identifica solo por su correo (UNIQUE). Al guardar
-- una cotización nueva con un correo que ya existía, el servidor sobrescribía el nombre y el
-- teléfono de ese cliente, y TODAS sus cotizaciones anteriores pasaban a mostrar los datos de la
-- última persona (p. ej. dos personas distintas que cotizan con el mismo correo).
--
-- Solución: cada cotización conserva los datos que se dieron EN ESE MOMENTO. public.users sigue
-- identificando al cliente por correo (client_id no cambia), pero el nombre, teléfono y documento
-- que se muestran en el panel, el contrato y los correos salen de la cotización.
--
-- 1) Tres columnas opcionales en public.quote (no afectan a nada existente).
-- 2) A las cotizaciones que ya existen se les copian los datos que hoy tiene su cliente, para que
--    no queden vacías (los nombres originales de las cotizaciones que ya fueron sobrescritas no
--    se pueden recuperar: se corrigen a mano desde el panel).
--
-- Es idempotente: se puede ejecutar más de una vez.
-- Para volver atrás: respaldos/20261101120000_datos_del_cliente_en_cotizacion.revertir.sql

ALTER TABLE public.quote
    ADD COLUMN IF NOT EXISTS cliente_nombre    VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cliente_telefono  VARCHAR(30),
    ADD COLUMN IF NOT EXISTS cliente_documento TEXT;

COMMENT ON COLUMN public.quote.cliente_nombre    IS 'Nombre que dio quien pidió esta cotización (puede diferir del de otras cotizaciones con el mismo correo).';
COMMENT ON COLUMN public.quote.cliente_telefono  IS 'Teléfono que dio quien pidió esta cotización.';
COMMENT ON COLUMN public.quote.cliente_documento IS 'Documento que dio quien pidió esta cotización.';

UPDATE public.quote q
SET cliente_nombre    = u.name,
    cliente_telefono  = u.phone,
    cliente_documento = u.documento
FROM public.users u
WHERE u.id = q.client_id
  AND q.cliente_nombre IS NULL
  AND q.cliente_telefono IS NULL
  AND q.cliente_documento IS NULL;

NOTIFY pgrst, 'reload schema';
