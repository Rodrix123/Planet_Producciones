-- Reconstrucción sobre el esquema real de Supabase (components/inventory/quote/events/...).
-- Reemplaza por completo a 0001-0003 (esas tablas ya fueron eliminadas manualmente).

-- Limpieza de tipos huérfanos de la implementación anterior
drop type if exists usuario_rol;
drop type if exists cotizacion_estado;

-- inventory: distingue cómo se renderiza cada categoría en el cotizador
alter table inventory add column if not exists control_type text not null default 'select'
    check (control_type in ('select', 'checkbox', 'qty'));

-- quote: estado previo a convertirse en evento, y los datos que el cliente
-- público ya elige hoy (antes de que Maritza complete dirección/hora exactas)
alter table quote add column if not exists estado text not null default 'recibida'
    check (estado in ('recibida', 'en_revision', 'finalizada', 'cancelada'));
alter table quote add column if not exists client_id bigint references users(id);
alter table quote add column if not exists event_type varchar;
alter table quote add column if not exists venue_id bigint references venue(id);
alter table quote add column if not exists transportation_id bigint references transportation(id);
alter table quote add column if not exists date date;

-- users (clientes): documento, necesario para el contrato
alter table users add column if not exists documento text;

-- events: seguimiento del contrato (confirmed ya existía y pasa a significar
-- "evento definitivo", no se toca su uso actual)
alter table events add column if not exists contrato_enviado_en timestamptz;
alter table events add column if not exists contrato_enviado_por uuid references profiles(id);
alter table events add column if not exists contrato_firmado_nombre text;
alter table events add column if not exists contrato_firmado_subido_en timestamptz;
alter table events add column if not exists contrato_firmado_subido_por uuid references profiles(id);

-- Tablas nuevas autorizadas explícitamente (únicas excepciones a "sin tablas nuevas")

create table if not exists empleados (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    documento text,
    telefono text,
    salario numeric,
    numero_cuenta text,
    banco text,
    tipo_contrato text not null check (tipo_contrato in ('con_contrato', 'sin_contrato')),
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

alter table empleados enable row level security;

do $$ begin
    create policy empleados_admin_all on empleados for all to authenticated
        using (is_admin()) with check (is_admin());
exception
    when duplicate_object then null;
end $$;

create table if not exists quote_historial (
    id uuid primary key default gen_random_uuid(),
    quote_id bigint not null references quote(id) on delete cascade,
    profile_id uuid references profiles(id),
    tipo text not null check (tipo in ('comentario', 'edicion', 'cambio_estado')),
    comentario text,
    items_antes jsonb,
    items_despues jsonb,
    estado_antes text,
    estado_despues text,
    creado_en timestamptz not null default now()
);

alter table quote_historial enable row level security;

do $$ begin
    create policy quote_historial_admin_all on quote_historial for all to authenticated
        using (is_admin()) with check (is_admin());
exception
    when duplicate_object then null;
end $$;
