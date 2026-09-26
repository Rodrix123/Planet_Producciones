-- RLS - Planet Producciones
-- Modelo de acceso (3 niveles, guardados en public.role / profiles.role_id):
--   * anon           -> visitante sin sesión (formulario público de cotización).
--   * authenticated  -> cualquier usuario logueado en Supabase Auth, con fila en
--                        public.profiles. El rol concreto se lee de profiles.role_id
--                        -> public.role.name:
--       - is_developer() = role.name = 'desarrollador' -> control total (equipo de
--                           desarrollo, mientras la app está en construcción).
--       - is_admin()     = role.name = 'administrador'  -> lee todo; en transactions
--                           solo puede ver e insertar, nunca editar ni borrar.
--       - is_worker()    = role.name = 'trabajador'      -> operación del día a día:
--                           despachos, indisponibilidad propia, reporta el estado del
--                           inventario (stock). NO tiene acceso directo a events ni a
--                           quote/quote_items/users (solo ve lo mínimo de logística de
--                           un evento a través de la vista public.events_dispatch); no
--                           administra catálogo/precios ni borra nada sensible.
--       - is_staff()     = tiene fila en profiles, sin importar cuál de los 3 roles
--                           tenga. Se usa para permisos que comparten los 3 niveles
--                           (ej. leer el catálogo).
--   * service_role    -> usado por el backend/servidor; Postgres/Supabase le da bypass
--                        automático de RLS, no necesita políticas.
--

-- ================================================================
-- 1) Funciones auxiliares
-- ================================================================
CREATE OR REPLACE FUNCTION public.current_role_name()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT r.name
  FROM public.profiles p
  JOIN public.role r ON r.id = p.role_id
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_developer()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT public.current_role_name() = 'desarrollador';
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT public.current_role_name() = 'administrador';
$$;

CREATE OR REPLACE FUNCTION public.is_worker()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT public.current_role_name() = 'trabajador';
$$;

-- Cualquiera de los 3 roles (solo requiere tener fila en profiles).
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_developer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_worker() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

-- ================================================================
-- 2) Privilegios de tabla (la puerta gruesa; RLS abajo es la puerta fina)
-- ================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- El visitante anónimo solo puede intentar INSERT en las 3 tablas del flujo público
-- de cotización. Todo lo demás le queda cerrado incluso antes de evaluar RLS.
GRANT INSERT ON public.users, public.quote, public.quote_items TO anon;
GRANT USAGE ON SEQUENCE public.users_id_seq, public.quote_id_seq TO anon;

-- ================================================================
-- 3) Habilitar RLS en todas las tablas
-- ================================================================
ALTER TABLE public.components               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_components     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportation           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unavailability_users     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unavailability_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_audit           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_stock_items     ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- 4) Desarrollador: control total en cualquier tabla, mientras el
--    proyecto está en construcción. Es la única política "_dev_all"
--    de cada tabla; sirve de válvula de escape sin tener que usar la
--    service_role key para probar la app como usuario normal.
-- ================================================================
CREATE POLICY "components_dev_all"               ON public.components               FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "venue_dev_all"                    ON public.venue                    FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "vehicles_dev_all"                 ON public.vehicles                 FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "role_dev_all"                     ON public.role                     FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "inventory_dev_all"                ON public.inventory                FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "inventory_components_dev_all"     ON public.inventory_components     FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "users_dev_all"                    ON public.users                    FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "transportation_dev_all"           ON public.transportation           FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "inventory_variants_dev_all"       ON public.inventory_variants       FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "stock_dev_all"                    ON public.stock                    FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "quote_dev_all"                    ON public.quote                    FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "quote_items_dev_all"              ON public.quote_items              FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "events_dev_all"                   ON public.events                   FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "transactions_dev_all"             ON public.transactions             FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "event_staff_dev_all"              ON public.event_staff              FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "unavailability_users_dev_all"     ON public.unavailability_users     FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "unavailability_inventory_dev_all" ON public.unavailability_inventory FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "package_dev_all"                  ON public.package                  FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "package_items_dev_all"            ON public.package_items            FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "dispatch_dev_all"                 ON public.dispatch                 FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "dispatch_audit_dev_all"           ON public.dispatch_audit           FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "dispatch_items_dev_all"           ON public.dispatch_items           FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());
CREATE POLICY "dispatch_stock_items_dev_all"     ON public.dispatch_stock_items     FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());

