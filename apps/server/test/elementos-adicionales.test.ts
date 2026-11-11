// Pruebas de los elementos adicionales: lo que no sale de la bodega y se alquila o se consigue aparte.
//
// Cubren la validación de lo que manda el panel, el total de la cotización (trigger propio de la tabla
// nueva), que el proveedor y su costo solo los vea la administradora, que el inventario no se toque y
// que Andrés vea los elementos en una sección aparte y sin precios. Corren sobre PGlite con el esquema de
// producción (test/fixtures/esquema_cotizaciones.sql): nunca tocan la base real.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { normalizarExtras, MAX_EXTRAS } from '../src/cotizacionEntrada';
import {
    api, contar, cotizacionCompleta, ctx, descargar, detenerServidor, iniciarServidor, MESA, PDF_VALIDO, PISO_5X5, reiniciarDatos, subirArchivo
} from './helpers/servidor';

before(iniciarServidor);
after(detenerServidor);
beforeEach(reiniciarDatos);

const PLANTA = { tag: 'ENERGÍA', nombre: 'Planta eléctrica 20 kVA', descripcion: 'Con operario', cantidad: 1, precioUnit: 800000, proveedor: 'Alquileres del Eje', costoProveedor: 500000, nota: 'Llega el día anterior' };
const CARPA = { nombre: 'Carpa 10 x 10', cantidad: 2, precioUnit: 350000 };

/** La cotización de prueba trae piso 5x5 ($3.800.000) + 10 mesas ($400.000) + transporte Manizales ($450.000). */
const TOTAL_BASE = 3800000 + 400000 + 450000;

const guardar = (id: number, cuerpo: Record<string, unknown>) => api('PUT', `/api/cotizaciones/${id}/items`, cuerpo);
const itemsBase = [{ variantId: PISO_5X5, cantidad: 1 }, { variantId: MESA, cantidad: 10 }];
const detalle = async (id: number, token = ctx.tokenAdmin) => (await api('GET', `/api/cotizaciones/${id}`, undefined, token)).json;

async function totalEnBase(id: number): Promise<number> {
    return Number((await ctx.db.query(`SELECT total FROM quote WHERE id = ${id}`)).rows[0]!['total' as never]);
}

// ---------------------------------------------------------------------------------------------
// Validación de lo que manda el panel
// ---------------------------------------------------------------------------------------------

describe('normalizarExtras', () => {
    it('sin lista no se toca nada (undefined); lista vacía es válida', () => {
        assert.equal(normalizarExtras(undefined), undefined);
        assert.deepEqual(normalizarExtras([]), []);
    });

    it('limpia espacios, pone la categoría por defecto y descarta lo vacío', () => {
        const [e] = normalizarExtras([{ nombre: '  Carpa   10 x 10 ', cantidad: 2, precioUnit: 350000, proveedor: '  ', nota: '' }])!;
        assert.equal(e!.nombre, 'Carpa 10 x 10');
        assert.equal(e!.tag, 'ELEMENTO ADICIONAL');
        assert.equal(e!.proveedor, undefined);
        assert.equal(e!.nota, undefined);
        assert.equal(e!.costoProveedor, undefined);
    });

    it('acepta precios y costos escritos como texto y con hasta dos decimales', () => {
        const [e] = normalizarExtras([{ nombre: 'X', cantidad: 1, precioUnit: '1500.50', costoProveedor: '0' }])!;
        assert.equal(e!.precioUnit, 1500.5);
        assert.equal(e!.costoProveedor, 0);
    });

    it('rechaza (null) lo que no cabe o no tiene sentido', () => {
        const base = { nombre: 'X', cantidad: 1, precioUnit: 1000 };
        const malos: unknown[] = [
            'no es lista', { nombre: 'X' }, [null], ['texto'],
            [{ ...base, nombre: '' }], [{ ...base, nombre: '   ' }], [{ ...base, nombre: 'a'.repeat(151) }],
            [{ ...base, tag: 'a'.repeat(101) }], [{ ...base, descripcion: 'a'.repeat(1001) }], [{ ...base, proveedor: 'a'.repeat(151) }],
            [{ ...base, cantidad: 0 }], [{ ...base, cantidad: -1 }], [{ ...base, cantidad: 1.5 }], [{ ...base, cantidad: '2' }], [{ ...base, cantidad: 101 }],
            [{ ...base, precioUnit: 0 }], [{ ...base, precioUnit: -5 }], [{ ...base, precioUnit: NaN }], [{ ...base, precioUnit: Infinity }],
            [{ ...base, precioUnit: 'mil' }], [{ ...base, precioUnit: 1.234 }], [{ ...base, precioUnit: 100000000 }], [{ ...base, precioUnit: undefined }],
            [{ ...base, costoProveedor: -1 }], [{ ...base, costoProveedor: 'abc' }], [{ ...base, costoProveedor: 1.005 }]
        ];
        for (const m of malos) assert.equal(normalizarExtras(m), null, JSON.stringify(m));
    });

    it('límite de cantidad de elementos por cotización', () => {
        const uno = { nombre: 'X', cantidad: 1, precioUnit: 1000 };
        assert.equal(normalizarExtras(Array(MAX_EXTRAS).fill(uno))!.length, MAX_EXTRAS);
        assert.equal(normalizarExtras(Array(MAX_EXTRAS + 1).fill(uno)), null);
    });
});

