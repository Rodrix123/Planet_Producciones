-- Carga de precios en "PriceVariants" - Planet Producciones
--
-- "PriceVariants" (id, id_variant, quantity, price, updated_at) guarda el precio de una
-- variante según la cantidad. Esta migración la llena a partir de los precios que hoy
-- viven en inventory_variants.price_variants (la tabla debe existir y estar vacía de
-- estas filas: es idempotente, no duplica pares variante + cantidad ni toca variantes que
-- ya tengan algún precio cargado):
--
-- 1) Variantes base de los 3 elementos cuyas versiones por cantidad se eliminaron en la
--    migración 20261012120000 (sin ellas, esos precios no tendrían a qué variante colgarse):
--      Par led de Ambientación -> "Par led (reflectores)" e "Inalambricos - Par led (reflectores)"
--      Unidades Pioneer CDJ y Mixer -> las dos referencias CDJ + Mixer
--      Sonido Principal -> "Line Array RCF HDL20-A"
--    Su price_variants (columna heredada) queda en el precio del tramo más barato.
-- 2) Una fila quantity = 1 por cada variante que ya existía, con su precio actual.
-- 3) Los tramos por cantidad de las variantes base, con los precios de las versiones eliminadas
--    (respaldadas en respaldos/20261012120000_...revertir.sql).
--
-- Resultado esperado: 94 filas = los 94 precios originales antes de eliminar versiones.
-- Para volver atrás: respaldos/20261012130000_cargar_price_variants.revertir.sql

-- 2) Una fila por cada variante existente que aún no tenga ningún precio en "PriceVariants"
--    (se hace antes de crear las variantes base, que reciben sus propios tramos).
INSERT INTO public."PriceVariants" (id_variant, quantity, price)
SELECT v.id, 1, v.price_variants
FROM public.inventory_variants v
WHERE NOT EXISTS (
    SELECT 1 FROM public."PriceVariants" p WHERE p.id_variant = v.id
);

-- 1) Variantes base (el elemento se busca por id Y nombre: si no coincide, no se crea nada).
DO $$
DECLARE
    creadas INTEGER;
BEGIN
    INSERT INTO public.inventory_variants (inventory_id, simple_description, price_variants)
    SELECT i.id, v.nombre, v.desde
    FROM (VALUES
        (96, 'Par led de Ambientación',      'Par led (reflectores)',                                               520000),
        (96, 'Par led de Ambientación',      'Inalambricos - Par led (reflectores)',                                600000),
        (94, 'Unidades Pioneer CDJ y Mixer', 'Pioneer CDJ 2000 Nexus 2 - Mixer Pioneer DJM 900 Nexus 2',           800000),
        (94, 'Unidades Pioneer CDJ y Mixer', 'Pioneer CDJ 3000 - Mixer DJM A9',                                    1200000),
        (81, 'Sonido Principal',             'Line Array RCF HDL20-A',                                              2700000)
    ) AS v(inventario_id, elemento, nombre, desde)
    JOIN public.inventory i ON i.id = v.inventario_id AND i.name = v.elemento
    WHERE NOT EXISTS (
        SELECT 1 FROM public.inventory_variants x
        WHERE x.inventory_id = i.id AND x.simple_description = v.nombre
    );
    GET DIAGNOSTICS creadas = ROW_COUNT;
    IF creadas NOT IN (0, 5) THEN
        RAISE EXCEPTION 'Se esperaba crear 5 variantes base (o 0 si ya existen) y se crearon %: no se aplica la migración.', creadas;
    END IF;
END $$;

-- 3) Tramos por cantidad de las variantes base.
INSERT INTO public."PriceVariants" (id_variant, quantity, price)
SELECT x.id, t.cantidad, t.precio
FROM (VALUES
    (96, 'Par led (reflectores)',                                      8,  520000),
    (96, 'Par led (reflectores)',                                      12, 780000),
    (96, 'Par led (reflectores)',                                      16, 1040000),
    (96, 'Par led (reflectores)',                                      20, 1300000),
    (96, 'Inalambricos - Par led (reflectores)',                       8,  600000),
    (96, 'Inalambricos - Par led (reflectores)',                       12, 900000),
    (94, 'Pioneer CDJ 2000 Nexus 2 - Mixer Pioneer DJM 900 Nexus 2',   2,  800000),
    (94, 'Pioneer CDJ 3000 - Mixer DJM A9',                            2,  1200000),
    (94, 'Pioneer CDJ 3000 - Mixer DJM A9',                            3,  1700000),
    (81, 'Line Array RCF HDL20-A',                                     4,  2700000),
    (81, 'Line Array RCF HDL20-A',                                     6,  3200000),
    (81, 'Line Array RCF HDL20-A',                                     8,  3700000)
) AS t(inventario_id, nombre, cantidad, precio)
JOIN public.inventory_variants x ON x.inventory_id = t.inventario_id AND x.simple_description = t.nombre
WHERE NOT EXISTS (
    SELECT 1 FROM public."PriceVariants" p WHERE p.id_variant = x.id AND p.quantity = t.cantidad
);

NOTIFY pgrst, 'reload schema';
