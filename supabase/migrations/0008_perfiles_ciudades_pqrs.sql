-- 1. Atributos reales de perfil montados sobre auth.users (vía profiles.id, que ya
-- tiene FK a auth.users). Antes "nombre" y "debe_cambiar_password" solo vivían dentro
-- del JSON de user_metadata de Supabase Auth, invisibles para cualquier inspección
-- directa del esquema relacional. Revisión de base de datos pidió que estos atributos
-- de perfil queden como columnas reales de la tabla, no solo en metadata.
alter table profiles add column if not exists nombre text;
alter table profiles add column if not exists correo text;
alter table profiles add column if not exists debe_cambiar_password boolean not null default true;

-- 2. Ciudad de cada sede (para filtrar "Sede" según la ciudad elegida en el cotizador)
-- y campos para una sede manual ("Otro") cuando el lugar real no está en el catálogo.
alter table venue add column if not exists city text;

alter table quote add column if not exists venue_nombre_manual text;
alter table quote add column if not exists venue_direccion_manual text;
alter table events add column if not exists venue_nombre_manual text;
alter table events add column if not exists venue_direccion_manual text;

update venue set city = 'Manizales' where city is null;

insert into venue (name, city)
select v.name, v.city
from (values
    ('Pereira 1', 'Pereira'),
    ('Pereira 2', 'Pereira'),
    ('Pereira 3', 'Pereira'),
    ('Armenia 1', 'Armenia'),
    ('Armenia 2', 'Armenia'),
    ('Armenia 3', 'Armenia')
) as v(name, city)
where not exists (select 1 from venue where venue.name = v.name);

-- 3. PQRS (tabla nueva autorizada explícitamente, tercera excepción a "sin tablas
-- nuevas" después de empleados y quote_historial): peticiones/quejas/reclamos/
-- sugerencias enviadas desde la página principal, respondidas por la administradora.
create table if not exists pqrs (
    id uuid primary key default gen_random_uuid(),
    nombre text not null,
    correo text not null,
    telefono text,
    mensaje text not null,
    respuesta text,
    respondido_en timestamptz,
    respondido_por uuid references profiles(id),
    creado_en timestamptz not null default now()
);

alter table pqrs enable row level security;

do $$ begin
    create policy pqrs_admin_all on pqrs for all to authenticated
        using (is_admin()) with check (is_admin());
exception
    when duplicate_object then null;
end $$;

-- Nota: antes de aplicar las dos líneas de abajo hay que respaldar nombre/correo de
-- las cuentas existentes (ver apps/server/src/scripts/seed-usuarios.ts, que ya los
-- escribe en profiles en cada corrida). En una base nueva, corre seed-usuarios.ts
-- antes de estas dos restricciones.
alter table profiles alter column nombre set not null;
alter table profiles alter column correo set not null;
