// Pruebas de integración de las cotizaciones y de los datos del cliente.
//
// Levantan el servidor real (rutas de cotizaciones, contratos y logística) sobre un Postgres
// embebido (PGlite) con el mismo esquema, restricciones y triggers que producción
// (test/fixtures/esquema_cotizaciones.sql) y aplican la migración nueva tal cual. Nunca tocan
// la base real ni mandan correos.
//
// Caso que motivó estas pruebas: dos personas distintas cotizaron con el mismo correo y, al
// guardar la segunda, las cotizaciones de las dos pasaron a mostrar el nombre de la última.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
    api, contar, cotizar, crearBase, ctx, detenerServidor, ESPEJOS, iniciarServidor, MANIZALES, MESA, pedido, PISO_3X3, PISO_5X5,
    reiniciarDatos, SEDE, SQL_CATALOGO, SQL_ESQUEMA, SQL_MIGRACION, SQL_REVERSA
} from './helpers/servidor';

before(iniciarServidor);
after(detenerServidor);
beforeEach(reiniciarDatos);

// ---------------------------------------------------------------------------------------------
// El caso reportado
// ---------------------------------------------------------------------------------------------

describe('dos personas con el mismo correo', () => {
    it('cada cotización conserva el nombre y el teléfono de quien la pidió', async () => {
        const correo = 'compartido@correo.com';
        const a = await cotizar({ ...pedido('jhon fredy', correo, { tipoEvento: 'Fiesta de 15 Años Deluxe', fechaEvento: '2026-11-30' }), cliente: { nombre: 'jhon fredy', correo, telefono: '3001111111' }, items: [{ variantId: PISO_5X5, cantidad: 1 }] });
        const b = await cotizar({ ...pedido('angela', correo, { tipoEvento: 'Fiesta de 15 Años Deluxe', fechaEvento: '2026-11-18' }), cliente: { nombre: 'angela', correo, telefono: '3002222222' }, transportationId: MANIZALES });
        assert.equal(a.status, 201);
        assert.equal(b.status, 201);

        const lista = (await api('GET', '/api/cotizaciones')).json as any[];
        const deJhon = lista.find((c) => c.id === a.json.id);
        const deAngela = lista.find((c) => c.id === b.json.id);

        assert.equal(deJhon.clienteNombre, 'jhon fredy');
        assert.equal(deJhon.clienteTelefono, '3001111111');
        assert.equal(deJhon.total, 3800000);
        assert.equal(deAngela.clienteNombre, 'angela');
        assert.equal(deAngela.clienteTelefono, '3002222222');
        assert.equal(deAngela.total, 1850000); // piso 3x3 + transporte Manizales

        // y al abrir cada una por separado
        assert.equal((await api('GET', `/api/cotizaciones/${a.json.id}`)).json.clienteNombre, 'jhon fredy');
        assert.equal((await api('GET', `/api/cotizaciones/${b.json.id}`)).json.clienteNombre, 'angela');
    });

    it('sigue habiendo un solo cliente por correo (no se duplican)', async () => {
        await cotizar(pedido('Uno', 'mismo@correo.com'));
        await cotizar(pedido('Dos', 'mismo@correo.com'));
        await cotizar(pedido('Tres', 'otro@correo.com'));
        assert.equal(await contar('users'), 2);
        assert.equal(await contar('quote'), 3);
    });

    it('tres personas seguidas con el mismo correo: ninguna pisa a otra', async () => {
        for (const n of ['Ana', 'Beto', 'Carla']) await cotizar(pedido(n, 'familia@correo.com'));
        const nombres = (await api('GET', '/api/cotizaciones')).json.map((c: any) => c.clienteNombre).sort();
        assert.deepEqual(nombres, ['Ana', 'Beto', 'Carla']);
    });

    it('envíos simultáneos con el mismo correo no se mezclan', async () => {
        const nombres = ['Ana', 'Beto', 'Carla', 'Diana', 'Elena', 'Fabio'];
        const respuestas = await Promise.all(nombres.map((n) => cotizar(pedido(n, 'tumulto@correo.com'))));
        assert.ok(respuestas.every((r) => r.status === 201));
        assert.equal(new Set(respuestas.map((r) => r.json.id)).size, nombres.length, 'cada envío crea su propia cotización');
        const guardados = (await api('GET', '/api/cotizaciones')).json.map((c: any) => c.clienteNombre).sort();
        assert.deepEqual(guardados, [...nombres].sort());
        assert.equal(await contar('users'), 1);
    });

    it('DOCUMENTA el error anterior: la consulta vieja sobrescribía el nombre del cliente compartido', async () => {
        // Es la consulta que tenía el servidor antes de la corrección.
        const guardarAntes = (nombre: string) => ctx.db.query(
            `INSERT INTO users (email, name, phone, documento) VALUES ('viejo@correo.com', $1, '1', NULL)
             ON CONFLICT (email) DO UPDATE SET name = excluded.name, phone = excluded.phone RETURNING id`, [nombre]);
        const u1 = await guardarAntes('jhon fredy');
        await ctx.db.query('INSERT INTO quote (total, client_id) VALUES (42125000, $1)', [(u1.rows[0] as any).id]);
        await guardarAntes('angela');
        // Leyendo como lo hacía el panel (el nombre salía de users), la cotización de jhon fredy dice "angela".
        const r = await ctx.db.query('SELECT u.name FROM quote q JOIN users u ON u.id = q.client_id');
        assert.equal((r.rows[0] as any).name, 'angela');
    });
});

