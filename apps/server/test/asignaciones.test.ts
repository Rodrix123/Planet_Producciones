// Pruebas de la asignación de personal a eventos confirmados (historia de usuario 2).
//
// Levantan las rutas reales (src/asignaciones/rutas.ts) sobre un Postgres embebido (PGlite) con el
// esquema real (test/fixtures/esquema_asignacion.sql) más la migración 0011, y simulan Supabase Auth.
// No necesitan internet ni credenciales y nunca tocan la base real. Nombres y celulares son ficticios.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import jwt from 'jsonwebtoken';

// auth.ts exige JWT_SECRET al cargarse: se define antes de importar las rutas (import dinámico).
const JWT_SECRET = 'secreto-solo-para-pruebas-de-asignacion';
process.env.JWT_SECRET = JWT_SECRET;

import type { BaseDeDatos } from '../src/asignaciones/conexion';
import type { CuentasDePersonal } from '../src/asignaciones/servicio';
import {
    diasQueOcupa,
    intervaloDe,
    motivoDelEvento,
    motivosDePersona,
    normalizarCelular,
    seSolapan
} from '../src/asignaciones/reglas';

const RAIZ_REPO = path.resolve(__dirname, '..', '..', '..');
const SQL_ESQUEMA = fs.readFileSync(path.join(__dirname, 'fixtures', 'esquema_asignacion.sql'), 'utf8');
const SQL_MIGRACION = fs.readFileSync(path.join(RAIZ_REPO, 'supabase', 'migrations', '0011_asignacion_personal.sql'), 'utf8');
const SQL_ETAPAS = fs.readFileSync(path.join(RAIZ_REPO, 'supabase', 'migrations', '0012_etapas_personal.sql'), 'utf8');

/** Esquema real + migraciones de la historia de usuario 2 (0011 y 0012). */
async function migrar(pg: PGlite): Promise<void> {
    await pg.exec(SQL_ESQUEMA);
    await pg.exec(SQL_MIGRACION);
    await pg.exec(SQL_ETAPAS);
}

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

function baseDePglite(pg: PGlite): BaseDeDatos {
    return {
        async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
            return { rows: (await pg.query<T>(sql, params)).rows };
        },
        transaccion(trabajo) {
            return pg.transaction((tx) =>
                trabajo({
                    async query<F = Record<string, unknown>>(sql: string, params?: unknown[]) {
                        return { rows: (await tx.query<F>(sql, params)).rows };
                    }
                })
            );
        }
    };
}

interface CuentasDePrueba extends CuentasDePersonal {
    fallar: boolean;
    llamadas: number;
    /** Si es 2, cada llamada espera a la otra (máx. 3 s): obliga a que dos solicitudes pasen juntas la validación previa. */
    reunir: number;
}

/** Supabase Auth simulado: escribe en auth.users de la misma base embebida. */
function cuentasSimuladas(pg: PGlite): CuentasDePrueba {
    let enEspera: (() => void)[] = [];
    return {
        fallar: false,
        llamadas: 0,
        reunir: 0,
        async crearUsuario({ telefono, nombre, empleadoId }) {
            this.llamadas += 1;
            if (this.fallar) throw new Error('Supabase no responde');
            if (this.reunir > 1) {
                await new Promise<void>((resolve) => {
                    enEspera.push(resolve);
                    if (enEspera.length >= this.reunir) {
                        enEspera.forEach((r) => r());
                        enEspera = [];
                    } else {
                        setTimeout(resolve, 3000);
                    }
                });
            }
            // Como Supabase: un celular repetido no crea otro usuario
            const { rows } = await pg.query<{ id: string }>(
                `insert into auth.users (phone, raw_user_meta_data)
                 values ($1, jsonb_build_object('full_name', $2::text, 'empleado_id', $3::text))
                 on conflict (phone) do nothing returning id::text as id`,
                [telefono, nombre, empleadoId]
            );
            return rows[0] ? { id: rows[0].id } : { yaExiste: true as const };
        },
        async eliminarUsuario(id) {
            await pg.query('delete from auth.users where id = $1', [id]);
        }
    };
}

const cookieDe = (rol: string): string =>
    `pp_session=${jwt.sign({ id: '00000000-0000-4000-8000-000000000001', rol, nombre: 'Prueba', correo: 'prueba@ejemplo.test', debeCambiarPassword: false }, JWT_SECRET)}`;
const COOKIE_ADMIN = cookieDe('administrador');

interface Respuesta {
    status: number;
    json: any;
}

interface Entorno {
    pg: PGlite;
    cuentas: ReturnType<typeof cuentasSimuladas>;
    server: Server;
    pedir(metodo: string, ruta: string, cuerpo?: unknown, cookie?: string | null): Promise<Respuesta>;
    cerrar(): Promise<void>;
}