// ---------------------------------------------------------------------------------------------
// Total de la cotización (trigger de la tabla nueva)
// ---------------------------------------------------------------------------------------------

describe('total de la cotización', () => {
    it('el trigger suma al insertar, ajusta al editar y resta al borrar', async () => {
        const id = await cotizacionCompleta();
        assert.equal(await totalEnBase(id), TOTAL_BASE);
        await ctx.db.exec(`INSERT INTO quote_extra_items (quote_id, name, quantity, unit_price) VALUES (${id}, 'Carpa', 2, 350000.50)`);
        assert.equal(await totalEnBase(id), TOTAL_BASE + 700001);
        await ctx.db.exec(`UPDATE quote_extra_items SET quantity = 3 WHERE quote_id = ${id}`);
        assert.equal(await totalEnBase(id), TOTAL_BASE + 1050001.5);
        await ctx.db.exec(`UPDATE quote_extra_items SET unit_price = 100 WHERE quote_id = ${id}`);
        assert.equal(await totalEnBase(id), TOTAL_BASE + 300);
        await ctx.db.exec(`DELETE FROM quote_extra_items WHERE quote_id = ${id}`);
        assert.equal(await totalEnBase(id), TOTAL_BASE);
    });

    it('los datos extremos los rechaza la base (cantidad 0, precio negativo)', async () => {
        const id = await cotizacionCompleta();
        await assert.rejects(ctx.db.exec(`INSERT INTO quote_extra_items (quote_id, name, quantity, unit_price) VALUES (${id}, 'X', 0, 10)`));
        await assert.rejects(ctx.db.exec(`INSERT INTO quote_extra_items (quote_id, name, quantity, unit_price) VALUES (${id}, 'X', 1, -10)`));
        assert.equal(await contar('quote_extra_items'), 0);
        assert.equal(await totalEnBase(id), TOTAL_BASE);
    });

    it('al guardar desde el panel el total incluye servicios, transporte y elementos adicionales', async () => {
        const id = await cotizacionCompleta();
        const r = await guardar(id, { items: itemsBase, extras: [PLANTA, CARPA] });
        assert.equal(r.status, 200);
        assert.equal(r.json.total, TOTAL_BASE + 800000 + 700000);
        assert.equal(await totalEnBase(id), TOTAL_BASE + 1500000);
        assert.equal(r.json.extras.length, 2);
    });

    it('reemplazar la lista recalcula (no acumula) y una lista vacía los quita todos', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA, CARPA] });
        assert.equal((await guardar(id, { items: itemsBase, extras: [CARPA] })).json.total, TOTAL_BASE + 700000);
        assert.equal(await contar('quote_extra_items'), 1);
        assert.equal((await guardar(id, { items: itemsBase, extras: [] })).json.total, TOTAL_BASE);
        assert.equal(await contar('quote_extra_items'), 0);
    });

    it('guardar solo los servicios (sin la clave extras) no borra los elementos adicionales', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        const r = await guardar(id, { items: [{ variantId: PISO_5X5, cantidad: 1 }] });
        assert.equal(r.status, 200);
        assert.equal(r.json.extras.length, 1);
        assert.equal(r.json.total, 3800000 + 450000 + 800000);
    });

    it('quitar todos los servicios del catálogo deja los elementos adicionales', async () => {
        const id = await cotizacionCompleta();
        const r = await guardar(id, { items: [], extras: [PLANTA] });
        assert.equal(r.json.items.length, 0);
        assert.equal(r.json.total, 450000 + 800000);
    });

    it('una lista inválida responde 400 y no cambia nada de lo guardado', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        const antes = await detalle(id);
        for (const mala of [[{ ...PLANTA, precioUnit: 0 }], [{ ...PLANTA, cantidad: 0 }], [{ ...PLANTA, nombre: '' }], 'texto']) {
            const r = await guardar(id, { items: [{ variantId: PISO_5X5, cantidad: 1 }], extras: mala });
            assert.equal(r.status, 400, JSON.stringify(mala));
        }
        const despues = await detalle(id);
        assert.equal(despues.total, antes.total);
        assert.equal(despues.items.length, antes.items.length);
        assert.equal(despues.extras.length, 1);
    });

    it('un valor que desborda el total responde 400 y deja intacto lo anterior (todo o nada)', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        const r = await guardar(id, { items: itemsBase, extras: [{ nombre: 'Enorme', cantidad: 100, precioUnit: 99999999.99 }] });
        assert.equal(r.status, 400);
        const d = await detalle(id);
        assert.equal(d.extras.length, 1);
        assert.equal(d.extras[0].nombre, PLANTA.nombre);
        assert.equal(d.total, TOTAL_BASE + 800000);
    });

    it('borrar la cotización borra sus elementos adicionales', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA, CARPA] });
        await ctx.db.exec(`DELETE FROM quote WHERE id = ${id}`);
        assert.equal(await contar('quote_extra_items'), 0);
    });

    it('cada cotización guarda los suyos', async () => {
        const a = await cotizacionCompleta('Ana', 'ana@correo.com');
        const b = await cotizacionCompleta('Beto', 'beto@correo.com');
        await guardar(a, { items: itemsBase, extras: [PLANTA] });
        await guardar(b, { items: itemsBase, extras: [CARPA] });
        assert.equal((await detalle(a)).extras[0].nombre, PLANTA.nombre);
        assert.equal((await detalle(b)).extras[0].nombre, CARPA.nombre);
        assert.equal(await totalEnBase(a), TOTAL_BASE + 800000);
        assert.equal(await totalEnBase(b), TOTAL_BASE + 700000);
    });
});