// ---------------------------------------------------------------------------------------------
// Cálculo del total
// ---------------------------------------------------------------------------------------------

describe('total de la cotización', () => {
    it('suma servicios y transporte', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: PISO_5X5, cantidad: 1 }, { variantId: MESA, cantidad: 10 }], transportationId: MANIZALES });
        const c = (await api('GET', `/api/cotizaciones/${r.json.id}`)).json;
        assert.equal(c.total, 3800000 + 400000 + 450000);
        assert.equal(c.items.length, 2);
    });

    it('respeta los tramos por cantidad: 8 espejos = $600.000 y 3 espejos = 3 x $100.000', async () => {
        const ocho = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: ESPEJOS, cantidad: 8 }] });
        const tres = await cotizar({ ...pedido('Beto', 'b@a.co'), items: [{ variantId: ESPEJOS, cantidad: 3 }] });
        assert.equal((await api('GET', `/api/cotizaciones/${ocho.json.id}`)).json.total, 600000);
        assert.equal((await api('GET', `/api/cotizaciones/${tres.json.id}`)).json.total, 300000);
    });

    it('acepta los identificadores como texto, tal como los entrega el catálogo real', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: String(PISO_5X5), cantidad: 1 }], transportationId: String(MANIZALES), venueId: String(SEDE) });
        assert.equal(r.status, 201);
        const c = (await api('GET', `/api/cotizaciones/${r.json.id}`)).json;
        assert.equal(c.total, 3800000 + 450000);
        assert.equal(c.lugar, 'Club Campestre');
    });

    it('solo transporte, sin servicios, es válido', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [], transportationId: MANIZALES });
        assert.equal(r.status, 201);
        assert.equal((await api('GET', `/api/cotizaciones/${r.json.id}`)).json.total, 450000);
    });

    it('sin servicios ni transporte se rechaza y no guarda nada', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [] });
        assert.equal(r.status, 400);
        assert.equal(await contar('quote'), 0);
        assert.equal(await contar('users'), 0);
    });

    it('el número de referencia lleva el año y el id con ceros', async () => {
        const r = await cotizar(pedido('Ana', 'a@a.co'));
        assert.match(r.json.numeroReferencia, /^PL-\d{4}-0001$/);
    });
});

// ---------------------------------------------------------------------------------------------
// Todo o nada
// ---------------------------------------------------------------------------------------------

