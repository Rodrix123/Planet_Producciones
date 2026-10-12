-- REVERSA de la migración 20261012130000_cargar_price_variants.sql
-- Deja "PriceVariants" y las variantes como estaban antes de la carga. Borra solo lo que la
-- migración creó, así que no toca filas de precio que hayas cargado a mano después:
--   * las 5 variantes base (sus tramos por cantidad se borran en cascada), y
--   * las filas quantity = 1 cuyo precio sigue igual al de inventory_variants.price_variants.
-- Si ya cambiaste alguno de esos precios en "PriceVariants", esa fila se conserva.

BEGIN;

DELETE FROM public.inventory_variants
WHERE (inventory_id, simple_description) IN (
    (96, 'Par led (reflectores)'),
    (96, 'Inalambricos - Par led (reflectores)'),
    (94, 'Pioneer CDJ 2000 Nexus 2 - Mixer Pioneer DJM 900 Nexus 2'),
    (94, 'Pioneer CDJ 3000 - Mixer DJM A9'),
    (81, 'Line Array RCF HDL20-A')
);

DELETE FROM public."PriceVariants" p
USING public.inventory_variants v
WHERE p.id_variant = v.id AND p.quantity = 1 AND p.price = v.price_variants;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261012130000';

NOTIFY pgrst, 'reload schema';

COMMIT;
