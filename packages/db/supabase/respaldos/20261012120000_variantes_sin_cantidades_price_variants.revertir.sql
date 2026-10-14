-- REVERSA de la migración 20261012120000_variantes_sin_cantidades_price_variants.sql
-- Respaldo generado el 2026-10-12 con las 12 variantes tal cual estaban antes de borrarlas
-- (mismos id, textos, precio y fechas). Ejecutar SOLO si quieres volver atrás: renombra
-- price_variants de nuevo a price, restaura el trigger update_total_quote y reinserta las filas.
-- Las 12 variantes no tenían cotizaciones, unidades físicas ni paquetes, así que no hay
-- datos dependientes que restaurar.

BEGIN;

ALTER TABLE public.inventory_variants
    RENAME CONSTRAINT inventory_variants_price_variants_check TO inventory_variants_price_check;
ALTER TABLE public.inventory_variants RENAME COLUMN price_variants TO price;

CREATE OR REPLACE FUNCTION public.update_total_quote()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    new_total NUMERIC(10, 2);
    v_quantity INTEGER;
    v_price NUMERIC(10, 2);
    v_quote_id BIGINT;
BEGIN
    if (TG_OP = 'INSERT') or (TG_OP = 'UPDATE') THEN
      v_quantity := NEW.quantity;
      v_price := (SELECT price FROM public.inventory_variants WHERE id = NEW.variant_id);
      v_quote_id := NEW.quote_id;
    else
      v_quantity := -OLD.quantity;
      v_price := (SELECT price FROM public.inventory_variants WHERE id = OLD.variant_id);
      v_quote_id := OLD.quote_id;
    end if;

    update public.quote
    SET total = total + (v_quantity * v_price)
    WHERE id = v_quote_id;
   RETURN NEW;
end;
$function$;

INSERT INTO public.inventory_variants
    (id, inventory_id, simple_description, detailed_description, price, image_url, created_at, updated_at)
VALUES
    (203, 94, '2 Unidades Pioneer CDJ 2000 Nexus 2 - Mixer Pioneer DJM 900 Nexus 2', NULL, 800000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (205, 94, '3 Unidades Pioneer CDJ 3000 - Mixer DJM A9', NULL, 1700000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (226, 96, '16 Par led (reflectores)', NULL, 1040000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (228, 96, 'Inalambricos - 8 Par led (reflectores)', NULL, 600000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (229, 81, 'Line Array 8 Cajas RCF HDL20-A', NULL, 3700000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (237, 96, 'Inalambricos - 12 Par led (reflectores)', NULL, 900000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (246, 81, 'Line Array 6 Cajas RCF HDL20-A', NULL, 3200000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (248, 96, '12 Par led (reflectores)', NULL, 780000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (270, 81, 'Line Array 4 Cajas RCF HDL20-A', NULL, 2700000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (276, 96, '20 Par led (reflectores)', NULL, 1300000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (286, 96, '8 Par led (reflectores)', NULL, 520000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00'),
    (290, 94, '2 Unidades Pioneer CDJ 3000 - Mixer DJM A9', NULL, 1200000.00, NULL, '2026-10-11 16:41:29.725157+00', '2026-10-11 16:41:29.725157+00');

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261012120000';

NOTIFY pgrst, 'reload schema';

COMMIT;
