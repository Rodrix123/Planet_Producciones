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
    total                  NUMERIC NOT NULL DEFAULT 0 CONSTRAINT quote_total_check CHECK (total >= 0),
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
