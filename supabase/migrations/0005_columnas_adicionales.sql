-- Ajustes menores detectados al conectar las rutas sobre el esquema real.

-- Nota interna por línea de cotización (Maritza). quote_items no tenía dónde guardarla.
alter table quote_items add column if not exists nota text;

-- Ítems "manuales" que Maritza agrega desde el panel (no vienen del cotizador público):
-- se guardan como inventory/inventory_variants reales (no se inventa otra tabla), pero
-- no deben aparecer en el catálogo público del cotizador.
alter table inventory add column if not exists visible_publico boolean not null default true;
