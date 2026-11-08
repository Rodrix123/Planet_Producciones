-- Elementos adicionales (externos) de una cotización - Planet Producciones
--
-- Tarea: "Mejorar lógica de elementos adicionales".
-- Como administradora quiero incluir en la propia cotización elementos que no están en la bodega
-- y hay que alquilar o conseguir aparte, sin registrarlos como stock.
--
-- Antes: el "ítem manual" creaba un tipo, una variante y un precio REALES en el inventario (con
-- visible_publico = false). Aparecía en el menú de Inventario como un elemento sin unidades, se
-- creaba aunque no se guardara la cotización y no se distinguía de lo que sale de la bodega.
--
-- Ahora: cada elemento adicional es una fila de esta tabla, propia de UNA cotización. No toca
-- inventory, inventory_variants ni stock. Guarda lo que se le cobra al cliente (cantidad y precio
-- por unidad) y, solo para la administradora, el proveedor y lo que cuesta conseguirlo.
--
-- El total de la cotización lo mantiene un trigger propio (update_total_quote_extra), igual que
-- update_total_quote lo hace con quote_items. No se modifica ninguna tabla ni función existente.
--
-- Es idempotente: se puede ejecutar más de una vez.
-- Para volver atrás: respaldos/20261107120000_elementos_adicionales_en_cotizacion.revertir.sql

CREATE TABLE IF NOT EXISTS public.quote_extra_items (
    id            BIGSERIAL      PRIMARY KEY,
    quote_id      BIGINT         NOT NULL REFERENCES public.quote (id) ON DELETE CASCADE,
    tag           VARCHAR(100)   NOT NULL DEFAULT 'ELEMENTO ADICIONAL',
    name          VARCHAR(150)   NOT NULL,
    description   TEXT,
    quantity      INT            NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    supplier      VARCHAR(150),
    supplier_cost NUMERIC(10, 2) CHECK (supplier_cost >= 0),
    nota          TEXT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_extra_items_quote_id_idx ON public.quote_extra_items (quote_id);

COMMENT ON TABLE  public.quote_extra_items               IS 'Elementos que no salen de la bodega (se alquilan o se consiguen aparte) incluidos en una cotización.';
COMMENT ON COLUMN public.quote_extra_items.unit_price    IS 'Precio por unidad que se le cobra al cliente (suma al total de la cotización).';
COMMENT ON COLUMN public.quote_extra_items.supplier      IS 'Quién lo alquila o lo vende. Solo lo ve la administradora; no sale en el PDF del cliente.';
COMMENT ON COLUMN public.quote_extra_items.supplier_cost IS 'Costo por unidad que cobra el proveedor. Solo lo ve la administradora.';

-- Total de la cotización: suma lo que se cobra por cada elemento adicional al insertarlo, resta al
-- borrarlo y ajusta la diferencia al editarlo.
CREATE OR REPLACE FUNCTION public.update_total_quote_extra() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_delta NUMERIC(10, 2);
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.quote SET total = total + (NEW.quantity * NEW.unit_price) WHERE id = NEW.quote_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.quote SET total = total - (OLD.quantity * OLD.unit_price) WHERE id = OLD.quote_id;
        RETURN OLD;
    END IF;

    -- UPDATE: la cotización no cambia de dueño (quote_id), solo cantidad o precio.
    v_delta := (NEW.quantity * NEW.unit_price) - (OLD.quantity * OLD.unit_price);
    UPDATE public.quote SET total = total + v_delta WHERE id = NEW.quote_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_total_quote_extra ON public.quote_extra_items;
CREATE TRIGGER update_total_quote_extra
    AFTER INSERT OR DELETE OR UPDATE ON public.quote_extra_items
    FOR EACH ROW EXECUTE FUNCTION public.update_total_quote_extra();

-- Acceso: igual que quote_items, pero sin acceso público (anon): el costo del proveedor es interno.
-- El servidor usa el rol de servicio (ignora RLS); estas reglas protegen el acceso directo por la API de Supabase.
ALTER TABLE public.quote_extra_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_extra_items_dev_all" ON public.quote_extra_items;
CREATE POLICY "quote_extra_items_dev_all" ON public.quote_extra_items
    FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
DROP POLICY IF EXISTS "quote_extra_items_admin_all" ON public.quote_extra_items;
CREATE POLICY "quote_extra_items_admin_all" ON public.quote_extra_items
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
