-- El precio de cada ítem de cotización ya no vive en inventory_variants.price (esa
-- columna fue eliminada y recreada varias veces por trabajo externo a esta rama);
-- ahora vive en la tabla nueva "PriceVariants" (id_variant, quantity, price), que
-- permite que una misma variante tenga varios tramos de cantidad con su propio
-- precio TOTAL para ese tramo (ej. "Par led x8" = $600.000, "x12" = $900.000),
-- en vez de un único precio por unidad.
--
-- Esta función reemplaza a la de la migración 0007: si existe un tramo exacto para
-- (variante, cantidad), ese precio YA es el total del tramo (no se multiplica de
-- nuevo por la cantidad). Si no hay un tramo exacto para esa cantidad (ej. cantidades
-- libres como sillas o mesas), se usa el tramo base (quantity = 1) como precio por
-- unidad, multiplicado por la cantidad real — el mismo comportamiento de siempre.
create or replace function update_total_quote()
returns trigger as $$
DECLARE
    v_quantity INTEGER;
    v_variant_id BIGINT;
    v_quote_id BIGINT;
    v_sign INTEGER;
    v_precio_tramo_exacto NUMERIC(10, 2);
    v_precio_base NUMERIC(10, 2);
    v_delta NUMERIC(10, 2);
BEGIN
    if (TG_OP = 'INSERT') or (TG_OP = 'UPDATE') THEN
      v_quantity := NEW.quantity;
      v_variant_id := NEW.variant_id;
      v_quote_id := NEW.quote_id;
      v_sign := 1;
    else
      v_quantity := OLD.quantity;
      v_variant_id := OLD.variant_id;
      v_quote_id := OLD.quote_id;
      v_sign := -1;
    end if;

    select price into v_precio_tramo_exacto
      from public."PriceVariants"
      where id_variant = v_variant_id and quantity = v_quantity;

    if v_precio_tramo_exacto is not null then
        v_delta := v_precio_tramo_exacto;
    else
        select price into v_precio_base
          from public."PriceVariants"
          where id_variant = v_variant_id and quantity = 1;
        v_delta := coalesce(v_precio_base, 0) * v_quantity;
    end if;

    update public.quote
    SET total = total + (v_sign * v_delta)
    WHERE id = v_quote_id;
   RETURN NEW;
end;
$$ language plpgsql;
