-- Esquema inicial - Planet Producciones
-- Los triggers y funciones almacenadas se crean directamente en el servidor.

-- ============================================================
-- COMPONENTES: piezas/materiales individuales que conforman un equipo
-- (ej. patas, tela, herrajes). Se relacionan con "inventory" mediante
-- inventory_components (la tabla "Componentes de Equipos" del diagrama).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.components (
    id          BIGSERIAL      PRIMARY KEY,
    name        VARCHAR(100)   NOT NULL,
    description TEXT,
    price       NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.venue (
    id   BIGSERIAL    PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vehicles (
    id    BIGSERIAL    PRIMARY KEY,
    plate VARCHAR(20)  NOT NULL UNIQUE,
    type  VARCHAR(50)  NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role (
    id          BIGSERIAL    PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT
);

-- "Equipos" del diagrama: categoría general del equipo (ej. "Silla").
CREATE TABLE IF NOT EXISTS public.inventory (
    id   BIGSERIAL    PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50)  NOT NULL
);

-- "Componentes de Equipos" del diagrama: de qué componentes está hecho cada equipo.
CREATE TABLE IF NOT EXISTS public.inventory_components (
    component_id BIGINT NOT NULL REFERENCES public.components (id) ON DELETE CASCADE,
    inventory_id BIGINT NOT NULL REFERENCES public.inventory (id) ON DELETE CASCADE,
    PRIMARY KEY (component_id, inventory_id)
);

CREATE TABLE IF NOT EXISTS public.users (
    id    BIGSERIAL    PRIMARY KEY,
    email VARCHAR(150) NOT NULL UNIQUE,
    name  VARCHAR(100) NOT NULL,
    phone VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS public.transportation (
    id    BIGSERIAL      PRIMARY KEY,
    city  VARCHAR(100)   NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0)
);

-- "Variante Equipos" del diagrama: variante concreta de un equipo (ej. "Silla blanca plástica").
CREATE TABLE IF NOT EXISTS public.inventory_variants (
    id                    BIGSERIAL      PRIMARY KEY,
    inventory_id          BIGINT         NOT NULL REFERENCES public.inventory (id) ON DELETE CASCADE,
    simple_description    TEXT,
    detailed_description  TEXT,
    price                 NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    image_url             VARCHAR(255),
    created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- "Inventario" del diagrama: unidad física individual de una variante (con estado y código de barras).
CREATE TABLE IF NOT EXISTS public.stock (
    id                   BIGSERIAL     PRIMARY KEY,
    id_inventory_variant BIGINT        NOT NULL REFERENCES public.inventory_variants (id) ON DELETE CASCADE,
    state                TEXT          NOT NULL DEFAULT 'bueno'
                CHECK (state IN ('bueno','danado','en_reparacion','dado_de_baja','perdido')),
    state_description    TEXT,
    barcode              VARCHAR(100)  UNIQUE,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Cotizaciones y items de cotización
CREATE TABLE IF NOT EXISTS public.quote (
    id         BIGSERIAL      PRIMARY KEY,
    total      NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- "Cotizacion Inventario" del diagrama: la cotización se hace por VARIANTE (id_variante), no por
-- categoría general de equipo, porque el precio vive en inventory_variants, no en inventory.
CREATE TABLE IF NOT EXISTS public.quote_items (
    quote_id   BIGINT NOT NULL REFERENCES public.quote (id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES public.inventory_variants (id) ON DELETE CASCADE,
    quantity   INT    NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (quote_id, variant_id)
);

-- Cualquier usuario autenticado (staff/administración). El correo y la contraseña los maneja
-- Supabase Auth (auth.users); esta tabla guarda solo los datos adicionales, con el mismo id.
CREATE TABLE IF NOT EXISTS public.profiles (
    id      UUID    PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    role_id INTEGER REFERENCES public.role (id)
);

CREATE TABLE IF NOT EXISTS public.events (
    id                BIGSERIAL      PRIMARY KEY,
    quote_id          BIGINT         NOT NULL UNIQUE REFERENCES public.quote (id) ON DELETE CASCADE,
    venue_id          BIGINT         REFERENCES public.venue (id) ON DELETE SET NULL,
    transportation_id BIGINT         REFERENCES public.transportation (id) ON DELETE SET NULL,
    event_type        VARCHAR(100),
    address           VARCHAR(255),
    date              DATE           NOT NULL,
    hour              TIME           NOT NULL,
    confirmed         BOOLEAN        NOT NULL DEFAULT FALSE,
    initial_payment   BOOLEAN        NOT NULL DEFAULT FALSE,
    client_id         BIGINT         REFERENCES public.users (id) ON DELETE SET NULL,
    total_paid        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_paid >= 0),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id                BIGSERIAL      PRIMARY KEY,
    payment_method    TEXT           NOT NULL DEFAULT 'efectivo'
                CHECK (payment_method IN ('efectivo','transferencia')),
    payment_reference VARCHAR(150),
    amount            NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    event_id          BIGINT         NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
    receipt_url       VARCHAR(255),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- "empleados eventos" del diagrama.
CREATE TABLE IF NOT EXISTS public.event_staff (
    event_id   BIGINT NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
    profile_id UUID   NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, profile_id)
);

-- "Indisponibilidad" del diagrama.
CREATE TABLE IF NOT EXISTS public.unavailability_users (
    id      BIGSERIAL PRIMARY KEY,
    id_user UUID      NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    date    DATE      NOT NULL
);

CREATE TABLE IF NOT EXISTS public.unavailability_inventory (
    id                   BIGSERIAL PRIMARY KEY,
    id_inventory_variant BIGINT    NOT NULL REFERENCES public.inventory_variants (id) ON DELETE CASCADE,
    date                 DATE      NOT NULL
);

CREATE TABLE IF NOT EXISTS public.package (
    id      BIGSERIAL    PRIMARY KEY,
    barcode VARCHAR(100) UNIQUE
);

-- Junction "Paquete" del diagrama: la PLANTILLA del paquete (qué variante y cuántas unidades
-- debe llevar). No amarra unidades físicas fijas: el mismo paquete se reutiliza en distintos
-- envíos y en cada uno se le puede asignar stock físico distinto (ver dispatch_stock_items).
-- Esto agrupa elementos pequeños de identificación única para que se manejen como un solo bulto.
CREATE TABLE IF NOT EXISTS public.package_items (
    package_id BIGINT NOT NULL REFERENCES public.package (id) ON DELETE CASCADE,
    variant_id BIGINT NOT NULL REFERENCES public.inventory_variants (id) ON DELETE CASCADE,
    quantity   INT    NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (package_id, variant_id)
);


CREATE TABLE IF NOT EXISTS public.dispatch (
    id              BIGSERIAL PRIMARY KEY,
    vehicle_id      BIGINT    NOT NULL REFERENCES public.vehicles (id) ON DELETE CASCADE,
    event_id        BIGINT    NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
    user_id         UUID      NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    programmed_date DATE      NOT NULL,
    date_dispatched DATE,
    state           TEXT      NOT NULL DEFAULT 'programado'
                CHECK (state IN ('programado','en_transito','entregado','cancelado'))
);

CREATE TABLE IF NOT EXISTS public.dispatch_audit (
    id          BIGSERIAL   PRIMARY KEY,
    dispatch_id BIGINT      NOT NULL REFERENCES public.dispatch (id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    action      TEXT        NOT NULL CHECK (action IN ('programado','en_transito','entregado','cancelado')),
    action_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes       TEXT
);

-- "Inventario-envio" del diagrama: qué paquetes va cada despacho y si ya se registraron.
CREATE TABLE IF NOT EXISTS public.dispatch_items (
    dispatch_id BIGINT  NOT NULL REFERENCES public.dispatch (id) ON DELETE CASCADE,
    package_id  BIGINT  NOT NULL REFERENCES public.package (id) ON DELETE CASCADE,
    registered  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (dispatch_id, package_id)
);

-- Qué unidades físicas concretas (stock, con su código de barras único) se usaron realmente
-- para cumplir cada paquete en un envío específico. package_items es solo la receta
-- (variante + cantidad); aquí se registra qué elemento único se asignó cada vez, porque
-- puede cambiar de un envío a otro.
CREATE TABLE IF NOT EXISTS public.dispatch_stock_items (
    dispatch_id BIGINT NOT NULL,
    package_id  BIGINT NOT NULL,
    stock_id    BIGINT NOT NULL REFERENCES public.stock (id) ON DELETE CASCADE,
    PRIMARY KEY (dispatch_id, package_id, stock_id),
    FOREIGN KEY (dispatch_id, package_id)
        REFERENCES public.dispatch_items (dispatch_id, package_id) ON DELETE CASCADE
);
