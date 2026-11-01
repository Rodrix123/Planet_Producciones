-- Revierte 20261101120000_datos_del_cliente_en_cotizacion.sql
-- Quita las columnas con los datos del cliente propios de cada cotización. Después de esto el
-- panel vuelve a leer el nombre/teléfono/documento de public.users (y el problema de
-- sobrescritura por correo regresa).
ALTER TABLE public.quote
    DROP COLUMN IF EXISTS cliente_nombre,
    DROP COLUMN IF EXISTS cliente_telefono,
    DROP COLUMN IF EXISTS cliente_documento;

NOTIFY pgrst, 'reload schema';
