-- Evita tener que resolver profile_id -> nombre contra Supabase Auth en cada lectura
-- del historial (solo 3 cuentas posibles, se guarda el nombre tal como estaba al escribir).
alter table quote_historial add column if not exists profile_nombre text;
