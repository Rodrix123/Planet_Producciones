-- 0010 — Disponibilidad de personal por WhatsApp: convocatorias.
--
-- La administradora crea una CONVOCATORIA para un evento y la envía por WhatsApp a varios
-- trabajadores (cuentas con rol "trabajador"); cada uno responde CONFIRMADO o RECHAZADO.
--
-- Se reutiliza lo que ya existe en la base y solo se agrega lo que falta:
--   profiles + role        quiénes son los trabajadores (rol "trabajador"). Su teléfono ya vive en
--                          auth.users.phone: no se duplica
--   events, quote, venue   nombre, fecha, hora de inicio y lugar del evento: se leen de ahí
--   event_staff            (existente) ahora guarda también, por trabajador y convocatoria, el
--                          envío por Meta y la respuesta: 7 columnas nuevas, todas opcionales
--   unavailability_users   (existente) sin cambios; el "No puedo asistir" se registrará ahí
--   convocatorias          NUEVA: una solicitud de disponibilidad para un evento
--   mensajes_whatsapp_entrantes   NUEVA: bitácora de lo que llega de Meta; evita procesar dos
--                          veces el mismo mensaje y conserva el historial de respuestas
--
-- Reglas que garantiza la propia base de datos:
--   * Un trabajador aparece una sola vez por evento en event_staff (su clave ya existente), así
--     que no puede repetirse en una convocatoria. Sí puede estar en convocatorias de otros eventos.
--   * Varias convocatorias de un mismo evento no se mezclan: cada fila de event_staff apunta a la suya.
--   * Un mensaje entrante de Meta (wa_message_id) solo se registra una vez.
--   * El teléfono del remitente se guarda en formato internacional E.164 con "+" (ej. +573XXXXXXXXX).
--
-- ATENCIÓN con event_staff: las filas con convocatoria_id pueden estar PENDIENTE o RECHAZADO. Quien
-- lea event_staff para mostrar el "personal asignado" debe incluir solo
--   estado_respuesta is null (asignación manual, como hasta ahora) o estado_respuesta = 'CONFIRMADO'.
--
-- Es idempotente (se puede ejecutar más de una vez) y no modifica filas existentes. Si ya se ejecutó
-- la primera versión de esta migración (3 tablas nuevas), el bloque 0 la reemplaza, pero solo si sus
-- tablas están vacías; si tuvieran datos, se detiene sin cambiar nada. Para aplicarla, pégala
-- completa en el SQL Editor de Supabase (puede pedir confirmación por contener "drop"). La base
-- es compartida: conviene avisar al equipo. Verificación y rollback, al final del archivo.

-- ============================================================================
-- 0) Reemplazo de la primera versión de esta migración (si se ejecutó)
--    Retiraba convocatoria_destinatarios, la columna empleados.es_logistica y una función.
--    No hace nada si esa versión no está en la base (por ejemplo, tras ejecutar este archivo).
-- ============================================================================
do $$
declare
    tabla text;
    hay_datos boolean;
begin
    if to_regclass('public.convocatoria_destinatarios') is null then
        return;
    end if;

    foreach tabla in array array['mensajes_whatsapp_entrantes', 'convocatoria_destinatarios', 'convocatorias']
    loop
        if to_regclass('public.' || tabla) is not null then
            execute format('select exists (select 1 from public.%I)', tabla) into hay_datos;
            if hay_datos then
                raise exception 'La tabla % de la primera versión de esta migración tiene datos: no se reemplaza automáticamente. Revísala antes de continuar.', tabla;
            end if;
        end if;
    end loop;

    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'empleados' and column_name = 'es_logistica'
    ) then
        execute 'select exists (select 1 from public.empleados where es_logistica)' into hay_datos;
        if hay_datos then
            raise exception 'Hay empleados marcados en empleados.es_logistica: no se elimina la columna automáticamente. Revísala antes de continuar.';
        end if;
        alter table public.empleados drop column es_logistica;
    end if;

    drop table if exists public.mensajes_whatsapp_entrantes;
    drop table if exists public.convocatoria_destinatarios;
    drop table if exists public.convocatorias;
    drop function if exists public.convocatorias_set_actualizado_en();