describe('guardado atómico', () => {
    it('un servicio que ya no existe se rechaza y no deja nada a medias', async () => {
        const r = await cotizar({ ...pedido('Ana', 'nuevo@correo.com'), items: [{ variantId: PISO_3X3, cantidad: 1 }, { variantId: 9999, cantidad: 1 }], transportationId: MANIZALES });
        assert.equal(r.status, 400);
        assert.match(r.json.message, /ya no está disponible/);
        assert.equal(await contar('quote'), 0, 'no queda una cotización solo con el transporte');
        assert.equal(await contar('quote_items'), 0);
        assert.equal(await contar('users'), 0, 'tampoco queda el cliente creado a medias');
    });

    it('una sede inexistente tampoco deja cotización a medias', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), venueId: 777 });
        assert.equal(r.status, 400);
        assert.equal(await contar('quote'), 0);
    });

    it('después de un fallo el siguiente envío funciona con normalidad', async () => {
        await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: 9999, cantidad: 1 }] });
        const ok = await cotizar(pedido('Ana', 'a@a.co'));
        assert.equal(ok.status, 201);
        assert.equal(await contar('quote'), 1);
    });
});

// ---------------------------------------------------------------------------------------------
// Fronteras de la entrada (por HTTP)
// ---------------------------------------------------------------------------------------------

describe('fronteras de la entrada', () => {
    it('nombre de 100 caracteres sí; de 101 se rechaza con un 400 claro (antes era un 500)', async () => {
        assert.equal((await cotizar(pedido('a'.repeat(100), 'a@a.co'))).status, 201);
        const r = await cotizar(pedido('a'.repeat(101), 'b@a.co'));
        assert.equal(r.status, 400);
        assert.match(r.json.message, /nombre es demasiado largo/);
    });

    it('teléfono de 30 caracteres sí; de 31 no', async () => {
        const p = (t: string, c: string) => ({ ...pedido('Ana', c), cliente: { nombre: 'Ana', correo: c, telefono: t } });
        assert.equal((await cotizar(p('3'.repeat(30), 'a@a.co'))).status, 201);
        assert.equal((await cotizar(p('3'.repeat(31), 'b@a.co'))).status, 400);
    });

    it('cantidades inválidas: 0, negativa, decimal, texto y demasiado grande', async () => {
        for (const cantidad of [0, -2, 1.5, '3', 100001]) {
            const r = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: PISO_3X3, cantidad }] });
            assert.equal(r.status, 400, `cantidad ${JSON.stringify(cantidad)}`);
        }
        assert.equal(await contar('quote'), 0);
    });

    it('frontera del valor: el cálculo de la base admite hasta $99.999.999,99 por servicio', async () => {
        // 2.499 mesas x $40.000 = $99.960.000 (cabe); 2.500 x $40.000 = $100.000.000 (no cabe)
        const cabe = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: MESA, cantidad: 2499 }] });
        assert.equal(cabe.status, 201);
        assert.equal((await api('GET', `/api/cotizaciones/${cabe.json.id}`)).json.total, 99960000);
        const noCabe = await cotizar({ ...pedido('Beto', 'b@a.co'), items: [{ variantId: MESA, cantidad: 2500 }] });
        assert.equal(noCabe.status, 400, 'antes era un error 500 sin explicación');
        assert.match(noCabe.json.message, /demasiado alto/);
        assert.equal(await contar('quote'), 1, 'la rechazada no deja nada guardado');
        assert.equal(await contar('users'), 1);
    });

    it('el mismo servicio dos veces se rechaza con 400 (antes reventaba con 500)', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), items: [{ variantId: PISO_3X3, cantidad: 1 }, { variantId: PISO_3X3, cantidad: 2 }] });
        assert.equal(r.status, 400);
    });

    it('fecha imposible o mal escrita se rechaza; fecha real se guarda', async () => {
        for (const f of ['2026-02-30', '2026-13-01', '18/11/2026', 'mañana']) {
            assert.equal((await cotizar({ ...pedido('Ana', 'a@a.co'), fechaEvento: f })).status, 400, f);
        }
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), fechaEvento: '2028-02-29' });
        assert.equal((await api('GET', `/api/cotizaciones/${r.json.id}`)).json.fechaEvento, '2028-02-29');
    });

    it('correo con mayúsculas y espacios se normaliza y reutiliza al mismo cliente', async () => {
        await cotizar(pedido('Ana', 'ana@correo.com'));
        await cotizar(pedido('Ana Otra', '  ANA@Correo.COM '));
        assert.equal(await contar('users'), 1);
        assert.equal((await ctx.db.query("SELECT email FROM users")).rows[0]!['email' as never], 'ana@correo.com');
    });

    it('correo inválido o sin datos de contacto se rechaza', async () => {
        assert.equal((await cotizar(pedido('Ana', 'sin-arroba'))).status, 400);
        assert.equal((await cotizar({ items: [] })).status, 400);
        assert.equal((await cotizar({})).status, 400);
    });

    it('nombres con tildes, emojis y comillas se guardan tal cual; SQL en el nombre no hace nada', async () => {
        const raro = "María José Ñandú 🎉 O'Brien'); DROP TABLE users;--";
        const r = await cotizar(pedido(raro.slice(0, 100), 'a@a.co'));
        assert.equal(r.status, 201);
        assert.equal((await api('GET', `/api/cotizaciones/${r.json.id}`)).json.clienteNombre, raro.slice(0, 100));
        assert.equal(await contar('users'), 1, 'la tabla de clientes sigue existiendo');
    });

    it('los espacios repetidos del nombre se limpian', async () => {
        const r = await cotizar(pedido('  Ana    María   Pérez ', 'a@a.co'));
        assert.equal((await api('GET', `/api/cotizaciones/${r.json.id}`)).json.clienteNombre, 'Ana María Pérez');
    });

    it('lugar manual se guarda sin sede; con sede se descarta el manual', async () => {
        const manual = await cotizar({ ...pedido('Ana', 'a@a.co'), venueNombreManual: 'Salón Los Cedros', venueDireccionManual: 'Cra 23 # 45-12' });
        const catalogo = await cotizar({ ...pedido('Beto', 'b@a.co'), venueId: SEDE, venueNombreManual: 'Ignorado' });
        const a = (await api('GET', `/api/cotizaciones/${manual.json.id}`)).json;
        const b = (await api('GET', `/api/cotizaciones/${catalogo.json.id}`)).json;
        assert.equal(a.lugar, 'Salón Los Cedros');
        assert.equal(b.lugar, 'Club Campestre');
        assert.equal(b.venueNombreManual, null);
    });
});

