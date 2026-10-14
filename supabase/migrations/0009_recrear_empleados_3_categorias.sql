-- La tabla `empleados` fue eliminada de la base compartida por un proceso externo a
-- esta rama (probablemente al correr localmente la rama inventario-niveles/CRUD-Log,
-- que no usa una tabla separada para esto). Se recrea aquí, ahora con 3 categorías de
-- contrato en vez de 2: con_contrato se mantiene igual; "sin_contrato" se divide en
-- freelance_fijo y freelance_no_fijo, siguiendo el pedido del usuario (inspirado en la
-- idea de la otra rama de distinguir freelancers fijos de los que no lo son).
create table if not exists empleados (
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

alter table empleados enable row level security;

do $$ begin
    create policy empleados_admin_all on empleados for all to authenticated
        using (is_admin()) with check (is_admin());
exception
    when duplicate_object then null;
end $$;
