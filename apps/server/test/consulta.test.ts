// Pruebas del panel de consulta (GET /api/consulta/clientes).
//
// Montan la ruta real sobre un Postgres embebido (PGlite) con las columnas reales de Supabase
// (test/fixtures/esquema_consulta.sql). No necesitan Docker, internet ni credenciales, y nunca
// tocan la base real.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import path from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { ClienteConsulta, RegistroConsulta } from '../src/routes/consulta.routes';

const SQL_ESQUEMA = fs.readFileSync(path.join(__dirname, 'fixtures', 'esquema_consulta.sql'), 'utf8');
const TABLAS = ['users', 'venue', 'transportation', 'quote', 'events'];

let db: PGlite;
let servidor: Server;
let url: string;
let cookieDe: (rol: string) => string;

/** Inserta una fila con las columnas dadas y devuelve su id. */
async function insertar(tabla: string, datos: Record<string, unknown>): Promise<number> {
    const columnas = Object.keys(datos);
    const marcas = columnas.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await db.query<{ id: number }>(
        `insert into public.${tabla} (${columnas.join(', ')}) values (${marcas}) returning id`,
        Object.values(datos)
    );
    return Number(rows[0]!.id);
}

const crearCliente = (nombre: string) =>
    insertar('users', { name: nombre, email: `${nombre.toLowerCase().replace(/\s+/g, '.')}@ejemplo.test` });

async function consultar(rol = 'administrador'): Promise<ClienteConsulta[]> {
    const res = await fetch(`${url}/api/consulta/clientes`, { headers: { cookie: cookieDe(rol) } });
    assert.equal(res.status, 200);
    const cuerpo = (await res.json()) as { clientes: ClienteConsulta[] };
    return cuerpo.clientes;
}

function clienteLlamado(clientes: ClienteConsulta[], nombre: string): ClienteConsulta {
    const cliente = clientes.find((c) => c.nombre === nombre);
    assert.ok(cliente, `No aparece el cliente ${nombre}`);
    return cliente;
}

async function unicoRegistro(nombre: string): Promise<RegistroConsulta> {
    const { registros } = clienteLlamado(await consultar(), nombre);
    assert.equal(registros.length, 1);
    return registros[0]!;
}