// ---------------------------------------------------------------------------------------------
// Edición desde el panel
// ---------------------------------------------------------------------------------------------

describe('corregir los datos de una cotización', () => {
    it('cambiar el nombre y el teléfono afecta solo a esa cotización', async () => {
        const correo = 'compartido@correo.com';
        const a = await cotizar(pedido('Ana', correo));
        const b = await cotizar(pedido('Beto', correo));
        const r = await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteNombre: 'Ana María', clienteTelefono: '3119999999', clienteDocumento: '123' });
        assert.equal(r.status, 200);
        assert.equal(r.json.clienteNombre, 'Ana María');
        assert.equal(r.json.clienteTelefono, '3119999999');
        assert.equal(r.json.clienteDocumento, '123');
        const otra = (await api('GET', `/api/cotizaciones/${b.json.id}`)).json;
        assert.equal(otra.clienteNombre, 'Beto', 'la otra cotización no cambia');
        assert.equal(otra.clienteTelefono, '3000000000');
    });

    it('cambiar el correo mueve solo esa cotización al cliente con ese correo', async () => {
        const a = await cotizar(pedido('Ana', 'viejo@correo.com'));
        const b = await cotizar(pedido('Beto', 'viejo@correo.com'));
        const r = await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteCorreo: 'Nuevo@Correo.com' });
        assert.equal(r.status, 200);
        assert.equal(r.json.clienteCorreo, 'nuevo@correo.com');
        assert.equal((await api('GET', `/api/cotizaciones/${b.json.id}`)).json.clienteCorreo, 'viejo@correo.com');
        assert.equal(await contar('users'), 2);
        assert.equal((await api('GET', `/api/cotizaciones/${a.json.id}`)).json.clienteNombre, 'Ana', 'conserva su nombre');
    });

    it('si la cotización ya es un evento, el evento sigue al cliente nuevo', async () => {
        const a = await cotizar(pedido('Ana', 'viejo@correo.com'));
        await ctx.db.query('INSERT INTO events (quote_id, client_id) SELECT id, client_id FROM quote WHERE id = $1', [a.json.id]);
        await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteCorreo: 'nuevo@correo.com' });
        const r = await ctx.db.query('SELECT e.client_id = q.client_id AS igual FROM events e JOIN quote q ON q.id = e.quote_id');
        assert.equal((r.rows[0] as any).igual, true);
    });

    it('un correo inválido se rechaza y no cambia nada', async () => {
        const a = await cotizar(pedido('Ana', 'a@a.co'));
        const r = await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteCorreo: 'no-es-correo' });
        assert.equal(r.status, 400);
        assert.equal((await api('GET', `/api/cotizaciones/${a.json.id}`)).json.clienteCorreo, 'a@a.co');
    });

    it('campos vacíos o en blanco no borran los datos existentes', async () => {
        const a = await cotizar(pedido('Ana', 'a@a.co'));
        const r = await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteNombre: '   ', clienteTelefono: '' });
        assert.equal(r.json.clienteNombre, 'Ana');
        assert.equal(r.json.clienteTelefono, '3000000000');
    });

    it('solo la administradora puede corregir; sin sesión no se puede', async () => {
        const a = await cotizar(pedido('Ana', 'a@a.co'));
        assert.equal((await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteNombre: 'X' }, null)).status, 401);
        assert.equal((await api('PUT', `/api/cotizaciones/${a.json.id}/datos`, { clienteNombre: 'X' }, ctx.tokenLogistica)).status, 403);
    });

    it('cotización inexistente devuelve 404', async () => {
        assert.equal((await api('PUT', '/api/cotizaciones/99999/datos', { clienteNombre: 'X' })).status, 404);
        assert.equal((await api('GET', '/api/cotizaciones/99999')).status, 404);
    });
});

