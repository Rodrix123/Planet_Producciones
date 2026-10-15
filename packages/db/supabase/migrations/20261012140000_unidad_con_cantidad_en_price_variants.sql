-- Elementos con varias unidades: nombre de la unidad + cantidad en "PriceVariants" - Planet Producciones
--
-- Cuatro elementos traían la cantidad dentro del nombre ("2 Lanzas Llamas"). Pasan a llamarse
-- por la unidad y la cantidad se guarda junto al precio en "PriceVariants.quantity"
-- (el precio es el de esa cantidad, el mismo que ya tenían):
--
--   inv  antes                                                       después                                                      cantidad  precio
--   107  2 Lanzas Llamas                                             Lanza Llamas                                                 2         700000
--   85   2 Criojets de CO2                                           Criojet de CO2                                               2         1000000
--   98   2 Plantas Eléctricas - Backup                               Planta Eléctrica - Backup                                    2         800000
--   106  20 Spot Inalambrico para iluminar mesas principales, ...    Spot Inalambrico para iluminar mesas principales, ...        20        1300000
--
-- Se cambia el nombre del elemento (inventory.name) y el de su única variante
-- (inventory_variants.simple_description). Los precios no cambian: solo la cantidad de su fila.
-- No se tocan los nombres con medidas, duraciones, tiros o capacidad (Tarima, Pista, Carpa,
-- Bola de Espejos, Kabuqui, Ventury, Sala Lounge) ni "1 Motor para Bola de Espejos" (1 unidad).
--
-- Para volver atrás: respaldos/20261012140000_unidad_con_cantidad_en_price_variants.revertir.sql

DO $$
DECLARE
    filas INTEGER;
BEGIN
    -- Guarda: el estado actual debe ser exactamente el esperado (nombres antiguos y una sola
    -- fila de precio con cantidad 1 por variante). Si no, no se cambia nada.
    SELECT count(*) INTO filas
    FROM (VALUES
        (107, 209, '2 Lanzas Llamas',                                                              700000),
        (85,  288, '2 Criojets de CO2',                                                            1000000),
        (98,  212, '2 Plantas Eléctricas - Backup',                                                800000),
        (106, 220, '20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas', 1300000)
    ) AS e(inv, var, nombre, precio)
    JOIN public.inventory i ON i.id = e.inv AND i.name = e.nombre
    JOIN public.inventory_variants v ON v.id = e.var AND v.inventory_id = e.inv AND v.simple_description = e.nombre
    JOIN public."PriceVariants" p ON p.id_variant = e.var AND p.quantity = 1 AND p.price = e.precio
    WHERE (SELECT count(*) FROM public."PriceVariants" x WHERE x.id_variant = e.var) = 1;
    IF filas <> 4 THEN
        RAISE EXCEPTION 'Se esperaban 4 elementos con su nombre antiguo y una fila de precio con cantidad 1, y hay %: no se cambia nada.', filas;
    END IF;
END $$;

UPDATE public.inventory SET name = 'Lanza Llamas'                      WHERE id = 107 AND name = '2 Lanzas Llamas';
UPDATE public.inventory SET name = 'Criojet de CO2'                    WHERE id = 85  AND name = '2 Criojets de CO2';
UPDATE public.inventory SET name = 'Planta Eléctrica - Backup'         WHERE id = 98  AND name = '2 Plantas Eléctricas - Backup';
UPDATE public.inventory SET name = 'Spot Inalambrico para iluminar mesas principales, mesas de postres y demas'
    WHERE id = 106 AND name = '20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas';

UPDATE public.inventory_variants SET simple_description = 'Lanza Llamas'              WHERE id = 209 AND simple_description = '2 Lanzas Llamas';
UPDATE public.inventory_variants SET simple_description = 'Criojet de CO2'            WHERE id = 288 AND simple_description = '2 Criojets de CO2';
UPDATE public.inventory_variants SET simple_description = 'Planta Eléctrica - Backup' WHERE id = 212 AND simple_description = '2 Plantas Eléctricas - Backup';
UPDATE public.inventory_variants SET simple_description = 'Spot Inalambrico para iluminar mesas principales, mesas de postres y demas'
    WHERE id = 220 AND simple_description = '20 Spot Inalambrico para iluminar mesas principales, mesas de postres y demas';

UPDATE public."PriceVariants" SET quantity = 2,  updated_at = now() WHERE id_variant = 209 AND quantity = 1;
UPDATE public."PriceVariants" SET quantity = 2,  updated_at = now() WHERE id_variant = 288 AND quantity = 1;
UPDATE public."PriceVariants" SET quantity = 2,  updated_at = now() WHERE id_variant = 212 AND quantity = 1;
UPDATE public."PriceVariants" SET quantity = 20, updated_at = now() WHERE id_variant = 220 AND quantity = 1;

NOTIFY pgrst, 'reload schema';