async function levantar(pg: PGlite): Promise<Entorno> {
    const express = (await import('express')).default;
    const cookieParser = (await import('cookie-parser')).default;
    const { crearAsignacionesRouter } = await import('../src/asignaciones/rutas');
    const cuentas = cuentasSimuladas(pg);
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/eventos/:eventoId/personal', crearAsignacionesRouter(baseDePglite(pg), cuentas));
    app.use((err: Error, _req: unknown, res: { status(n: number): { json(o: unknown): void } }, _next: unknown) => {
        res.status(500).json({ status: 'error', message: err.message });
    });
    const server = await new Promise<Server>((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
        pg,
        cuentas,
        server,
        async pedir(metodo, ruta, cuerpo, cookie = COOKIE_ADMIN) {
            const r = await fetch(base + ruta, {
                method: metodo,
                headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
                body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
            });
            return { status: r.status, json: await r.json() };
        },
        async cerrar() {
            await new Promise((resolve) => server.close(resolve));
        }
    };
}

async function uno<T = any>(pg: PGlite, sql: string, params: unknown[] = []): Promise<T> {
    const { rows } = await pg.query<T>(sql, params);
    assert.equal(rows.length, 1, `Se esperaba 1 fila de: ${sql}`);
    return rows[0];
}

const contar = async (pg: PGlite, sql: string, params: unknown[] = []): Promise<number> =>
    Number((await uno<{ n: number }>(pg, `select count(*)::int as n from (${sql}) x`, params)).n);

interface DatosEvento {
    nombre: string;
    dias: number;
    hora?: string | null; // hora de la cotización
    horaEvento?: string | null; // hora propia del evento (si falta, sale de la cotización)
    horaFin?: string | null;
    confirmado?: boolean;
    estado?: string;
}

/** Crea cotización + evento; la fecha es relativa a hoy en Colombia. Devuelve el id del evento. */
async function crearEvento(pg: PGlite, d: DatosEvento): Promise<number> {
    const { id: quoteId } = await uno<{ id: number }>(
        pg,
        `insert into quote (estado, event_type, date, hour, venue_nombre_manual)
         values ($1, $2, (now() at time zone 'America/Bogota')::date + $3::int, $4::time, 'Salón de pruebas')
         returning id`,
        [d.estado ?? 'finalizada', d.nombre, d.dias, d.hora ?? null]
    );
    const { id } = await uno<{ id: number }>(
        pg,
        `insert into events (quote_id, confirmed, hour, hora_fin) values ($1, $2, $3::time, $4::time) returning id`,
        [quoteId, d.confirmado ?? true, d.horaEvento ?? null, d.horaFin ?? null]
    );
    return Number(id);
}

async function crearCuenta(pg: PGlite, nombre: string, rol: string, telefono: string | null): Promise<string> {
    const { id } = await uno<{ id: string }>(pg, `insert into auth.users (phone) values ($1) returning id::text as id`, [telefono]);
    await pg.query(
        `insert into profiles (id, role_id, nombre) values ($1, (select id from role where name = $2), $3)`,
        [id, rol, nombre]
    );
    return id;
}

async function crearEmpleado(pg: PGlite, nombre: string, tipo: string, telefono: string | null, activo = true): Promise<string> {
    const { id } = await uno<{ id: string }>(
        pg,
        `insert into empleados (nombre, telefono, tipo_contrato, activo) values ($1, $2, $3, $4) returning id::text as id`,
        [nombre, telefono, tipo, activo]
    );
    return id;
}

const persona = (r: Respuesta, nombre: string) => {
    const p = r.json.personal.find((x: { nombre: string }) => x.nombre === nombre);
    assert.ok(p, `No aparece ${nombre} en el personal`);
    return p;
};

// ---------------------------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------------------------

describe('Reglas de horario', () => {
    it('un evento cuya hora de fin es menor que la de inicio termina al día siguiente', () => {
        const noche = intervaloDe('2026-11-20', '20:00', '02:00')!;
        assert.equal(noche.hasta - noche.desde, 6 * 60);
        assert.deepEqual(diasQueOcupa(noche), ['2026-11-20', '2026-11-21']);
        assert.deepEqual(diasQueOcupa(intervaloDe('2026-11-20', '08:00', '12:00')!), ['2026-11-20']);
        // terminar justo a medianoche no ocupa el día siguiente
        assert.deepEqual(diasQueOcupa(intervaloDe('2026-11-20', '18:00', '00:00')!), ['2026-11-20']);
    });

    it('sin datos completos o con inicio igual a fin no hay intervalo', () => {
        assert.equal(intervaloDe('2026-11-20', '18:00', '18:00'), null);
        assert.equal(intervaloDe(null, '18:00', '20:00'), null);
        assert.equal(intervaloDe('2026-11-20', null, '20:00'), null);
        assert.equal(intervaloDe('2026-11-20', '18:00', '25:00'), null);
    });

    it('terminar a la hora en que empieza el otro no es choque; cruzarse sí', () => {
        const a = intervaloDe('2026-11-20', '18:00', '23:00')!;
        assert.equal(seSolapan(a, intervaloDe('2026-11-20', '23:00', '01:00')!), false);
        assert.equal(seSolapan(a, intervaloDe('2026-11-20', '22:59', '23:30')!), true);
        assert.equal(seSolapan(a, intervaloDe('2026-11-20', '19:00', '20:00')!), true); // contenido
        assert.equal(seSolapan(intervaloDe('2026-11-20', '23:00', '02:00')!, intervaloDe('2026-11-21', '01:00', '05:00')!), true);
    });

    it('el evento debe estar confirmado, vigente, sin cancelar y con fecha y hora', () => {
        const base = { confirmado: true, cancelado: false, fecha: '2026-11-20', vigente: true, horaInicio: '18:00' };
        assert.equal(motivoDelEvento(base), null);
        assert.equal(motivoDelEvento({ ...base, confirmado: false })?.codigo, 'EVENTO_NO_CONFIRMADO');
        assert.equal(motivoDelEvento({ ...base, cancelado: true })?.codigo, 'EVENTO_CANCELADO');
        assert.equal(motivoDelEvento({ ...base, fecha: null })?.codigo, 'EVENTO_SIN_FECHA');
        assert.equal(motivoDelEvento({ ...base, vigente: false })?.codigo, 'EVENTO_PASADO');
        assert.equal(motivoDelEvento({ ...base, horaInicio: null })?.codigo, 'EVENTO_SIN_HORA');
    });

    it('detecta choques, horarios incompletos el mismo día y días no disponibles', () => {
        const evento = { fecha: '2026-11-20', intervalo: intervaloDe('2026-11-20', '18:00', '23:00')! };
        const otro = { eventoId: 9, nombreEvento: 'Concierto', fecha: '2026-11-20', horaInicio: '20:00', horaFin: '23:30' };
        assert.deepEqual(motivosDePersona(evento, [otro], []).map((m) => m.codigo), ['SOLAPE']);
        assert.match(motivosDePersona(evento, [otro], [])[0].mensaje, /«Concierto»/);
        assert.deepEqual(motivosDePersona(evento, [{ ...otro, horaFin: null }], []).map((m) => m.codigo), ['HORARIO_DESCONOCIDO']);
        assert.deepEqual(motivosDePersona(evento, [{ ...otro, fecha: '2026-11-22', horaFin: null }], []), []);
        assert.deepEqual(motivosDePersona(evento, [], ['2026-11-20']).map((m) => m.codigo), ['DIA_NO_DISPONIBLE']);
        assert.deepEqual(motivosDePersona(evento, [], ['2026-11-21']), []);
    });

    it('normaliza celulares colombianos al formato de auth.users', () => {
        assert.equal(normalizarCelular('300 000 0003'), '573000000003');
        assert.equal(normalizarCelular('+57 300-000-0003'), '573000000003');
        assert.equal(normalizarCelular('573000000003'), '573000000003');
        assert.equal(normalizarCelular('123'), null);
        assert.equal(normalizarCelular(null), null);
    });
});

// ---------------------------------------------------------------------------------------------
// Migración 0011
// ---------------------------------------------------------------------------------------------

describe('Migración 0011', () => {
    it('agrega el rol trabajador y events.hora_fin, y se puede ejecutar dos veces', async () => {
        const pg = await PGlite.create();
        await pg.exec(SQL_ESQUEMA);
        await pg.exec(SQL_MIGRACION);
        await pg.exec(SQL_MIGRACION);
        assert.equal(await contar(pg, `select 1 from role where name = 'trabajador'`), 1);
        const columna = await uno(pg, `select data_type, is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = 'events' and column_name = 'hora_fin'`);
        assert.deepEqual(columna, { data_type: 'time without time zone', is_nullable: 'YES' });
        await pg.close();
    });

    it('se detiene sin cambiar nada si event_staff no tiene las columnas de WhatsApp (0010)', async () => {
        const pg = await PGlite.create();
        await pg.exec(SQL_ESQUEMA);
        await pg.exec('alter table event_staff drop column estado_respuesta cascade');
        await assert.rejects(pg.exec(SQL_MIGRACION), /Aplica primero la migración 0010/);
        assert.equal(await contar(pg, `select 1 from role where name = 'trabajador'`), 0);
        await pg.close();
    });
});

describe('Migración 0012 (etapas)', () => {
    it('agrega event_staff.etapas sin tocar las asignaciones existentes y se puede ejecutar dos veces', async () => {
        const pg = await PGlite.create();
        await pg.exec(SQL_ESQUEMA);
        await pg.exec(SQL_MIGRACION);
        const evento = await crearEvento(pg, { nombre: 'Boda', dias: 5, hora: '18:00', horaFin: '23:00' });
        const perfilId = await crearCuenta(pg, 'Ana Torres', 'trabajador', '573000000003');
        await pg.query('insert into event_staff (event_id, profile_id) values ($1, $2)', [evento, perfilId]);
        await pg.exec(SQL_ETAPAS);
        await pg.exec(SQL_ETAPAS);
        const columna = await uno(pg, `select data_type, is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = 'event_staff' and column_name = 'etapas'`);
        assert.deepEqual(columna, { data_type: 'ARRAY', is_nullable: 'YES' });
        assert.deepEqual(await uno(pg, 'select etapas from event_staff'), { etapas: null }); // queda "sin etapa"
        await pg.close();
    });

    it('solo admite carga, organizacion y desmonte, sin repetir y sin listas vacías', async () => {
        const pg = await PGlite.create();
        await migrar(pg);
        const evento = await crearEvento(pg, { nombre: 'Boda', dias: 5, hora: '18:00', horaFin: '23:00' });
        const perfilId = await crearCuenta(pg, 'Ana Torres', 'trabajador', '573000000003');
        await pg.query(`insert into event_staff (event_id, profile_id, etapas) values ($1, $2, '{carga,desmonte}')`, [evento, perfilId]);
        const poner = (valor: string | null) => pg.query('update event_staff set etapas = $1::text[]', [valor]);
        await poner('{carga,organizacion,desmonte}');
        await poner(null);
        for (const invalido of ['{montaje}', '{}', '{carga,carga}', '{carga,organizacion,desmonte,carga}']) {
            await assert.rejects(poner(invalido), (err: { code?: string }) => err.code === '23514', invalido);
        }
        await pg.close();
    });
});

// ---------------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------------

describe('API de asignación de personal', () => {
    let e: Entorno;
    const ev: Record<string, number> = {};
    const perfil: Record<string, string> = {};
    const empleado: Record<string, string> = {};

    before(async () => {
        const pg = await PGlite.create();
        await migrar(pg);

        // Cuentas existentes: dos de ellas son personas de la nómina (mismo celular)
        perfil.admin = await crearCuenta(pg, 'Ada Administradora', 'administrador', null);
        perfil.sara = await crearCuenta(pg, 'Sara Secretaria', 'secretaria', '573000000001');
        perfil.jaime = await crearCuenta(pg, 'Jaime Jefe', 'jefe_logistica', '573000000002');
        // Trabajadores con cuenta que no están en la nómina (flujo de WhatsApp)
        perfil.diego = await crearCuenta(pg, 'Diego Trabajador', 'trabajador', '573000000007');
        perfil.elena = await crearCuenta(pg, 'Elena Trabajadora', 'trabajador', '573000000008');
        perfil.fabio = await crearCuenta(pg, 'Fabio Trabajador', 'trabajador', '573000000009');
        // Salió de la nómina pero conserva su cuenta: no debe aparecer
        perfil.ignacio = await crearCuenta(pg, 'Ignacio Inactivo', 'trabajador', '573000000006');

        empleado.sara = await crearEmpleado(pg, 'Sara Secretaria', 'con_contrato', '300 000 0001');
        empleado.jaime = await crearEmpleado(pg, 'Jaime Jefe', 'con_contrato', '+57 300 000 0002');
        empleado.ana = await crearEmpleado(pg, 'Ana Torres', 'con_contrato', '3000000003');
        empleado.bruno = await crearEmpleado(pg, 'Bruno Díaz', 'freelance_fijo', '573000000004');
        empleado.carla = await crearEmpleado(pg, 'Carla Ruiz', 'freelance_no_fijo', '300-000-0005');
        empleado.sinCelular = await crearEmpleado(pg, 'Samuel Sin Celular', 'freelance_no_fijo', null);
        empleado.ignacio = await crearEmpleado(pg, 'Ignacio Inactivo', 'con_contrato', '3000000006', false);

        ev.boda = await crearEvento(pg, { nombre: 'Boda', dias: 10, hora: '18:00' }); // hora solo en la cotización
        ev.concierto = await crearEvento(pg, { nombre: 'Concierto', dias: 10, hora: '20:00', horaEvento: '20:00', horaFin: '23:30' });
        ev.desayuno = await crearEvento(pg, { nombre: 'Desayuno', dias: 10, hora: '08:00', horaFin: '12:00' });
        ev.trasnocho = await crearEvento(pg, { nombre: 'Trasnocho', dias: 10, hora: '23:00', horaFin: '02:00' });
        ev.madrugada = await crearEvento(pg, { nombre: 'Madrugada', dias: 11, hora: '01:00', horaFin: '05:00' });
        ev.feria = await crearEvento(pg, { nombre: 'Feria', dias: 11, hora: '10:00', confirmado: false });
        ev.pasado = await crearEvento(pg, { nombre: 'Pasado', dias: -3, hora: '10:00', horaFin: '12:00' });
        ev.cancelado = await crearEvento(pg, { nombre: 'Cancelado', dias: 12, hora: '10:00', estado: 'cancelada' });
        ev.sinHora = await crearEvento(pg, { nombre: 'Sin hora', dias: 13, hora: null, horaEvento: '00:00' });
        ev.congreso = await crearEvento(pg, { nombre: 'Congreso', dias: 14, hora: '13:00', horaFin: '15:00' });
        ev.feriaWhatsapp = await crearEvento(pg, { nombre: 'Feria WhatsApp', dias: 14, hora: '09:00' });
        ev.gala = await crearEvento(pg, { nombre: 'Gala', dias: 15, hora: '18:00' });

        // WhatsApp: Diego confirmó Feria WhatsApp de 10:00 a 14:00 (su horario sale de la convocatoria)
        const conv = await uno<{ id: string }>(pg,
            `insert into convocatorias (event_id, hora_inicio, hora_fin, estado) values ($1, '10:00', '14:00', 'ENVIADA') returning id::text as id`,
            [ev.feriaWhatsapp]);
        await pg.query(`insert into event_staff (event_id, profile_id, convocatoria_id, estado_respuesta, estado_envio, respondido_en)
                        values ($1, $2, $3, 'CONFIRMADO', 'ENVIADO', now())`, [ev.feriaWhatsapp, perfil.diego, conv.id]);
        // En la Gala: Elena no ha respondido, Fabio rechazó y Diego confirmó
        const convGala = await uno<{ id: string }>(pg,
            `insert into convocatorias (event_id, hora_inicio, hora_fin, estado) values ($1, '18:00', '22:00', 'ENVIADA') returning id::text as id`,
            [ev.gala]);
        await pg.query(`insert into event_staff (event_id, profile_id, convocatoria_id, estado_respuesta, estado_envio, respondido_en) values
                        ($1, $2, $5, 'PENDIENTE', 'ENVIADO', null),
                        ($1, $3, $5, 'RECHAZADO', 'ENVIADO', now()),
                        ($1, $4, $5, 'CONFIRMADO', 'ENVIADO', now())`,
            [ev.gala, perfil.elena, perfil.fabio, perfil.diego, convGala.id]);

        // Jaime marcó como no disponible el día de la Boda
        await pg.query(`insert into unavailability_users (id_user, date) values ($1, (now() at time zone 'America/Bogota')::date + 10)`, [perfil.jaime]);

        e = await levantar(pg);
    });

    after(async () => {
        await e.cerrar();
        await e.pg.close();
    });

    it('exige sesión de administradora', async () => {
        assert.equal((await e.pedir('GET', `/api/eventos/${ev.boda}/personal`, undefined, null)).status, 401);
        assert.equal((await e.pedir('GET', `/api/eventos/${ev.boda}/personal`, undefined, cookieDe('secretaria'))).status, 403);
    });

    it('consulta el evento confirmado y el personal (nómina activa + trabajadores), sin hora de fin aún', async () => {
        const r = await e.pedir('GET', `/api/eventos/${ev.boda}/personal`);
        assert.equal(r.status, 200);
        assert.equal(r.json.evento.nombre, 'Boda');
        assert.equal(r.json.evento.horaInicio, '18:00'); // de la cotización
        assert.equal(r.json.evento.asignable, true);
        assert.equal(r.json.horaFinEvaluada, null);
        const nombres = r.json.personal.map((p: { nombre: string }) => p.nombre);
        assert.deepEqual(nombres, ['Ana Torres', 'Bruno Díaz', 'Carla Ruiz', 'Diego Trabajador', 'Elena Trabajadora',
            'Fabio Trabajador', 'Jaime Jefe', 'Samuel Sin Celular', 'Sara Secretaria']);
        assert.equal(persona(r, 'Sara Secretaria').clave, `p:${perfil.sara}`); // reutiliza su cuenta
        assert.equal(persona(r, 'Ana Torres').clave, `e:${empleado.ana}`); // aún sin cuenta
        assert.equal(persona(r, 'Ana Torres').estado, 'SIN_COMPROBAR');
        assert.equal(persona(r, 'Samuel Sin Celular').estado, 'SIN_CELULAR');
        assert.equal(r.json.personal.some((p: { seleccionable: boolean }) => p.seleccionable), false);
    });

    it('con la hora de fin propuesta calcula la disponibilidad', async () => {
        const r = await e.pedir('GET', `/api/eventos/${ev.boda}/personal?horaFin=23:00`);
        assert.equal(r.status, 200);
        assert.equal(r.json.horaFinEvaluada, '23:00');
        assert.equal(persona(r, 'Ana Torres').estado, 'DISPONIBLE');
        assert.equal(persona(r, 'Jaime Jefe').estado, 'NO_DISPONIBLE');
        assert.equal(persona(r, 'Jaime Jefe').motivos[0].codigo, 'DIA_NO_DISPONIBLE');
        assert.equal((await e.pedir('GET', `/api/eventos/${ev.boda}/personal?horaFin=18:00`)).status, 400);
        assert.equal((await e.pedir('GET', `/api/eventos/${ev.boda}/personal?horaFin=tarde`)).status, 400);
    });

    it('asigna una persona: crea su cuenta, guarda la hora de fin y la fila de event_staff', async () => {
        const r = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '23:00', etapa: 'organizacion', personal: [`e:${empleado.ana}`] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.mensaje, 'Se asignó 1 persona a Organización.');
        assert.equal(r.json.cuentasCreadas, 1);
        assert.deepEqual(r.json.asignados.map((a: { nombre: string }) => a.nombre), ['Ana Torres']);
        assert.equal(r.json.asignados[0].origen, 'manual');
        assert.equal(r.json.evento.horaFin, '23:00');

        const cuenta = await uno(e.pg, `select p.id::text as id, r.name as rol, p.nombre, u.phone, u.email,
                u.raw_user_meta_data->>'empleado_id' as empleado_id
              from auth.users u join profiles p on p.id = u.id join role r on r.id = p.role_id where u.phone = '573000000003'`);
        assert.deepEqual({ ...cuenta, id: undefined }, { id: undefined, rol: 'trabajador', nombre: 'Ana Torres', phone: '573000000003', email: null, empleado_id: empleado.ana });
        perfil.ana = cuenta.id;
        const fila = await uno(e.pg, `select convocatoria_id, estado_respuesta from event_staff where event_id = $1`, [ev.boda]);
        assert.deepEqual(fila, { convocatoria_id: null, estado_respuesta: null });
    });

    it('asigna varias personas a la vez (con y sin cuenta previa)', async () => {
        const r = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, {
            horaFin: '23:00',
            etapa: 'organizacion',
            personal: [`e:${empleado.bruno}`, `p:${perfil.sara}`, `p:${perfil.diego}`]
        });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.mensaje, 'Se asignaron 3 personas a Organización.');
        assert.equal(r.json.cuentasCreadas, 1);
        assert.deepEqual(r.json.asignados.map((a: { nombre: string }) => a.nombre),
            ['Ana Torres', 'Bruno Díaz', 'Diego Trabajador', 'Sara Secretaria']);
        perfil.bruno = (await uno(e.pg, `select id::text as id from auth.users where phone = '573000000004'`)).id;
        // Sara conserva su cuenta y su rol
        assert.equal((await uno(e.pg, `select r.name from profiles p join role r on r.id = p.role_id where p.id = $1`, [perfil.sara])).name, 'secretaria');
    });

    it('no asigna personal a eventos no confirmados, pasados, cancelados, sin hora o inexistentes', async () => {
        const antes = { filas: await contar(e.pg, 'select 1 from event_staff'), usuarios: await contar(e.pg, 'select 1 from auth.users') };
        const casos: [number, string, number][] = [
            [ev.feria, 'EVENTO_NO_CONFIRMADO', 409],
            [ev.pasado, 'EVENTO_PASADO', 409],
            [ev.cancelado, 'EVENTO_CANCELADO', 409],
            [ev.sinHora, 'EVENTO_SIN_HORA', 409],
            [999999, 'EVENTO_NO_ENCONTRADO', 404]
        ];
        for (const [id, codigo, status] of casos) {
            const r = await e.pedir('POST', `/api/eventos/${id}/personal`, { horaFin: '23:00', etapa: 'organizacion', personal: [`e:${empleado.carla}`] });
            assert.equal(r.status, status, `${codigo}: ${JSON.stringify(r.json)}`);
            assert.equal(r.json.codigo, codigo);
        }
        assert.equal((await e.pedir('POST', '/api/eventos/abc/personal', { horaFin: '23:00', personal: [] })).status, 400);
        // La consulta sí muestra el motivo para que la pantalla lo explique
        const g = await e.pedir('GET', `/api/eventos/${ev.feria}/personal`);
        assert.equal(g.json.evento.asignable, false);
        assert.equal(g.json.evento.motivo.codigo, 'EVENTO_NO_CONFIRMADO');
        assert.deepEqual(g.json.personal, []);
        assert.equal(await contar(e.pg, 'select 1 from event_staff'), antes.filas);
        assert.equal(await contar(e.pg, 'select 1 from auth.users'), antes.usuarios);
    });

    it('evita duplicados y es todo o nada: si alguien ya está, no guarda a nadie ni crea cuentas', async () => {
        const usuarios = await contar(e.pg, 'select 1 from auth.users');
        // e:<Ana> es la clave vieja de antes de crearle la cuenta: igual se reconoce
        for (const clave of [`p:${perfil.ana}`, `e:${empleado.ana}`]) {
            const r = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '23:00', etapa: 'organizacion', personal: [clave, `e:${empleado.carla}`] });
            assert.equal(r.status, 409);
            assert.equal(r.json.codigo, 'PERSONAL_NO_DISPONIBLE');
            assert.match(r.json.message, /^No se guardó ninguna asignación\./);
            assert.deepEqual(r.json.detalles.map((p: { codigo: string }) => p.codigo), ['YA_EN_ETAPA']);
        }
        assert.equal(await contar(e.pg, 'select 1 from event_staff where event_id = $1', [ev.boda]), 4);
        assert.equal(await contar(e.pg, 'select 1 from auth.users'), usuarios); // Carla sigue sin cuenta
        // La misma persona dos veces en una solicitud se cuenta una vez
        const r = await e.pedir('POST', `/api/eventos/${ev.desayuno}/personal`, { horaFin: '12:00', etapa: 'organizacion', personal: [`p:${perfil.ana}`, `p:${perfil.ana}`] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.mensaje, 'Se asignó 1 persona a Organización.');
    });

    it('detecta choques de horario, incluso con eventos que terminan al día siguiente', async () => {
        // Ana está en la Boda (18:00-23:00): el Concierto (20:00-23:30) se cruza
        const choque = await e.pedir('POST', `/api/eventos/${ev.concierto}/personal`, { horaFin: '23:30', etapa: 'organizacion', personal: [`p:${perfil.ana}`] });
        assert.equal(choque.status, 409);
        assert.equal(choque.json.detalles[0].codigo, 'SOLAPE');
        assert.match(choque.json.message, /Ana Torres: Ya está asignado a «Boda»/);
        // La pantalla lo ve antes de intentar
        assert.equal(persona(await e.pedir('GET', `/api/eventos/${ev.concierto}/personal`), 'Ana Torres').estado, 'NO_DISPONIBLE');
        // Trasnocho empieza a las 23:00, justo cuando termina la Boda: no es choque
        const contiguo = await e.pedir('POST', `/api/eventos/${ev.trasnocho}/personal`, { horaFin: '02:00', etapa: 'organizacion', personal: [`p:${perfil.ana}`] });
        assert.equal(contiguo.status, 200, JSON.stringify(contiguo.json));
        assert.equal(contiguo.json.terminaAlDiaSiguiente, true);
        // Trasnocho termina a las 02:00 del día siguiente: la Madrugada (01:00-05:00) se cruza
        const madrugada = await e.pedir('POST', `/api/eventos/${ev.madrugada}/personal`, { horaFin: '05:00', etapa: 'organizacion', personal: [`p:${perfil.ana}`] });
        assert.equal(madrugada.status, 409);
        assert.match(madrugada.json.message, /«Trasnocho»/);
    });

    it('usa el horario de la convocatoria de WhatsApp para quien confirmó por ese medio', async () => {
        // Diego confirmó la Feria WhatsApp de 10:00 a 14:00; el Congreso es de 13:00 a 15:00
        const r = await e.pedir('POST', `/api/eventos/${ev.congreso}/personal`, { horaFin: '15:00', etapa: 'organizacion', personal: [`p:${perfil.diego}`] });
        assert.equal(r.status, 409);
        assert.match(r.json.message, /«Feria WhatsApp»/);
    });

    it('trata las convocatorias pendientes y rechazadas de WhatsApp sin contarlas como asignaciones', async () => {
        const r = await e.pedir('GET', `/api/eventos/${ev.gala}/personal?horaFin=23:00`);
        assert.equal(r.status, 200);
        assert.deepEqual(r.json.asignados.map((a: { nombre: string; origen: string; puedeQuitarse: boolean }) => [a.nombre, a.origen, a.puedeQuitarse]),
            [['Diego Trabajador', 'whatsapp', false]]);
        assert.equal(r.json.asignados[0].horaFin, '22:00'); // de su convocatoria
        assert.equal(persona(r, 'Elena Trabajadora').estado, 'CONVOCADO');
        assert.equal(persona(r, 'Fabio Trabajador').estado, 'RECHAZO_WHATSAPP');
        const pendiente = await e.pedir('POST', `/api/eventos/${ev.gala}/personal`, { horaFin: '23:00', etapa: 'organizacion', personal: [`p:${perfil.elena}`] });
        assert.equal(pendiente.status, 409);
        assert.equal(pendiente.json.detalles[0].codigo, 'YA_CONVOCADO');
        const quitar = await e.pedir('DELETE', `/api/eventos/${ev.gala}/personal/${perfil.diego}`);
        assert.equal(quitar.status, 409);
        assert.equal(quitar.json.codigo, 'ORIGEN_WHATSAPP');
    });

    it('no ofrece ni acepta a quien salió de la nómina, aunque conserve su cuenta de trabajador', async () => {
        const r = await e.pedir('POST', `/api/eventos/${ev.desayuno}/personal`, { horaFin: '12:00', etapa: 'organizacion', personal: [`p:${perfil.ignacio}`] });
        assert.equal(r.status, 409);
        assert.equal(r.json.detalles[0].codigo, 'NO_ENCONTRADO');
        assert.equal(r.json.detalles[0].nombre, 'Persona');
    });

    it('no cambia la hora de fin si deja con choque a alguien ya asignado; si no, la guarda', async () => {
        // Ana está en la Boda y en el Trasnocho (desde las 23:00): alargar la Boda hasta 23:30 choca
        const largo = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '23:30', personal: [] });
        assert.equal(largo.status, 409);
        assert.equal(largo.json.detalles[0].codigo, 'CAMBIO_HORARIO');
        assert.equal((await uno(e.pg, `select to_char(hora_fin, 'HH24:MI') as h from events where id = $1`, [ev.boda])).h, '23:00');
        // Sin cambios ni personas no hay nada que guardar
        assert.equal((await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '23:00', personal: [] })).status, 400);
        const corto = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '22:00', personal: [] });
        assert.equal(corto.status, 200, JSON.stringify(corto.json));
        assert.equal(corto.json.mensaje, 'Se guardó la hora de finalización del evento.');
        assert.equal(corto.json.evento.horaFin, '22:00');
    });

    it('si Supabase no crea la cuenta, no asigna a nadie', async () => {
        e.cuentas.fallar = true;
        try {
            const r = await e.pedir('POST', `/api/eventos/${ev.desayuno}/personal`, { horaFin: '12:00', etapa: 'organizacion', personal: [`e:${empleado.carla}`, `p:${perfil.sara}`] });
            assert.equal(r.status, 502);
            assert.equal(r.json.codigo, 'CUENTA_NO_CREADA');
            assert.equal(await contar(e.pg, 'select 1 from event_staff where event_id = $1 and profile_id = $2', [ev.desayuno, perfil.sara]), 0);
            assert.equal(await contar(e.pg, `select 1 from auth.users where phone = '573000000005'`), 0);
        } finally {
            e.cuentas.fallar = false;
        }
    });

    it('dos asignaciones simultáneas que chocan: solo una se guarda', async () => {
        // Carla (sin cuenta) a la Boda (18:00-22:00) y al Concierto (20:00-23:30) a la vez. Las dos
        // pasan la validación previa (ninguna ve a la otra) y se esperan al crear la cuenta: la que
        // guarda segunda debe descubrir el choque dentro de su transacción.
        e.cuentas.llamadas = 0;
        e.cuentas.reunir = 2;
        let a: Respuesta;
        let b: Respuesta;
        try {
            [a, b] = await Promise.all([
                e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '22:00', etapa: 'organizacion', personal: [`e:${empleado.carla}`] }),
                e.pedir('POST', `/api/eventos/${ev.concierto}/personal`, { horaFin: '23:30', etapa: 'organizacion', personal: [`e:${empleado.carla}`] })
            ]);
        } finally {
            e.cuentas.reunir = 0;
        }
        assert.equal(e.cuentas.llamadas, 2, 'las dos solicitudes debían pasar juntas la validación previa');
        assert.deepEqual([a.status, b.status].sort(), [200, 409], `${JSON.stringify(a.json)} ${JSON.stringify(b.json)}`);
        assert.equal(await contar(e.pg, `select 1 from auth.users where phone = '573000000005'`), 1); // una sola cuenta
        assert.equal(await contar(e.pg, `select 1 from event_staff s join auth.users u on u.id = s.profile_id where u.phone = '573000000005'`), 1);
    });

    it('quita a una persona asignada a mano y la deja disponible otra vez', async () => {
        const r = await e.pedir('DELETE', `/api/eventos/${ev.boda}/personal/${perfil.bruno}`);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.mensaje, 'Se quitó a Bruno Díaz del evento.');
        assert.equal(r.json.asignados.some((a: { nombre: string }) => a.nombre === 'Bruno Díaz'), false);
        assert.equal(persona(r, 'Bruno Díaz').estado, 'DISPONIBLE');
        assert.equal((await e.pedir('DELETE', `/api/eventos/${ev.boda}/personal/${perfil.bruno}`)).json.codigo, 'NO_ASIGNADO');
        assert.equal((await e.pedir('DELETE', `/api/eventos/${ev.boda}/personal/no-es-un-id`)).status, 400);
        assert.equal((await e.pedir('DELETE', `/api/eventos/${ev.pasado}/personal/${perfil.ana}`)).json.codigo, 'EVENTO_PASADO');
    });

    it('organiza por etapas: una persona puede estar en varias, pero no dos veces en la misma', async () => {
        // Ana ya está en Organización; Bruno salió del evento en la prueba anterior
        const r = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '22:00', etapa: 'carga', personal: [`p:${perfil.ana}`, `p:${perfil.bruno}`] });
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.mensaje, 'Se asignaron 2 personas a Carga.');
        const etapasDe = (resp: Respuesta, nombre: string) => resp.json.asignados.find((a: { nombre: string }) => a.nombre === nombre)?.etapas;
        assert.deepEqual(etapasDe(r, 'Ana Torres'), ['carga', 'organizacion']); // siempre en el orden de las etapas
        assert.deepEqual(etapasDe(r, 'Bruno Díaz'), ['carga']);
        assert.deepEqual(await uno(e.pg, 'select etapas from event_staff where event_id = $1 and profile_id = $2', [ev.boda, perfil.ana]), { etapas: ['carga', 'organizacion'] });

        const repetida = await e.pedir('POST', `/api/eventos/${ev.boda}/personal`, { horaFin: '22:00', etapa: 'carga', personal: [`p:${perfil.ana}`] });
        assert.equal(repetida.status, 409);
        assert.equal(repetida.json.detalles[0].codigo, 'YA_EN_ETAPA');
        assert.match(repetida.json.message, /Ana Torres: Ya está en Carga\./);

        const ana = persona(await e.pedir('GET', `/api/eventos/${ev.boda}/personal`), 'Ana Torres');
        assert.deepEqual([ana.estado, ana.seleccionable, ana.etapas], ['ASIGNADO', true, ['carga', 'organizacion']]);
    });

    it('quitar de una etapa conserva las demás; quitar la última saca a la persona del evento', async () => {
        const base = `/api/eventos/${ev.boda}/personal`;
        const r = await e.pedir('DELETE', `${base}/${perfil.ana}?etapa=organizacion`);
        assert.equal(r.status, 200, JSON.stringify(r.json));
        assert.equal(r.json.mensaje, 'Se quitó a Ana Torres de Organización.');
        assert.deepEqual(r.json.asignados.find((a: { nombre: string }) => a.nombre === 'Ana Torres').etapas, ['carga']);
        assert.equal((await e.pedir('DELETE', `${base}/${perfil.ana}?etapa=organizacion`)).json.codigo, 'NO_EN_ETAPA');
        assert.equal((await e.pedir('DELETE', `${base}/${perfil.ana}?etapa=montaje`)).json.codigo, 'ETAPA_INVALIDA');

        const ultima = await e.pedir('DELETE', `${base}/${perfil.bruno}?etapa=carga`);
        assert.equal(ultima.json.mensaje, 'Se quitó a Bruno Díaz del evento.');
        assert.equal(await contar(e.pg, 'select 1 from event_staff where event_id = $1 and profile_id = $2', [ev.boda, perfil.bruno]), 0);
    });

    it('las asignaciones sin etapa (anteriores o de WhatsApp) se muestran sin etapa y se les puede dar una', async () => {
        // Como las 10 de la Gala real: asignada antes de que existieran las etapas
        await e.pg.query('insert into event_staff (event_id, profile_id) values ($1, $2)', [ev.congreso, perfil.sara]);
        const resumen = await e.pedir('GET', `/api/eventos/${ev.congreso}/personal?vista=asignados`);
        assert.equal(resumen.status, 200);
        assert.deepEqual(resumen.json.asignados.map((a: { nombre: string; etapas: unknown }) => [a.nombre, a.etapas]), [['Sara Secretaria', null]]);
        assert.deepEqual(resumen.json.personal, []); // la vista resumida no calcula disponibilidad
        const conEtapa = await e.pedir('POST', `/api/eventos/${ev.congreso}/personal`, { horaFin: '15:00', etapa: 'desmonte', personal: [`p:${perfil.sara}`] });
        assert.equal(conEtapa.status, 200, JSON.stringify(conEtapa.json));
        assert.equal(conEtapa.json.mensaje, 'Se asignó 1 persona a Desmonte.');
        assert.deepEqual(conEtapa.json.asignados[0].etapas, ['desmonte']);

        // Diego confirmó la Gala por WhatsApp: se le da etapa y, al quitársela, sigue asignado sin etapa
        const gala = `/api/eventos/${ev.gala}/personal`;
        const carga = await e.pedir('POST', gala, { horaFin: '23:00', etapa: 'carga', personal: [`p:${perfil.diego}`] });
        assert.equal(carga.status, 200, JSON.stringify(carga.json));
        const diego = () => carga.json.asignados.find((a: { nombre: string }) => a.nombre === 'Diego Trabajador');
        assert.deepEqual([diego().origen, diego().etapas], ['whatsapp', ['carga']]);
        const sinEtapa = await e.pedir('DELETE', `${gala}/${perfil.diego}?etapa=carga`);
        assert.equal(sinEtapa.json.mensaje, 'Se quitó a Diego Trabajador de Carga.');
        assert.deepEqual(sinEtapa.json.asignados.find((a: { nombre: string }) => a.nombre === 'Diego Trabajador').etapas, null);
        assert.equal(await contar(e.pg, 'select 1 from event_staff where event_id = $1 and profile_id = $2', [ev.gala, perfil.diego]), 1);
    });

    it('rechaza solicitudes mal formadas', async () => {
        const ruta = `/api/eventos/${ev.desayuno}/personal`;
        assert.equal((await e.pedir('POST', ruta, { horaFin: '12:00', personal: [`p:${perfil.sara}`] })).json.codigo, 'ETAPA_INVALIDA');
        assert.equal((await e.pedir('POST', ruta, { horaFin: '12:00', etapa: 'montaje', personal: [`p:${perfil.sara}`] })).json.codigo, 'ETAPA_INVALIDA');
        assert.equal((await e.pedir('POST', ruta, { personal: [`p:${perfil.sara}`] })).json.codigo, 'HORA_FIN_INVALIDA');
        assert.equal((await e.pedir('POST', ruta, { horaFin: '8pm', personal: [] })).json.codigo, 'HORA_FIN_INVALIDA');
        assert.equal((await e.pedir('POST', ruta, { horaFin: '12:00', etapa: 'organizacion', personal: ['x:123'] })).json.codigo, 'PERSONA_INVALIDA');
        assert.equal((await e.pedir('POST', ruta, { horaFin: '12:00', personal: 'todos' })).json.codigo, 'SOLICITUD_INVALIDA');
        assert.equal((await e.pedir('POST', ruta, { horaFin: '08:00', etapa: 'organizacion', personal: [`p:${perfil.sara}`] })).json.codigo, 'HORA_FIN_INVALIDA');
    });
});