end $$;

-- ============================================================================
-- 1) convocatorias: una solicitud de disponibilidad asociada a un evento
--    La fecha, el tipo de evento y la sede salen de quote/venue; nombre_evento y lugar son
--    opcionales y solo se llenan si la administradora corrige lo que dice la cotización.
-- ============================================================================
create table if not exists public.convocatorias (
    id uuid primary key default gen_random_uuid(),
    event_id bigint not null references public.events (id),

    hora_inicio time not null,
    hora_fin time not null,
    nombre_evento text,
    lugar text,

    -- Ciclo de vida. BORRADOR -> ENVIANDO -> ENVIADA (o CANCELADA).
    estado text not null default 'BORRADOR',
    envio_iniciado_en timestamptz,
    creado_en timestamptz not null default now(),

    constraint convocatorias_textos_validos check (
        (nombre_evento is null or btrim(nombre_evento) <> '') and (lugar is null or btrim(lugar) <> '')
    ),
    constraint convocatorias_estado_valido check (estado in ('BORRADOR', 'ENVIANDO', 'ENVIADA', 'CANCELADA')),
    -- Solo una convocatoria que ya empezó a enviarse (ENVIANDO / ENVIADA) tiene fecha de inicio
    -- de envío; en BORRADOR no. Una CANCELADA puede tenerla o no, según se cancelara antes o después.
    constraint convocatorias_envio_coherente check (
        estado not in ('BORRADOR', 'ENVIANDO', 'ENVIADA')
        or ((estado = 'BORRADOR') = (envio_iniciado_en is null))
    )
);

create index if not exists convocatorias_event_id_idx on public.convocatorias (event_id);

-- ============================================================================
-- 2) event_staff: envío por Meta y respuesta de cada trabajador convocado
--    Las filas que ya existen (asignaciones manuales) no cambian: convocatoria_id queda en NULL
--    y las demás columnas nuevas también. Las filas de una convocatoria siempre traen
--    estado_respuesta y estado_envio.
-- ============================================================================
alter table public.event_staff
    add column if not exists convocatoria_id uuid references public.convocatorias (id) on delete cascade,
    add column if not exists estado_respuesta text,
    add column if not exists respondido_en timestamptz,
    add column if not exists estado_envio text,
    add column if not exists wa_message_id text,
    add column if not exists enviado_en timestamptz,
    add column if not exists error_envio text;

alter table public.event_staff drop constraint if exists event_staff_convocatoria_completa;
alter table public.event_staff add constraint event_staff_convocatoria_completa
    check (convocatoria_id is null or (estado_respuesta is not null and estado_envio is not null));

alter table public.event_staff drop constraint if exists event_staff_respuesta_valida;
alter table public.event_staff add constraint event_staff_respuesta_valida
    check (estado_respuesta in ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO'));

-- Hay fecha de respuesta si y solo si el trabajador ya respondió
alter table public.event_staff drop constraint if exists event_staff_respuesta_coherente;
alter table public.event_staff add constraint event_staff_respuesta_coherente
    check (convocatoria_id is null or ((estado_respuesta = 'PENDIENTE') = (respondido_en is null)));

alter table public.event_staff drop constraint if exists event_staff_envio_valido;
alter table public.event_staff add constraint event_staff_envio_valido
    check (estado_envio in ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'ERROR'));

alter table public.event_staff drop constraint if exists event_staff_envio_enviado_completo;
alter table public.event_staff add constraint event_staff_envio_enviado_completo
    check (estado_envio is distinct from 'ENVIADO' or (wa_message_id is not null and enviado_en is not null));