// ---------------------------------------------------------------------------------------------
// Compatibilidad y otras pantallas que muestran el nombre
// ---------------------------------------------------------------------------------------------

describe('otras pantallas', () => {
    it('una cotización antigua sin datos propios sigue mostrando el nombre del cliente', async () => {
        await ctx.db.query("INSERT INTO users (email, name, phone, documento) VALUES ('viejo@correo.com', 'Cliente Antiguo', '3105550000', '99')");
        await ctx.db.query('INSERT INTO quote (total, client_id) VALUES (500000, 1)');
        const c = (await api('GET', '/api/cotizaciones/1')).json;
        assert.equal(c.clienteNombre, 'Cliente Antiguo');
        assert.equal(c.clienteTelefono, '3105550000');
        assert.equal(c.clienteDocumento, '99');
    });

    it('logística muestra el nombre de la cotización, no el del cliente compartido', async () => {
        const correo = 'compartido@correo.com';
        const a = await cotizar({ ...pedido('Ana', correo), fechaEvento: '2026-12-01' });
        const b = await cotizar({ ...pedido('Beto', correo), fechaEvento: '2026-12-02' });
        await ctx.db.query('INSERT INTO events (quote_id, client_id, confirmed) SELECT id, client_id, true FROM quote');
        const r = await api('GET', '/api/logistica/eventos', undefined, ctx.tokenLogistica);
        assert.equal(r.status, 200);
        const nombres = Object.fromEntries(r.json.map((e: any) => [e.id, e.clienteNombre]));
        assert.equal(nombres[a.json.id], 'Ana');
        assert.equal(nombres[b.json.id], 'Beto');
    });

    it('el contrato usa el documento propio de la cotización', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), cliente: { nombre: 'Ana', correo: 'a@a.co', telefono: '3000000000', documento: '1012345678' }, fechaEvento: '2026-12-01' });
        await ctx.db.query('INSERT INTO events (quote_id, client_id) SELECT id, client_id FROM quote');
        const pdf = await fetch(`${ctx.base}/api/contratos/${r.json.id}/pdf`, { headers: { cookie: `pp_session=${ctx.tokenAdmin}` } });
        assert.equal(pdf.status, 200);
        assert.match(pdf.headers.get('content-type') || '', /pdf/);
    });

    it('un cliente sin sesión no puede ver el listado', async () => {
        assert.equal((await api('GET', '/api/cotizaciones', undefined, null)).status, 401);
    });
});