-- profiles se maneja aparte más abajo (sección 8), porque además de dev_all
-- necesita blindaje contra auto-ascenso a admin/desarrollador.

-- ================================================================
-- 5) Catálogo / datos maestros: admin lo administra completo,
--    cualquier staff (trabajador incluido) solo lo lee.
--    (venue, vehicles, role, inventory, inventory_components,
--     components, transportation, inventory_variants)
-- ================================================================
CREATE POLICY "components_admin_all" ON public.components
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "components_staff_select" ON public.components
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "venue_admin_all" ON public.venue
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "venue_staff_select" ON public.venue
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "vehicles_admin_all" ON public.vehicles
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "vehicles_staff_select" ON public.vehicles
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "role_admin_all" ON public.role
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "role_staff_select" ON public.role
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "inventory_admin_all" ON public.inventory
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "inventory_staff_select" ON public.inventory
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "inventory_components_admin_all" ON public.inventory_components
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "inventory_components_staff_select" ON public.inventory_components
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "transportation_admin_all" ON public.transportation
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "transportation_staff_select" ON public.transportation
    FOR SELECT TO authenticated USING (public.is_staff());

CREATE POLICY "inventory_variants_admin_all" ON public.inventory_variants
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "inventory_variants_staff_select" ON public.inventory_variants
    FOR SELECT TO authenticated USING (public.is_staff());

-- ================================================================
-- 6) stock: dato operativo (cambia de estado seguido) -> trabajador
--    puede leer/crear/actualizar; borrar queda solo para admin/dev.
-- ================================================================
CREATE POLICY "stock_admin_all" ON public.stock
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "stock_staff_select" ON public.stock
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "stock_staff_insert" ON public.stock
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "stock_staff_update" ON public.stock
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

-- ================================================================
-- 7) Flujo público de cotización: users (clientes), quote, quote_items.
--    anon solo puede INSERTAR (crear su cliente + su cotización).
--    Ver/editar después queda SOLO para admin/dev: el trabajador no tiene
--    ningún acceso a estas 3 tablas (ni SELECT, ni INSERT, ni UPDATE) --
--    "no accede directamente a la cotización". Por eso el INSERT público
--    ya no incluye "authenticated": si lo incluyera, un trabajador logueado
--    podría crear/editar cotizaciones desde su propia sesión.
-- ================================================================
CREATE POLICY "users_admin_all" ON public.users
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "users_public_insert" ON public.users
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "quote_admin_all" ON public.quote
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "quote_public_insert" ON public.quote
    FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "quote_items_admin_all" ON public.quote_items
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "quote_items_public_insert" ON public.quote_items
    FOR INSERT TO anon WITH CHECK (true);

-- ================================================================
-- 8) profiles: cada uno ve su propia fila. Nadie puede insertarse a
--    sí mismo ni auto-actualizar su rol (evita escalar privilegios
--    desde el propio cliente): por eso NO existe una política de
--    "profiles_self_update". Asignar/cambiar rol lo hace un admin,
--    el desarrollador, o el servidor (service_role) -- nunca el
--    propio usuario. Además, admin no puede asignar el rol
--    'desarrollador' (ni a otros ni a sí mismo): solo el propio
--    desarrollador (o el seed, que corre con service_role) puede.
-- ================================================================
CREATE POLICY "profiles_dev_all" ON public.profiles
    FOR ALL TO authenticated USING (public.is_developer()) WITH CHECK (public.is_developer());

CREATE POLICY "profiles_admin_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (
        public.is_admin()
        AND NOT EXISTS (
            SELECT 1 FROM public.role r
            WHERE r.id = role_id AND r.name = 'desarrollador'
        )
    );

CREATE POLICY "profiles_self_select" ON public.profiles
    FOR SELECT TO authenticated USING (id = auth.uid());