alter table public.event_staff drop constraint if exists event_staff_envio_error_completo;
alter table public.event_staff add constraint event_staff_envio_error_completo
    check (estado_envio is distinct from 'ERROR' or (error_envio is not null and btrim(error_envio) <> ''));

-- El id que devuelve Meta al enviar es único; con él se enlaza la respuesta del trabajador
create unique index if not exists event_staff_wa_message_id_key
    on public.event_staff (wa_message_id) where wa_message_id is not null;
create index if not exists event_staff_convocatoria_id_idx on public.event_staff (convocatoria_id);

-- ============================================================================
-- 3) mensajes_whatsapp_entrantes: bitácora de mensajes recibidos de Meta
--    Insertar con "on conflict (wa_message_id) do nothing": si no inserta, el mensaje ya se
--    procesó y se descarta. Un trabajador que cambia su respuesta deja varias filas aquí
--    (historial), mientras event_staff guarda solo la última.
-- ============================================================================
create table if not exists public.mensajes_whatsapp_entrantes (
    wa_message_id text primary key,
    telefono_remitente text not null,

    tipo text not null,                    -- tipo de mensaje de Meta: button, text, interactive...
    contenido text,                        -- texto visible del botón o del mensaje
    payload text,                          -- payload del botón de respuesta rápida
    contexto_wa_message_id text,           -- id del mensaje saliente al que responde
    recibido_en timestamptz not null,      -- hora del mensaje según Meta

    -- Qué se entendió y a quién se aplicó. Quedan en NULL si no se pudo asociar con seguridad.
    convocatoria_id uuid references public.convocatorias (id) on delete set null,
    profile_id uuid references public.profiles (id) on delete set null,
    respuesta text,
    resultado text,                        -- NULL = recibido y aún sin procesar

    constraint mensajes_whatsapp_entrantes_telefono_e164 check (telefono_remitente ~ '^\+[1-9][0-9]{7,14}$'),
    constraint mensajes_whatsapp_entrantes_respuesta_valida check (respuesta in ('CONFIRMADO', 'RECHAZADO')),
    constraint mensajes_whatsapp_entrantes_resultado_valido
        check (resultado in ('APLICADO', 'IGNORADO', 'NO_ASOCIADO'))
);

create index if not exists mensajes_whatsapp_entrantes_profile_id_idx
    on public.mensajes_whatsapp_entrantes (profile_id);
create index if not exists mensajes_whatsapp_entrantes_convocatoria_id_idx
    on public.mensajes_whatsapp_entrantes (convocatoria_id);

-- ============================================================================
-- 4) Seguridad de las dos tablas nuevas (contienen teléfonos y respuestas del personal)
--    El backend se conecta con el rol postgres (ignora RLS). Por la API pública de Supabase el
--    visitante anónimo no tiene acceso y solo el administrador puede leer/escribir.
--    event_staff conserva las políticas que ya tenía.
-- ============================================================================
alter table public.convocatorias enable row level security;
alter table public.mensajes_whatsapp_entrantes enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on table public.convocatorias, public.mensajes_whatsapp_entrantes from anon;
    end if;
end $$;

do $$
declare
    tabla text;
begin
    if to_regprocedure('public.is_admin()') is null
       or not exists (select 1 from pg_roles where rolname = 'authenticated') then
        raise notice 'No existe public.is_admin() o el rol authenticated: las tablas quedan con RLS activo y sin políticas (solo accesibles desde el backend).';
        return;
    end if;

    foreach tabla in array array['convocatorias', 'mensajes_whatsapp_entrantes']
    loop
        if not exists (
            select 1 from pg_policies
            where schemaname = 'public' and tablename = tabla and policyname = tabla || '_admin_all'
        ) then
            execute format(
                'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                tabla || '_admin_all', tabla
            );
        end if;
    end loop;
end $$;

-- ============================================================================
-- 5) Documentación dentro de la base
-- ============================================================================
comment on table public.convocatorias is
    'Solicitud de disponibilidad de personal para un evento (se envía por WhatsApp). Un evento puede tener varias.';
