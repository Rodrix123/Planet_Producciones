-- 0010 — Disponibilidad de personal por WhatsApp: modelo de datos de las convocatorias.
--
-- La administradora crea una CONVOCATORIA para un evento y la envía por WhatsApp a varios
-- trabajadores de logística; cada trabajador responde CONFIRMADO o RECHAZADO.
--
--   convocatorias                     una solicitud de disponibilidad para un evento
--     \_ convocatoria_destinatarios   un trabajador convocado: envío (Meta) + respuesta actual
--   mensajes_whatsapp_entrantes       bitácora de TODO mensaje recibido de Meta: evita
--                                     procesar dos veces el mismo mensaje y conserva el
--                                     historial de qué respondió cada trabajador y cuándo
--
-- Reglas que garantiza la propia base de datos:
--   * Un trabajador no se repite dentro de una convocatoria. Sí puede estar en convocatorias
--     de otros eventos, e incluso en varias del mismo evento (cada una con sus respuestas).
--   * Los teléfonos se guardan en formato internacional E.164 con "+" (ej. +573XXXXXXXXX).
--   * Un mensaje entrante de Meta (wa_message_id) solo se registra una vez.
--   * Los datos que viajan en el mensaje (evento, fecha, horario, lugar) se guardan como copia
--     en la convocatoria: cada respuesta queda ligada a lo que se preguntó, aunque la
--     cotización cambie después.
--
-- Esta migración solo agrega estructuras nuevas (3 tablas y la columna empleados.es_logistica,
-- que arranca en false para todos); no modifica ni borra datos existentes. Es idempotente: se
-- puede ejecutar más de una vez. Para aplicarla, pégala completa en el SQL Editor de Supabase
-- (el editor puede pedir confirmación por contener "drop trigger if exists"). Antes conviene
-- avisar al equipo: la base es compartida. Verificación y rollback, al final del archivo.

-- ============================================================================
-- 1) empleados: marca del personal de logística (los únicos que reciben convocatorias)
-- ============================================================================
alter table public.empleados
    add column if not exists es_logistica boolean not null default false;

comment on column public.empleados.es_logistica is
    'true = personal de logística: puede recibir convocatorias de disponibilidad por WhatsApp.';

-- ============================================================================
-- 2) convocatorias: una solicitud de disponibilidad asociada a un evento
-- ============================================================================
create table if not exists public.convocatorias (
    id uuid primary key default gen_random_uuid(),
    event_id bigint not null references public.events (id),

    -- Copia de lo que se le informa al trabajador (variables de la plantilla de WhatsApp)
    nombre_evento text not null,
    fecha_evento date not null,
    hora_inicio time not null,
    hora_fin time not null,
    lugar text not null,

    -- Ciclo de vida. BORRADOR -> ENVIANDO -> ENVIADA (o CANCELADA).
    estado text not null default 'BORRADOR',
    envio_iniciado_en timestamptz,

    creada_por uuid references public.profiles (id) on delete set null,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    constraint convocatorias_datos_completos check (btrim(nombre_evento) <> '' and btrim(lugar) <> ''),
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
-- 3) convocatoria_destinatarios: un trabajador convocado a una convocatoria
-- ============================================================================
create table if not exists public.convocatoria_destinatarios (
    id uuid primary key default gen_random_uuid(),
    convocatoria_id uuid not null references public.convocatorias (id) on delete cascade,
    empleado_id uuid not null references public.empleados (id),

    -- Copia al momento de convocar: el saludo y el número exacto al que se escribió
    nombre_trabajador text not null,
    telefono text not null,

    -- Respuesta actual del trabajador (el historial completo está en mensajes_whatsapp_entrantes)
    estado_respuesta text not null default 'PENDIENTE',
    respondido_en timestamptz,

    -- Envío del mensaje por la API de Meta
    estado_envio text not null default 'PENDIENTE',
    wa_message_id text,
    enviado_en timestamptz,
    error_envio text,
    intentos_envio integer not null default 0,

    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now(),

    constraint convocatoria_destinatarios_trabajador_unico unique (convocatoria_id, empleado_id),
    -- (convocatoria, teléfono) identifica sin ambigüedad a quién pertenece una respuesta entrante
    constraint convocatoria_destinatarios_telefono_unico unique (convocatoria_id, telefono),
    constraint convocatoria_destinatarios_datos_completos check (btrim(nombre_trabajador) <> ''),
    constraint convocatoria_destinatarios_telefono_e164 check (telefono ~ '^\+[1-9][0-9]{7,14}$'),
    constraint convocatoria_destinatarios_respuesta_valida
        check (estado_respuesta in ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO')),
    -- Hay fecha de respuesta si y solo si el trabajador ya respondió
    constraint convocatoria_destinatarios_respuesta_coherente
        check ((estado_respuesta = 'PENDIENTE') = (respondido_en is null)),
    constraint convocatoria_destinatarios_envio_valido
        check (estado_envio in ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'ERROR')),
    constraint convocatoria_destinatarios_envio_enviado_completo
        check (estado_envio <> 'ENVIADO' or (wa_message_id is not null and enviado_en is not null)),
    constraint convocatoria_destinatarios_envio_error_completo
        check (estado_envio <> 'ERROR' or (error_envio is not null and btrim(error_envio) <> '')),
    constraint convocatoria_destinatarios_intentos_validos check (intentos_envio >= 0)
);