// ---------------------------------------------------------------------------------------------
// Inventario: los elementos adicionales no son stock
// ---------------------------------------------------------------------------------------------

describe('no contaminan el inventario', () => {
    it('agregar elementos adicionales no crea tipos, variantes ni unidades', async () => {
        const [inv, vars] = [await contar("inventory"), await contar("inventory_variants")];
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA, CARPA] });
        assert.equal(await contar('inventory'), inv);
        assert.equal(await contar('inventory_variants'), vars);
    });

    it('el endpoint viejo del ítem manual ya no existe', async () => {
        const r = await api('POST', '/api/catalogo/manual', { tag: 'X', nombre: 'Y', precio: 1000 });
        assert.equal(r.status, 404);
        assert.equal(await contar('inventory'), 3);
    });
});

// ---------------------------------------------------------------------------------------------
// Quién ve el proveedor y su costo
// ---------------------------------------------------------------------------------------------

describe('proveedor y costo: solo para la administradora', () => {
    it('la administradora los recibe', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        const e = (await detalle(id)).extras[0];
        assert.equal(e.proveedor, 'Alquileres del Eje');
        assert.equal(e.costoProveedor, 500000);
        assert.equal(e.precioUnit, 800000);
    });

    it('la secretaria ve el elemento y su precio, pero nunca proveedor ni costo', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        const r = await api('GET', `/api/cotizaciones/${id}`, undefined, ctx.tokenSecretaria);
        assert.equal(r.status, 200);
        assert.equal(r.json.extras.length, 1);
        assert.equal(r.json.extras[0].nombre, PLANTA.nombre);
        assert.equal(r.json.extras[0].precioUnit, 800000);
        const texto = JSON.stringify(r.json);
        for (const secreto of ['proveedor', 'costoProveedor', 'Alquileres del Eje', '500000']) {
            assert.ok(!texto.includes(secreto), `la secretaria no debe recibir "${secreto}"`);
        }
    });

    it('el historial no guarda el proveedor ni el costo', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        await guardar(id, { items: itemsBase, extras: [CARPA] });
        const historial = (await api('GET', `/api/cotizaciones/${id}/historial`)).json;
        const texto = JSON.stringify(historial);
        assert.ok(!texto.includes('Alquileres del Eje'));
        assert.ok(!texto.includes('costoProveedor'));
        assert.ok(historial.some((h: any) => h.tipo === 'edicion'));
    });

    it('solo la administradora puede editarlos', async () => {
        const id = await cotizacionCompleta();
        assert.equal((await api('PUT', `/api/cotizaciones/${id}/items`, { items: itemsBase, extras: [PLANTA] }, ctx.tokenSecretaria)).status, 403);
        assert.equal((await api('PUT', `/api/cotizaciones/${id}/items`, { items: itemsBase, extras: [PLANTA] }, ctx.tokenLogistica)).status, 403);
        assert.equal((await api('PUT', `/api/cotizaciones/${id}/items`, { items: itemsBase, extras: [PLANTA] }, null)).status, 401);
        assert.equal(await contar('quote_extra_items'), 0);
    });
});

