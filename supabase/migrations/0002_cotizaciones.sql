-- Fase 2: cotizaciones reales (reemplazan el flujo "solo email" anterior),
-- su historial de revisión/comentarios, y los empleados.

do $$ begin
    create type cotizacion_estado as enum (
        'recibida', 'en_revision', 'finalizada', 'contrato_enviado', 'programada', 'cancelada'
    );
exception
    when duplicate_object then null;
end $$;

create sequence if not exists cotizaciones_numero_seq;

create table if not exists cotizaciones (
    id uuid primary key default gen_random_uuid(),
    numero_referencia text not null unique,
    cliente_nombre text not null,
    cliente_correo text not null,
    cliente_telefono text not null,
    cliente_documento text,
    tipo_evento text,
    ciudad text,
    lugar text,
    fecha_evento date,
    items jsonb not null default '[]'::jsonb,
    total numeric not null default 0,
    estado cotizacion_estado not null default 'recibida',
    creada_en timestamptz not null default now(),
    actualizada_en timestamptz not null default now(),
    finalizada_en timestamptz,
    finalizada_por uuid references usuarios(id),
    programada_en timestamptz
);

create index if not exists cotizaciones_estado_idx on cotizaciones (estado);

create table if not exists cotizacion_historial (
    id uuid primary key default gen_random_uuid(),
    cotizacion_id uuid not null references cotizaciones(id) on delete cascade,
    usuario_id uuid references usuarios(id),
    tipo text not null check (tipo in ('comentario', 'edicion', 'cambio_estado')),
    comentario text,
    items_antes jsonb,
    items_despues jsonb,
    estado_antes text,
    estado_despues text,
    creado_en timestamptz not null default now()
);

create index if not exists cotizacion_historial_cotizacion_idx on cotizacion_historial (cotizacion_id);

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