-- El id que devuelve Meta al enviar es único; con él se enlaza la respuesta del trabajador
create unique index if not exists convocatoria_destinatarios_wa_message_id_key
    on public.convocatoria_destinatarios (wa_message_id) where wa_message_id is not null;
create index if not exists convocatoria_destinatarios_empleado_id_idx
    on public.convocatoria_destinatarios (empleado_id);

-- ============================================================================
-- 4) mensajes_whatsapp_entrantes: bitácora de mensajes recibidos de Meta
--    Insertar con "on conflict (wa_message_id) do nothing returning id": si no devuelve
--    fila, el mensaje ya se procesó y se descarta. Un trabajador que cambia su respuesta
--    deja varias filas aquí (historial), mientras el destinatario guarda solo la última.
-- ============================================================================
create table if not exists public.mensajes_whatsapp_entrantes (
    id uuid primary key default gen_random_uuid(),
    wa_message_id text not null,
    telefono_remitente text not null,

    tipo text not null,                    -- tipo de mensaje de Meta: button, text, interactive...
    contenido text,                        -- texto visible del botón o del mensaje
    payload text,                          -- payload del botón de respuesta rápida
    contexto_wa_message_id text,           -- id del mensaje saliente al que responde
    recibido_en timestamptz not null,      -- hora del mensaje según Meta

    -- Qué se entendió y a quién se aplicó. Quedan en NULL si no se pudo asociar con seguridad.
    convocatoria_id uuid references public.convocatorias (id) on delete set null,
    destinatario_id uuid references public.convocatoria_destinatarios (id) on delete set null,
    respuesta text,
    resultado text,                        -- NULL = recibido y aún sin procesar
    detalle text,
    payload_crudo jsonb,

    creado_en timestamptz not null default now(),

    constraint mensajes_whatsapp_entrantes_wa_message_id_key unique (wa_message_id),
    constraint mensajes_whatsapp_entrantes_telefono_e164 check (telefono_remitente ~ '^\+[1-9][0-9]{7,14}$'),
    constraint mensajes_whatsapp_entrantes_respuesta_valida check (respuesta in ('CONFIRMADO', 'RECHAZADO')),
    constraint mensajes_whatsapp_entrantes_resultado_valido
        check (resultado in ('APLICADO', 'IGNORADO', 'NO_ASOCIADO'))
);

create index if not exists mensajes_whatsapp_entrantes_destinatario_id_idx
    on public.mensajes_whatsapp_entrantes (destinatario_id);
create index if not exists mensajes_whatsapp_entrantes_convocatoria_id_idx
    on public.mensajes_whatsapp_entrantes (convocatoria_id);

-- ============================================================================
-- 5) actualizado_en se renueva solo en cada UPDATE (el webhook de Meta escribe aquí)
-- ============================================================================
create or replace function public.convocatorias_set_actualizado_en()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.actualizado_en := now();
    return new;
end;
$$;

drop trigger if exists convocatorias_set_actualizado_en on public.convocatorias;
create trigger convocatorias_set_actualizado_en
    before update on public.convocatorias
    for each row execute function public.convocatorias_set_actualizado_en();

