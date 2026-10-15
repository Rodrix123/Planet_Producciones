-- Bug preexistente: la función ya usaba una columna "price" dentro de la misma consulta
-- donde declaraba una variable PL/pgSQL llamada igual ("price"), lo que Postgres rechaza
-- como referencia ambigua. Esto hacía fallar CUALQUIER insert/update/delete en
-- quote_items (bloqueaba por completo guardar cotizaciones). Se renombra la variable.
create or replace function update_total_quote()
returns trigger as $$
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
$$ language plpgsql;
