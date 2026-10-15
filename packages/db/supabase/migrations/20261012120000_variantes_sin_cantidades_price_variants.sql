-- Variantes sin versiones por cantidad + precio en price_variants - Planet Producciones
--
-- 1) Elimina las 12 variantes que solo cambian por la CANTIDAD de piezas del mismo
--    elemento (la cantidad se pone al cotizar, en quote_items.quantity):
--      Par led de Ambientación: 8, 12, 16 y 20 (normales) y 8 y 12 (inalámbricos)
--      Unidades Pioneer CDJ y Mixer: 2 CDJ 2000, 2 CDJ 3000 y 3 CDJ 3000
--      Sonido Principal: Line Array de 4, 6 y 8 cajas
--    Las variantes que cambian por tamaño o medida (tarima, pista, pantalla, truss,
--    carpa, bola de espejos) NO se tocan.
-- 2) Renombra inventory_variants.price a price_variants (conserva todos los precios).
-- 3) update_total_quote (trigger de quote_items) lee la columna nueva; sin esto el
--    total de las cotizaciones dejaría de calcularse.
-- 4) Pide a PostgREST recargar el esquema para que la API vea la columna nueva.
--
-- Para volver atrás: respaldos/20261012120000_variantes_sin_cantidades_price_variants.revertir.sql
-- (renombra la columna de vuelta, restaura el trigger y vuelve a insertar las 12 filas).

-- Borrar una variante arrastra en cascada stock, quote_items, package_items y
-- unavailability_inventory. Si alguna de estas 12 ya los tiene, no se borra nada.
DO $$
DECLARE
    ids CONSTANT BIGINT[] := ARRAY[203, 205, 226, 228, 229, 237, 246, 248, 270, 276, 286, 290];
BEGIN
    IF EXISTS (SELECT 1 FROM public.quote_items WHERE variant_id = ANY (ids))
       OR EXISTS (SELECT 1 FROM public.stock WHERE id_inventory_variant = ANY (ids))
       OR EXISTS (SELECT 1 FROM public.package_items WHERE variant_id = ANY (ids))
       OR EXISTS (SELECT 1 FROM public.unavailability_inventory WHERE id_inventory_variant = ANY (ids)) THEN
        RAISE EXCEPTION 'Alguna de las variantes por cantidad ya tiene cotizaciones, unidades, paquetes o indisponibilidad: no se elimina nada.';
    END IF;
END $$;

DO $$
DECLARE
    borradas INTEGER;
BEGIN
    DELETE FROM public.inventory_variants
    WHERE id IN (203, 205, 226, 228, 229, 237, 246, 248, 270, 276, 286, 290);
    GET DIAGNOSTICS borradas = ROW_COUNT;
    IF borradas <> 12 THEN
        RAISE EXCEPTION 'Se esperaba eliminar 12 variantes y se eliminaron %: no se aplica la migración.', borradas;
    END IF;
END $$;

ALTER TABLE public.inventory_variants RENAME COLUMN price TO price_variants;
ALTER TABLE public.inventory_variants
    RENAME CONSTRAINT inventory_variants_price_check TO inventory_variants_price_variants_check;

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
      v_price := (SELECT price_variants FROM public.inventory_variants WHERE id = NEW.variant_id);
      v_quote_id := NEW.quote_id;
    else
      v_quantity := -OLD.quantity;
      v_price := (SELECT price_variants FROM public.inventory_variants WHERE id = OLD.variant_id);
      v_quote_id := OLD.quote_id;
    end if;

    update public.quote
    SET total = total + (v_quantity * v_price)
    WHERE id = v_quote_id;
   RETURN NEW;
end;
$function$;

NOTIFY pgrst, 'reload schema';