drop trigger if exists convocatoria_destinatarios_set_actualizado_en on public.convocatoria_destinatarios;
create trigger convocatoria_destinatarios_set_actualizado_en
    before update on public.convocatoria_destinatarios
    for each row execute function public.convocatorias_set_actualizado_en();

-- ============================================================================
-- 6) Seguridad: contienen teléfonos y respuestas del personal
--    El backend se conecta con el rol postgres (ignora RLS). Por la API pública de Supabase,
--    el visitante anónimo no tiene acceso y solo el administrador puede leer/escribir.
-- ============================================================================
alter table public.convocatorias enable row level security;
alter table public.convocatoria_destinatarios enable row level security;
alter table public.mensajes_whatsapp_entrantes enable row level security;

do $$
begin
    if exists (select 1 from pg_roles where rolname = 'anon') then
        revoke all on table public.convocatorias,
                            public.convocatoria_destinatarios,
                            public.mensajes_whatsapp_entrantes
            from anon;
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

    foreach tabla in array array['convocatorias', 'convocatoria_destinatarios', 'mensajes_whatsapp_entrantes']
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
-- 7) Documentación dentro de la base
-- ============================================================================
comment on table public.convocatorias is
    'Solicitud de disponibilidad de personal para un evento (se envía por WhatsApp). Un evento puede tener varias.';
comment on table public.convocatoria_destinatarios is
    'Trabajador convocado a una convocatoria: estado del envío por Meta y respuesta actual (PENDIENTE, CONFIRMADO o RECHAZADO).';
comment on column public.convocatoria_destinatarios.telefono is
    'Teléfono en formato internacional E.164 con "+" (ej. +573XXXXXXXXX).';
comment on column public.convocatoria_destinatarios.wa_message_id is
    'Id del mensaje saliente que devolvió Meta al enviar la plantilla; la respuesta del trabajador lo trae como contexto.';
comment on table public.mensajes_whatsapp_entrantes is
    'Bitácora de mensajes recibidos de WhatsApp. wa_message_id único = el mismo mensaje no se procesa dos veces; conserva el historial de respuestas.';

-- ============================================================================
-- VERIFICACIÓN (solo lectura) — ejecutar después de aplicar la migración:
--
-- 1) Las tres tablas existen y tienen RLS activo (rls_activo = true en las 3 filas):
--      select relname as tabla, relrowsecurity as rls_activo from pg_class
--       where relnamespace = 'public'::regnamespace
--         and relname in ('convocatorias', 'convocatoria_destinatarios', 'mensajes_whatsapp_entrantes')
--       order by 1;
--
-- 2) La columna de logística existe y nadie está marcado todavía (marcados_logistica = 0):
--      select count(*) as empleados, count(*) filter (where es_logistica) as marcados_logistica
--        from public.empleados;
--
-- 3) Restricciones por tabla (esperado: convocatorias 6, convocatoria_destinatarios 13,
--    mensajes_whatsapp_entrantes 7):
--      select conrelid::regclass as tabla, count(*) as restricciones from pg_constraint
--       where conrelid in ('public.convocatorias'::regclass, 'public.convocatoria_destinatarios'::regclass,
--                          'public.mensajes_whatsapp_entrantes'::regclass)
--         and contype <> 'n'
--       group by 1 order by 1;
--
-- 4) Una política *_admin_all por tabla (3 filas; 0 filas = no existía public.is_admin()):
--      select tablename, policyname from pg_policies
--       where schemaname = 'public'
--         and tablename in ('convocatorias', 'convocatoria_destinatarios', 'mensajes_whatsapp_entrantes')
--       order by 1;
-- ============================================================================

-- ============================================================================
-- ROLLBACK — deshace esta migración y BORRA los datos de convocatorias y respuestas.
-- Descomenta y ejecuta solo si de verdad quieres revertirla (el orden importa):
--
-- drop table if exists public.mensajes_whatsapp_entrantes;
-- drop table if exists public.convocatoria_destinatarios;
-- drop table if exists public.convocatorias;
-- drop function if exists public.convocatorias_set_actualizado_en();
-- alter table public.empleados drop column if exists es_logistica;
-- ============================================================================
