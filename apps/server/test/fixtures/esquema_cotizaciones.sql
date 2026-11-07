-- Esquema mínimo de la base real (Supabase) para probar las cotizaciones: mismas tablas,
-- restricciones y triggers que producción ANTES de la migración 20261101120000 (las tres
-- columnas cliente_* de quote las agrega esa migración, que las pruebas aplican tal cual).
-- Se carga en un Postgres embebido (PGlite): nunca toca la base real.

CREATE TABLE users (
    id        BIGSERIAL PRIMARY KEY,
    email     VARCHAR(150) NOT NULL UNIQUE,
    name      VARCHAR(100) NOT NULL,
    phone     VARCHAR(30),
    documento TEXT
);

CREATE TABLE venue (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city TEXT
);

CREATE TABLE transportation (
    id    BIGSERIAL PRIMARY KEY,
    city  VARCHAR(100) NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE inventory (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(100) NOT NULL,
    type             VARCHAR(50) NOT NULL,
    control_type     TEXT NOT NULL DEFAULT 'select',
    visible_publico  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE inventory_variants (
    id                   BIGSERIAL PRIMARY KEY,
    inventory_id         BIGINT NOT NULL REFERENCES inventory (id) ON DELETE CASCADE,
    simple_description   TEXT,
    detailed_description TEXT,
    image_url            VARCHAR(255),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "PriceVariants" (
    id         BIGSERIAL PRIMARY KEY,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    price      NUMERIC NOT NULL,
    quantity   BIGINT NOT NULL,
    id_variant BIGINT NOT NULL REFERENCES inventory_variants (id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE quote (
    id                     BIGSERIAL PRIMARY KEY,
    total                  NUMERIC(10, 2) NOT NULL DEFAULT 0 CONSTRAINT quote_total_check CHECK (total >= 0),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    estado                 TEXT NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida', 'en_revision', 'finalizada', 'cancelada')),
    client_id              BIGINT REFERENCES users (id),
    event_type             VARCHAR,
    venue_id               BIGINT REFERENCES venue (id),
    transportation_id      BIGINT REFERENCES transportation (id),
    date                   DATE,
    venue_nombre_manual    TEXT,
    address                TEXT,
    hour                   TIME,
    venue_direccion_manual TEXT
);

CREATE TABLE quote_items (
    quote_id   BIGINT NOT NULL REFERENCES quote (id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES inventory_variants (id) ON DELETE CASCADE,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    nota       TEXT,
    PRIMARY KEY (quote_id, variant_id)
);

CREATE TABLE events (
    id                           BIGSERIAL PRIMARY KEY,
    quote_id                     BIGINT NOT NULL UNIQUE REFERENCES quote (id) ON DELETE CASCADE,
    confirmed                    BOOLEAN NOT NULL DEFAULT FALSE,
    initial_payment              BOOLEAN NOT NULL DEFAULT FALSE,
    total_paid                   NUMERIC NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    contrato_enviado_en          TIMESTAMPTZ,
    contrato_enviado_por         UUID,
    contrato_firmado_nombre      TEXT,
    contrato_firmado_subido_en   TIMESTAMPTZ,
    contrato_firmado_subido_por  UUID,
    venue_id                     BIGINT REFERENCES venue (id),
    transportation_id            BIGINT REFERENCES transportation (id),
    event_type                   VARCHAR,
    address                      VARCHAR(255),
    date                         DATE,
    hour                         TIME,
    client_id                    BIGINT REFERENCES users (id),
    venue_nombre_manual          TEXT,
    venue_direccion_manual       TEXT
);

CREATE TABLE quote_historial (
    id              BIGSERIAL PRIMARY KEY,
    quote_id        BIGINT NOT NULL REFERENCES quote (id) ON DELETE CASCADE,
    profile_id      UUID,
    profile_nombre  TEXT,
    tipo            TEXT NOT NULL,
    comentario      TEXT,
    items_antes     JSONB,
    items_despues   JSONB,
    estado_antes    TEXT,
    estado_despues  TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers reales de producción
CREATE OR REPLACE FUNCTION set_created_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.created_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION update_total_quote() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_quantity INTEGER;
    v_variant_id BIGINT;
    v_quote_id BIGINT;
    v_sign INTEGER;
    v_precio_tramo_exacto NUMERIC(10, 2);
    v_precio_base NUMERIC(10, 2);
    v_delta NUMERIC(10, 2);
BEGIN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE') THEN
      v_quantity := NEW.quantity;
      v_variant_id := NEW.variant_id;
      v_quote_id := NEW.quote_id;
      v_sign := 1;
    ELSE
      v_quantity := OLD.quantity;
      v_variant_id := OLD.variant_id;
      v_quote_id := OLD.quote_id;
      v_sign := -1;
    END IF;

    SELECT price INTO v_precio_tramo_exacto
      FROM "PriceVariants"
      WHERE id_variant = v_variant_id AND quantity = v_quantity;

    IF v_precio_tramo_exacto IS NOT NULL THEN
        v_delta := v_precio_tramo_exacto;
    ELSE
        SELECT price INTO v_precio_base
          FROM "PriceVariants"
          WHERE id_variant = v_variant_id AND quantity = 1;
        v_delta := coalesce(v_precio_base, 0) * v_quantity;
    END IF;

    UPDATE quote SET total = total + (v_sign * v_delta) WHERE id = v_quote_id;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_created_at BEFORE INSERT ON quote FOR EACH ROW EXECUTE FUNCTION set_created_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quote FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER update_total_quote AFTER INSERT OR DELETE OR UPDATE ON quote_items FOR EACH ROW EXECUTE FUNCTION update_total_quote();

-- Elementos adicionales (migración 20261107120000, sin RLS ni comentarios: la prueba no tiene roles de Supabase)
CREATE TABLE IF NOT EXISTS public.quote_extra_items (
    id            BIGSERIAL      PRIMARY KEY,
    quote_id      BIGINT         NOT NULL REFERENCES public.quote (id) ON DELETE CASCADE,
    tag           VARCHAR(100)   NOT NULL DEFAULT 'ELEMENTO ADICIONAL',
    name          VARCHAR(150)   NOT NULL,
    description   TEXT,
    quantity      INT            NOT NULL CHECK (quantity > 0),
    unit_price    NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    supplier      VARCHAR(150),
    supplier_cost NUMERIC(10, 2) CHECK (supplier_cost >= 0),
    nota          TEXT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS quote_extra_items_quote_id_idx ON public.quote_extra_items (quote_id);

-- Total de la cotización: suma lo que se cobra por cada elemento adicional al insertarlo, resta al
-- borrarlo y ajusta la diferencia al editarlo.
CREATE OR REPLACE FUNCTION public.update_total_quote_extra() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_delta NUMERIC(10, 2);
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.quote SET total = total + (NEW.quantity * NEW.unit_price) WHERE id = NEW.quote_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.quote SET total = total - (OLD.quantity * OLD.unit_price) WHERE id = OLD.quote_id;
        RETURN OLD;
    END IF;

    -- UPDATE: la cotización no cambia de dueño (quote_id), solo cantidad o precio.
    v_delta := (NEW.quantity * NEW.unit_price) - (OLD.quantity * OLD.unit_price);
    UPDATE public.quote SET total = total + v_delta WHERE id = NEW.quote_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_total_quote_extra ON public.quote_extra_items;
CREATE TRIGGER update_total_quote_extra
    AFTER INSERT OR DELETE OR UPDATE ON public.quote_extra_items
    FOR EACH ROW EXECUTE FUNCTION public.update_total_quote_extra();

-- PQRS (supabase/migrations/0008_perfiles_ciudades_pqrs.sql, sin RLS ni la referencia a profiles)
CREATE TABLE IF NOT EXISTS pqrs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         TEXT NOT NULL,
    correo         TEXT NOT NULL,
    telefono       TEXT,
    mensaje        TEXT NOT NULL,
    respuesta      TEXT,
    respondido_en  TIMESTAMPTZ,
    respondido_por UUID,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nómina (supabase/migrations/0009_recrear_empleados_3_categorias.sql)
CREATE TABLE IF NOT EXISTS empleados (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         TEXT NOT NULL,
    documento      TEXT,
    telefono       TEXT,
    salario        NUMERIC,
    numero_cuenta  TEXT,
    banco          TEXT,
    tipo_contrato  TEXT NOT NULL CHECK (tipo_contrato IN ('con_contrato', 'freelance_fijo', 'freelance_no_fijo')),
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cuentas de acceso (esquema.sql + supabase/migrations/0008: perfiles con nombre y correo; sin la referencia a auth.users)
CREATE TABLE IF NOT EXISTS role (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS profiles (
    id                    UUID    PRIMARY KEY,
    role_id               INTEGER REFERENCES role (id),
    debe_cambiar_password BOOLEAN NOT NULL DEFAULT TRUE,
    nombre                TEXT    NOT NULL,
    correo                TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS unavailability_users (
    id      BIGSERIAL PRIMARY KEY,
    id_user UUID      NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    date    DATE      NOT NULL
);
