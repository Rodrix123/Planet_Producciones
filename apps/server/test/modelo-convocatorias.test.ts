// Pruebas del modelo de datos de las convocatorias (Numeral 2).
//
// Ejecutan supabase/migrations/0010_disponibilidad_personal_whatsapp.sql sobre un Postgres
// embebido (PGlite) que reproduce las tablas reales de Supabase que la migración referencia
// (test/fixtures/esquema_base.sql). No necesitan Docker, internet ni credenciales, y nunca
// tocan la base real.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const RAIZ_REPO = path.resolve(__dirname, '..', '..', '..');
const SQL_MIGRACION = fs.readFileSync(
    path.join(RAIZ_REPO, 'supabase', 'migrations', '0010_disponibilidad_personal_whatsapp.sql'),
    'utf8'
);
const SQL_ESQUEMA_BASE = fs.readFileSync(path.join(__dirname, 'fixtures', 'esquema_base.sql'), 'utf8');

const TABLAS_NUEVAS = ['convocatoria_destinatarios', 'convocatorias', 'mensajes_whatsapp_entrantes'];
const TELEFONO_LAURA = '+12025550101'; // números ficticios (555-01xx está reservado para ficción)
const TELEFONO_PEDRO = '+12025550102';

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

/** Sin directorio, la base vive en memoria; con directorio, en disco (para probar el reinicio). */
async function crearBase(dataDir?: string): Promise<PGlite> {
    return dataDir ? PGlite.create(dataDir) : PGlite.create();
}

async function baseConEsquema(): Promise<PGlite> {
    const db = await crearBase();
    await db.exec(SQL_ESQUEMA_BASE);
    return db;
}

async function baseConMigracion(): Promise<PGlite> {
    const db = await baseConEsquema();
    await db.exec(SQL_MIGRACION);
    return db;
}

/** Ejecuta una consulta que debe devolver exactamente una fila. */
async function uno<T>(db: PGlite, sql: string, params: unknown[] = []): Promise<T> {
    const resultado = await db.query<T>(sql, params);
    assert.equal(resultado.rows.length, 1, `Se esperaba 1 fila de: ${sql}`);
    return resultado.rows[0] as T;
}

/** Comprueba que una sentencia falla con el código SQLSTATE (y la restricción) indicados. */
async function debeFallar(
    db: PGlite,
    esperado: { code: string; constraint?: string },
    sql: string,
    params: unknown[] = []
): Promise<void> {
    await db.exec('savepoint antes_del_error');
    await assert.rejects(db.query(sql, params), (error: unknown) => {
        const { code, constraint } = error as { code?: string; constraint?: string };
        assert.equal(code, esperado.code, `SQLSTATE inesperado en: ${sql}`);
        if (esperado.constraint) assert.equal(constraint, esperado.constraint);
        return true;
    });
    await db.exec('rollback to savepoint antes_del_error');
}

async function crearEvento(db: PGlite): Promise<number> {
    const cotizacion = await uno<{ id: number }>(
        db,
        `insert into public.quote (hour, date, event_type)
         values ('15:00', current_date + 30, 'Celebración empresarial') returning id`
    );
    const evento = await uno<{ id: number }>(
        db,
        'insert into public.events (quote_id, confirmed) values ($1, true) returning id',
        [cotizacion.id]
    );
    return evento.id;
}

async function crearEmpleado(db: PGlite, nombre: string): Promise<string> {
    const empleado = await uno<{ id: string }>(
        db,
        `insert into public.empleados (nombre, telefono, tipo_contrato, es_logistica)
         values ($1, '202 555 0101', 'freelance_fijo', true) returning id`,
        [nombre]
    );
    return empleado.id;
}

async function crearConvocatoria(db: PGlite, eventId: number): Promise<string> {
    const convocatoria = await uno<{ id: string }>(
        db,
        `insert into public.convocatorias (event_id, nombre_evento, fecha_evento, hora_inicio, hora_fin, lugar)
         values ($1, 'Celebración empresarial', '2026-10-24', '15:00', '23:00', 'Manizales') returning id`,
        [eventId]
    );
    return convocatoria.id;
}

async function convocar(
    db: PGlite,
    convocatoriaId: string,
    empleadoId: string,
    nombre: string,
    telefono: string
): Promise<string> {
    const destinatario = await uno<{ id: string }>(
        db,
        `insert into public.convocatoria_destinatarios (convocatoria_id, empleado_id, nombre_trabajador, telefono)
         values ($1, $2, $3, $4) returning id`,
        [convocatoriaId, empleadoId, nombre, telefono]
    );
    return destinatario.id;
}

async function responder(
    db: PGlite,
    destinatarioId: string,
    respuesta: 'CONFIRMADO' | 'RECHAZADO'
): Promise<void> {
    await db.query(
        'update public.convocatoria_destinatarios set estado_respuesta = $2, respondido_en = now() where id = $1',
        [destinatarioId, respuesta]
    );
}

