-- Fase 1: cuentas internas (administradora, secretaria, jefe de logística)

create extension if not exists pgcrypto;

do $$ begin
    create type usuario_rol as enum ('administradora', 'secretaria', 'jefe_logistica');
exception
    when duplicate_object then null;
end $$;

create table if not exists usuarios (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    correo text not null unique,
    password_hash text not null,
    rol usuario_rol not null,
    debe_cambiar_password boolean not null default true,
    activo boolean not null default true,
    creado_en timestamptz not null default now(),
    actualizado_en timestamptz not null default now()
);
