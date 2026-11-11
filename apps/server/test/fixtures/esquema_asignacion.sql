-- Réplica mínima del esquema REAL de Supabase que usa la asignación de personal (columnas medidas
-- en solo lectura el 2026-11-04 y el 2026-11-07). Solo para pruebas con PGlite: nunca se aplica a la
-- base real. event_staff ya incluye las columnas de la 0010 de la rama de WhatsApp, como en Supabase.

create schema if not exists auth;

create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    phone text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table public.role (
    id bigserial primary key,
    name varchar(100) not null,
    description text
);

create table public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    role_id integer references public.role (id),
    debe_cambiar_password boolean not null default true,
    key text,
    bank_account text,
    "CC" double precision,
    nombre text,
    correo text
);

create table public.users (
    id bigserial primary key,
    name varchar(100),
    email varchar(150),
    phone varchar(30)
);

create table public.venue (
    id bigserial primary key,
    name varchar(100) not null,
    city text
);

create table public.quote (
    id bigserial primary key,
    client_id bigint references public.users (id),
    estado text not null default 'recibida',
    event_type varchar(100),
    date date,
    hour time,
    venue_id bigint references public.venue (id),
    venue_nombre_manual text,
    venue_direccion_manual text,
    total numeric not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.events (
    id bigserial primary key,
    quote_id bigint not null unique references public.quote (id) on delete cascade,
    confirmed boolean not null default false,
    initial_payment boolean not null default false,
    total_paid numeric not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    contrato_enviado_en timestamptz,
    contrato_firmado_subido_en timestamptz,
    venue_id bigint references public.venue (id),
    transportation_id bigint,
    event_type varchar(100),
    address varchar(255),
    date date,
    hour time,
    client_id bigint references public.users (id),
    venue_nombre_manual text,
    venue_direccion_manual text
);

create table public.convocatorias (
    id uuid primary key default gen_random_uuid(),
    event_id bigint not null references public.events (id),
    hora_inicio time not null,
    hora_fin time not null,
    nombre_evento text,
    lugar text,
    estado text not null default 'BORRADOR',
    envio_iniciado_en timestamptz,
    creado_en timestamptz not null default now()
);

create table public.event_staff (
    event_id bigint not null references public.events (id) on delete cascade,
    profile_id uuid not null references public.profiles (id) on delete cascade,
    convocatoria_id uuid references public.convocatorias (id) on delete cascade,
    estado_respuesta text,
    respondido_en timestamptz,
    estado_envio text,
    wa_message_id text,
    enviado_en timestamptz,
    error_envio text,
    primary key (event_id, profile_id),
    constraint event_staff_respuesta_valida check (estado_respuesta in ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO')),
    constraint event_staff_convocatoria_completa
        check (convocatoria_id is null or (estado_respuesta is not null and estado_envio is not null))
);

create table public.unavailability_users (
    id bigserial primary key,
    id_user uuid not null references public.profiles (id) on delete cascade,
    date date not null
);

create table public.empleados (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    documento text,
    telefono text,
    salario numeric,
    numero_cuenta text,
    banco text,
    tipo_contrato text not null check (tipo_contrato in ('con_contrato', 'freelance_fijo', 'freelance_no_fijo')),
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);

insert into public.role (name, description) values
    ('administrador', 'Administradora'),
    ('secretaria', 'Secretaria'),
    ('jefe_logistica', 'Jefe de logística');