comment on column public.event_staff.convocatoria_id is
    'Convocatoria que originó esta fila (NULL = asignación manual). Las filas de una convocatoria pueden estar PENDIENTE o RECHAZADO: para el personal asignado, filtrar estado_respuesta is null o CONFIRMADO.';
comment on column public.event_staff.wa_message_id is
    'Id del mensaje saliente que devolvió Meta al enviar la plantilla; la respuesta del trabajador lo trae como contexto.';
comment on table public.mensajes_whatsapp_entrantes is
    'Bitácora de mensajes recibidos de WhatsApp. wa_message_id único = el mismo mensaje no se procesa dos veces; conserva el historial de respuestas.';

-- ============================================================================
-- VERIFICACIÓN (solo lectura) — ejecutar después de aplicar la migración:
--
-- 1) Las dos tablas nuevas existen y tienen RLS activo (rls_activo = true en las 2 filas):
--      select relname as tabla, relrowsecurity as rls_activo from pg_class
--       where relnamespace = 'public'::regnamespace
--         and relname in ('convocatorias', 'mensajes_whatsapp_entrantes')
--       order by 1;
--
-- 2) event_staff tiene las 7 columnas nuevas (7 filas) y sus filas existentes siguen igual
--    (con_convocatoria = 0 mientras no se cree ninguna convocatoria):
--      select column_name from information_schema.columns
--       where table_schema = 'public' and table_name = 'event_staff'
--         and column_name in ('convocatoria_id', 'estado_respuesta', 'respondido_en', 'estado_envio',
--                             'wa_message_id', 'enviado_en', 'error_envio')
--       order by 1;
--      select count(*) as filas, count(convocatoria_id) as con_convocatoria from public.event_staff;
--
-- 3) Restricciones nuevas (esperado: convocatorias 5, mensajes_whatsapp_entrantes 6 y 7 nuevas en event_staff):
--      select conrelid::regclass as tabla, count(*) as restricciones from pg_constraint
--       where conrelid in ('public.convocatorias'::regclass, 'public.mensajes_whatsapp_entrantes'::regclass)
--         and contype <> 'n'
--       group by 1 order by 1;
--      select count(*) as nuevas_en_event_staff from pg_constraint
--       where conrelid = 'public.event_staff'::regclass
--         and conname in ('event_staff_convocatoria_id_fkey', 'event_staff_convocatoria_completa',
--                         'event_staff_respuesta_valida', 'event_staff_respuesta_coherente',
--                         'event_staff_envio_valido', 'event_staff_envio_enviado_completo',
--                         'event_staff_envio_error_completo');
--
-- 4) Una política *_admin_all por tabla nueva (2 filas; 0 filas = no existía public.is_admin()):
--      select tablename, policyname from pg_policies
--       where schemaname = 'public' and tablename in ('convocatorias', 'mensajes_whatsapp_entrantes')
--       order by 1;
--
-- 5) La primera versión quedó retirada (esperado: 0 filas):
--      select table_name from information_schema.tables
--       where table_schema = 'public' and table_name = 'convocatoria_destinatarios'
--      union all
--      select column_name from information_schema.columns
--       where table_schema = 'public' and table_name = 'empleados' and column_name = 'es_logistica';
-- ============================================================================

-- ============================================================================
-- ROLLBACK — deshace esta migración y BORRA los datos de convocatorias y respuestas (las filas
-- manuales de event_staff no se tocan). Descomenta y ejecuta solo si de verdad quieres
-- revertirla (el orden importa):
--
-- delete from public.event_staff where convocatoria_id is not null;
-- alter table public.event_staff drop column if exists convocatoria_id, drop column if exists estado_respuesta, drop column if exists respondido_en, drop column if exists estado_envio, drop column if exists wa_message_id, drop column if exists enviado_en, drop column if exists error_envio;
-- drop table if exists public.mensajes_whatsapp_entrantes;
-- drop table if exists public.convocatorias;
-- ============================================================================
