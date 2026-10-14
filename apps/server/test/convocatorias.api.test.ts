// Pruebas de los endpoints de convocatorias (Numeral 3).
//
// Levantan un servidor Express real con los routers de producción y la autenticación real del
// proyecto (cookie de sesión firmada), sobre un Postgres embebido (PGlite) con el esquema de
// Supabase (test/fixtures/esquema_base.sql) y la migración 0010. No usan la base real, ni
// internet, ni WhatsApp. Los teléfonos y nombres son ficticios.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Consulta } from '../src/convocatorias/consulta';

// auth.ts exige JWT_SECRET al cargarse, por eso se importa dinámicamente después de definirlo
process.env.JWT_SECRET = 'secreto-solo-para-pruebas-del-numeral-3';
const TOKEN_N8N = 'n8n'.repeat(12); // 36 caracteres: supera el mínimo de 32
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const UUID_INEXISTENTE = '99999999-9999-4999-8999-999999999999';

const RAIZ_REPO = path.resolve(__dirname, '..', '..', '..');
const SQL_ESQUEMA_BASE = fs.readFileSync(path.join(__dirname, 'fixtures', 'esquema_base.sql'), 'utf8');
const SQL_MIGRACION = fs.readFileSync(
    path.join(RAIZ_REPO, 'supabase', 'migrations', '0010_disponibilidad_personal_whatsapp.sql'),
    'utf8'
);

type Json = any;
interface Respuesta {
    estado: number;
    cuerpo: Json;
    cabeceras: Headers;
}
interface OpcionesLlamada {
    cuerpo?: unknown;
    cookie?: string;
    bearer?: string;
    autorizacion?: string;
}

const consultaDePGlite = (bd: PGlite): Consulta => ({
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
        const resultado = await bd.query(sql, params);
        return { rows: resultado.rows as T[] };
    }
});