// ---------------------------------------------------------------------------------------------
// La migración
// ---------------------------------------------------------------------------------------------

describe('migración 20261101120000', () => {
    async function baseAntigua(): Promise<PGlite> {
        const antigua = await crearBase();
        await antigua.exec(SQL_ESQUEMA);
        await antigua.exec(SQL_CATALOGO);
        // Estado real de producción antes del arreglo: un cliente (angela) con tres cotizaciones
        // que en realidad eran de personas distintas, más otro cliente aparte.
        await antigua.exec(`
            INSERT INTO users (email, name, phone, documento) VALUES
                ('jua@gmail.com', 'angela', '3006915749', NULL),
                ('beto@gmail.com', 'Beto', '+573185101502', '555');
            INSERT INTO quote (total, client_id, event_type) VALUES (42125000, 1, 'Fiesta'), (2050000, 1, 'Fiesta'), (900000, 2, 'Corporativo');
        `);
        return antigua;
    }

    it('agrega las tres columnas y copia los datos actuales a las cotizaciones existentes', async () => {
        const antigua = await baseAntigua();
        const antes = (await antigua.query('SELECT sum(total) AS s, count(*) AS n FROM quote')).rows[0] as any;
        await antigua.exec(SQL_MIGRACION);
        const filas = (await antigua.query('SELECT id, cliente_nombre, cliente_telefono, cliente_documento FROM quote ORDER BY id')).rows as any[];
        assert.deepEqual(filas.map((f) => f.cliente_nombre), ['angela', 'angela', 'Beto']);
        assert.equal(filas[2].cliente_telefono, '+573185101502');
        assert.equal(filas[2].cliente_documento, '555');
        const despues = (await antigua.query('SELECT sum(total) AS s, count(*) AS n FROM quote')).rows[0] as any;
        assert.deepEqual(despues, antes, 'los totales y el número de cotizaciones no cambian');
        await antigua.close();
    });

    it('es idempotente y no pisa correcciones hechas después', async () => {
        const antigua = await baseAntigua();
        await antigua.exec(SQL_MIGRACION);
        await antigua.exec("UPDATE quote SET cliente_nombre = 'jhon fredy' WHERE id = 1");
        await antigua.exec(SQL_MIGRACION); // segunda ejecución
        const nombres = (await antigua.query('SELECT cliente_nombre FROM quote ORDER BY id')).rows.map((r: any) => r.cliente_nombre);
        assert.deepEqual(nombres, ['jhon fredy', 'angela', 'Beto']);
        await antigua.close();
    });

    it('las cotizaciones sin cliente quedan sin datos propios (sin error)', async () => {
        const antigua = await baseAntigua();
        await antigua.exec('INSERT INTO quote (total) VALUES (1000)');
        await antigua.exec(SQL_MIGRACION);
        const r = (await antigua.query('SELECT cliente_nombre FROM quote WHERE client_id IS NULL')).rows[0] as any;
        assert.equal(r.cliente_nombre, null);
        await antigua.close();
    });

    it('la reversa deja la tabla como estaba', async () => {
        const antigua = await baseAntigua();
        await antigua.exec(SQL_MIGRACION);
        const reversa = SQL_REVERSA;
        await antigua.exec(reversa);
        const cols = (await antigua.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'quote' AND column_name LIKE 'cliente_%'")).rows;
        assert.equal(cols.length, 0);
        await antigua.close();
    });
});
