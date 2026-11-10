-- Revierte 20261107120000_elementos_adicionales_en_cotizacion.sql
-- Borra la tabla de elementos adicionales y su trigger. CUIDADO: si ya hay elementos guardados, su
-- valor sigue dentro de quote.total (nada lo resta al borrar la tabla). Antes de revertir, quita los
-- elementos desde el panel o resta a mano esos valores del total de cada cotización.
DROP TRIGGER IF EXISTS update_total_quote_extra ON public.quote_extra_items;
DROP FUNCTION IF EXISTS public.update_total_quote_extra();
DROP TABLE IF EXISTS public.quote_extra_items;

NOTIFY pgrst, 'reload schema';
