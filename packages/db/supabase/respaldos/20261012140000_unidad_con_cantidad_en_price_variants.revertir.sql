-- REVERSA de la migración 20261012140000_unidad_con_cantidad_en_price_variants.sql
-- Devuelve los cuatro elementos a su nombre anterior (con la cantidad dentro del nombre) y
-- pone de nuevo cantidad 1 en su fila de "PriceVariants". Los precios no se tocan.

BEGIN;

UPDATE public.inventory SET name = '2 Lanzas Llamas'                      WHERE id = 107 AND name = 'Lanza Llamas';
UPDATE public.inventory SET name = '2 Criojets de CO2'                    WHERE id = 85  AND name = 'Criojet de CO2';
UPDATE public.inventory SET name = '2 Plantas Eléctricas - Backup'        WHERE id = 98  AND name = 'Planta Eléctrica - Backup';
UPDATE public.inventory SET name = '20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas'
    WHERE id = 106 AND name = 'Spot Inalambrico para iluminar mesas principales, mesas de postres y demas';

UPDATE public.inventory_variants SET simple_description = '2 Lanzas Llamas'                      WHERE id = 209 AND simple_description = 'Lanza Llamas';
UPDATE public.inventory_variants SET simple_description = '2 Criojets de CO2'                    WHERE id = 288 AND simple_description = 'Criojet de CO2';
UPDATE public.inventory_variants SET simple_description = '2 Plantas Eléctricas - Backup'        WHERE id = 212 AND simple_description = 'Planta Eléctrica - Backup';
UPDATE public.inventory_variants SET simple_description = '20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas'
    WHERE id = 220 AND simple_description = 'Spot Inalambrico para iluminar mesas principales, mesas de postres y demas';

UPDATE public."PriceVariants" SET quantity = 1, updated_at = now() WHERE id_variant IN (209, 288, 212) AND quantity = 2;
UPDATE public."PriceVariants" SET quantity = 1, updated_at = now() WHERE id_variant = 220 AND quantity = 20;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261012140000';

NOTIFY pgrst, 'reload schema';

COMMIT;
