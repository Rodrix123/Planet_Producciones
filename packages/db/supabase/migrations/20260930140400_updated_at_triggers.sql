-- Triggers de updated_at - Planet Producciones
-- Única función automática de este archivo: mantener la columna updated_at
-- de cada fila sincronizada con la hora real de su último UPDATE. Sin esto,
-- updated_at solo se llenaría bien en el INSERT (por su DEFAULT NOW()) y
-- quedaría congelada en cualquier edición posterior.
--
-- Solo llevan este trigger las tablas que tienen columna updated_at:
-- components, inventory_variants, stock, quote, events. Tablas como
-- transactions o dispatch_audit no tienen updated_at a propósito (son
-- de solo lectura/insert una vez creadas, ver rls_policies.sql), así que
-- no aplica.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.components
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.inventory_variants
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.stock
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.quote
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.set_updated_at_event_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    Update public.quote set updated_at = NOW() where id = NEW.quote_id;
    Update public.events set updated_at = NOW() where id = NEW.event_id;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_updated_at
    BEFORE UPDATE ON public.quote_items
        FOR EACH ROW 
        EXECUTE FUNCTION public.set_updated_at_event_quote();


-- Igual que set_updated_at, pero para el INSERT: created_at tiene
-- DEFAULT NOW(), pero ese default solo se usa si la columna se omite
-- del INSERT. Si alguien la manda explícita (a propósito o por error),
-- este trigger la pisa siempre con la hora real del servidor, para que
-- created_at no se pueda falsificar desde el cliente.
CREATE OR REPLACE FUNCTION public.set_created_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.created_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER set_created_at
    BEFORE INSERT ON public.components
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();

CREATE OR REPLACE TRIGGER set_created_at
    BEFORE INSERT ON public.inventory_variants
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();

CREATE OR REPLACE TRIGGER set_created_at
    BEFORE INSERT ON public.stock
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();

CREATE OR REPLACE TRIGGER set_created_at
    BEFORE INSERT ON public.quote
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();

CREATE OR REPLACE TRIGGER set_created_at
    BEFORE INSERT ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();

CREATE OR REPLACE TRIGGER set_created_at
    BEFORE INSERT ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_created_at();


-- Cuando entra un pago (transactions), suma su monto al total_paid del
-- evento y, si con eso ya se alcanzó el % mínimo del total cotizado
-- (configurable en public.config, clave 'factor_minimo_pago_inicial'),
-- marca events.initial_payment = TRUE. El UPDATE ... RETURNING deja el
-- incremento y la lectura del nuevo acumulado como una sola operación
-- atómica, para que dos pagos simultáneos no se pisen leyendo el mismo
-- total_paid viejo.
CREATE OR REPLACE FUNCTION public.update_initial_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    minimum_initial_payment_factor NUMERIC(3, 2);
    quote_total                    NUMERIC(10, 2);
    new_total_paid                 NUMERIC(10, 2);
BEGIN
    UPDATE public.events
    SET total_paid = total_paid + NEW.amount
    WHERE id = NEW.event_id
    RETURNING total_paid INTO new_total_paid;

    SELECT q.total INTO quote_total
    FROM public.events e
    JOIN public.quote q ON q.id = e.quote_id
    WHERE e.id = NEW.event_id;

    SELECT value::NUMERIC(3, 2) INTO minimum_initial_payment_factor
    FROM public.config
    WHERE key = 'factor_minimo_pago_inicial';

    IF new_total_paid >= quote_total * minimum_initial_payment_factor THEN
        UPDATE public.events SET initial_payment = TRUE WHERE id = NEW.event_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER update_initial_payment
    AFTER INSERT ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_initial_payment();


create OR REPLACE FUNCTION public.update_total_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    new_total NUMERIC(10, 2);
    quantity INTEGER;
    price NUMERIC(10, 2);
    quote_id BIGINT;
BEGIN
    if (TG_OP = 'INSERT') or (TG_OP = 'UPDATE') THEN
      quantity := NEW.quantity;
      price := (SELECT price FROM public.inventory_variants WHERE id = NEW.variant_id);
      quote_id := NEW.quote_id;
    else 
      quantity := -OLD.quantity;
      price := (SELECT price FROM public.inventory_variants WHERE id = OLD.variant_id);
      quote_id := OLD.quote_id;
    end if;

    update public.quote 
    SET total = total + (quantity * price)
    WHERE id = quote_id;
   RETURN NEW;
end;$$;

Create OR REPLACE trigger update_total_quote
    AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_total_quote();


create OR REPLACE FUNCTION public.max_date_validation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    max_date_separation inTEGER;
    max_date_allowed DATE;

BEGIN
    SELECT value::INTEGER INTO max_date_separation
    FROM public.config
    WHERE key = 'fecha_maxima_separacion_evento';
    max_date_allowed := CURRENT_DATE + max_date_separation; 
    IF NEW.date > max_date_allowed THEN
        RAISE EXCEPTION 'La fecha del evento no puede ser mayor a % días a partir de hoy. (Maximo debe de ser el %)', max_date_separation, max_date_allowed;
    END IF;
    RETURN NEW;
end; 
$$ ;



create or replace trigger max_date_validation
    BEFORE INSERT ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION public.max_date_validation();


CREATE EXTENSION IF NOT EXISTS pg_cron;


SELECT cron.schedule(
  'day_verification',
  '1 0 * * *',
  $$ SELECT public.event_quote_verification(); $$
);

create or replace function public.event_quote_verification()
RETURNS void
LANGUAGE plpgsql
AS $$
declare
    max_date_separation INTEGER;
BEGIN
    select value::INTEGER INTO max_date_separation
    from public.config
    where key = 'fecha_maxima_separacion_evento';

    DELETE FROM public.events 
    WHERE CURRENT_DATE - date > max_date_separation
    AND (confirmed = false OR total_paid < (SELECT sum(total) FROM public.quote WHERE id = quote_id));

    ---completar segun las direcciones de la administradora
END;
$$;