/** Foto del esquema creado por la migración, para comparar antes y después. */
async function firmaDelEsquema(db: PGlite): Promise<string[]> {
    // regclass::text omite "public." porque public está en el search_path: se compara por nombre simple
    const resultado = await db.query<{ elemento: string }>(
        `select 'restriccion ' || conrelid::regclass::text || '.' || conname as elemento
           from pg_constraint
          where conrelid::regclass::text = any($1::text[])
         union all
         select 'indice ' || indexname from pg_indexes
          where schemaname = 'public' and tablename::text = any($1::text[])
         union all
         select 'trigger ' || tgname from pg_trigger
          where not tgisinternal and tgrelid::regclass::text = any($1::text[])
         union all
         select 'politica ' || policyname from pg_policies
          where schemaname = 'public' and tablename::text = any($1::text[])
         order by 1`,
        [TABLAS_NUEVAS]
    );
    return resultado.rows.map((fila) => fila.elemento);
}

// ---------------------------------------------------------------------------------------------
// 1) La migración en sí
// ---------------------------------------------------------------------------------------------

describe('Migración 0010', () => {
    it('crea las tres tablas y la columna empleados.es_logistica', async () => {
        const db = await baseConMigracion();
        try {
            const tablas = await db.query<{ table_name: string }>(
                `select table_name from information_schema.tables
                  where table_schema = 'public' and table_name::text = any($1::text[]) order by 1`,
                [TABLAS_NUEVAS]
            );
            assert.deepEqual(tablas.rows.map((fila) => fila.table_name), TABLAS_NUEVAS);

            const columna = await uno<{ data_type: string; is_nullable: string; column_default: string }>(
                db,
                `select data_type, is_nullable, column_default from information_schema.columns
                  where table_schema = 'public' and table_name = 'empleados' and column_name = 'es_logistica'`
            );
            assert.deepEqual(columna, { data_type: 'boolean', is_nullable: 'NO', column_default: 'false' });
        } finally {
            await db.close();
        }
    });

    it('no altera los empleados que ya existen: quedan con es_logistica = false', async () => {
        const db = await baseConEsquema();
        try {
            await db.query(
                `insert into public.empleados (nombre, documento, telefono, salario, tipo_contrato)
                 values ('Pedro Gómez', 'DOC-DE-PRUEBA', '202 555 0199', 1800000, 'con_contrato')`
            );
            await db.exec(SQL_MIGRACION);

            const empleado = await uno<Record<string, unknown>>(
                db,
                `select nombre, documento, telefono, salario::text as salario, tipo_contrato, activo, es_logistica
                   from public.empleados`
            );
            assert.deepEqual(empleado, {
                nombre: 'Pedro Gómez',
                documento: 'DOC-DE-PRUEBA',
                telefono: '202 555 0199',
                salario: '1800000',
                tipo_contrato: 'con_contrato',
                activo: true,
                es_logistica: false
            });
        } finally {
            await db.close();
        }
    });

    it('es idempotente: ejecutarla otra vez no falla ni duplica nada', async () => {
        const db = await baseConMigracion();
        try {
            const antes = await firmaDelEsquema(db);
            assert.ok(antes.length > 20, 'la firma del esquema debería tener restricciones, índices, triggers y políticas');

            await db.exec(SQL_MIGRACION);
            await db.exec(SQL_MIGRACION);

            assert.deepEqual(await firmaDelEsquema(db), antes);
        } finally {
            await db.close();
        }
    });

    it('el bloque ROLLBACK del archivo la revierte por completo y se puede volver a aplicar', async () => {
        const db = await baseConEsquema();
        try {
            await db.query(
                "insert into public.empleados (nombre, tipo_contrato) values ('Laura', 'freelance_fijo')"
            );
            await db.exec(SQL_MIGRACION);

            const inicio = SQL_MIGRACION.indexOf('-- ROLLBACK');
            assert.notEqual(inicio, -1, 'el archivo debe traer un bloque ROLLBACK');
            const rollback = SQL_MIGRACION.slice(inicio)
                .split('\n')
                .filter((linea) => /^-- (drop|alter) /i.test(linea))
                .map((linea) => linea.slice(3))
                .join('\n');
            assert.equal(rollback.split('\n').length, 5, 'el ROLLBACK debe tener las 5 sentencias documentadas');
            await db.exec(rollback);

            const restos = await db.query(
                `select 1 from pg_class where relnamespace = 'public'::regnamespace and relname::text = any($1::text[])
                 union all select 1 from pg_proc where proname = 'convocatorias_set_actualizado_en'
                 union all select 1 from information_schema.columns
                            where table_name = 'empleados' and column_name = 'es_logistica'`,
                [TABLAS_NUEVAS]
            );
            assert.equal(restos.rows.length, 0, 'no debe quedar ninguna tabla, función ni columna de la migración');

            const empleado = await uno<{ nombre: string }>(db, 'select nombre from public.empleados');
            assert.equal(empleado.nombre, 'Laura', 'el rollback no debe tocar los empleados existentes');

            await db.exec(SQL_MIGRACION);
            assert.ok((await firmaDelEsquema(db)).length > 20);
        } finally {
            await db.close();
        }
    });

    it('si la base no tiene public.is_admin(), no falla: deja RLS activo y sin políticas', async () => {
        const db = await baseConEsquema();
        try {
            await db.exec('drop function public.is_admin()');
            await db.exec(SQL_MIGRACION);

            const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
                `select relname, relrowsecurity from pg_class
                  where relnamespace = 'public'::regnamespace and relname::text = any($1::text[]) order by 1`,
                [TABLAS_NUEVAS]
            );
            assert.deepEqual(
                rls.rows,
                TABLAS_NUEVAS.map((relname) => ({ relname, relrowsecurity: true }))
            );
            const politicas = await db.query('select 1 from pg_policies where tablename::text = any($1::text[])', [TABLAS_NUEVAS]);
            assert.equal(politicas.rows.length, 0);
        } finally {
            await db.close();
        }
    });
});