// ---------------------------------------------------------------------------------------------
// PDF y contrato (cliente) y lista de carga (Andrés)
// ---------------------------------------------------------------------------------------------

describe('documentos', () => {
    it('el PDF de la cotización se genera con los elementos adicionales', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA, CARPA] });
        const pdf = await descargar(`/api/cotizaciones/${id}/pdf`);
        assert.equal(pdf.status, 200);
        assert.match(pdf.tipo, /application\/pdf/);
        assert.ok(pdf.cuerpo.subarray(0, 5).toString() === '%PDF-');
    });

    it('el contrato incluye los elementos adicionales y se envía', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA] });
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        const vista = await descargar(`/api/contratos/${id}/pdf`, ctx.tokenSecretaria);
        assert.equal(vista.status, 200);
        const r = await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.equal(r.status, 200);
    });

    it('Andrés los ve en una sección aparte y sin precios, proveedor ni costo', async () => {
        const id = await cotizacionCompleta();
        await guardar(id, { items: itemsBase, extras: [PLANTA, CARPA] });
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        assert.equal((await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`)).status, 200);

        const eventos = (await api('GET', '/api/logistica/eventos', undefined, ctx.tokenLogistica)).json;
        assert.equal(eventos.length, 1);
        const e = eventos[0];
        assert.equal(e.externos.length, 2);
        assert.deepEqual(e.externos.map((x: any) => x.nombre), [PLANTA.nombre, CARPA.nombre]);
        assert.equal(e.externos[0].nota, 'Llega el día anterior');
        assert.ok(!e.equipos.some((x: any) => x.nombre === PLANTA.nombre), 'no se mezclan con los equipos de la bodega');
        assert.equal(e.equipos.length, 2);
        const texto = JSON.stringify(e);
        for (const secreto of ['precioUnit', 'precio', 'proveedor', 'costo', 'Alquileres del Eje', '800000', '500000']) {
            assert.ok(!texto.includes(secreto), `Andrés no debe recibir "${secreto}"`);
        }

        const lista = await descargar(`/api/logistica/eventos/${id}/pdf`, ctx.tokenLogistica);
        assert.equal(lista.status, 200);
        assert.ok(lista.cuerpo.subarray(0, 5).toString() === '%PDF-');
    });

    it('un evento sin elementos adicionales devuelve la lista vacía', async () => {
        const id = await cotizacionCompleta();
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`);
        const e = (await api('GET', '/api/logistica/eventos', undefined, ctx.tokenLogistica)).json[0];
        assert.deepEqual(e.externos, []);
    });
});