describe('Persistencia y base sin migrar', () => {
    it('las asignaciones siguen ahí después de cerrar y reabrir la base', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asignacion-'));
        try {
            let pg = await PGlite.create(dir);
            await migrar(pg);
            const id = await crearEvento(pg, { nombre: 'Aniversario', dias: 5, hora: '19:00' });
            const empleadoId = await crearEmpleado(pg, 'Lina Prueba', 'con_contrato', '3000000010');
            let entorno = await levantar(pg);
            const r = await entorno.pedir('POST', `/api/eventos/${id}/personal`, { horaFin: '23:00', etapa: 'organizacion', personal: [`e:${empleadoId}`] });
            assert.equal(r.status, 200, JSON.stringify(r.json));
            await entorno.cerrar();
            await pg.close();

            pg = await PGlite.create(dir);
            entorno = await levantar(pg);
            const g = await entorno.pedir('GET', `/api/eventos/${id}/personal`);
            assert.deepEqual(g.json.asignados.map((a: { nombre: string }) => a.nombre), ['Lina Prueba']);
            assert.equal(g.json.evento.horaFin, '23:00');
            await entorno.cerrar();
            await pg.close();
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('sin la migración 0011 responde 503 con instrucciones en vez de un error genérico', async () => {
        const pg = await PGlite.create();
        await pg.exec(SQL_ESQUEMA);
        const id = await (async () => {
            const { id: q } = await uno<{ id: number }>(pg, `insert into quote (event_type, date, hour) values ('Boda', (now() at time zone 'America/Bogota')::date + 3, '18:00') returning id`);
            return Number((await uno<{ id: number }>(pg, `insert into events (quote_id, confirmed) values ($1, true) returning id`, [q])).id);
        })();
        const entorno = await levantar(pg);
        const r = await entorno.pedir('GET', `/api/eventos/${id}/personal`);
        assert.equal(r.status, 503);
        assert.equal(r.json.codigo, 'FALTA_MIGRACION');
        assert.match(r.json.message, /0011_asignacion_personal\.sql/);
        await entorno.cerrar();
        await pg.close();
    });
});

describe('Menú de eventos (listarEventos)', () => {
    it('el bloque "Personal" muestra solo asignaciones manuales y confirmadas por WhatsApp', async () => {
        const { listarEventos } = await import('@my-app/db/eventos');
        const fila = {
            id: 1, confirmed: true, initial_payment: false, total_paid: 0, contrato_enviado_en: null, contrato_firmado_subido_en: null,
            date: null, hour: null, event_type: 'Boda', address: null, venue_nombre_manual: null, venue_direccion_manual: null,
            venue: null, client: null, transportation: null, quote: null,
            event_staff: [
                { profile_id: 'm', estado_respuesta: null },
                { profile_id: 'p', estado_respuesta: 'PENDIENTE' },
                { profile_id: 'c', estado_respuesta: 'CONFIRMADO' },
                { profile_id: 'r', estado_respuesta: 'RECHAZADO' }
            ]
        };
        const usuarios = [['m', 'Zoe Manual'], ['p', 'Pedro Pendiente'], ['c', 'Carlos Confirmado'], ['r', 'Rita Rechazo']]
            .map(([id, nombre]) => ({ id, email: null, user_metadata: { full_name: nombre } }));
        const supabaseFalso = {
            from: () => ({ select: async () => ({ data: [fila], error: null }) }),
            auth: { admin: { listUsers: async () => ({ data: { users: usuarios }, error: null }) } }
        } as unknown as Parameters<typeof listarEventos>[0];
        const { eventos } = await listarEventos(supabaseFalso);
        assert.deepEqual(eventos[0].personal, ['Carlos Confirmado', 'Zoe Manual']);
    });
});