// ---------------------------------------------------------------------------------------------
// 2) Persistencia y reglas del modelo (cada prueba corre dentro de una transacción que se revierte)
// ---------------------------------------------------------------------------------------------

describe('Modelo de convocatorias', () => {
    let db: PGlite;

    before(async () => {
        db = await baseConMigracion();
    });
    after(async () => {
        await db.close();
    });
    beforeEach(async () => {
        await db.exec('begin');
    });
    afterEach(async () => {
        await db.exec('rollback');
    });

    describe('Convocatoria asociada a un evento', () => {
        it('se guarda con los datos que viajan en el mensaje y queda en BORRADOR', async () => {
            const eventId = await crearEvento(db);
            const id = await crearConvocatoria(db, eventId);

            const convocatoria = await uno<Record<string, unknown>>(
                db,
                `select event_id, estado, nombre_evento, fecha_evento::text as fecha_evento,
                        hora_inicio::text as hora_inicio, hora_fin::text as hora_fin, lugar,
                        envio_iniciado_en, creado_en is not null as tiene_creado_en
                   from public.convocatorias where id = $1`,
                [id]
            );
            assert.deepEqual(convocatoria, {
                event_id: eventId,
                estado: 'BORRADOR',
                nombre_evento: 'Celebración empresarial',
                fecha_evento: '2026-10-24',
                hora_inicio: '15:00:00',
                hora_fin: '23:00:00',
                lugar: 'Manizales',
                envio_iniciado_en: null,
                tiene_creado_en: true
            });
        });

        it('rechaza una convocatoria para un evento que no existe', async () => {
            await debeFallar(
                db,
                { code: '23503', constraint: 'convocatorias_event_id_fkey' },
                `insert into public.convocatorias (event_id, nombre_evento, fecha_evento, hora_inicio, hora_fin, lugar)
                 values (999999, 'Evento fantasma', '2026-10-24', '15:00', '23:00', 'Manizales')`
            );
        });

        it('exige los datos del mensaje: evento, lugar y horario completos', async () => {
            const eventId = await crearEvento(db);
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatorias_datos_completos' },
                `insert into public.convocatorias (event_id, nombre_evento, fecha_evento, hora_inicio, hora_fin, lugar)
                 values ($1, '   ', '2026-10-24', '15:00', '23:00', 'Manizales')`,
                [eventId]
            );
            await debeFallar(
                db,
                { code: '23502' },
                `insert into public.convocatorias (event_id, nombre_evento, fecha_evento, hora_inicio, lugar)
                 values ($1, 'Celebración', '2026-10-24', '15:00', 'Manizales')`,
                [eventId]
            );
        });

        it('valida los estados y que la fecha de inicio de envío sea coherente con el estado', async () => {
            const eventId = await crearEvento(db);
            const id = await crearConvocatoria(db, eventId);

            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatorias_estado_valido' },
                "update public.convocatorias set estado = 'FINALIZADA' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatorias_envio_coherente' },
                "update public.convocatorias set estado = 'ENVIANDO' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatorias_envio_coherente' },
                'update public.convocatorias set envio_iniciado_en = now() where id = $1',
                [id]
            );

            await db.query("update public.convocatorias set estado = 'ENVIANDO', envio_iniciado_en = now() where id = $1", [id]);
            await db.query("update public.convocatorias set estado = 'ENVIADA' where id = $1", [id]);
            const convocatoria = await uno<{ estado: string; envio_iniciado: boolean }>(
                db,
                'select estado, envio_iniciado_en is not null as envio_iniciado from public.convocatorias where id = $1',
                [id]
            );
            assert.deepEqual(convocatoria, { estado: 'ENVIADA', envio_iniciado: true });
        });
    });

    describe('Trabajadores de la convocatoria', () => {
        it('un trabajador recién convocado queda PENDIENTE de respuesta y sin enviar', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const laura = await crearEmpleado(db, 'Laura');
            const id = await convocar(db, convocatoriaId, laura, 'Laura', TELEFONO_LAURA);

            const destinatario = await uno<Record<string, unknown>>(
                db,
                `select nombre_trabajador, telefono, estado_respuesta, respondido_en, estado_envio,
                        wa_message_id, enviado_en, error_envio, intentos_envio
                   from public.convocatoria_destinatarios where id = $1`,
                [id]
            );
            assert.deepEqual(destinatario, {
                nombre_trabajador: 'Laura',
                telefono: TELEFONO_LAURA,
                estado_respuesta: 'PENDIENTE',
                respondido_en: null,
                estado_envio: 'PENDIENTE',
                wa_message_id: null,
                enviado_en: null,
                error_envio: null,
                intentos_envio: 0
            });
        });

        it('un trabajador no puede estar duplicado dentro de la misma convocatoria', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const laura = await crearEmpleado(db, 'Laura');
            await convocar(db, convocatoriaId, laura, 'Laura', TELEFONO_LAURA);

            await debeFallar(
                db,
                { code: '23505', constraint: 'convocatoria_destinatarios_trabajador_unico' },
                `insert into public.convocatoria_destinatarios (convocatoria_id, empleado_id, nombre_trabajador, telefono)
                 values ($1, $2, 'Laura', $3)`,
                [convocatoriaId, laura, TELEFONO_PEDRO]
            );
        });

        it('dos trabajadores no pueden compartir teléfono dentro de la misma convocatoria', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);

            await debeFallar(
                db,
                { code: '23505', constraint: 'convocatoria_destinatarios_telefono_unico' },
                `insert into public.convocatoria_destinatarios (convocatoria_id, empleado_id, nombre_trabajador, telefono)
                 values ($1, $2, 'Pedro', $3)`,
                [convocatoriaId, await crearEmpleado(db, 'Pedro'), TELEFONO_LAURA]
            );
        });

        it('el mismo trabajador puede participar en convocatorias de eventos diferentes', async () => {
            const laura = await crearEmpleado(db, 'Laura');
            const convocatoriaA = await crearConvocatoria(db, await crearEvento(db));
            const convocatoriaB = await crearConvocatoria(db, await crearEvento(db));

            await convocar(db, convocatoriaA, laura, 'Laura', TELEFONO_LAURA);
            await convocar(db, convocatoriaB, laura, 'Laura', TELEFONO_LAURA);

            const total = await uno<{ n: number }>(
                db,
                'select count(*)::int as n from public.convocatoria_destinatarios where empleado_id = $1',
                [laura]
            );
            assert.equal(total.n, 2);
        });
    });

    describe('Varias convocatorias para un mismo evento', () => {
        it('no mezclan las respuestas de cada una', async () => {
            const eventId = await crearEvento(db);
            const laura = await crearEmpleado(db, 'Laura');
            const pedro = await crearEmpleado(db, 'Pedro');
            const convocatoriaA = await crearConvocatoria(db, eventId);
            const convocatoriaB = await crearConvocatoria(db, eventId);
            assert.notEqual(convocatoriaA, convocatoriaB);

            const lauraEnA = await convocar(db, convocatoriaA, laura, 'Laura', TELEFONO_LAURA);
            const lauraEnB = await convocar(db, convocatoriaB, laura, 'Laura', TELEFONO_LAURA);
            await convocar(db, convocatoriaA, pedro, 'Pedro', TELEFONO_PEDRO);
            const pedroEnB = await convocar(db, convocatoriaB, pedro, 'Pedro', TELEFONO_PEDRO);

            await responder(db, lauraEnA, 'CONFIRMADO');
            await responder(db, lauraEnB, 'RECHAZADO');
            await responder(db, pedroEnB, 'CONFIRMADO');

            const resumen = await db.query<{ convocatoria_id: string; estado_respuesta: string; n: number }>(
                `select convocatoria_id, estado_respuesta, count(*)::int as n
                   from public.convocatoria_destinatarios
                  where convocatoria_id in ($1, $2)
                  group by 1, 2`,
                [convocatoriaA, convocatoriaB]
            );
            const contar = (convocatoria: string): Record<string, number> =>
                Object.fromEntries(
                    resumen.rows.filter((fila) => fila.convocatoria_id === convocatoria).map((fila) => [fila.estado_respuesta, fila.n])
                );
            assert.deepEqual(contar(convocatoriaA), { CONFIRMADO: 1, PENDIENTE: 1 });
            assert.deepEqual(contar(convocatoriaB), { RECHAZADO: 1, CONFIRMADO: 1 });

            // Laura confirmó en A y rechazó en B: cada fila conserva su propia respuesta
            const lauraA = await uno<{ estado_respuesta: string }>(
                db,
                'select estado_respuesta from public.convocatoria_destinatarios where id = $1',
                [lauraEnA]
            );
            assert.equal(lauraA.estado_respuesta, 'CONFIRMADO');
        });
    });

    describe('Estados de respuesta', () => {
        it('admite PENDIENTE, CONFIRMADO y RECHAZADO, y exige fecha de respuesta salvo en PENDIENTE', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const id = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);

            await responder(db, id, 'CONFIRMADO');
            await responder(db, id, 'RECHAZADO');
            const respondido = await uno<{ estado_respuesta: string; con_fecha: boolean }>(
                db,
                'select estado_respuesta, respondido_en is not null as con_fecha from public.convocatoria_destinatarios where id = $1',
                [id]
            );
            assert.deepEqual(respondido, { estado_respuesta: 'RECHAZADO', con_fecha: true });

            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_respuesta_valida' },
                "update public.convocatoria_destinatarios set estado_respuesta = 'TAL_VEZ', respondido_en = now() where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_respuesta_coherente' },
                'update public.convocatoria_destinatarios set respondido_en = null where id = $1',
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_respuesta_coherente' },
                "update public.convocatoria_destinatarios set estado_respuesta = 'PENDIENTE' where id = $1",
                [id]
            );
        });
    });

    describe('Información de envío por Meta', () => {
        it('guarda estado, id del mensaje de Meta, fecha de envío y errores', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const enviado = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);
            const fallido = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Pedro'), 'Pedro', TELEFONO_PEDRO);

            await db.query("update public.convocatoria_destinatarios set estado_envio = 'ENVIANDO', intentos_envio = 1 where id = $1", [enviado]);
            await db.query(
                `update public.convocatoria_destinatarios
                    set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-1', enviado_en = now()
                  where id = $1`,
                [enviado]
            );
            await db.query(
                `update public.convocatoria_destinatarios
                    set estado_envio = 'ERROR', error_envio = 'El número no está registrado en WhatsApp', intentos_envio = 2
                  where id = $1`,
                [fallido]
            );

            const filas = await db.query<Record<string, unknown>>(
                `select nombre_trabajador, estado_envio, wa_message_id, enviado_en is not null as con_fecha_envio,
                        error_envio, intentos_envio
                   from public.convocatoria_destinatarios where convocatoria_id = $1 order by nombre_trabajador`,
                [convocatoriaId]
            );
            assert.deepEqual(filas.rows, [
                { nombre_trabajador: 'Laura', estado_envio: 'ENVIADO', wa_message_id: 'wamid.SALIENTE-1', con_fecha_envio: true, error_envio: null, intentos_envio: 1 },
                { nombre_trabajador: 'Pedro', estado_envio: 'ERROR', wa_message_id: null, con_fecha_envio: false, error_envio: 'El número no está registrado en WhatsApp', intentos_envio: 2 }
            ]);
        });

        it('no deja marcar un envío como ENVIADO sin id de Meta y fecha, ni como ERROR sin motivo', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const id = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);

            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_envio_enviado_completo' },
                "update public.convocatoria_destinatarios set estado_envio = 'ENVIADO' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_envio_enviado_completo' },
                "update public.convocatoria_destinatarios set estado_envio = 'ENVIADO', wa_message_id = 'wamid.X' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_envio_error_completo' },
                "update public.convocatoria_destinatarios set estado_envio = 'ERROR' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_envio_error_completo' },
                "update public.convocatoria_destinatarios set estado_envio = 'ERROR', error_envio = '  ' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_envio_valido' },
                "update public.convocatoria_destinatarios set estado_envio = 'ENTREGADO' where id = $1",
                [id]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'convocatoria_destinatarios_intentos_validos' },
                'update public.convocatoria_destinatarios set intentos_envio = -1 where id = $1',
                [id]
            );
        });

        it('el id de mensaje de Meta no se puede asignar a dos trabajadores', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const laura = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);
            const pedro = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Pedro'), 'Pedro', TELEFONO_PEDRO);
            const enviar = `update public.convocatoria_destinatarios
                               set estado_envio = 'ENVIADO', wa_message_id = 'wamid.REPETIDO', enviado_en = now()
                             where id = $1`;

            await db.query(enviar, [laura]);
            await debeFallar(
                db,
                { code: '23505', constraint: 'convocatoria_destinatarios_wa_message_id_key' },
                enviar,
                [pedro]
            );
        });
    });

    describe('Teléfonos en formato internacional', () => {
        const insertarDestinatario = `insert into public.convocatoria_destinatarios (convocatoria_id, empleado_id, nombre_trabajador, telefono)
                                      values ($1, $2, 'Laura', $3)`;

        it('acepta números E.164 con "+" y código de país', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const validos = ['+573000000000', '+12025550101', '+14155552671', '+34612345678'];
            for (const telefono of validos) {
                await db.query(insertarDestinatario, [convocatoriaId, await crearEmpleado(db, 'Laura'), telefono]);
            }
            const total = await uno<{ n: number }>(db, 'select count(*)::int as n from public.convocatoria_destinatarios');
            assert.equal(total.n, validos.length);
        });

        it('rechaza números sin normalizar', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const sinNormalizar = [
                '2025550101', // sin código de país ni "+"
                '12025550101', // sin "+"
                '+1 202 555 0101', // con espacios
                '+1-202-555-0101', // con guiones
                '+02025550101', // el código de país no empieza en 0
                '+120255', // demasiado corto
                '+120255501019999999', // más de 15 dígitos
                ' +12025550101', // espacio al inicio
                '+12025550101 ', // espacio al final
                'whatsapp:+12025550101',
                ''
            ];
            for (const telefono of sinNormalizar) {
                await debeFallar(
                    db,
                    { code: '23514', constraint: 'convocatoria_destinatarios_telefono_e164' },
                    insertarDestinatario,
                    [convocatoriaId, await crearEmpleado(db, 'Laura'), telefono]
                );
            }
        });

        it('la misma regla protege el teléfono del remitente de los mensajes entrantes', async () => {
            const insertar = `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en)
                              values ($1, $2, 'text', now())`;
            await db.query(insertar, ['wamid.ENTRANTE-OK', TELEFONO_LAURA]);
            await debeFallar(
                db,
                { code: '23514', constraint: 'mensajes_whatsapp_entrantes_telefono_e164' },
                insertar,
                ['wamid.ENTRANTE-MAL', '12025550101']
            );
        });
    });

    describe('Mensajes entrantes de WhatsApp', () => {
        it('registra una sola vez cada mensaje de Meta (evita procesar duplicados)', async () => {
            const insertar = `insert into public.mensajes_whatsapp_entrantes
                                  (wa_message_id, telefono_remitente, tipo, contenido, payload, recibido_en)
                              values ($1, $2, 'button', 'Sí, puedo asistir', 'PAYLOAD_DE_PRUEBA', now())
                              on conflict (wa_message_id) do nothing returning id`;

            const primero = await db.query(insertar, ['wamid.ENTRANTE-1', TELEFONO_LAURA]);
            const repetido = await db.query(insertar, ['wamid.ENTRANTE-1', TELEFONO_LAURA]);
            assert.equal(primero.rows.length, 1, 'la primera vez se registra');
            assert.equal(repetido.rows.length, 0, 'la segunda vez se detecta como duplicado');

            const total = await uno<{ n: number }>(db, 'select count(*)::int as n from public.mensajes_whatsapp_entrantes');
            assert.equal(total.n, 1);

            await debeFallar(
                db,
                { code: '23505', constraint: 'mensajes_whatsapp_entrantes_wa_message_id_key' },
                insertar.replace('on conflict (wa_message_id) do nothing returning id', ''),
                ['wamid.ENTRANTE-1', TELEFONO_LAURA]
            );
        });

        it('conserva el historial: cuándo y a qué mensaje respondió, aunque cambie de respuesta', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const destinatarioId = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);
            await db.query(
                `update public.convocatoria_destinatarios
                    set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-LAURA', enviado_en = now()
                  where id = $1`,
                [destinatarioId]
            );

            const registrar = async (waMessageId: string, respuesta: 'CONFIRMADO' | 'RECHAZADO', recibidoEn: string) => {
                await db.query(
                    `insert into public.mensajes_whatsapp_entrantes
                         (wa_message_id, telefono_remitente, tipo, contenido, contexto_wa_message_id, recibido_en,
                          convocatoria_id, destinatario_id, respuesta, resultado)
                     values ($1, $2, 'button', $3, 'wamid.SALIENTE-LAURA', $4, $5, $6, $7, 'APLICADO')`,
                    [waMessageId, TELEFONO_LAURA, respuesta === 'CONFIRMADO' ? 'Sí, puedo asistir' : 'No puedo asistir', recibidoEn, convocatoriaId, destinatarioId, respuesta]
                );
                await db.query(
                    'update public.convocatoria_destinatarios set estado_respuesta = $2, respondido_en = $3 where id = $1',
                    [destinatarioId, respuesta, recibidoEn]
                );
            };
            await registrar('wamid.ENTRANTE-A', 'CONFIRMADO', '2026-10-13T14:00:00Z');
            await registrar('wamid.ENTRANTE-B', 'RECHAZADO', '2026-10-13T16:30:00Z');

            const actual = await uno<{ estado_respuesta: string }>(
                db,
                'select estado_respuesta from public.convocatoria_destinatarios where id = $1',
                [destinatarioId]
            );
            assert.equal(actual.estado_respuesta, 'RECHAZADO', 'el destinatario guarda la última respuesta');

            const historial = await db.query<Record<string, unknown>>(
                `select m.respuesta, to_char(m.recibido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as recibido_en,
                        m.contexto_wa_message_id = d.wa_message_id as responde_al_mensaje_enviado
                   from public.mensajes_whatsapp_entrantes m
                   join public.convocatoria_destinatarios d on d.id = m.destinatario_id
                  where m.destinatario_id = $1 order by m.recibido_en`,
                [destinatarioId]
            );
            assert.deepEqual(historial.rows, [
                { respuesta: 'CONFIRMADO', recibido_en: '2026-10-13T14:00', responde_al_mensaje_enviado: true },
                { respuesta: 'RECHAZADO', recibido_en: '2026-10-13T16:30', responde_al_mensaje_enviado: true }
            ]);
        });

        it('registra los mensajes que no se pueden asociar con seguridad a una convocatoria', async () => {
            await db.query(
                `insert into public.mensajes_whatsapp_entrantes
                     (wa_message_id, telefono_remitente, tipo, contenido, recibido_en, resultado, detalle, payload_crudo)
                 values ('wamid.DESCONOCIDO', '+12025550103', 'text', 'Hola, ¿quién es?', now(), 'NO_ASOCIADO',
                         'El número no corresponde a ningún trabajador convocado', '{"messages":[{"type":"text"}]}'::jsonb)`
            );
            const mensaje = await uno<Record<string, unknown>>(
                db,
                `select convocatoria_id, destinatario_id, respuesta, resultado, detalle, payload_crudo->'messages'->0->>'type' as tipo_crudo
                   from public.mensajes_whatsapp_entrantes where wa_message_id = 'wamid.DESCONOCIDO'`
            );
            assert.deepEqual(mensaje, {
                convocatoria_id: null,
                destinatario_id: null,
                respuesta: null,
                resultado: 'NO_ASOCIADO',
                detalle: 'El número no corresponde a ningún trabajador convocado',
                tipo_crudo: 'text'
            });

            const insertar = `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en, respuesta, resultado)
                              values ($1, '+12025550103', 'text', now(), $2, $3)`;
            await debeFallar(db, { code: '23514', constraint: 'mensajes_whatsapp_entrantes_resultado_valido' }, insertar, ['wamid.R1', null, 'FALLIDO']);
            await debeFallar(db, { code: '23514', constraint: 'mensajes_whatsapp_entrantes_respuesta_valida' }, insertar, ['wamid.R2', 'TAL_VEZ', 'APLICADO']);
            await db.query(insertar, ['wamid.R3', null, null]); // recibido y aún sin procesar
        });
    });

    describe('Integridad al borrar', () => {
        it('borrar una convocatoria borra a sus destinatarios pero conserva la bitácora de mensajes', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const destinatarioId = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);
            await db.query(
                `insert into public.mensajes_whatsapp_entrantes
                     (wa_message_id, telefono_remitente, tipo, recibido_en, convocatoria_id, destinatario_id, respuesta, resultado)
                 values ('wamid.HISTORIAL', $1, 'button', now(), $2, $3, 'CONFIRMADO', 'APLICADO')`,
                [TELEFONO_LAURA, convocatoriaId, destinatarioId]
            );

            await db.query('delete from public.convocatorias where id = $1', [convocatoriaId]);

            const destinatarios = await uno<{ n: number }>(db, 'select count(*)::int as n from public.convocatoria_destinatarios');
            assert.equal(destinatarios.n, 0);
            const mensaje = await uno<{ convocatoria_id: string | null; destinatario_id: string | null; respuesta: string }>(
                db,
                "select convocatoria_id, destinatario_id, respuesta from public.mensajes_whatsapp_entrantes where wa_message_id = 'wamid.HISTORIAL'"
            );
            assert.deepEqual(mensaje, { convocatoria_id: null, destinatario_id: null, respuesta: 'CONFIRMADO' });
        });

        it('no deja borrar un trabajador ni un evento que ya tienen convocatorias (se protege el historial)', async () => {
            const eventId = await crearEvento(db);
            const laura = await crearEmpleado(db, 'Laura');
            const convocatoriaId = await crearConvocatoria(db, eventId);
            await convocar(db, convocatoriaId, laura, 'Laura', TELEFONO_LAURA);

            await debeFallar(
                db,
                { code: '23503', constraint: 'convocatoria_destinatarios_empleado_id_fkey' },
                'delete from public.empleados where id = $1',
                [laura]
            );
            await debeFallar(
                db,
                { code: '23503', constraint: 'convocatorias_event_id_fkey' },
                'delete from public.events where id = $1',
                [eventId]
            );
        });
    });

    describe('actualizado_en', () => {
        it('se renueva solo en cada UPDATE de convocatorias y de destinatarios', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            const destinatarioId = await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);
            // Cada UPDATE intenta dejar una fecha vieja: el trigger la reemplaza por la hora actual.
            // Sin el trigger, "actualizado_en" se quedaría en 2020.
            await db.query("update public.convocatorias set actualizado_en = '2020-01-01', lugar = 'Chinchiná' where id = $1", [convocatoriaId]);
            await db.query("update public.convocatoria_destinatarios set actualizado_en = '2020-01-01', intentos_envio = 1 where id = $1", [destinatarioId]);

            const renovado = await uno<{ convocatoria: boolean; destinatario: boolean }>(
                db,
                `select (select actualizado_en > '2020-01-02' from public.convocatorias where id = $1) as convocatoria,
                        (select actualizado_en > '2020-01-02' from public.convocatoria_destinatarios where id = $2) as destinatario`,
                [convocatoriaId, destinatarioId]
            );
            assert.deepEqual(renovado, { convocatoria: true, destinatario: true });
        });
    });

    describe('Seguridad (RLS)', () => {
        it('las tres tablas tienen RLS activo y una política que solo permite al administrador', async () => {
            const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
                `select relname, relrowsecurity from pg_class
                  where relnamespace = 'public'::regnamespace and relname::text = any($1::text[]) order by 1`,
                [TABLAS_NUEVAS]
            );
            assert.deepEqual(rls.rows, TABLAS_NUEVAS.map((relname) => ({ relname, relrowsecurity: true })));

            const politicas = await db.query<{ policyname: string; roles: string; cmd: string }>(
                `select policyname, roles::text as roles, cmd from pg_policies
                  where schemaname = 'public' and tablename::text = any($1::text[]) order by 1`,
                [TABLAS_NUEVAS]
            );
            assert.deepEqual(
                politicas.rows,
                TABLAS_NUEVAS.map((tabla) => ({ policyname: `${tabla}_admin_all`, roles: '{authenticated}', cmd: 'ALL' }))
            );
        });

        it('el visitante anónimo no accede; un usuario autenticado sin ser administrador no ve filas; el administrador sí', async () => {
            const convocatoriaId = await crearConvocatoria(db, await crearEvento(db));
            await convocar(db, convocatoriaId, await crearEmpleado(db, 'Laura'), 'Laura', TELEFONO_LAURA);
            const empleadoIntruso = await crearEmpleado(db, 'Intruso');

            const comoRol = async <T>(rol: string, esAdmin: boolean, accion: () => Promise<T>): Promise<T> => {
                await db.exec('savepoint cambio_de_rol');
                try {
                    await db.exec(`set local role ${rol}`);
                    await db.exec(`set local test.es_admin = '${esAdmin}'`);
                    return await accion();
                } finally {
                    await db.exec('rollback to savepoint cambio_de_rol');
                }
            };
            const contar = async (tabla: string): Promise<number> =>
                (await uno<{ n: number }>(db, `select count(*)::int as n from public.${tabla}`)).n;

            for (const tabla of TABLAS_NUEVAS) {
                await assert.rejects(
                    comoRol('anon', false, () => contar(tabla)),
                    (error: unknown) => (error as { code?: string }).code === '42501',
                    `anon no debe poder leer ${tabla}`
                );
            }
            assert.equal(await comoRol('authenticated', false, () => contar('convocatoria_destinatarios')), 0);
            assert.equal(await comoRol('authenticated', true, () => contar('convocatoria_destinatarios')), 1);
            assert.equal(await comoRol('authenticated', true, () => contar('convocatorias')), 1);

            // Escribir también está reservado al administrador
            const actualizar = async (): Promise<number> =>
                (await db.query('update public.convocatoria_destinatarios set intentos_envio = 5')).affectedRows ?? 0;
            assert.equal(await comoRol('authenticated', false, actualizar), 0, 'sin ser administrador el UPDATE no alcanza ninguna fila');
            assert.equal(await comoRol('authenticated', true, actualizar), 1, 'el administrador sí puede actualizar');

            await assert.rejects(
                comoRol('authenticated', false, () =>
                    db.query(
                        `insert into public.convocatoria_destinatarios (convocatoria_id, empleado_id, nombre_trabajador, telefono)
                         values ($1, $2, 'Intruso', '+12025550104')`,
                        [convocatoriaId, empleadoIntruso]
                    )),
                (error: unknown) => (error as { code?: string }).code === '42501',
                'un usuario que no es administrador no puede insertar'
            );
        });
    });
});

