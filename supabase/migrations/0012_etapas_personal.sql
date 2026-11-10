-- 0012 — Etapas del personal asignado a un evento (historia de usuario 2, mejora).
--
-- El personal de un evento se organiza en tres etapas fijas: Carga, Organización y Desmonte. Una
-- misma persona puede estar en varias (por ejemplo, en Carga y en Desmonte), así que cada fila de
-- public.event_staff (evento + persona) guarda la LISTA de sus etapas:
--   etapas = '{carga,desmonte}'  -> está en Carga y en Desmonte
--   etapas = NULL                -> asignada sin etapa (filas anteriores a esta migración, o
--                                   confirmaciones por WhatsApp a las que aún no se les dio etapa)
-- Las etapas no tienen horario propio: para detectar choques entre eventos se sigue usando el
-- horario completo del evento (inicio y events.hora_fin).
--
-- Esta migración solo agrega la columna (opcional) y una restricción que admite únicamente esas
-- tres etapas, sin repetir y sin listas vacías. No crea tablas y no modifica ni borra filas: las
-- asignaciones que ya existen quedan "sin etapa". Se puede ejecutar más de una vez.
-- Para aplicarla, pégala completa en el SQL Editor de Supabase. La base es compartida: avisa al
-- equipo antes. Requiere la 0011. Verificación y rollback, al final del archivo.

alter table public.event_staff add column if not exists etapas text[];

comment on column public.event_staff.etapas is
    'Etapas del evento en las que trabaja la persona: carga, organizacion y/o desmonte. NULL = sin etapa.';

-- Solo las tres etapas, al menos una, sin repetir. (Una restricción CHECK no admite subconsultas;
-- "sin repetir" se comprueba comparando con las etapas distintas que contiene.)
do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conrelid = 'public.event_staff'::regclass and conname = 'event_staff_etapas_validas'
    ) then
        alter table public.event_staff add constraint event_staff_etapas_validas check (
            etapas is null
            or (
                cardinality(etapas) between 1 and 3
                and etapas <@ array['carga', 'organizacion', 'desmonte']::text[]
                and cardinality(etapas) = (
                    (case when 'carga' = any(etapas) then 1 else 0 end)
                  + (case when 'organizacion' = any(etapas) then 1 else 0 end)
                  + (case when 'desmonte' = any(etapas) then 1 else 0 end)
                )
            )
        );
    end if;
end $$;

-- ============================================================================
-- VERIFICACIÓN (solo lectura), después de aplicarla:
--
-- 1) La columna existe y es opcional (1 fila: ARRAY, YES):
--      select data_type, is_nullable from information_schema.columns
--       where table_schema = 'public' and table_name = 'event_staff' and column_name = 'etapas';
--
-- 2) La restricción existe (1 fila):
--      select conname from pg_constraint
--       where conrelid = 'public.event_staff'::regclass and conname = 'event_staff_etapas_validas';
--
-- 3) Las asignaciones anteriores quedaron sin etapa (etapas en NULL, mismas filas que antes):
--      select count(*) as filas, count(etapas) as con_etapa from public.event_staff;
-- ============================================================================

-- ============================================================================
-- ROLLBACK. Solo si de verdad quieres revertirla: borra las etapas guardadas (las asignaciones se
-- conservan, sin etapa).
--
-- alter table public.event_staff drop constraint if exists event_staff_etapas_validas;
-- alter table public.event_staff drop column if exists etapas;
-- ============================================================================