before(async () => {
    process.env.JWT_SECRET = 'secreto-solo-para-pruebas';
    // Se importan aquí porque auth.ts exige JWT_SECRET en cuanto se carga.
    const { crearConsultaRouter } = await import('../src/routes/consulta.routes');
    const { signSessionToken, COOKIE_NAME } = await import('../src/auth');

    cookieDe = (rol) => `${COOKIE_NAME}=${signSessionToken({
        id: '00000000-0000-0000-0000-000000000001',
        rol: rol as 'administrador',
        nombre: 'Persona de prueba',
        correo: 'prueba@ejemplo.test',
        debeCambiarPassword: false
    })}`;

    db = await PGlite.create();
    await db.exec(SQL_ESQUEMA);

    const app = express();
    app.use(cookieParser());
    app.use('/api/consulta', crearConsultaRouter(db));
    await new Promise<void>((resolve) => { servidor = app.listen(0, resolve); });
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

after(async () => {
    await new Promise((resolve) => servidor.close(resolve));
    await db.close();
});

beforeEach(async () => {
    await db.exec(`truncate ${TABLAS.map((t) => `public.${t}`).join(', ')} restart identity cascade`);
});

describe('Acceso', () => {
    it('sin sesión responde 401', async () => {
        const res = await fetch(`${url}/api/consulta/clientes`);
        assert.equal(res.status, 401);
    });

    it('una sesión inválida responde 401', async () => {
        const res = await fetch(`${url}/api/consulta/clientes`, { headers: { cookie: 'pp_session=inventada' } });
        assert.equal(res.status, 401);
    });

    for (const rol of ['secretaria', 'jefe_logistica']) {
        it(`el rol ${rol} recibe 403`, async () => {
            const res = await fetch(`${url}/api/consulta/clientes`, { headers: { cookie: cookieDe(rol) } });
            assert.equal(res.status, 403);
        });
    }

    it('la administradora entra', async () => {
        assert.deepEqual(await consultar(), []);
    });
});

describe('Clientes', () => {
    it('lista a todos los clientes, también a los que no tienen cotizaciones', async () => {
        await crearCliente('Sin Cotizaciones');
        const conCotizacion = await crearCliente('Con Cotizacion');
        await insertar('quote', { client_id: conCotizacion });

        const clientes = await consultar();
        assert.deepEqual(clienteLlamado(clientes, 'Sin Cotizaciones').registros, []);
        assert.equal(clienteLlamado(clientes, 'Con Cotizacion').registros.length, 1);
    });

    it('los ordena alfabéticamente en español', async () => {
        for (const nombre of ['Zoe', 'Ñusta', 'Álvaro', 'nora', 'Beto']) await crearCliente(nombre);
        const nombres = (await consultar()).map((c) => c.nombre);
        assert.deepEqual(nombres, ['Álvaro', 'Beto', 'nora', 'Ñusta', 'Zoe']);
    });

    it('agrupa aparte las cotizaciones que no tienen cliente', async () => {
        await crearCliente('Alguien');
        await insertar('quote', { client_id: null });
        const clientes = await consultar();
        const ultimo = clientes[clientes.length - 1]!;
        assert.equal(ultimo.id, null);
        assert.equal(ultimo.nombre, 'Sin cliente asociado');
        assert.equal(ultimo.registros.length, 1);
    });
});

describe('Asociación de eventos con su cliente', () => {
    it('un evento con events.client_id nulo queda bajo el cliente de su cotización', async () => {
        const ana = await crearCliente('Ana');
        await crearCliente('Otra Persona');
        const cotizacion = await insertar('quote', { client_id: ana });
        const evento = await insertar('events', { quote_id: cotizacion });

        const clientes = await consultar();
        assert.equal(clienteLlamado(clientes, 'Ana').registros[0]?.evento?.id, evento);
        assert.deepEqual(clienteLlamado(clientes, 'Otra Persona').registros, []);
    });

    it('si el evento tiene su propio cliente, ese es el que cuenta', async () => {
        const deLaCotizacion = await crearCliente('De La Cotizacion');
        const delEvento = await crearCliente('Del Evento');
        const cotizacion = await insertar('quote', { client_id: deLaCotizacion });
        await insertar('events', { quote_id: cotizacion, client_id: delEvento });

        const clientes = await consultar();
        assert.equal(clienteLlamado(clientes, 'Del Evento').registros.length, 1);
        assert.deepEqual(clienteLlamado(clientes, 'De La Cotizacion').registros, []);
    });

    it('cada cotización sale una sola vez y sin mezclarse entre clientes', async () => {
        const ana = await crearCliente('Ana');
        const beto = await crearCliente('Beto');
        const deAna = await insertar('quote', { client_id: ana });
        await insertar('quote', { client_id: ana });
        const deBeto = await insertar('quote', { client_id: beto });
        await insertar('events', { quote_id: deAna });
        await insertar('events', { quote_id: deBeto });

        const clientes = await consultar();
        assert.equal(clienteLlamado(clientes, 'Ana').registros.length, 2);
        assert.deepEqual(clienteLlamado(clientes, 'Beto').registros.map((r) => r.cotizacionId), [deBeto]);
    });
});

describe('Datos de cada registro', () => {
    it('toma del evento lo que tiene y de la cotización lo que le falta', async () => {
        const ana = await crearCliente('Ana');
        const sedeCotizacion = await insertar('venue', { name: 'Sede vieja', city: 'Pereira' });
        const sedeEvento = await insertar('venue', { name: 'Sede nueva', city: 'Manizales' });
        const cotizacion = await insertar('quote', {
            client_id: ana, event_type: 'Grado', date: '2026-12-10', hour: '18:00', venue_id: sedeCotizacion
        });
        await insertar('events', { quote_id: cotizacion, date: '2026-12-24', venue_id: sedeEvento });

        const registro = await unicoRegistro('Ana');
        assert.equal(registro.fecha, '2026-12-24');
        assert.equal(registro.hora, '18:00:00');
        assert.equal(registro.tipoEvento, 'Grado');
        assert.equal(registro.lugar, 'Sede nueva');
        assert.equal(registro.ciudad, 'Manizales');
    });

    it('un evento sin fecha ni hora propias usa las de su cotización', async () => {
        const ana = await crearCliente('Ana');
        const cotizacion = await insertar('quote', { client_id: ana, date: '2026-11-20', hour: '20:30' });
        await insertar('events', { quote_id: cotizacion });

        const registro = await unicoRegistro('Ana');
        assert.equal(registro.fecha, '2026-11-20');
        assert.equal(registro.hora, '20:30:00');
    });

    it('la hora 00:00 de relleno de "finalizar" no se muestra como hora real', async () => {
        const ana = await crearCliente('Ana');
        const cotizacion = await insertar('quote', { client_id: ana, date: '2026-11-20' });
        await insertar('events', { quote_id: cotizacion, date: '2026-11-20', hour: '00:00:00' });

        assert.equal((await unicoRegistro('Ana')).hora, null);
    });

    it('si hay hora 00:00 de relleno y la cotización tiene hora, gana la de la cotización', async () => {
        const ana = await crearCliente('Ana');
        const cotizacion = await insertar('quote', { client_id: ana, hour: '15:00' });
        await insertar('events', { quote_id: cotizacion, hour: '00:00:00' });

        assert.equal((await unicoRegistro('Ana')).hora, '15:00:00');
    });

    it('un evento creado de verdad a medianoche conserva su hora', async () => {
        const ana = await crearCliente('Ana');
        const cotizacion = await insertar('quote', { client_id: ana, hour: '00:00:00' });
        await insertar('events', { quote_id: cotizacion, hour: '00:00:00' });

        assert.equal((await unicoRegistro('Ana')).hora, '00:00:00');
    });

    it('un lugar escrito a mano en el evento gana a la sede anterior de la cotización', async () => {
        const ana = await crearCliente('Ana');
        const sede = await insertar('venue', { name: 'Sede anterior', city: 'Pereira' });
        const cotizacion = await insertar('quote', { client_id: ana, venue_id: sede });
        await insertar('events', {
            quote_id: cotizacion, venue_nombre_manual: 'Finca Los Cedros', venue_direccion_manual: 'Km 4 vía al Magdalena'
        });

        const registro = await unicoRegistro('Ana');
        assert.equal(registro.lugar, 'Finca Los Cedros');
        assert.equal(registro.direccion, 'Km 4 vía al Magdalena');
    });

    it('incluye transporte, total y referencia', async () => {
        const ana = await crearCliente('Ana');
        const transporte = await insertar('transportation', { city: 'Chinchiná', price: 250000 });
        const cotizacion = await insertar('quote', {
            client_id: ana, total: 1750000, transportation_id: transporte, created_at: '2026-06-15T12:00:00Z'
        });

        const registro = await unicoRegistro('Ana');
        assert.equal(registro.numeroReferencia, `PL-2026-${String(cotizacion).padStart(4, '0')}`);
        assert.equal(registro.total, 1750000);
        assert.deepEqual(registro.transporte, { ciudad: 'Chinchiná', precio: 250000 });
    });

    it('incluye pagos y contrato del evento, sin exponer el nombre del archivo', async () => {
        const ana = await crearCliente('Ana');
        const cotizacion = await insertar('quote', { client_id: ana });
        await insertar('events', {
            quote_id: cotizacion,
            initial_payment: true,
            total_paid: 400000,
            contrato_enviado_en: '2026-10-01T15:00:00Z',
            contrato_firmado_nombre: '7-1760000000000.pdf',
            contrato_firmado_subido_en: '2026-10-03T15:00:00Z'
        });

        const { evento } = await unicoRegistro('Ana');
        assert.equal(evento?.pagoInicial, true);
        assert.equal(evento?.totalPagado, 400000);
        assert.equal(evento?.tieneContratoFirmado, true);
        assert.ok(!JSON.stringify(evento).includes('1760000000000'));
    });

    it('ordena por fecha y hora, y deja al final lo que no tiene fecha', async () => {
        const ana = await crearCliente('Ana');
        await insertar('quote', { client_id: ana, event_type: 'sin fecha' });
        await insertar('quote', { client_id: ana, event_type: 'tarde', date: '2026-12-01', hour: '20:00' });
        await insertar('quote', { client_id: ana, event_type: 'mañana', date: '2026-12-01', hour: '09:00' });
        await insertar('quote', { client_id: ana, event_type: 'antes', date: '2026-11-01' });

        const { registros } = clienteLlamado(await consultar(), 'Ana');
        assert.deepEqual(registros.map((r) => r.tipoEvento), ['antes', 'mañana', 'tarde', 'sin fecha']);
    });
});

describe('Estado', () => {
    async function estadoDe(cotizacion: Record<string, unknown>, evento?: Record<string, unknown>) {
        const cliente = await crearCliente('Ana');
        const id = await insertar('quote', { client_id: cliente, ...cotizacion });
        if (evento) await insertar('events', { quote_id: id, ...evento });
        return (await unicoRegistro('Ana')).estado;
    }

    it('recibida', async () => assert.equal(await estadoDe({}), 'recibida'));
    it('en revisión', async () => assert.equal(await estadoDe({ estado: 'en_revision' }), 'en_revision'));
    it('cancelada', async () => assert.equal(await estadoDe({ estado: 'cancelada' }), 'cancelada'));
    it('finalizada', async () => assert.equal(await estadoDe({ estado: 'finalizada' }, {}), 'finalizada'));
    it('contrato enviado', async () => {
        assert.equal(await estadoDe({}, { contrato_enviado_en: '2026-10-01T15:00:00Z' }), 'contrato_enviado');
    });
    it('programada', async () => assert.equal(await estadoDe({}, { confirmed: true }), 'programada'));
});

describe('Solo lectura', () => {
    let antes: string;

    const volcado = async () => {
        const partes = await Promise.all(TABLAS.map(async (t) => {
            const { rows } = await db.query(`select * from public.${t} order by id`);
            return [t, rows];
        }));
        return JSON.stringify(partes);
    };

    beforeEach(async () => {
        const ana = await crearCliente('Ana');
        const cotizacion = await insertar('quote', { client_id: ana, total: 1000 });
        await insertar('events', { quote_id: cotizacion, hour: '00:00:00' });
        antes = await volcado();
    });

    afterEach(async () => {
        assert.equal(await volcado(), antes);
    });

    it('consultar no cambia ninguna fila', async () => {
        await consultar();
        await consultar();
    });

    it('la ruta no acepta escrituras', async () => {
        for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
            const res = await fetch(`${url}/api/consulta/clientes`, { method, headers: { cookie: cookieDe('administrador') } });
            assert.equal(res.status, 404, `${method} debería no existir`);
        }
    });
});