// ---------------------------------------------------------------------------------------------
// 3) Persistencia real en disco: cerrar y volver a abrir la base conserva los datos
// ---------------------------------------------------------------------------------------------

describe('Persistencia tras reiniciar', () => {
    let directorio: string;

    before(() => {
        directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'pglite-convocatorias-'));
    });
    after(() => {
        try {
            fs.rmSync(directorio, { recursive: true, force: true });
        } catch {
            // En Windows el sistema puede tardar en soltar los archivos; no es un fallo de la prueba.
        }
    });

    it('convocatoria, destinatarios y mensajes siguen ahí después de cerrar y reabrir la base', async () => {
        let base = await crearBase(directorio);
        let convocatoriaId: string;
        try {
            await base.exec(SQL_ESQUEMA_BASE);
            await base.exec(SQL_MIGRACION);
            convocatoriaId = await crearConvocatoria(base, await crearEvento(base));
            const lauraId = await convocar(base, convocatoriaId, await crearEmpleado(base, 'Laura'), 'Laura', TELEFONO_LAURA);
            await convocar(base, convocatoriaId, await crearEmpleado(base, 'Pedro'), 'Pedro', TELEFONO_PEDRO);
            await base.query(
                `update public.convocatoria_destinatarios
                    set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-LAURA', enviado_en = now()
                  where id = $1`,
                [lauraId]
            );
            await responder(base, lauraId, 'CONFIRMADO');
            await base.query(
                `insert into public.mensajes_whatsapp_entrantes
                     (wa_message_id, telefono_remitente, tipo, recibido_en, convocatoria_id, destinatario_id, respuesta, resultado)
                 values ('wamid.ENTRANTE-LAURA', $1, 'button', now(), $2, $3, 'CONFIRMADO', 'APLICADO')`,
                [TELEFONO_LAURA, convocatoriaId, lauraId]
            );
        } finally {
            await base.close();
        }

        base = await crearBase(directorio); // "reinicio": se abre de nuevo el mismo directorio de datos
        try {
            const respuestas = await base.query<{ nombre_trabajador: string; estado_respuesta: string; estado_envio: string }>(
                `select nombre_trabajador, estado_respuesta, estado_envio
                   from public.convocatoria_destinatarios where convocatoria_id = $1 order by nombre_trabajador`,
                [convocatoriaId]
            );
            assert.deepEqual(respuestas.rows, [
                { nombre_trabajador: 'Laura', estado_respuesta: 'CONFIRMADO', estado_envio: 'ENVIADO' },
                { nombre_trabajador: 'Pedro', estado_respuesta: 'PENDIENTE', estado_envio: 'PENDIENTE' }
            ]);

            // El mensaje ya registrado sigue marcando el duplicado después del reinicio
            const duplicado = await base.query(
                `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en)
                 values ('wamid.ENTRANTE-LAURA', $1, 'button', now())
                 on conflict (wa_message_id) do nothing returning id`,
                [TELEFONO_LAURA]
            );
            assert.equal(duplicado.rows.length, 0);
        } finally {
            await base.close();
        }
    });
});