-- ================================================================
-- 9) Operación interna (eventos, envíos, paquetes). events queda fuera
--    del alcance directo del trabajador (ni SELECT, ni INSERT, ni
--    UPDATE): solo admin/dev lo gestionan -- "no accede directamente
--    al evento como tal". Para que el trabajador pueda igual hacer
--    despachos (necesita dirección/fecha/hora de entrega), existe la
--    vista public.events_dispatch (justo debajo de este bloque), que
--    expone solo columnas de logística, sin cliente/cotización/pagos.
--    El resto (despachos, paquetes) sigue: cualquier staff puede
--    leer/crear/actualizar, borrar queda para admin/dev.
-- ================================================================
CREATE POLICY "events_admin_all" ON public.events
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Vista de solo-lectura con las columnas logísticas de events (nada de
-- client_id, quote_id, total_paid ni initial_payment). No es "invoker":
-- se ejecuta con los permisos de quien la creó (el rol de las migraciones,
-- dueño de la tabla events, que por eso mismo ya está exento de las
-- políticas RLS de esa tabla). El único control de acceso real es el
-- WHERE is_staff() de abajo -- por eso esta vista NUNCA debe crearse con
-- "security_invoker = true", o dejaría de tener sentido este diseño.
CREATE OR REPLACE VIEW public.events_dispatch
WITH (security_invoker = false) AS
SELECT
    id,
    venue_id,
    transportation_id,
    event_type,
    address,
    date,
    hour,
    confirmed
FROM public.events
WHERE public.is_staff();

GRANT SELECT ON public.events_dispatch TO authenticated;

CREATE POLICY "event_staff_admin_all" ON public.event_staff
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "event_staff_staff_select" ON public.event_staff
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "event_staff_staff_insert" ON public.event_staff
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "package_admin_all" ON public.package
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "package_staff_select" ON public.package
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "package_staff_insert" ON public.package
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "package_staff_update" ON public.package
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "package_items_admin_all" ON public.package_items
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "package_items_staff_select" ON public.package_items
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "package_items_staff_insert" ON public.package_items
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "package_items_staff_update" ON public.package_items
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "dispatch_admin_all" ON public.dispatch
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dispatch_staff_select" ON public.dispatch
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "dispatch_staff_insert" ON public.dispatch
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "dispatch_staff_update" ON public.dispatch
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "dispatch_items_admin_all" ON public.dispatch_items
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dispatch_items_staff_select" ON public.dispatch_items
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "dispatch_items_staff_insert" ON public.dispatch_items
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "dispatch_items_staff_update" ON public.dispatch_items
    FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY "dispatch_stock_items_admin_all" ON public.dispatch_stock_items
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dispatch_stock_items_staff_select" ON public.dispatch_stock_items
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "dispatch_stock_items_staff_insert" ON public.dispatch_stock_items
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "dispatch_stock_items_staff_delete" ON public.dispatch_stock_items
    FOR DELETE TO authenticated USING (public.is_staff());

-- ================================================================
-- 10) Registros que no deben quedar en manos de cualquiera:
--     - transactions (dinero): trabajador Y administrador solo
--       pueden VER e INSERTAR: nunca UPDATE ni DELETE. Un pago mal
--       registrado se corrige con un pago compensatorio nuevo, no
--       editando el original. Solo el desarrollador (política de la
--       sección 4) puede corregir/borrar directamente, y solo debería
--       hacerlo para arreglar datos durante el desarrollo.
--     - dispatch_audit (bitácora): igual, solo ver/insertar para
--       cualquier staff; admin sí puede corregir un registro si hace
--       falta (bitácora operativa, no financiera).
-- ================================================================
CREATE POLICY "transactions_staff_select" ON public.transactions
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "transactions_staff_insert" ON public.transactions
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

CREATE POLICY "dispatch_audit_admin_all" ON public.dispatch_audit
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "dispatch_audit_staff_select" ON public.dispatch_audit
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "dispatch_audit_staff_insert" ON public.dispatch_audit
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());

-- ================================================================
-- 11) unavailability_users: cada trabajador gestiona SU PROPIA
--     indisponibilidad; el equipo completo puede verla (para programar).
-- ================================================================
CREATE POLICY "unavailability_users_admin_all" ON public.unavailability_users
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "unavailability_users_staff_select" ON public.unavailability_users
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "unavailability_users_self_insert" ON public.unavailability_users
    FOR INSERT TO authenticated WITH CHECK (id_user = auth.uid());
CREATE POLICY "unavailability_users_self_delete" ON public.unavailability_users
    FOR DELETE TO authenticated USING (id_user = auth.uid());

CREATE POLICY "unavailability_inventory_admin_all" ON public.unavailability_inventory
    FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "unavailability_inventory_staff_select" ON public.unavailability_inventory
    FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "unavailability_inventory_staff_insert" ON public.unavailability_inventory
    FOR INSERT TO authenticated WITH CHECK (public.is_staff());
CREATE POLICY "unavailability_inventory_staff_delete" ON public.unavailability_inventory
    FOR DELETE TO authenticated USING (public.is_staff());