describe('Endpoints de convocatorias', () => {
    let bd: PGlite;
    let servidor: Server;
    let base: string;
    let nombreCookie: string;
    let firmarSesion: (rol: 'administrador' | 'secretaria' | 'jefe_logistica') => string;
    let crearRouters: typeof import('../src/convocatorias/rutas.js');
    const roles: Record<string, number> = {};
    const extras: Server[] = [];

    // -----------------------------------------------------------------------------------------
    // Infraestructura
    // -----------------------------------------------------------------------------------------

    function iniciarApp(tokenN8n: string | undefined): Promise<{ servidor: Server; base: string }> {
        const consulta = consultaDePGlite(bd);
        const app = express();
        app.use(express.json());
        app.use(cookieParser());
        app.use('/api/convocatorias', crearRouters.crearConvocatoriasRouter(consulta));
        app.use('/api/integraciones', crearRouters.crearIntegracionesRouter(consulta, tokenN8n));
        // Igual que el index.ts real: lo que no controla el router termina en un 500 genérico
        app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error('Error no controlado en una ruta de prueba:', err);
            res.status(500).json({ status: 'error', message: 'error inesperado' });
        });
        return new Promise((resolver) => {
            const s = app.listen(0, '127.0.0.1', () => {
                resolver({ servidor: s, base: `http://127.0.0.1:${(s.address() as AddressInfo).port}` });
            });
        });
    }

    const cerrar = (s: Server): Promise<void> =>
        new Promise((resolver) => {
            s.closeAllConnections();
            s.close(() => resolver());
        });

    async function llamar(urlBase: string, metodo: 'GET' | 'POST', ruta: string, op: OpcionesLlamada = {}): Promise<Respuesta> {
        const cabeceras: Record<string, string> = {};
        if (op.cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
        if (op.cookie) cabeceras['cookie'] = `${nombreCookie}=${op.cookie}`;
        if (op.bearer) cabeceras['authorization'] = `Bearer ${op.bearer}`;
        if (op.autorizacion) cabeceras['authorization'] = op.autorizacion;
        const respuesta = await fetch(`${urlBase}${ruta}`, {
            method: metodo,
            headers: cabeceras,
            ...(op.cuerpo !== undefined ? { body: JSON.stringify(op.cuerpo) } : {})
        });
        const texto = await respuesta.text();
        return { estado: respuesta.status, cuerpo: texto ? JSON.parse(texto) : null, cabeceras: respuesta.headers };
    }

    const api = (metodo: 'GET' | 'POST', ruta: string, op: OpcionesLlamada = {}) => llamar(base, metodo, ruta, op);
    const comoAdmin = () => firmarSesion('administrador');

    async function uno<T>(sql: string, params: unknown[] = []): Promise<T> {
        const resultado = await bd.query<T>(sql, params);
        assert.equal(resultado.rows.length, 1, `Se esperaba 1 fila de: ${sql}`);
        return resultado.rows[0] as T;
    }
    const contar = async (tabla: string, donde = 'true'): Promise<number> =>
        (await uno<{ n: number }>(`select count(*)::int as n from public.${tabla} where ${donde}`)).n;
    const fechaEn = async (dias: number): Promise<string> =>
        (await uno<{ d: string }>("select ((now() at time zone 'America/Bogota')::date + $1::int)::text as d", [dias])).d;

    interface OpcionesEvento {
        confirmado?: boolean;
        estado?: string;
        dias?: number | null;
        hora?: string;
        tipo?: string | null;
        sede?: { nombre: string; ciudad: string | null } | null;
        sedeManual?: string | null;
        ciudadTransporte?: string | null;
        conEvento?: boolean;
    }

    /** Crea una cotización y, normalmente, su evento confirmado dentro de `dias` días. */
    async function crearEvento(op: OpcionesEvento = {}): Promise<{ cotizacionId: number; eventoId: number | null }> {
        const {
            confirmado = true,
            estado = 'finalizada',
            dias = 14,
            hora = '15:00',
            tipo = 'Celebración empresarial',
            sede = { nombre: 'Hotel Termales', ciudad: 'Manizales' },
            sedeManual = null,
            ciudadTransporte = null,
            conEvento = true
        } = op;
        const venueId = sede
            ? (await uno<{ id: number }>('insert into public.venue (name, city) values ($1, $2) returning id', [sede.nombre, sede.ciudad])).id
            : null;
        const transporteId = ciudadTransporte
            ? (await uno<{ id: number }>('insert into public.transportation (city) values ($1) returning id', [ciudadTransporte])).id
            : null;
        const cotizacion = await uno<{ id: number }>(
            `insert into public.quote (estado, event_type, venue_id, transportation_id, venue_nombre_manual, date, hour)
             values ($1, $2, $3, $4, $5, $6::date, $7::time) returning id`,
            [estado, tipo, venueId, transporteId, sedeManual, dias === null ? null : await fechaEn(dias), hora]
        );
        const evento = conEvento
            ? await uno<{ id: number }>('insert into public.events (quote_id, confirmed) values ($1, $2) returning id', [cotizacion.id, confirmado])
            : null;
        return { cotizacionId: cotizacion.id, eventoId: evento?.id ?? null };
    }

    /**
     * Una cuenta como las de la aplicación: usuario de Auth (el teléfono se guarda solo con
     * dígitos) y su perfil con un rol. Por defecto es personal de logística (rol "trabajador").
     */
    async function crearTrabajador(
        nombre: string,
        telefono: string | null,
        op: { rol?: string | null } = {}
    ): Promise<string> {
        const rol = op.rol === undefined ? 'trabajador' : op.rol;
        const rolId = rol === null ? null : roles[rol];
        const cuenta = await uno<{ id: string }>('insert into auth.users (id, phone) values (gen_random_uuid(), $1) returning id', [telefono]);
        await bd.query('insert into public.profiles (id, role_id, nombre, correo) values ($1, $2, $3, $4)', [
            cuenta.id,
            rolId,
            nombre,
            `${nombre.toLowerCase().replace(/\s+/g, '.')}@example.com`
        ]);
        return cuenta.id;
    }

    /** Eventos que no admiten convocatorias y el código con el que el servidor explica por qué. */
    const eventosNoConvocables: { nombre: string; evento: OpcionesEvento; codigo: string }[] = [
        { nombre: 'la cotización todavía no es un evento', evento: { conEvento: false }, codigo: 'EVENTO_NO_HABILITADO' },
        { nombre: 'el evento no está confirmado', evento: { confirmado: false }, codigo: 'EVENTO_NO_CONFIRMADO' },
        { nombre: 'el evento está cancelado', evento: { estado: 'cancelada' }, codigo: 'EVENTO_CANCELADO' },
        { nombre: 'el evento no tiene fecha', evento: { dias: null }, codigo: 'EVENTO_SIN_FECHA' },
        { nombre: 'el evento fue ayer', evento: { dias: -1 }, codigo: 'EVENTO_PASADO' }
    ];

    const cuerpoCrear = (cotizacionId: number, trabajadorIds: string[], extra: Record<string, unknown> = {}) => ({
        cotizacionId,
        trabajadorIds,
        horaFin: '23:00',
        ...extra
    });

    /** Crea una convocatoria por la API con dos trabajadores y devuelve lo necesario para seguir probando. */
    async function convocatoriaLista() {
        const evento = await crearEvento();
        const laura = await crearTrabajador('Laura', '3000000001');
        const pedro = await crearTrabajador('Pedro', '3000000002');
        const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(evento.cotizacionId, [laura, pedro]) });
        assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
        return { ...evento, laura, pedro, convocatoria: r.cuerpo.convocatoria as Json };
    }

    /** Simula lo que hará el Numeral 9: la respuesta de un trabajador queda en su fila de event_staff. */
    const registrarRespuesta = (convocatoriaId: string, trabajadorId: string, respuesta: string) =>
        bd.query(
            `update public.event_staff set estado_respuesta = $3, respondido_en = now()
              where convocatoria_id = $1 and profile_id = $2`,
            [convocatoriaId, trabajadorId, respuesta]
        );

    // -----------------------------------------------------------------------------------------
    // Preparación
    // -----------------------------------------------------------------------------------------

    before(async () => {
        const auth = await import('../src/auth.js');
        firmarSesion = (rol) =>
            auth.signSessionToken({ id: ADMIN_ID, rol, nombre: 'Prueba', correo: 'prueba@example.com', debeCambiarPassword: false });
        nombreCookie = auth.COOKIE_NAME;
        crearRouters = await import('../src/convocatorias/rutas.js');

        bd = await PGlite.create();
        await bd.exec(SQL_ESQUEMA_BASE);
        await bd.exec(SQL_MIGRACION);
        for (const nombre of ['administrador', 'secretaria', 'jefe_logistica', 'trabajador']) {
            roles[nombre] = (await uno<{ id: number }>('insert into public.role (name) values ($1) returning id', [nombre])).id;
        }
        // La administradora que firma los tokens existe como cuenta, igual que en la aplicación
        await bd.query('insert into auth.users (id) values ($1)', [ADMIN_ID]);
        await bd.query("insert into public.profiles (id, role_id, nombre, correo) values ($1, $2, 'Prueba', 'prueba@example.com')", [
            ADMIN_ID,
            roles['administrador']
        ]);

        ({ servidor, base } = await iniciarApp(TOKEN_N8N));
    });

    after(async () => {
        await cerrar(servidor);
        for (const extra of extras) await cerrar(extra);
        await bd.close();
    });

    beforeEach(async () => {
        await bd.exec(`truncate table public.mensajes_whatsapp_entrantes, public.convocatorias, public.events,
                       public.quote, public.venue, public.transportation restart identity cascade`);
        await bd.exec(`delete from public.event_staff;
                       delete from public.profiles where id <> '${ADMIN_ID}';
                       delete from auth.users where id <> '${ADMIN_ID}'`);
    });

    // -----------------------------------------------------------------------------------------
    // Crear
    // -----------------------------------------------------------------------------------------

    describe('POST /api/convocatorias (crear)', () => {
        it('crea la convocatoria con los datos del evento y los teléfonos normalizados', async () => {
            const { cotizacionId, eventoId } = await crearEvento();
            const laura = await crearTrabajador('Laura', '3000000001'); // celular sin indicativo
            const pedro = await crearTrabajador('Pedro', '573000000002'); // con indicativo, como lo guarda Auth

            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura, pedro]) });

            assert.equal(r.estado, 201);
            assert.equal(r.cuerpo.status, 'ok');
            const c = r.cuerpo.convocatoria;
            assert.deepEqual(
                {
                    eventoId: c.eventoId,
                    cotizacionId: c.cotizacionId,
                    nombreEvento: c.nombreEvento,
                    fechaEvento: c.fechaEvento,
                    horaInicio: c.horaInicio,
                    horaFin: c.horaFin,
                    lugar: c.lugar,
                    estado: c.estado,
                    envioIniciadoEn: c.envioIniciadoEn
                },
                {
                    eventoId,
                    cotizacionId,
                    nombreEvento: 'Celebración empresarial',
                    fechaEvento: await fechaEn(14),
                    horaInicio: '15:00',
                    horaFin: '23:00',
                    lugar: 'Hotel Termales, Manizales',
                    estado: 'BORRADOR',
                    envioIniciadoEn: null
                }
            );
            assert.deepEqual(c.resumen, { total: 2, confirmados: 0, rechazados: 0, pendientes: 2, enviados: 0, conError: 0 });
            assert.deepEqual(
                c.destinatarios.map((d: Json) => [d.nombre, d.telefono, d.estadoRespuesta, d.estadoEnvio, d.enviadoEn]),
                [
                    ['Laura', '+573000000001', 'PENDIENTE', 'PENDIENTE', null],
                    ['Pedro', '+573000000002', 'PENDIENTE', 'PENDIENTE', null]
                ]
            );

            // Lo que ya está en la cotización no se copia: la convocatoria solo guarda su horario
            const guardada = await uno<Json>('select event_id, nombre_evento, lugar from public.convocatorias');
            assert.deepEqual(guardada, { event_id: eventoId, nombre_evento: null, lugar: null });
            assert.equal(await contar('event_staff', `convocatoria_id = '${c.id}'`), 2);
        });

        it('respeta lo que la administradora corrige: nombre, lugar y hora de inicio', async () => {
            const { cotizacionId } = await crearEvento();
            const laura = await crearTrabajador('Laura', '3000000001');

            const r = await api('POST', '/api/convocatorias', {
                cookie: comoAdmin(),
                cuerpo: cuerpoCrear(cotizacionId, [laura], {
                    nombreEvento: '  Boda   de\nAna y Luis ',
                    lugar: 'Finca  La Esperanza, Chinchiná',
                    horaInicio: '16:30',
                    horaFin: '02:00'
                })
            });

            assert.equal(r.estado, 201);
            const c = r.cuerpo.convocatoria;
            assert.equal(c.nombreEvento, 'Boda de Ana y Luis', 'el texto queda en una sola línea');
            assert.equal(c.lugar, 'Finca La Esperanza, Chinchiná');
            assert.equal(c.horaInicio, '16:30');
            assert.equal(c.horaFin, '02:00', 'un evento puede terminar después de medianoche');
            const guardada = await uno<Json>('select nombre_evento, lugar from public.convocatorias');
            assert.deepEqual(guardada, { nombre_evento: 'Boda de Ana y Luis', lugar: 'Finca La Esperanza, Chinchiná' });
        });

        it('sin sede del catálogo usa la sede escrita a mano y la ciudad del transporte', async () => {
            const { cotizacionId } = await crearEvento({ sede: null, sedeManual: 'Hacienda El Roble', ciudadTransporte: 'Pereira' });
            const laura = await crearTrabajador('Laura', '3000000001');
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });
            assert.equal(r.estado, 201);
            assert.equal(r.cuerpo.convocatoria.lugar, 'Hacienda El Roble, Pereira');
        });

        it('acepta el cotizacionId como texto numérico y un evento que es hoy', async () => {
            const { cotizacionId } = await crearEvento({ dias: 0 });
            const laura = await crearTrabajador('Laura', '3000000001');
            const r = await api('POST', '/api/convocatorias', {
                cookie: comoAdmin(),
                cuerpo: cuerpoCrear(cotizacionId, [laura], { cotizacionId: String(cotizacionId) })
            });
            assert.equal(r.estado, 201, 'el día del evento todavía se puede convocar');
        });

        it('permite varias convocatorias para el mismo evento, cada una con sus propios trabajadores', async () => {
            const { cotizacionId } = await crearEvento();
            const laura = await crearTrabajador('Laura', '3000000001');
            const pedro = await crearTrabajador('Pedro', '3000000002');
            const diana = await crearTrabajador('Diana', '3000000003');
            const montaje = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura, pedro], { horaInicio: '08:00', horaFin: '14:00' }) });
            const show = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [diana]) });

            assert.equal(montaje.estado, 201);
            assert.equal(show.estado, 201);
            assert.notEqual(montaje.cuerpo.convocatoria.id, show.cuerpo.convocatoria.id);
            assert.equal(await contar('convocatorias'), 2);
            assert.equal(await contar('event_staff'), 3);
        });

        it('no toca las asignaciones que ya existen en event_staff', async () => {
            const { cotizacionId, eventoId } = await crearEvento();
            const manual = await crearTrabajador('Manual', '3000000009');
            await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventoId, manual]);
            const laura = await crearTrabajador('Laura', '3000000001');

            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });

            assert.equal(r.estado, 201);
            const fila = await uno<Json>(
                'select convocatoria_id, estado_respuesta, estado_envio from public.event_staff where profile_id = $1',
                [manual]
            );
            assert.deepEqual(fila, { convocatoria_id: null, estado_respuesta: null, estado_envio: null });
        });
    });

    describe('POST /api/convocatorias: autorización', () => {
        it('sin sesión responde 401 en los tres endpoints de la administradora', async () => {
            const { convocatoria } = await convocatoriaLista();
            for (const [metodo, ruta, cuerpo] of [
                ['POST', '/api/convocatorias', cuerpoCrear(1, [UUID_INEXISTENTE])],
                ['GET', '/api/convocatorias?cotizacionId=1', undefined],
                ['POST', `/api/convocatorias/${convocatoria.id}/enviar`, undefined]
            ] as const) {
                const r = await api(metodo, ruta, cuerpo === undefined ? {} : { cuerpo });
                assert.equal(r.estado, 401, `${metodo} ${ruta}`);
            }
        });

        it('una cookie de sesión manipulada responde 401', async () => {
            const r = await api('GET', '/api/convocatorias?cotizacionId=1', { cookie: `${comoAdmin()}x` });
            assert.equal(r.estado, 401);
        });

        it('la secretaria y el jefe de logística reciben 403: solo la administradora gestiona convocatorias', async () => {
            const { convocatoria, cotizacionId, laura } = await convocatoriaLista();
            for (const rol of ['secretaria', 'jefe_logistica'] as const) {
                const sesion = firmarSesion(rol);
                const crear = await api('POST', '/api/convocatorias', { cookie: sesion, cuerpo: cuerpoCrear(cotizacionId, [laura]) });
                const listar = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: sesion });
                const enviar = await api('POST', `/api/convocatorias/${convocatoria.id}/enviar`, { cookie: sesion });
                assert.deepEqual([crear.estado, listar.estado, enviar.estado], [403, 403, 403], `rol ${rol}`);
            }
            assert.equal(await contar('convocatorias'), 1, 'no se creó nada');
            const estado = await uno<{ estado: string }>('select estado from public.convocatorias');
            assert.equal(estado.estado, 'BORRADOR', 'tampoco se inició el envío');
        });
    });

    describe('POST /api/convocatorias: solicitud mal formada (400)', () => {
        const invalidas: { nombre: string; cambio: Record<string, unknown>; codigo: string }[] = [
            { nombre: 'sin cotizacionId', cambio: { cotizacionId: undefined }, codigo: 'COTIZACION_INVALIDA' },
            { nombre: 'cotizacionId negativo', cambio: { cotizacionId: -3 }, codigo: 'COTIZACION_INVALIDA' },
            { nombre: 'cotizacionId decimal', cambio: { cotizacionId: 1.5 }, codigo: 'COTIZACION_INVALIDA' },
            { nombre: 'cotizacionId que no es número', cambio: { cotizacionId: 'abc' }, codigo: 'COTIZACION_INVALIDA' },
            { nombre: 'trabajadorIds ausente', cambio: { trabajadorIds: undefined }, codigo: 'TRABAJADORES_REQUERIDOS' },
            { nombre: 'trabajadorIds vacío', cambio: { trabajadorIds: [] }, codigo: 'TRABAJADORES_REQUERIDOS' },
            { nombre: 'trabajadorIds que no es una lista', cambio: { trabajadorIds: 'uno' }, codigo: 'TRABAJADORES_REQUERIDOS' },
            { nombre: 'trabajador con identificador inválido', cambio: { trabajadorIds: ['no-es-un-uuid'] }, codigo: 'TRABAJADOR_INVALIDO' },
            {
                nombre: 'más de 100 trabajadores',
                cambio: { trabajadorIds: Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) },
                codigo: 'DEMASIADOS_TRABAJADORES'
            },
            { nombre: 'sin hora de fin', cambio: { horaFin: undefined }, codigo: 'HORA_FIN_REQUERIDA' },
            { nombre: 'hora de fin 25:00', cambio: { horaFin: '25:00' }, codigo: 'HORA_INVALIDA' },
            { nombre: 'hora de fin sin cero inicial', cambio: { horaFin: '9:00' }, codigo: 'HORA_INVALIDA' },
            { nombre: 'hora de inicio inválida', cambio: { horaInicio: '99:99' }, codigo: 'HORA_INVALIDA' },
            { nombre: 'nombreEvento que no es texto', cambio: { nombreEvento: 123 }, codigo: 'TEXTO_INVALIDO' },
            { nombre: 'nombreEvento demasiado largo', cambio: { nombreEvento: 'x'.repeat(121) }, codigo: 'TEXTO_MUY_LARGO' },
            { nombre: 'lugar demasiado largo', cambio: { lugar: 'x'.repeat(201) }, codigo: 'TEXTO_MUY_LARGO' }
        ];
        for (const { nombre, cambio, codigo } of invalidas) {
            it(`${nombre} → 400 ${codigo}`, async () => {
                const { cotizacionId } = await crearEvento();
                const laura = await crearTrabajador('Laura', '3000000001');
                const r = await api('POST', '/api/convocatorias', {
                    cookie: comoAdmin(),
                    cuerpo: { ...cuerpoCrear(cotizacionId, [laura]), ...cambio }
                });
                assert.equal(r.estado, 400);
                assert.equal(r.cuerpo.status, 'error');
                assert.equal(r.cuerpo.codigo, codigo);
                assert.equal(await contar('convocatorias'), 0);
            });
        }

        it('un cuerpo que no es un objeto → 400 SOLICITUD_INVALIDA', async () => {
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: [] });
            assert.equal(r.estado, 400);
            assert.equal(r.cuerpo.codigo, 'SOLICITUD_INVALIDA');
        });

        it('un trabajador repetido en la lista → 400 TRABAJADORES_DUPLICADOS', async () => {
            const { cotizacionId } = await crearEvento();
            const laura = await crearTrabajador('Laura', '3000000001');
            const r = await api('POST', '/api/convocatorias', {
                cookie: comoAdmin(),
                cuerpo: cuerpoCrear(cotizacionId, [laura, laura.toUpperCase()])
            });
            assert.equal(r.estado, 400);
            assert.equal(r.cuerpo.codigo, 'TRABAJADORES_DUPLICADOS');
        });

        it('la hora de fin igual a la de inicio → 400 HORARIO_INVALIDO', async () => {
            const { cotizacionId } = await crearEvento({ hora: '15:00' });
            const laura = await crearTrabajador('Laura', '3000000001');
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura], { horaFin: '15:00' }) });
            assert.equal(r.estado, 400);
            assert.equal(r.cuerpo.codigo, 'HORARIO_INVALIDO');
        });
    });

    describe('POST /api/convocatorias: datos que faltan en el evento', () => {
        it('sin tipo de evento hay que indicar el nombre', async () => {
            const { cotizacionId } = await crearEvento({ tipo: null });
            const laura = await crearTrabajador('Laura', '3000000001');
            const sin = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });
            assert.equal(sin.estado, 400);
            assert.equal(sin.cuerpo.codigo, 'NOMBRE_EVENTO_REQUERIDO');
            const con = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura], { nombreEvento: 'Cumpleaños' }) });
            assert.equal(con.estado, 201);
        });

        it('una hora 00:00 por defecto parece un marcador: hay que confirmar la hora de inicio', async () => {
            const { cotizacionId } = await crearEvento({ hora: '00:00' });
            const laura = await crearTrabajador('Laura', '3000000001');
            const sin = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });
            assert.equal(sin.estado, 400);
            assert.equal(sin.cuerpo.codigo, 'HORA_INICIO_REQUERIDA');
            const con = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura], { horaInicio: '19:00' }) });
            assert.equal(con.estado, 201);
            assert.equal(con.cuerpo.convocatoria.horaInicio, '19:00');
        });

        it('sin sede ni ciudad hay que indicar el lugar', async () => {
            const { cotizacionId } = await crearEvento({ sede: null });
            const laura = await crearTrabajador('Laura', '3000000001');
            const sin = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });
            assert.equal(sin.estado, 400);
            assert.equal(sin.cuerpo.codigo, 'LUGAR_REQUERIDO');
            const con = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura], { lugar: 'Manizales' }) });
            assert.equal(con.estado, 201);
        });
    });

    describe('POST /api/convocatorias: el evento debe existir y estar habilitado', () => {
        it('un evento que no existe → 404', async () => {
            const laura = await crearTrabajador('Laura', '3000000001');
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(987654, [laura]) });
            assert.equal(r.estado, 404);
            assert.equal(r.cuerpo.codigo, 'EVENTO_NO_ENCONTRADO');
        });

        for (const { nombre, evento, codigo } of eventosNoConvocables) {
            it(`${nombre} → 409 ${codigo}`, async () => {
                const { cotizacionId } = await crearEvento(evento);
                const laura = await crearTrabajador('Laura', '3000000001');
                const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });
                assert.equal(r.estado, 409);
                assert.equal(r.cuerpo.codigo, codigo);
                assert.equal(await contar('convocatorias'), 0);
            });
        }
    });

    describe('POST /api/convocatorias: los trabajadores deben poder convocarse (422)', () => {
        const detallesDe = (r: Respuesta): [string | null, string][] =>
            r.cuerpo.detalles.map((d: Json) => [d.nombre, d.motivo]).sort();

        it('un trabajador que no existe', async () => {
            const { cotizacionId } = await crearEvento();
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [UUID_INEXISTENTE]) });
            assert.equal(r.estado, 422);
            assert.equal(r.cuerpo.codigo, 'TRABAJADORES_NO_VALIDOS');
            assert.deepEqual(r.cuerpo.detalles, [{ trabajadorId: UUID_INEXISTENTE, nombre: null, motivo: 'NO_ENCONTRADO' }]);
        });

        it('una cuenta que no es de personal de logística (otro rol o sin rol) y una sin celular válido', async () => {
            const { cotizacionId } = await crearEvento();
            const ids = [
                await crearTrabajador('Carlos', '3000000003', { rol: 'secretaria' }),
                await crearTrabajador('Diana', '3000000004', { rol: null }),
                await crearTrabajador('Elena', 'llamar a Elena'),
                await crearTrabajador('Fabio', null)
            ];
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, ids) });
            assert.equal(r.estado, 422);
            assert.deepEqual(detallesDe(r), [
                ['Carlos', 'NO_ES_TRABAJADOR'],
                ['Diana', 'NO_ES_TRABAJADOR'],
                ['Elena', 'TELEFONO_INVALIDO'],
                ['Fabio', 'TELEFONO_INVALIDO']
            ]);
            assert.match(r.cuerpo.message, /Carlos \(su cuenta no tiene el rol trabajador\)/);
        });

        it('un trabajador ya asignado a mano a este evento no se puede convocar; uno ya convocado, tampoco', async () => {
            const { cotizacionId, eventoId } = await crearEvento();
            const asignado = await crearTrabajador('Asignado', '3000000005');
            const convocado = await crearTrabajador('Convocado', '3000000006');
            await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventoId, asignado]);
            const primera = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [convocado]) });
            assert.equal(primera.estado, 201);

            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [asignado, convocado]) });

            assert.equal(r.estado, 422);
            assert.deepEqual(detallesDe(r), [
                ['Asignado', 'YA_ASIGNADO'],
                ['Convocado', 'YA_CONVOCADO']
            ]);
            assert.equal(await contar('convocatorias'), 1, 'no se creó una segunda convocatoria');
        });

        it('el mismo trabajador sí se puede convocar a otro evento', async () => {
            const laura = await crearTrabajador('Laura', '3000000001');
            for (const evento of [await crearEvento(), await crearEvento({ tipo: 'Boda' })]) {
                const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(evento.cotizacionId, [laura]) });
                assert.equal(r.estado, 201);
            }
            assert.equal(await contar('event_staff', `profile_id = '${laura}'`), 2);
        });

        it('dos trabajadores con el mismo celular (escrito distinto) no se pueden convocar juntos', async () => {
            const { cotizacionId } = await crearEvento();
            const ids = [await crearTrabajador('Laura', '3000000001'), await crearTrabajador('Pedro', '573000000001')];
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, ids) });
            assert.equal(r.estado, 422);
            assert.deepEqual(detallesDe(r), [
                ['Laura', 'TELEFONO_DUPLICADO'],
                ['Pedro', 'TELEFONO_DUPLICADO']
            ]);
        });

        it('es todo o nada: si uno falla no se crea la convocatoria ni sus otros trabajadores', async () => {
            const { cotizacionId } = await crearEvento();
            const ids = [await crearTrabajador('Laura', '3000000001'), await crearTrabajador('Carlos', '3000000003', { rol: 'secretaria' })];
            const r = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, ids) });
            assert.equal(r.estado, 422);
            assert.deepEqual(detallesDe(r), [['Carlos', 'NO_ES_TRABAJADOR']], 'solo se informa a quien falla');
            assert.equal(await contar('convocatorias'), 0);
            assert.equal(await contar('event_staff'), 0);
        });
    });

    // -----------------------------------------------------------------------------------------
    // Consultar
    // -----------------------------------------------------------------------------------------

    describe('GET /api/convocatorias?cotizacionId= (consultar)', () => {
        it('un evento sin convocatorias devuelve una lista vacía', async () => {
            const { cotizacionId } = await crearEvento();
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            assert.equal(r.estado, 200);
            assert.equal(r.cuerpo.status, 'ok');
            assert.deepEqual(r.cuerpo.convocatorias, []);
        });

        it('un evento que no existe → 404; sin cotizacionId o inválido → 400', async () => {
            assert.equal((await api('GET', '/api/convocatorias?cotizacionId=987654', { cookie: comoAdmin() })).estado, 404);
            for (const consulta of ['', '?cotizacionId=', '?cotizacionId=abc', '?cotizacionId=-1', '?cotizacionId=1&cotizacionId=2']) {
                const r = await api('GET', `/api/convocatorias${consulta}`, { cookie: comoAdmin() });
                assert.equal(r.estado, 400, `consulta "${consulta}"`);
                assert.equal(r.cuerpo.codigo, 'COTIZACION_INVALIDA');
            }
        });

        it('cada convocatoria muestra solo sus respuestas aunque el evento tenga varias', async () => {
            const { cotizacionId } = await crearEvento();
            const laura = await crearTrabajador('Laura', '3000000001');
            const pedro = await crearTrabajador('Pedro', '3000000002');
            const diana = await crearTrabajador('Diana', '3000000003');
            const a = (await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura, pedro]) })).cuerpo.convocatoria;
            const b = (await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [diana], { horaFin: '22:00' }) })).cuerpo.convocatoria;

            await registrarRespuesta(a.id, laura, 'CONFIRMADO');
            await registrarRespuesta(b.id, diana, 'RECHAZADO');

            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            assert.equal(r.estado, 200);
            const lista: Json[] = r.cuerpo.convocatorias;
            assert.equal(lista.length, 2);
            const listaA = lista.find((c) => c.id === a.id);
            const listaB = lista.find((c) => c.id === b.id);
            assert.deepEqual(listaA.resumen, { total: 2, confirmados: 1, rechazados: 0, pendientes: 1, enviados: 0, conError: 0 });
            assert.deepEqual(listaB.resumen, { total: 1, confirmados: 0, rechazados: 1, pendientes: 0, enviados: 0, conError: 0 });
            assert.deepEqual(
                listaA.destinatarios.map((d: Json) => [d.nombre, d.estadoRespuesta]),
                [['Laura', 'CONFIRMADO'], ['Pedro', 'PENDIENTE']]
            );
            assert.deepEqual(listaB.destinatarios.map((d: Json) => [d.nombre, d.estadoRespuesta]), [['Diana', 'RECHAZADO']]);
            assert.notEqual(listaA.destinatarios[0].respondidoEn, null);
        });

        it('no mezcla las convocatorias de otros eventos ni lista como convocados a quienes se asignaron a mano', async () => {
            const eventoA = await crearEvento();
            const eventoB = await crearEvento({ tipo: 'Boda' });
            const laura = await crearTrabajador('Laura', '3000000001');
            const manual = await crearTrabajador('Manual', '3000000009');
            await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventoA.eventoId, manual]);
            const enA = (await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(eventoA.cotizacionId, [laura]) })).cuerpo.convocatoria;
            await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(eventoB.cotizacionId, [laura]) });

            const r = await api('GET', `/api/convocatorias?cotizacionId=${eventoA.cotizacionId}`, { cookie: comoAdmin() });
            assert.deepEqual(r.cuerpo.convocatorias.map((c: Json) => c.id), [enA.id]);
            assert.deepEqual(r.cuerpo.convocatorias[0].destinatarios.map((d: Json) => d.nombre), ['Laura']);
        });

        it('los datos del evento se leen de la cotización: si cambian después, la convocatoria lo refleja', async () => {
            const { cotizacionId } = await convocatoriaLista();
            await bd.query("update public.quote set event_type = 'Aniversario', date = date + 3 where id = $1", [cotizacionId]);
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            const c = r.cuerpo.convocatorias[0];
            assert.equal(c.nombreEvento, 'Aniversario');
            assert.equal(c.fechaEvento, await fechaEn(17));
        });

        it('refleja el estado de los envíos de cada trabajador', async () => {
            const { convocatoria, cotizacionId, laura, pedro } = await convocatoriaLista();
            await bd.query(
                `update public.event_staff set estado_envio = 'ENVIADO', wa_message_id = 'wamid.SALIENTE-1', enviado_en = now()
                  where convocatoria_id = $1 and profile_id = $2`,
                [convocatoria.id, laura]
            );
            await bd.query(
                `update public.event_staff set estado_envio = 'ERROR', error_envio = 'Número sin WhatsApp'
                  where convocatoria_id = $1 and profile_id = $2`,
                [convocatoria.id, pedro]
            );
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            const c = r.cuerpo.convocatorias[0];
            assert.equal(c.resumen.enviados, 1);
            assert.equal(c.resumen.conError, 1);
            const porNombre = Object.fromEntries(c.destinatarios.map((d: Json) => [d.nombre, d]));
            assert.equal(porNombre.Laura.estadoEnvio, 'ENVIADO');
            assert.notEqual(porNombre.Laura.enviadoEn, null);
            assert.deepEqual([porNombre.Pedro.estadoEnvio, porNombre.Pedro.error], ['ERROR', 'Número sin WhatsApp']);
        });

        it('sigue mostrando el historial aunque el evento ya no admita nuevas convocatorias', async () => {
            const { cotizacionId } = await convocatoriaLista();
            await bd.query("update public.quote set estado = 'cancelada' where id = $1", [cotizacionId]);
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            assert.equal(r.estado, 200);
            assert.equal(r.cuerpo.convocatorias.length, 1);
        });

        it('informa los datos del evento y que admite convocatorias', async () => {
            const { cotizacionId } = await crearEvento({
                hora: '18:30',
                tipo: 'Boda',
                sede: { nombre: 'Hacienda Los Robles', ciudad: 'Chía' }
            });
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            assert.equal(r.estado, 200);
            assert.deepEqual(r.cuerpo.evento, {
                cotizacionId,
                convocable: true,
                motivo: null,
                fecha: await fechaEn(14),
                horaInicio: '18:30',
                nombre: 'Boda',
                lugar: 'Hacienda Los Robles, Chía',
                requiereHoraInicio: false,
                requiereNombre: false,
                requiereLugar: false
            });
        });

        it('un evento de hoy admite convocatorias', async () => {
            const { cotizacionId } = await crearEvento({ dias: 0 });
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
            assert.equal(r.cuerpo.evento.convocable, true);
            assert.equal(r.cuerpo.evento.fecha, await fechaEn(0));
        });

        for (const { nombre, evento, codigo } of eventosNoConvocables) {
            it(`${nombre}: sigue consultándose, pero dice que no admite convocatorias (${codigo})`, async () => {
                const { cotizacionId } = await crearEvento(evento);
                const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() });
                assert.equal(r.estado, 200);
                assert.equal(r.cuerpo.evento.convocable, false);
                assert.equal(r.cuerpo.evento.motivo.codigo, codigo);
                assert.match(r.cuerpo.evento.motivo.mensaje, /\S/);
                assert.deepEqual(r.cuerpo.convocatorias, []);
            });
        }

        it('avisa qué datos debe indicar la administradora porque la cotización no los trae', async () => {
            const sinHora = await crearEvento({ hora: '00:00' });
            const sinTipo = await crearEvento({ tipo: null });
            const sinSede = await crearEvento({ sede: null });
            const evento = async (cotizacionId: number) =>
                (await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { cookie: comoAdmin() })).cuerpo.evento;

            const a = await evento(sinHora.cotizacionId);
            assert.deepEqual([a.requiereHoraInicio, a.requiereNombre, a.requiereLugar], [true, false, false]);
            const b = await evento(sinTipo.cotizacionId);
            assert.deepEqual([b.requiereHoraInicio, b.requiereNombre, b.requiereLugar], [false, true, false]);
            assert.equal(b.nombre, null);
            const c = await evento(sinSede.cotizacionId);
            assert.deepEqual([c.requiereHoraInicio, c.requiereNombre, c.requiereLugar], [false, false, true]);
            assert.equal(c.lugar, null);
        });
    });

    // -----------------------------------------------------------------------------------------
    // Trabajadores que se pueden convocar
    // -----------------------------------------------------------------------------------------

    describe('GET /api/convocatorias/trabajadores (a quién se puede convocar)', () => {
        const listar = (cotizacionId: number, cookie = comoAdmin()) =>
            api('GET', `/api/convocatorias/trabajadores?cotizacionId=${cotizacionId}`, { cookie });
        const resumen = (r: Respuesta): [string, boolean, string | null][] =>
            r.cuerpo.trabajadores.map((t: Json) => [t.nombre, t.elegible, t.motivo?.codigo ?? null]);
        const porNombre = (r: Respuesta): Record<string, Json> =>
            Object.fromEntries(r.cuerpo.trabajadores.map((t: Json) => [t.nombre, t]));

        it('lista solo a los trabajadores, por orden alfabético y con el celular normalizado', async () => {
            const { cotizacionId } = await crearEvento();
            const pedro = await crearTrabajador('Pedro', '573000000002');
            const laura = await crearTrabajador('Laura', '3000000001');
            await crearTrabajador('Carlos', '3000000003', { rol: 'secretaria' });
            await crearTrabajador('Sin rol', '3000000004', { rol: null });

            const r = await listar(cotizacionId);
            assert.equal(r.estado, 200);
            assert.equal(r.cuerpo.status, 'ok');
            assert.deepEqual(
                r.cuerpo.trabajadores.map((t: Json) => [t.id, t.nombre, t.telefono, t.elegible, t.motivo, t.noDisponibleEseDia]),
                [
                    [laura, 'Laura', '+573000000001', true, null, false],
                    [pedro, 'Pedro', '+573000000002', true, null, false]
                ],
                'ni la secretaria, ni la cuenta sin rol, ni la administradora son trabajadores'
            );
        });

        it('si no hay trabajadores devuelve una lista vacía', async () => {
            const { cotizacionId } = await crearEvento();
            const r = await listar(cotizacionId);
            assert.equal(r.estado, 200);
            assert.deepEqual(r.cuerpo.trabajadores, []);
        });

        it('explica por qué no se puede convocar a quien no cumple', async () => {
            const { cotizacionId, eventoId } = await crearEvento();
            await crearTrabajador('Ana', null);
            await crearTrabajador('Beto', '');
            await crearTrabajador('Carla', '6012345678'); // fijo de Bogotá: no sirve para WhatsApp
            const diego = await crearTrabajador('Diego', '3000000011');
            const elena = await crearTrabajador('Elena', '3000000012');
            await crearTrabajador('Fabio', '3000000013');
            const convocar = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [diego]) });
            assert.equal(convocar.estado, 201);
            await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventoId, elena]);

            const r = await listar(cotizacionId);
            assert.deepEqual(resumen(r), [
                ['Ana', false, 'SIN_TELEFONO'],
                ['Beto', false, 'SIN_TELEFONO'],
                ['Carla', false, 'TELEFONO_INVALIDO'],
                ['Diego', false, 'YA_CONVOCADO'],
                ['Elena', false, 'YA_ASIGNADO'],
                ['Fabio', true, null]
            ]);
            const trabajadores = porNombre(r);
            for (const nombre of ['Ana', 'Beto', 'Carla', 'Diego', 'Elena']) {
                assert.match(trabajadores[nombre].motivo.mensaje, /\S/, `${nombre} trae el texto del motivo`);
            }
            assert.equal(trabajadores.Carla.telefono, null, 'un celular que no sirve no se presenta como válido');
            assert.equal(trabajadores.Diego.telefono, '+573000000011', 'quien ya fue convocado conserva su celular');
        });

        it('quien fue convocado o asignado a otro evento sigue disponible para este', async () => {
            const otro = await crearEvento({ tipo: 'Boda' });
            const { cotizacionId } = await crearEvento();
            const laura = await crearTrabajador('Laura', '3000000001');
            const pedro = await crearTrabajador('Pedro', '3000000002');
            await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(otro.cotizacionId, [laura]) });
            await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [otro.eventoId, pedro]);

            assert.deepEqual(resumen(await listar(cotizacionId)), [['Laura', true, null], ['Pedro', true, null]]);
        });

        it('advierte de quien marcó no disponible el día del evento, sin impedir convocarlo', async () => {
            const { cotizacionId } = await crearEvento({ dias: 10 });
            const laura = await crearTrabajador('Laura', '3000000001');
            const pedro = await crearTrabajador('Pedro', '3000000002');
            await bd.query(
                'insert into public.unavailability_users (id_user, date) values ($1, $2::date), ($3, $4::date)',
                [laura, await fechaEn(10), pedro, await fechaEn(11)]
            );

            const r = await listar(cotizacionId);
            const trabajadores = porNombre(r);
            assert.deepEqual([trabajadores.Laura.noDisponibleEseDia, trabajadores.Laura.elegible], [true, true]);
            assert.deepEqual([trabajadores.Pedro.noDisponibleEseDia, trabajadores.Pedro.elegible], [false, true], 'otro día no cuenta');

            const crear = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [laura]) });
            assert.equal(crear.estado, 201, 'la advertencia no es un impedimento');
        });

        it('lo que la lista ofrece coincide con lo que acepta la creación (misma regla)', async () => {
            const { cotizacionId, eventoId } = await crearEvento();
            await crearTrabajador('Ana', null);
            await crearTrabajador('Carla', '6012345678');
            const diego = await crearTrabajador('Diego', '3000000011');
            const elena = await crearTrabajador('Elena', '3000000012');
            await crearTrabajador('Fabio', '3000000013');
            await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [diego]) });
            await bd.query('insert into public.event_staff (event_id, profile_id) values ($1, $2)', [eventoId, elena]);

            const r = await listar(cotizacionId);
            assert.equal(r.cuerpo.trabajadores.length, 5);
            for (const t of r.cuerpo.trabajadores as Json[]) {
                const crear = await api('POST', '/api/convocatorias', { cookie: comoAdmin(), cuerpo: cuerpoCrear(cotizacionId, [t.id]) });
                if (t.elegible) {
                    assert.equal(crear.estado, 201, `${t.nombre} figura como elegible y debe poder convocarse`);
                } else {
                    assert.equal(crear.estado, 422, `${t.nombre} figura como no elegible (${t.motivo.codigo}) y debe rechazarse`);
                    const codigoCreacion = t.motivo.codigo === 'SIN_TELEFONO' ? 'TELEFONO_INVALIDO' : t.motivo.codigo;
                    assert.equal(crear.cuerpo.detalles[0].motivo, codigoCreacion);
                }
            }
        });

        for (const { nombre, evento, codigo } of eventosNoConvocables) {
            it(`${nombre} → 409 ${codigo}`, async () => {
                const { cotizacionId } = await crearEvento(evento);
                await crearTrabajador('Laura', '3000000001');
                const r = await listar(cotizacionId);
                assert.equal(r.estado, 409);
                assert.equal(r.cuerpo.codigo, codigo);
            });
        }

        it('un evento que no existe → 404; sin cotizacionId o inválido → 400', async () => {
            assert.equal((await listar(987654)).estado, 404);
            for (const consulta of ['', '?cotizacionId=', '?cotizacionId=abc', '?cotizacionId=0']) {
                const r = await api('GET', `/api/convocatorias/trabajadores${consulta}`, { cookie: comoAdmin() });
                assert.equal(r.estado, 400, `consulta "${consulta}"`);
                assert.equal(r.cuerpo.codigo, 'COTIZACION_INVALIDA');
            }
        });

        it('sin sesión responde 401; la secretaria y el jefe de logística, 403', async () => {
            const { cotizacionId } = await crearEvento();
            await crearTrabajador('Laura', '3000000001');
            const ruta = `/api/convocatorias/trabajadores?cotizacionId=${cotizacionId}`;
            assert.equal((await api('GET', ruta)).estado, 401);
            assert.equal((await api('GET', ruta, { cookie: `${comoAdmin()}x` })).estado, 401);
            for (const rol of ['secretaria', 'jefe_logistica'] as const) {
                assert.equal((await api('GET', ruta, { cookie: firmarSesion(rol) })).estado, 403, `rol ${rol}`);
            }
        });
    });

    // -----------------------------------------------------------------------------------------
    // Iniciar el envío
    // -----------------------------------------------------------------------------------------

    describe('POST /api/convocatorias/:id/enviar (iniciar el envío)', () => {
        it('pasa a ENVIANDO pero NO marca a nadie como enviado (no se simula el envío)', async () => {
            const { convocatoria } = await convocatoriaLista();
            const r = await api('POST', `/api/convocatorias/${convocatoria.id}/enviar`, { cookie: comoAdmin() });

            assert.equal(r.estado, 202);
            assert.equal(r.cuerpo.status, 'ok');
            assert.match(r.cuerpo.message, /todavía no se ha enviado ningún mensaje/);
            const c = r.cuerpo.convocatoria;
            assert.equal(c.estado, 'ENVIANDO');
            assert.notEqual(c.envioIniciadoEn, null);
            assert.deepEqual(
                c.destinatarios.map((d: Json) => [d.estadoEnvio, d.enviadoEn, d.estadoRespuesta]),
                [['PENDIENTE', null, 'PENDIENTE'], ['PENDIENTE', null, 'PENDIENTE']]
            );
            assert.equal(c.resumen.enviados, 0);
        });

        it('una solicitud repetida recibe 409 y no vuelve a iniciar el envío', async () => {
            const { convocatoria } = await convocatoriaLista();
            const ruta = `/api/convocatorias/${convocatoria.id}/enviar`;
            const primera = await api('POST', ruta, { cookie: comoAdmin() });
            const inicio = await uno<{ t: string }>('select envio_iniciado_en::text as t from public.convocatorias');

            const repetida = await api('POST', ruta, { cookie: comoAdmin() });
            assert.equal(primera.estado, 202);
            assert.equal(repetida.estado, 409);
            assert.equal(repetida.cuerpo.codigo, 'CONVOCATORIA_EN_ENVIO');
            assert.deepEqual(repetida.cuerpo.detalles, { estado: 'ENVIANDO' });
            assert.deepEqual(await uno('select envio_iniciado_en::text as t from public.convocatorias'), inicio, 'la fecha de inicio no cambia');
        });

        it('cinco solicitudes simultáneas (doble clic, reintentos): solo una inicia el envío', async () => {
            const { convocatoria } = await convocatoriaLista();
            const ruta = `/api/convocatorias/${convocatoria.id}/enviar`;
            const respuestas = await Promise.all(Array.from({ length: 5 }, () => api('POST', ruta, { cookie: comoAdmin() })));
            assert.deepEqual(respuestas.map((r) => r.estado).sort(), [202, 409, 409, 409, 409]);
            for (const r of respuestas.filter((x) => x.estado === 409)) assert.ok(['CONVOCATORIA_EN_ENVIO'].includes(r.cuerpo.codigo));
        });

        it('si dos solicitudes ya vieron "BORRADOR" a la vez, el UPDATE condicional deja pasar solo a una', async () => {
            // Con una base real de varias conexiones la revisión previa no basta: dos solicitudes pueden
            // verla en BORRADOR antes de que alguna actualice. Aquí se fuerza esa carrera deteniendo
            // cada UPDATE hasta que las dos hayan llegado a él.
            const servicio = await import('../src/convocatorias/servicio.js');
            const { convocatoria } = await convocatoriaLista();
            const real = consultaDePGlite(bd);
            let llegadas = 0;
            let soltar: () => void = () => undefined;
            const puerta = new Promise<void>((resolver) => {
                soltar = resolver;
            });
            const conCarrera: Consulta = {
                async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
                    if (/^\s*update\s+public\.convocatorias/i.test(sql)) {
                        llegadas += 1;
                        if (llegadas === 2) soltar();
                        await puerta;
                    }
                    return real.query<T>(sql, params);
                }
            };

            const resultados = await Promise.allSettled([
                servicio.iniciarEnvio(conCarrera, convocatoria.id),
                servicio.iniciarEnvio(conCarrera, convocatoria.id)
            ]);

            assert.equal(llegadas, 2, 'las dos solicitudes llegaron al UPDATE');
            assert.deepEqual(resultados.map((r) => r.status).sort(), ['fulfilled', 'rejected']);
            const rechazada = resultados.find((r): r is PromiseRejectedResult => r.status === 'rejected');
            assert.equal((rechazada?.reason as { codigo?: string }).codigo, 'CONVOCATORIA_EN_ENVIO');
        });

        it('una convocatoria ya enviada o cancelada no se puede volver a enviar', async () => {
            const { convocatoria } = await convocatoriaLista();
            const ruta = `/api/convocatorias/${convocatoria.id}/enviar`;
            await bd.query("update public.convocatorias set estado = 'ENVIADA', envio_iniciado_en = now()");
            const enviada = await api('POST', ruta, { cookie: comoAdmin() });
            assert.deepEqual([enviada.estado, enviada.cuerpo.codigo], [409, 'CONVOCATORIA_YA_ENVIADA']);

            await bd.query("update public.convocatorias set estado = 'CANCELADA'");
            const cancelada = await api('POST', ruta, { cookie: comoAdmin() });
            assert.deepEqual([cancelada.estado, cancelada.cuerpo.codigo], [409, 'CONVOCATORIA_CANCELADA']);
        });

        it('si el evento se canceló o ya pasó después de crear la convocatoria, no se envía', async () => {
            const { convocatoria, cotizacionId } = await convocatoriaLista();
            const ruta = `/api/convocatorias/${convocatoria.id}/enviar`;

            await bd.query("update public.quote set estado = 'cancelada' where id = $1", [cotizacionId]);
            const cancelado = await api('POST', ruta, { cookie: comoAdmin() });
            assert.deepEqual([cancelado.estado, cancelado.cuerpo.codigo], [409, 'EVENTO_CANCELADO']);

            await bd.query("update public.quote set estado = 'finalizada', date = date - 60 where id = $1", [cotizacionId]);
            const pasado = await api('POST', ruta, { cookie: comoAdmin() });
            assert.deepEqual([pasado.estado, pasado.cuerpo.codigo], [409, 'EVENTO_PASADO']);

            const estado = await uno<{ estado: string }>('select estado from public.convocatorias');
            assert.equal(estado.estado, 'BORRADOR', 'sigue en borrador');
        });

        it('una convocatoria sin trabajadores no se puede enviar', async () => {
            const { convocatoria } = await convocatoriaLista();
            await bd.query('delete from public.event_staff where convocatoria_id = $1', [convocatoria.id]);
            const r = await api('POST', `/api/convocatorias/${convocatoria.id}/enviar`, { cookie: comoAdmin() });
            assert.deepEqual([r.estado, r.cuerpo.codigo], [409, 'SIN_DESTINATARIOS']);
        });

        it('una convocatoria que no existe → 404; un identificador inválido → 400', async () => {
            const noExiste = await api('POST', `/api/convocatorias/${UUID_INEXISTENTE}/enviar`, { cookie: comoAdmin() });
            assert.deepEqual([noExiste.estado, noExiste.cuerpo.codigo], [404, 'CONVOCATORIA_NO_ENCONTRADA']);
            const invalido = await api('POST', '/api/convocatorias/123/enviar', { cookie: comoAdmin() });
            assert.deepEqual([invalido.estado, invalido.cuerpo.codigo], [400, 'CONVOCATORIA_INVALIDA']);
        });
    });

    // -----------------------------------------------------------------------------------------
    // Endpoint interno para n8n
    // -----------------------------------------------------------------------------------------

    describe('POST /api/integraciones/whatsapp/respuestas (n8n)', () => {
        const RUTA = '/api/integraciones/whatsapp/respuestas';
        const mensaje = (extra: Record<string, unknown> = {}) => ({
            waMessageId: 'wamid.ENTRANTE-PRUEBA-1',
            telefono: '573000000001',
            tipo: 'button',
            contenido: 'Sí, puedo asistir',
            payload: 'PAYLOAD_DE_PRUEBA',
            contextoWaMessageId: 'wamid.SALIENTE-PRUEBA-1',
            recibidoEn: 1760000000,
            respuesta: 'CONFIRMADO',
            ...extra
        });
        const enviar = (cuerpo: unknown, op: OpcionesLlamada = { bearer: TOKEN_N8N }) => api('POST', RUTA, { cuerpo, ...op });

        it('registra el mensaje en la bitácora con el teléfono normalizado y la hora de Meta', async () => {
            const r = await enviar(mensaje());
            assert.equal(r.estado, 201);
            assert.equal(r.cuerpo.duplicado, false);

            const fila = await uno<Json>(
                `select wa_message_id, telefono_remitente, tipo, contenido, payload, contexto_wa_message_id,
                        to_char(recibido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') as recibido,
                        respuesta, resultado, convocatoria_id, profile_id
                   from public.mensajes_whatsapp_entrantes`
            );
            assert.deepEqual(fila, {
                wa_message_id: 'wamid.ENTRANTE-PRUEBA-1',
                telefono_remitente: '+573000000001',
                tipo: 'button',
                contenido: 'Sí, puedo asistir',
                payload: 'PAYLOAD_DE_PRUEBA',
                contexto_wa_message_id: 'wamid.SALIENTE-PRUEBA-1',
                recibido: new Date(1760000000 * 1000).toISOString().slice(0, 19),
                respuesta: 'CONFIRMADO',
                resultado: null,
                convocatoria_id: null,
                profile_id: null
            });
        });

        it('acepta la hora como texto de segundos o como fecha ISO, y la omite sin error', async () => {
            await enviar(mensaje({ waMessageId: 'wamid.A', recibidoEn: '1760000000' }));
            await enviar(mensaje({ waMessageId: 'wamid.B', recibidoEn: '2026-10-13T14:00:00Z' }));
            const sinHora = mensaje({ waMessageId: 'wamid.C' });
            delete (sinHora as Record<string, unknown>).recibidoEn;
            assert.equal((await enviar(sinHora)).estado, 201);
            const horas = await bd.query<{ wa_message_id: string; recibido: string }>(
                `select wa_message_id, to_char(recibido_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as recibido
                   from public.mensajes_whatsapp_entrantes order by wa_message_id`
            );
            assert.equal(horas.rows[0]?.recibido, new Date(1760000000 * 1000).toISOString().slice(0, 16));
            assert.equal(horas.rows[1]?.recibido, '2026-10-13T14:00');
            assert.equal(horas.rows.length, 3);
        });

        it('el mismo mensaje repetido (reintento de n8n) no se registra dos veces', async () => {
            const primero = await enviar(mensaje());
            const repetido = await enviar(mensaje({ contenido: 'otro texto' }));
            assert.equal(primero.estado, 201);
            assert.equal(repetido.estado, 200);
            assert.equal(repetido.cuerpo.duplicado, true);
            assert.equal(await contar('mensajes_whatsapp_entrantes'), 1);
            const guardado = await uno<{ contenido: string }>('select contenido from public.mensajes_whatsapp_entrantes');
            assert.equal(guardado.contenido, 'Sí, puedo asistir', 'se conserva el primero');
        });

        it('todavía no cambia la respuesta de ningún trabajador (eso es el Numeral 9)', async () => {
            const { convocatoria } = await convocatoriaLista();
            await enviar(mensaje({ telefono: '573000000001', respuesta: 'CONFIRMADO' }));
            const r = await api('GET', `/api/convocatorias?cotizacionId=${convocatoria.cotizacionId}`, { cookie: comoAdmin() });
            assert.equal(r.cuerpo.convocatorias[0].resumen.pendientes, 2);
        });

        const invalidos: { nombre: string; cambio: Record<string, unknown>; codigo: string }[] = [
            { nombre: 'sin waMessageId', cambio: { waMessageId: undefined }, codigo: 'CAMPO_REQUERIDO' },
            { nombre: 'waMessageId con espacios', cambio: { waMessageId: 'wamid. X' }, codigo: 'MENSAJE_INVALIDO' },
            { nombre: 'waMessageId demasiado largo', cambio: { waMessageId: 'x'.repeat(256) }, codigo: 'TEXTO_MUY_LARGO' },
            { nombre: 'sin teléfono', cambio: { telefono: undefined }, codigo: 'TELEFONO_INVALIDO' },
            { nombre: 'teléfono inválido', cambio: { telefono: 'abc' }, codigo: 'TELEFONO_INVALIDO' },
            { nombre: 'sin tipo', cambio: { tipo: undefined }, codigo: 'CAMPO_REQUERIDO' },
            { nombre: 'respuesta desconocida', cambio: { respuesta: 'TAL_VEZ' }, codigo: 'RESPUESTA_INVALIDA' },
            { nombre: 'hora inválida', cambio: { recibidoEn: 'ayer' }, codigo: 'FECHA_INVALIDA' },
            { nombre: 'contenido que no es texto', cambio: { contenido: 5 }, codigo: 'TEXTO_INVALIDO' },
            { nombre: 'contenido demasiado largo', cambio: { contenido: 'x'.repeat(4097) }, codigo: 'TEXTO_MUY_LARGO' }
        ];
        for (const { nombre, cambio, codigo } of invalidos) {
            it(`${nombre} → 400 ${codigo}`, async () => {
                const r = await enviar(mensaje(cambio));
                assert.equal(r.estado, 400);
                assert.equal(r.cuerpo.codigo, codigo);
                assert.equal(await contar('mensajes_whatsapp_entrantes'), 0);
            });
        }

        it('sin token, con token incorrecto o con otro esquema de autorización → 401', async () => {
            const sinToken = await enviar(mensaje(), {});
            assert.equal(sinToken.estado, 401);
            assert.equal(sinToken.cabeceras.get('www-authenticate'), 'Bearer');
            assert.equal((await enviar(mensaje(), { bearer: `${TOKEN_N8N}x` })).estado, 401);
            assert.equal((await enviar(mensaje(), { bearer: 'corto' })).estado, 401);
            assert.equal((await enviar(mensaje(), { autorizacion: `Basic ${TOKEN_N8N}` })).estado, 401);
            assert.equal(await contar('mensajes_whatsapp_entrantes'), 0);
        });

        it('la sesión de la administradora no sirve aquí, ni el token de n8n sirve en las rutas de la administradora', async () => {
            const conSesion = await enviar(mensaje(), { cookie: comoAdmin() });
            assert.equal(conSesion.estado, 401);
            const { cotizacionId } = await crearEvento();
            const r = await api('GET', `/api/convocatorias?cotizacionId=${cotizacionId}`, { bearer: TOKEN_N8N });
            assert.equal(r.estado, 401);
        });

        it('si el servidor no tiene token configurado (o es muy corto) rechaza todo con 503', async () => {
            for (const token of [undefined, '', 'demasiado-corto']) {
                const extra = await iniciarApp(token);
                extras.push(extra.servidor);
                const r = await llamar(extra.base, 'POST', RUTA, { cuerpo: mensaje(), bearer: token || 'cualquiera' });
                assert.equal(r.estado, 503, `token configurado: ${JSON.stringify(token)}`);
                assert.equal(r.cuerpo.codigo, 'INTEGRACION_NO_CONFIGURADA');
            }
            assert.equal(await contar('mensajes_whatsapp_entrantes'), 0);
        });
    });
});
