-- Fase 3/4: contratos (generado bajo demanda + firmado subido por la administradora).

create table if not exists contratos (
    id uuid primary key default gen_random_uuid(),
    cotizacion_id uuid not null unique references cotizaciones(id) on delete cascade,
    enviado_en timestamptz,
    enviado_por uuid references usuarios(id),
    pdf_firmado_nombre text,
    firmado_subido_en timestamptz,
    firmado_subido_por uuid references usuarios(id)
);
