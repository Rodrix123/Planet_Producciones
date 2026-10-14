// Pruebas del modelo de datos de las convocatorias (Numeral 2).
//
// Ejecutan supabase/migrations/0010_disponibilidad_personal_whatsapp.sql sobre un Postgres
// embebido (PGlite) que reproduce las tablas reales de Supabase que la migración usa
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
// La primera versión de la migración (3 tablas nuevas), tal como se ejecutó en Supabase
const SQL_VERSION_ANTERIOR = fs.readFileSync(path.join(__dirname, 'fixtures', '0010_version_anterior.sql'), 'utf8');

const TABLAS_NUEVAS = ['convocatorias', 'mensajes_whatsapp_entrantes'];
const COLUMNAS_NUEVAS_EVENT_STAFF = [
    'convocatoria_id',
    'enviado_en',
    'error_envio',
    'estado_envio',
    'estado_respuesta',
    'respondido_en',
    'wa_message_id'
];
const TELEFONO_LAURA = '+12025550101'; // números ficticios (555-01xx está reservado para ficción)

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

async function listarTablas(db: PGlite): Promise<string[]> {
    const resultado = await db.query<{ table_name: string }>(
        "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
    );
    return resultado.rows.map((fila) => fila.table_name);
}

async function columnasDe(db: PGlite, tabla: string): Promise<string[]> {
    const resultado = await db.query<{ column_name: string }>(
        "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
        [tabla]
    );
    return resultado.rows.map((fila) => fila.column_name);
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

/** Una cuenta de trabajador: usuario de Auth (con su teléfono) y su perfil con el rol "trabajador". */
async function crearCuenta(db: PGlite, nombre: string, telefono: string | null = null): Promise<string> {
    const rol = await db.query<{ id: number }>("select id from public.role where name = 'trabajador'");
    const rolId = rol.rows[0]?.id ?? (await uno<{ id: number }>(db, "insert into public.role (name) values ('trabajador') returning id")).id;
    const cuenta = await uno<{ id: string }>(db, 'insert into auth.users (id, phone) values (gen_random_uuid(), $1) returning id', [telefono]);
    await db.query('insert into public.profiles (id, role_id, nombre, correo) values ($1, $2, $3, $4)', [
        cuenta.id,
        rolId,
        nombre,
        `${nombre.toLowerCase()}@example.com`
    ]);
    return cuenta.id;
}

async function crearConvocatoria(db: PGlite, eventId: number): Promise<string> {
    const convocatoria = await uno<{ id: string }>(
        db,
        "insert into public.convocatorias (event_id, hora_inicio, hora_fin) values ($1, '15:00', '23:00') returning id",
        [eventId]
    );
    return convocatoria.id;
}

/** Convoca a un trabajador: queda en event_staff, PENDIENTE de respuesta y sin enviar. */
async function convocar(db: PGlite, convocatoriaId: string, eventId: number, cuentaId: string): Promise<void> {
    await db.query(
        `insert into public.event_staff (event_id, profile_id, convocatoria_id, estado_respuesta, estado_envio)
         values ($1, $2, $3, 'PENDIENTE', 'PENDIENTE')`,
        [eventId, cuentaId, convocatoriaId]
    );
}

async function responder(
    db: PGlite,
    eventId: number,
    cuentaId: string,
    respuesta: 'CONFIRMADO' | 'RECHAZADO'
): Promise<void> {
    await db.query(
        'update public.event_staff set estado_respuesta = $3, respondido_en = now() where event_id = $1 and profile_id = $2',
        [eventId, cuentaId, respuesta]
    );
}

/** Foto del esquema de las tablas que toca la migración, para comparar antes y después. */
async function firmaDelEsquema(db: PGlite): Promise<string[]> {
    const tablas = [...TABLAS_NUEVAS, 'event_staff'];
    // regclass::text omite "public." porque public está en el search_path: se compara por nombre simple
    const resultado = await db.query<{ elemento: string }>(
        `select 'restriccion ' || conrelid::regclass::text || '.' || conname as elemento
           from pg_constraint
          where conrelid::regclass::text = any($1::text[])
         union all
         select 'indice ' || indexname from pg_indexes
          where schemaname = 'public' and tablename::text = any($1::text[])
         union all
         select 'politica ' || policyname from pg_policies
          where schemaname = 'public' and tablename::text = any($1::text[])
         order by 1`,
        [tablas]
    );
    return resultado.rows.map((fila) => fila.elemento);
}

// ---------------------------------------------------------------------------------------------
// 1) La migración en sí
// ---------------------------------------------------------------------------------------------

describe('Migración 0010', () => {
    it('solo crea 2 tablas nuevas y agrega 7 columnas opcionales a event_staff', async () => {
        const db = await baseConEsquema();
        try {
            const tablasAntes = await listarTablas(db);
            const columnasAntes = await columnasDe(db, 'event_staff');
            await db.exec(SQL_MIGRACION);

            const tablasDespues = await listarTablas(db);
            assert.deepEqual(
                tablasDespues.filter((tabla) => !tablasAntes.includes(tabla)),
                TABLAS_NUEVAS,
                'las únicas tablas nuevas son convocatorias y mensajes_whatsapp_entrantes'
            );
            assert.deepEqual(tablasAntes.filter((tabla) => !tablasDespues.includes(tabla)), [], 'no desaparece ninguna tabla');

            const columnasDespues = await columnasDe(db, 'event_staff');
            assert.deepEqual(columnasDespues.slice(0, columnasAntes.length), columnasAntes, 'las columnas que había no cambian');
            assert.deepEqual(columnasDespues.filter((c) => !columnasAntes.includes(c)).sort(), COLUMNAS_NUEVAS_EVENT_STAFF);

            const obligatorias = await db.query(
                `select column_name from information_schema.columns
                  where table_schema = 'public' and table_name = 'event_staff'
                    and column_name = any($1::text[]) and is_nullable = 'NO'`,
                [COLUMNAS_NUEVAS_EVENT_STAFF]
            );
            assert.equal(obligatorias.rows.length, 0, 'las columnas nuevas son opcionales');
            assert.ok(!(await columnasDe(db, 'empleados')).includes('es_logistica'), 'no se toca la tabla empleados');
        } finally {
            await db.close();
        }
    });

    it('no altera las asignaciones que ya existen en event_staff y sigue admitiendo las manuales', async () => {
        const db = await baseConEsquema();
        try {
            const eventId = await crearEvento(db);
            const antigua = await crearCuenta(db, 'Antigua');
            await db.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventId, antigua]);

            await db.exec(SQL_MIGRACION);

            const fila = await uno<Record<string, unknown>>(
                db,
                `select profile_id = $2 as es_la_misma, convocatoria_id, estado_respuesta, respondido_en,
                        estado_envio, wa_message_id, enviado_en, error_envio
                   from public.event_staff where event_id = $1`,
                [eventId, antigua]
            );
            assert.deepEqual(fila, {
                es_la_misma: true,
                convocatoria_id: null,
                estado_respuesta: null,
                respondido_en: null,
                estado_envio: null,
                wa_message_id: null,
                enviado_en: null,
                error_envio: null
            });

            // Una asignación manual nueva (como la hace hoy el resto de la aplicación) sigue siendo válida
            const nueva = await crearCuenta(db, 'Nueva');
            await db.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventId, nueva]);
            const total = await uno<{ n: number }>(db, 'select count(*)::int as n from public.event_staff');
            assert.equal(total.n, 2);
        } finally {
            await db.close();
        }
    });

    it('es idempotente: ejecutarla otra vez no falla ni duplica nada', async () => {
        const db = await baseConMigracion();
        try {
            const antes = await firmaDelEsquema(db);
            assert.ok(antes.length > 20, 'la firma del esquema debería tener restricciones, índices y políticas');

            await db.exec(SQL_MIGRACION);
            await db.exec(SQL_MIGRACION);

            assert.deepEqual(await firmaDelEsquema(db), antes);
        } finally {
            await db.close();
        }
    });

    it('el bloque ROLLBACK del archivo la revierte por completo y conserva las asignaciones manuales', async () => {
        const db = await baseConEsquema();
        try {
            const eventId = await crearEvento(db);
            const manual = await crearCuenta(db, 'Manual');
            const invitada = await crearCuenta(db, 'Invitada');
            await db.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventId, manual]);
            const tablasBase = await listarTablas(db);
            const columnasBase = await columnasDe(db, 'event_staff');

            await db.exec(SQL_MIGRACION);
            await convocar(db, await crearConvocatoria(db, eventId), eventId, invitada);

            const inicio = SQL_MIGRACION.indexOf('-- ROLLBACK');
            assert.notEqual(inicio, -1, 'el archivo debe traer un bloque ROLLBACK');
            const rollback = SQL_MIGRACION.slice(inicio)
                .split('\n')
                .filter((linea) => /^-- (delete|drop|alter) /i.test(linea))
                .map((linea) => linea.slice(3))
                .join('\n');
            assert.equal(rollback.split('\n').length, 4, 'el ROLLBACK debe tener las 4 sentencias documentadas');
            await db.exec(rollback);

            assert.deepEqual(await listarTablas(db), tablasBase, 'vuelven las tablas de antes');
            assert.deepEqual(await columnasDe(db, 'event_staff'), columnasBase, 'vuelven las columnas de antes');
            const filas = await db.query<{ profile_id: string }>('select profile_id from public.event_staff');
            assert.deepEqual(filas.rows.map((fila) => fila.profile_id), [manual], 'solo queda la asignación manual');

            await db.exec(SQL_MIGRACION);
            assert.ok((await firmaDelEsquema(db)).length > 20, 'se puede volver a aplicar');
        } finally {
            await db.close();
        }
    });

    it('reemplaza la primera versión (3 tablas) cuando está vacía', async () => {
        const db = await baseConEsquema();
        try {
            const tablasBase = await listarTablas(db);
            const columnasEmpleados = await columnasDe(db, 'empleados');
            await db.exec(SQL_VERSION_ANTERIOR);
            assert.ok((await listarTablas(db)).includes('convocatoria_destinatarios'), 'la primera versión sí creaba esa tabla');
            assert.ok((await columnasDe(db, 'empleados')).includes('es_logistica'));

            await db.exec(SQL_MIGRACION);

            assert.deepEqual(
                (await listarTablas(db)).filter((tabla) => !tablasBase.includes(tabla)),
                TABLAS_NUEVAS,
                'solo quedan las 2 tablas nuevas'
            );
            assert.deepEqual(await columnasDe(db, 'empleados'), columnasEmpleados, 'empleados vuelve a ser la de antes');
            const funcion = await db.query("select 1 from pg_proc where proname = 'convocatorias_set_actualizado_en'");
            assert.equal(funcion.rows.length, 0, 'se retira la función de la primera versión');
            assert.deepEqual(await columnasDe(db, 'convocatorias'), [
                'id', 'event_id', 'hora_inicio', 'hora_fin', 'nombre_evento', 'lugar', 'estado', 'envio_iniciado_en', 'creado_en'
            ]);

            await db.exec(SQL_MIGRACION);
        } finally {
            await db.close();
        }
    });

    it('se detiene sin cambiar nada si la primera versión ya tiene datos', async () => {
        const db = await baseConEsquema();
        try {
            await db.exec(SQL_VERSION_ANTERIOR);
            const eventId = await crearEvento(db);
            await db.query(
                `insert into public.convocatorias (event_id, nombre_evento, fecha_evento, hora_inicio, hora_fin, lugar)
                 values ($1, 'Celebración', current_date + 30, '15:00', '23:00', 'Manizales')`,
                [eventId]
            );
            const tablasAntes = await listarTablas(db);

            await assert.rejects(db.exec(SQL_MIGRACION), /primera versión de esta migración tiene datos/);

            assert.deepEqual(await listarTablas(db), tablasAntes, 'no se borró ni se creó nada');
            const filas = await uno<{ n: number }>(db, 'select count(*)::int as n from public.convocatorias');
            assert.equal(filas.n, 1);
        } finally {
            await db.close();
        }
    });

    it('tampoco la reemplaza si ya hay empleados marcados en es_logistica', async () => {
        const db = await baseConEsquema();
        try {
            await db.exec(SQL_VERSION_ANTERIOR);
            await db.query("insert into public.empleados (nombre, tipo_contrato, es_logistica) values ('Laura', 'freelance_fijo', true)");
            const tablasAntes = await listarTablas(db);

            await assert.rejects(db.exec(SQL_MIGRACION), /empleados marcados en empleados\.es_logistica/);

            assert.deepEqual(await listarTablas(db), tablasAntes);
            assert.ok((await columnasDe(db, 'empleados')).includes('es_logistica'), 'la columna sigue ahí');
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
        it('se guarda con su horario, en BORRADOR y sin textos propios (nombre y lugar salen del evento)', async () => {
            const eventId = await crearEvento(db);
            const id = await crearConvocatoria(db, eventId);

            const convocatoria = await uno<Record<string, unknown>>(
                db,
                `select event_id, estado, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin,
                        nombre_evento, lugar, envio_iniciado_en, creado_en is not null as tiene_creado_en
                   from public.convocatorias where id = $1`,
                [id]
            );
            assert.deepEqual(convocatoria, {
                event_id: eventId,
                estado: 'BORRADOR',
                hora_inicio: '15:00:00',
                hora_fin: '23:00:00',
                nombre_evento: null,
                lugar: null,
                envio_iniciado_en: null,
                tiene_creado_en: true
            });
        });

        it('rechaza una convocatoria para un evento que no existe', async () => {
            await debeFallar(
                db,
                { code: '23503', constraint: 'convocatorias_event_id_fkey' },
                "insert into public.convocatorias (event_id, hora_inicio, hora_fin) values (999999, '15:00', '23:00')"
            );
        });

        it('exige el horario y no admite nombre ni lugar vacíos', async () => {
            const eventId = await crearEvento(db);
            await debeFallar(
                db,
                { code: '23502' },
                "insert into public.convocatorias (event_id, hora_inicio) values ($1, '15:00')",
                [eventId]
            );
            for (const [nombre, lugar] of [['   ', null], [null, ''], ['Boda', '  ']]) {
                await debeFallar(
                    db,
                    { code: '23514', constraint: 'convocatorias_textos_validos' },
                    "insert into public.convocatorias (event_id, hora_inicio, hora_fin, nombre_evento, lugar) values ($1, '15:00', '23:00', $2, $3)",
                    [eventId, nombre, lugar]
                );
            }
            await db.query(
                "insert into public.convocatorias (event_id, hora_inicio, hora_fin, nombre_evento, lugar) values ($1, '15:00', '23:00', 'Boda', 'Finca La Esperanza')",
                [eventId]
            );
        });

        it('valida los estados y que la fecha de inicio de envío sea coherente con el estado', async () => {
            const id = await crearConvocatoria(db, await crearEvento(db));

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

    describe('Trabajadores convocados (event_staff)', () => {
        it('un trabajador convocado queda PENDIENTE de respuesta y sin enviar; las asignaciones manuales no llevan estados', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            const pedro = await crearCuenta(db, 'Pedro');
            await convocar(db, convocatoriaId, eventId, laura);
            await db.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventId, pedro]);

            const columnas = `convocatoria_id, estado_respuesta, respondido_en, estado_envio, wa_message_id, enviado_en, error_envio`;
            const convocada = await uno<Record<string, unknown>>(
                db,
                `select ${columnas} from public.event_staff where profile_id = $1`,
                [laura]
            );
            assert.deepEqual(convocada, {
                convocatoria_id: convocatoriaId,
                estado_respuesta: 'PENDIENTE',
                respondido_en: null,
                estado_envio: 'PENDIENTE',
                wa_message_id: null,
                enviado_en: null,
                error_envio: null
            });
            const manual = await uno<Record<string, unknown>>(
                db,
                `select ${columnas} from public.event_staff where profile_id = $1`,
                [pedro]
            );
            assert.deepEqual(Object.values(manual), Array(7).fill(null));
        });

        it('una fila de convocatoria debe traer sus estados', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            await debeFallar(
                db,
                { code: '23514', constraint: 'event_staff_convocatoria_completa' },
                'insert into public.event_staff (event_id, profile_id, convocatoria_id) values ($1, $2, $3)',
                [eventId, laura, convocatoriaId]
            );
        });

        it('un trabajador no puede estar duplicado en el evento: ni en la misma convocatoria ni en otra del mismo evento', async () => {
            const eventId = await crearEvento(db);
            const primera = await crearConvocatoria(db, eventId);
            const segunda = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            await convocar(db, primera, eventId, laura);

            const insertar = `insert into public.event_staff (event_id, profile_id, convocatoria_id, estado_respuesta, estado_envio)
                              values ($1, $2, $3, 'PENDIENTE', 'PENDIENTE')`;
            await debeFallar(db, { code: '23505', constraint: 'event_staff_pkey' }, insertar, [eventId, laura, primera]);
            await debeFallar(db, { code: '23505', constraint: 'event_staff_pkey' }, insertar, [eventId, laura, segunda]);
        });

        it('el mismo trabajador puede ser convocado a eventos diferentes', async () => {
            const laura = await crearCuenta(db, 'Laura');
            const eventoA = await crearEvento(db);
            const eventoB = await crearEvento(db);
            await convocar(db, await crearConvocatoria(db, eventoA), eventoA, laura);
            await convocar(db, await crearConvocatoria(db, eventoB), eventoB, laura);

            const total = await uno<{ n: number }>(db, 'select count(*)::int as n from public.event_staff where profile_id = $1', [laura]);
            assert.equal(total.n, 2);
        });

        it('varias convocatorias del mismo evento no mezclan las respuestas de cada una', async () => {
            const eventId = await crearEvento(db);
            const montaje = await crearConvocatoria(db, eventId);
            const show = await crearConvocatoria(db, eventId);
            assert.notEqual(montaje, show);
            const laura = await crearCuenta(db, 'Laura');
            const pedro = await crearCuenta(db, 'Pedro');
            const diana = await crearCuenta(db, 'Diana');
            await convocar(db, montaje, eventId, laura);
            await convocar(db, montaje, eventId, pedro);
            await convocar(db, show, eventId, diana);

            await responder(db, eventId, laura, 'CONFIRMADO');
            await responder(db, eventId, diana, 'RECHAZADO');

            const resumen = await db.query<{ convocatoria_id: string; estado_respuesta: string; n: number }>(
                `select convocatoria_id, estado_respuesta, count(*)::int as n
                   from public.event_staff where convocatoria_id in ($1, $2) group by 1, 2`,
                [montaje, show]
            );
            const contar = (convocatoria: string): Record<string, number> =>
                Object.fromEntries(
                    resumen.rows.filter((fila) => fila.convocatoria_id === convocatoria).map((fila) => [fila.estado_respuesta, fila.n])
                );
            assert.deepEqual(contar(montaje), { CONFIRMADO: 1, PENDIENTE: 1 });
            assert.deepEqual(contar(show), { RECHAZADO: 1 });
        });

        it('admite PENDIENTE, CONFIRMADO y RECHAZADO, y exige fecha de respuesta salvo en PENDIENTE', async () => {
            const eventId = await crearEvento(db);
            const laura = await crearCuenta(db, 'Laura');
            await convocar(db, await crearConvocatoria(db, eventId), eventId, laura);

            await responder(db, eventId, laura, 'CONFIRMADO');
            await responder(db, eventId, laura, 'RECHAZADO');
            const respondido = await uno<{ estado_respuesta: string; con_fecha: boolean }>(
                db,
                'select estado_respuesta, respondido_en is not null as con_fecha from public.event_staff where profile_id = $1',
                [laura]
            );
            assert.deepEqual(respondido, { estado_respuesta: 'RECHAZADO', con_fecha: true });

            await debeFallar(
                db,
                { code: '23514', constraint: 'event_staff_respuesta_valida' },
                "update public.event_staff set estado_respuesta = 'TAL_VEZ', respondido_en = now() where profile_id = $1",
                [laura]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'event_staff_respuesta_coherente' },
                'update public.event_staff set respondido_en = null where profile_id = $1',
                [laura]
            );
            await debeFallar(
                db,
                { code: '23514', constraint: 'event_staff_respuesta_coherente' },
                "update public.event_staff set estado_respuesta = 'PENDIENTE' where profile_id = $1",
                [laura]
            );
        });

        it('guarda estado, id de Meta, fecha de envío y errores del envío', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            const pedro = await crearCuenta(db, 'Pedro');
            await convocar(db, convocatoriaId, eventId, laura);
            await convocar(db, convocatoriaId, eventId, pedro);

            await db.query("update public.event_staff set estado_envio = 'ENVIANDO' where profile_id = $1", [laura]);
            await db.query(
                `update public.event_staff set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-1', enviado_en = now()
                  where profile_id = $1`,
                [laura]
            );
            await db.query(
                "update public.event_staff set estado_envio = 'ERROR', error_envio = 'El número no está registrado en WhatsApp' where profile_id = $1",
                [pedro]
            );

            const filas = await db.query<Record<string, unknown>>(
                `select estado_envio, wa_message_id, enviado_en is not null as con_fecha_envio, error_envio
                   from public.event_staff where convocatoria_id = $1 order by estado_envio`,
                [convocatoriaId]
            );
            assert.deepEqual(filas.rows, [
                { estado_envio: 'ENVIADO', wa_message_id: 'wamid.SALIENTE-1', con_fecha_envio: true, error_envio: null },
                { estado_envio: 'ERROR', wa_message_id: null, con_fecha_envio: false, error_envio: 'El número no está registrado en WhatsApp' }
            ]);
        });

        it('no deja marcar un envío como ENVIADO sin id de Meta y fecha, ni como ERROR sin motivo', async () => {
            const eventId = await crearEvento(db);
            const laura = await crearCuenta(db, 'Laura');
            await convocar(db, await crearConvocatoria(db, eventId), eventId, laura);

            const actualizar = (cambio: string) => `update public.event_staff set ${cambio} where profile_id = $1`;
            await debeFallar(db, { code: '23514', constraint: 'event_staff_envio_enviado_completo' }, actualizar("estado_envio = 'ENVIADO'"), [laura]);
            await debeFallar(
                db,
                { code: '23514', constraint: 'event_staff_envio_enviado_completo' },
                actualizar("estado_envio = 'ENVIADO', wa_message_id = 'wamid.X'"),
                [laura]
            );
            await debeFallar(db, { code: '23514', constraint: 'event_staff_envio_error_completo' }, actualizar("estado_envio = 'ERROR'"), [laura]);
            await debeFallar(
                db,
                { code: '23514', constraint: 'event_staff_envio_error_completo' },
                actualizar("estado_envio = 'ERROR', error_envio = '  '"),
                [laura]
            );
            await debeFallar(db, { code: '23514', constraint: 'event_staff_envio_valido' }, actualizar("estado_envio = 'ENTREGADO'"), [laura]);
        });

        it('el id de mensaje de Meta no se puede asignar a dos trabajadores', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            const pedro = await crearCuenta(db, 'Pedro');
            await convocar(db, convocatoriaId, eventId, laura);
            await convocar(db, convocatoriaId, eventId, pedro);
            const enviar = `update public.event_staff set estado_envio = 'ENVIADO', wa_message_id = 'wamid.REPETIDO', enviado_en = now()
                             where profile_id = $1`;

            await db.query(enviar, [laura]);
            await debeFallar(db, { code: '23505', constraint: 'event_staff_wa_message_id_key' }, enviar, [pedro]);
        });

        it('borrar una convocatoria borra a sus trabajadores convocados y deja las asignaciones manuales', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            const pedro = await crearCuenta(db, 'Pedro');
            await convocar(db, convocatoriaId, eventId, laura);
            await db.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventId, pedro]);

            await db.query('delete from public.convocatorias where id = $1', [convocatoriaId]);

            const filas = await db.query<{ profile_id: string }>('select profile_id from public.event_staff');
            assert.deepEqual(filas.rows.map((fila) => fila.profile_id), [pedro]);
        });

        it('no deja borrar un evento que ya tiene convocatorias (se protege el historial)', async () => {
            const eventId = await crearEvento(db);
            await crearConvocatoria(db, eventId);
            await debeFallar(db, { code: '23503', constraint: 'convocatorias_event_id_fkey' }, 'delete from public.events where id = $1', [eventId]);
        });
    });

    describe('Mensajes entrantes de WhatsApp', () => {
        it('registra una sola vez cada mensaje de Meta (evita procesar duplicados)', async () => {
            const insertar = `insert into public.mensajes_whatsapp_entrantes
                                  (wa_message_id, telefono_remitente, tipo, contenido, payload, recibido_en)
                              values ($1, $2, 'button', 'Sí, puedo asistir', 'PAYLOAD_DE_PRUEBA', now())
                              on conflict (wa_message_id) do nothing returning wa_message_id`;

            const primero = await db.query(insertar, ['wamid.ENTRANTE-1', TELEFONO_LAURA]);
            const repetido = await db.query(insertar, ['wamid.ENTRANTE-1', TELEFONO_LAURA]);
            assert.equal(primero.rows.length, 1, 'la primera vez se registra');
            assert.equal(repetido.rows.length, 0, 'la segunda vez se detecta como duplicado');

            const total = await uno<{ n: number }>(db, 'select count(*)::int as n from public.mensajes_whatsapp_entrantes');
            assert.equal(total.n, 1);

            await debeFallar(
                db,
                { code: '23505', constraint: 'mensajes_whatsapp_entrantes_pkey' },
                insertar.replace('on conflict (wa_message_id) do nothing returning wa_message_id', ''),
                ['wamid.ENTRANTE-1', TELEFONO_LAURA]
            );
        });

        it('el teléfono del remitente se guarda en formato internacional normalizado', async () => {
            const insertar = `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en)
                              values ($1, $2, 'text', now())`;
            for (const [i, telefono] of ['+573000000000', '+12025550101', '+34612345678'].entries()) {
                await db.query(insertar, [`wamid.OK-${i}`, telefono]);
            }
            const invalidos = ['3000000001', '573000000001', '+57 300 000 0001', '+57-300-000-0001', '+0573000000001', '+5730000', '+5730000000012345', ' +573000000001', ''];
            for (const [i, telefono] of invalidos.entries()) {
                await debeFallar(db, { code: '23514', constraint: 'mensajes_whatsapp_entrantes_telefono_e164' }, insertar, [`wamid.MAL-${i}`, telefono]);
            }
        });

        it('conserva el historial: cuándo y a qué mensaje respondió, aunque cambie de respuesta', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            await convocar(db, convocatoriaId, eventId, laura);
            await db.query(
                `update public.event_staff set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-LAURA', enviado_en = now()
                  where profile_id = $1`,
                [laura]
            );

            const registrar = async (waMessageId: string, respuesta: 'CONFIRMADO' | 'RECHAZADO', recibidoEn: string) => {
                await db.query(
                    `insert into public.mensajes_whatsapp_entrantes
                         (wa_message_id, telefono_remitente, tipo, contenido, contexto_wa_message_id, recibido_en,
                          convocatoria_id, profile_id, respuesta, resultado)
                     values ($1, $2, 'button', $3, 'wamid.SALIENTE-LAURA', $4, $5, $6, $7, 'APLICADO')`,
                    [waMessageId, TELEFONO_LAURA, respuesta === 'CONFIRMADO' ? 'Sí, puedo asistir' : 'No puedo asistir', recibidoEn, convocatoriaId, laura, respuesta]
                );
                await db.query(
                    'update public.event_staff set estado_respuesta = $3, respondido_en = $4 where event_id = $1 and profile_id = $2',
                    [eventId, laura, respuesta, recibidoEn]
                );
            };
            await registrar('wamid.ENTRANTE-A', 'CONFIRMADO', '2026-10-13T14:00:00Z');
            await registrar('wamid.ENTRANTE-B', 'RECHAZADO', '2026-10-13T16:30:00Z');

            const actual = await uno<{ estado_respuesta: string }>(db, 'select estado_respuesta from public.event_staff where profile_id = $1', [laura]);
            assert.equal(actual.estado_respuesta, 'RECHAZADO', 'event_staff guarda la última respuesta');

            const historial = await db.query<Record<string, unknown>>(
                `select m.respuesta, to_char(m.recibido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as recibido_en,
                        m.contexto_wa_message_id = s.wa_message_id as responde_al_mensaje_enviado
                   from public.mensajes_whatsapp_entrantes m
                   join public.event_staff s on s.profile_id = m.profile_id and s.convocatoria_id = m.convocatoria_id
                  where m.profile_id = $1 order by m.recibido_en`,
                [laura]
            );
            assert.deepEqual(historial.rows, [
                { respuesta: 'CONFIRMADO', recibido_en: '2026-10-13T14:00', responde_al_mensaje_enviado: true },
                { respuesta: 'RECHAZADO', recibido_en: '2026-10-13T16:30', responde_al_mensaje_enviado: true }
            ]);
        });

        it('registra los mensajes que no se pueden asociar con seguridad a una convocatoria', async () => {
            await db.query(
                `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, contenido, recibido_en, resultado)
                 values ('wamid.DESCONOCIDO', '+12025550103', 'text', 'Hola, ¿quién es?', now(), 'NO_ASOCIADO')`
            );
            const mensaje = await uno<Record<string, unknown>>(
                db,
                'select convocatoria_id, profile_id, respuesta, resultado from public.mensajes_whatsapp_entrantes'
            );
            assert.deepEqual(mensaje, { convocatoria_id: null, profile_id: null, respuesta: null, resultado: 'NO_ASOCIADO' });

            const insertar = `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en, respuesta, resultado)
                              values ($1, '+12025550103', 'text', now(), $2, $3)`;
            await debeFallar(db, { code: '23514', constraint: 'mensajes_whatsapp_entrantes_resultado_valido' }, insertar, ['wamid.R1', null, 'FALLIDO']);
            await debeFallar(db, { code: '23514', constraint: 'mensajes_whatsapp_entrantes_respuesta_valida' }, insertar, ['wamid.R2', 'TAL_VEZ', 'APLICADO']);
            await db.query(insertar, ['wamid.R3', null, null]); // recibido y aún sin procesar
        });

        it('borrar la convocatoria o la cuenta conserva la bitácora de mensajes', async () => {
            const eventId = await crearEvento(db);
            const convocatoriaId = await crearConvocatoria(db, eventId);
            const laura = await crearCuenta(db, 'Laura');
            await convocar(db, convocatoriaId, eventId, laura);
            await db.query(
                `insert into public.mensajes_whatsapp_entrantes
                     (wa_message_id, telefono_remitente, tipo, recibido_en, convocatoria_id, profile_id, respuesta, resultado)
                 values ('wamid.HISTORIAL', $1, 'button', now(), $2, $3, 'CONFIRMADO', 'APLICADO')`,
                [TELEFONO_LAURA, convocatoriaId, laura]
            );

            await db.query('delete from public.convocatorias where id = $1', [convocatoriaId]);
            await db.query('delete from public.profiles where id = $1', [laura]);

            const mensaje = await uno<{ convocatoria_id: string | null; profile_id: string | null; respuesta: string }>(
                db,
                "select convocatoria_id, profile_id, respuesta from public.mensajes_whatsapp_entrantes where wa_message_id = 'wamid.HISTORIAL'"
            );
            assert.deepEqual(mensaje, { convocatoria_id: null, profile_id: null, respuesta: 'CONFIRMADO' });
        });
    });

    describe('Seguridad (RLS)', () => {
        it('las dos tablas nuevas tienen RLS activo y una política que solo permite al administrador', async () => {
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
            await db.query(
                `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en, convocatoria_id)
                 values ('wamid.RLS', $1, 'text', now(), $2)`,
                [TELEFONO_LAURA, convocatoriaId]
            );

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
                assert.equal(await comoRol('authenticated', false, () => contar(tabla)), 0, `un usuario sin ser administrador no ve ${tabla}`);
                assert.equal(await comoRol('authenticated', true, () => contar(tabla)), 1, `el administrador ve ${tabla}`);
            }

            const actualizar = async (): Promise<number> =>
                (await db.query("update public.convocatorias set estado = 'CANCELADA'")).affectedRows ?? 0;
            assert.equal(await comoRol('authenticated', false, actualizar), 0, 'sin ser administrador el UPDATE no alcanza ninguna fila');
            assert.equal(await comoRol('authenticated', true, actualizar), 1, 'el administrador sí puede actualizar');
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

    it('convocatoria, trabajadores y mensajes siguen ahí después de cerrar y reabrir la base', async () => {
        let base = await crearBase(directorio);
        let convocatoriaId: string;
        try {
            await base.exec(SQL_ESQUEMA_BASE);
            await base.exec(SQL_MIGRACION);
            const eventId = await crearEvento(base);
            convocatoriaId = await crearConvocatoria(base, eventId);
            const laura = await crearCuenta(base, 'Laura');
            const pedro = await crearCuenta(base, 'Pedro');
            await convocar(base, convocatoriaId, eventId, laura);
            await convocar(base, convocatoriaId, eventId, pedro);
            await base.query(
                `update public.event_staff set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-LAURA', enviado_en = now()
                  where profile_id = $1`,
                [laura]
            );
            await responder(base, eventId, laura, 'CONFIRMADO');
            await base.query(
                `insert into public.mensajes_whatsapp_entrantes
                     (wa_message_id, telefono_remitente, tipo, recibido_en, convocatoria_id, profile_id, respuesta, resultado)
                 values ('wamid.ENTRANTE-LAURA', $1, 'button', now(), $2, $3, 'CONFIRMADO', 'APLICADO')`,
                [TELEFONO_LAURA, convocatoriaId, laura]
            );
        } finally {
            await base.close();
        }

        base = await crearBase(directorio); // "reinicio": se abre de nuevo el mismo directorio de datos
        try {
            const respuestas = await base.query<{ nombre: string; estado_respuesta: string; estado_envio: string }>(
                `select p.nombre, s.estado_respuesta, s.estado_envio
                   from public.event_staff s join public.profiles p on p.id = s.profile_id
                  where s.convocatoria_id = $1 order by p.nombre`,
                [convocatoriaId]
            );
            assert.deepEqual(respuestas.rows, [
                { nombre: 'Laura', estado_respuesta: 'CONFIRMADO', estado_envio: 'ENVIADO' },
                { nombre: 'Pedro', estado_respuesta: 'PENDIENTE', estado_envio: 'PENDIENTE' }
            ]);

            // El mensaje ya registrado sigue marcando el duplicado después del reinicio
            const duplicado = await base.query(
                `insert into public.mensajes_whatsapp_entrantes (wa_message_id, telefono_remitente, tipo, recibido_en)
                 values ('wamid.ENTRANTE-LAURA', $1, 'button', now())
                 on conflict (wa_message_id) do nothing returning wa_message_id`,
                [TELEFONO_LAURA]
            );
            assert.equal(duplicado.rows.length, 0);
        } finally {
            await base.close();
        }
    });
});
