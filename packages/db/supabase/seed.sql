-- Seed - Planet Producciones
-- Se ejecuta automáticamente después de las migraciones cuando corres
-- `supabase db reset` (local) o `supabase db seed` (config.toml ya apunta aquí).
--
-- Por qué existe este archivo:
-- Las políticas RLS de public.profiles no permiten que un usuario se inserte a
-- sí mismo ni que se asigne un rol (para que nadie pueda auto-ascender a admin
-- o desarrollador). Eso significa que la primera cuenta del sistema no se puede
-- crear desde la app -- alguien tiene que insertarla directamente. Este seed
-- corre con privilegios de superusuario (ignora RLS), así que es el lugar
-- correcto para ese primer registro.
--
-- Antes de correr esto:
--   1. Crea el usuario en Authentication > Users del dashboard de Supabase
--      (o con supabase.auth.signUp desde la app) con el correo que pongas abajo.
--   2. Cambia el correo 'claude.planet.producciones@gmail.com' por el real si es distinto.
-- Si el correo no existe todavía en auth.users, los INSERT de abajo simplemente
-- no insertan nada (no dan error), así que puedes correr este archivo antes o
-- después de crear el usuario.

-- ============================================================
-- 1) Roles base que necesita public.profiles.role_id
-- ============================================================
INSERT INTO public.role (name, description)
SELECT 'desarrollador', 'Equipo de desarrollo: acceso total a todas las tablas mientras el proyecto está en construcción'
WHERE NOT EXISTS (SELECT 1 FROM public.role WHERE name = 'desarrollador');

INSERT INTO public.role (name, description)
SELECT 'administrador', 'Lee todas las tablas; en transacciones solo puede ver e insertar, nunca editar ni borrar'
WHERE NOT EXISTS (SELECT 1 FROM public.role WHERE name = 'administrador');

INSERT INTO public.role (name, description)
SELECT 'trabajador', 'Personal operativo: eventos, despachos, bodega. No administra catálogo/precios ni borra registros sensibles'
WHERE NOT EXISTS (SELECT 1 FROM public.role WHERE name = 'trabajador');

-- ============================================================
-- 2) Primera cuenta del sistema, como desarrollador (edita el
--    correo si es necesario). Une vez el equipo esté en producción,
--    un desarrollador puede reasignarse a sí mismo el rol 'administrador'
--    desde la app si ya no necesita el acceso total.
-- ============================================================
INSERT INTO public.profiles (id, role_id)
SELECT u.id, r.id
FROM auth.users u
JOIN public.role r ON r.name = 'desarrollador'
WHERE u.email = 'claude.planet.producciones@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3) Ejemplos para dar de alta otras cuentas. Descomenta y cambia
--    el correo cuando tengas una cuenta de prueba.
-- ============================================================
-- INSERT INTO public.profiles (id, role_id)
-- SELECT u.id, r.id
-- FROM auth.users u
-- JOIN public.role r ON r.name = 'administrador'
-- WHERE u.email = 'correo-del-admin@ejemplo.com'
-- ON CONFLICT (id) DO NOTHING;

-- INSERT INTO public.profiles (id, role_id)
-- SELECT u.id, r.id
-- FROM auth.users u
-- JOIN public.role r ON r.name = 'trabajador'
-- WHERE u.email = 'correo-del-trabajador@ejemplo.com'
-- ON CONFLICT (id) DO NOTHING;
