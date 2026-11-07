-- 0011 — Asignación de personal a eventos confirmados (historia de usuario 2).
--
-- La administradora asigna personal a un evento confirmado desde el menú "Eventos". Cada
-- asignación es una fila de public.event_staff (tabla existente, la misma que usa el flujo de
-- disponibilidad por WhatsApp de la rama feature/disponibilidad-personal-whatsapp):
--   * hecha a mano en la app  -> convocatoria_id NULL y estado_respuesta NULL
--   * confirmada por WhatsApp -> convocatoria_id con su convocatoria y estado_respuesta 'CONFIRMADO'
-- Las filas PENDIENTE o RECHAZADO de WhatsApp NO cuentan como personal asignado.
--
-- event_staff apunta a public.profiles, así que cada persona de la nómina (public.empleados) se
-- asigna con una cuenta: la app la crea la primera vez que se asigna a esa persona (usuario de
-- Supabase Auth solo con su celular, sin correo ni contraseña, y su perfil con el rol
-- "trabajador"). Si su celular ya pertenece a una cuenta existente, se reutiliza esa cuenta.
--
-- Esta migración:
--   1) comprueba que event_staff ya tiene las columnas de la 0010 de WhatsApp (no las crea);
--   2) agrega el rol "trabajador" en public.role (una fila, solo si no existe);
--   3) agrega public.events.hora_fin (opcional) para saber a qué hora termina cada evento.
-- No crea tablas, no borra nada y no modifica filas existentes. Se puede ejecutar más de una vez.
-- Para aplicarla, pégala completa en el SQL Editor de Supabase. La base es compartida: avisa al
-- equipo antes. Verificación y rollback, al final del archivo.

-- ============================================================================
-- 1) Requisito: event_staff con las columnas de la 0010 (Opción B) de WhatsApp
-- ============================================================================
do $$
begin
    if (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'event_staff'
           and column_name in ('convocatoria_id', 'estado_respuesta')) < 2 then
        raise exception 'event_staff no tiene las columnas convocatoria_id y estado_respuesta. Aplica primero la migración 0010 de la rama feature/disponibilidad-personal-whatsapp.';
    end if;
end $$;

-- ============================================================================
-- 2) Rol del personal que se asigna a los eventos (el mismo nombre que usa la rama de WhatsApp)
-- ============================================================================
insert into public.role (name, description)
select 'trabajador', 'Personal operativo que se asigna a los eventos. No tiene acceso al panel.'
 where not exists (select 1 from public.role where name = 'trabajador');

-- ============================================================================
-- 3) Hora de finalización del evento
-- ============================================================================
-- La hora de inicio ya existe (events.hour, o quote.hour si falta). Si hora_fin es menor que la de
-- inicio, el evento termina al día siguiente (p. ej. de 8:00 p. m. a 2:00 a. m.). Es la hora en que
-- se libera al personal. Solo vive en events: se define al asignar personal, cuando el evento ya
-- está confirmado, así que quote no la necesita.
alter table public.events add column if not exists hora_fin time;

comment on column public.events.hora_fin is
    'Hora en que termina el evento (se libera al personal). Menor que la de inicio = termina al día siguiente.';

-- ============================================================================
-- VERIFICACIÓN (solo lectura), después de aplicarla:
--
-- 1) El rol existe una sola vez (1 fila):
--      select id, name from public.role where name = 'trabajador';
--
-- 2) La columna existe y es opcional (1 fila: time without time zone, YES):
--      select data_type, is_nullable from information_schema.columns
--       where table_schema = 'public' and table_name = 'events' and column_name = 'hora_fin';
-- ============================================================================

-- ============================================================================
-- ROLLBACK. Solo si de verdad quieres revertirla. Borrar el rol falla si ya hay perfiles con él
-- (la app los crea al asignar personal); en ese caso primero hay que decidir qué hacer con ellos.
--
-- alter table public.events drop column if exists hora_fin;
-- delete from public.role where name = 'trabajador';
-- ============================================================================
