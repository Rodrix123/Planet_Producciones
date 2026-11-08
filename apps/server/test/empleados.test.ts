// Pruebas de la nómina (/api/empleados): crear, editar, borrar y qué pasa con datos raros.
// Solo la administradora entra. Sobre el esquema de producción en PGlite.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, contar, ctx, detenerServidor, iniciarServidor, reiniciarDatos } from './helpers/servidor';

before(iniciarServidor);
after(detenerServidor);
beforeEach(reiniciarDatos);

const base = { nombre: 'Luis Rojas', documento: '1020304050', telefono: '3001112233', salario: 1800000, numeroCuenta: '123456', banco: 'Bancolombia', tipoContrato: 'con_contrato' };
const crear = async (extra: Record<string, unknown> = {}) => (await api('POST', '/api/empleados', { ...base, ...extra })).json;
const UUID_FALSO = '00000000-0000-0000-0000-000000000000';

describe('permisos', () => {
    it('solo la administradora', async () => {
        const e = await crear();
        for (const [token, esperado] of [[ctx.tokenSecretaria, 403], [ctx.tokenLogistica, 403], [null, 401]] as const) {
            assert.equal((await api('GET', '/api/empleados', undefined, token)).status, esperado);
            assert.equal((await api('POST', '/api/empleados', base, token)).status, esperado);
            assert.equal((await api('PUT', `/api/empleados/${e.id}`, { nombre: 'X' }, token)).status, esperado);
            assert.equal((await api('DELETE', `/api/empleados/${e.id}`, undefined, token)).status, esperado);
        }
        assert.equal(await contar('empleados'), 1);
    });
});

describe('crear', () => {
    it('guarda y devuelve el empleado (salario como número)', async () => {
        const r = await api('POST', '/api/empleados', base);
        assert.equal(r.status, 201);
        assert.equal(r.json.nombre, 'Luis Rojas');
        assert.equal(r.json.salario, 1800000);
        assert.equal(r.json.tipoContrato, 'con_contrato');
        assert.equal(r.json.activo, true);
    });

    it('solo el nombre y el tipo de contrato son obligatorios; lo vacío queda sin valor', async () => {
        const r = await api('POST', '/api/empleados', { nombre: ' Ana ', tipoContrato: 'freelance_fijo', documento: '', telefono: '   ', salario: null });
        assert.equal(r.status, 201);
        assert.deepEqual([r.json.nombre, r.json.documento, r.json.telefono, r.json.salario], ['Ana', null, null, null]);
    });

    it('un salario escrito como texto se acepta', async () => {
        assert.equal((await crear({ salario: '2500000.50' })).salario, 2500000.5);
    });

    it('responde 400 (nunca 500) a datos inválidos y no guarda nada', async () => {
        const malos: Record<string, unknown>[] = [
            { nombre: '' }, { nombre: '   ' }, { nombre: 123 }, { nombre: ['a'] }, { nombre: 'a'.repeat(101) },
            { tipoContrato: '' }, { tipoContrato: 'otro' }, { tipoContrato: 5 },
            { salario: -1 }, { salario: 'mucho' }, { salario: '1.234' }, { salario: 1_000_000_001 }, { salario: {} }, { salario: [5] },
            { documento: 123 }, { documento: 'd'.repeat(31) }, { telefono: { a: 1 } }, { telefono: 't'.repeat(31) },
            { numeroCuenta: 'c'.repeat(41) }, { banco: 'b'.repeat(81) }, { banco: false }
        ];
        for (const m of malos) {
            const r = await api('POST', '/api/empleados', { ...base, ...m });
            assert.equal(r.status, 400, `debería ser 400: ${JSON.stringify(m)} (fue ${r.status})`);
        }
        for (const cuerpo of [undefined, null, 'texto', [], 7]) assert.equal((await api('POST', '/api/empleados', cuerpo)).status, 400);
        assert.equal(await contar('empleados'), 0);
    });

    it('en el límite exacto sí cabe', async () => {
        const r = await api('POST', '/api/empleados', { nombre: 'n'.repeat(100), tipoContrato: 'freelance_no_fijo', documento: 'd'.repeat(30), salario: 1_000_000_000 });
        assert.equal(r.status, 201);
    });

    it('un nombre con HTML se guarda tal cual (los paneles lo escapan al mostrarlo)', async () => {
        const r = await crear({ nombre: '<img src=x onerror=alert(1)>' });
        assert.equal(r.nombre, '<img src=x onerror=alert(1)>');
    });
});

describe('listar', () => {
    it('solo los activos, por orden alfabético', async () => {
        await crear({ nombre: 'Zoe' });
        const b = await crear({ nombre: 'Beto' });
        await crear({ nombre: 'Ana' });
        await api('DELETE', `/api/empleados/${b.id}`);
        const lista = (await api('GET', '/api/empleados')).json as any[];
        assert.deepEqual(lista.map((x) => x.nombre), ['Ana', 'Zoe']);
    });
});

describe('editar', () => {
    it('cambia solo lo que se envía', async () => {
        const e = await crear();
        const r = await api('PUT', `/api/empleados/${e.id}`, { telefono: '3109998877' });
        assert.equal(r.status, 200);
        assert.equal(r.json.telefono, '3109998877');
        assert.deepEqual([r.json.nombre, r.json.salario, r.json.banco, r.json.tipoContrato], ['Luis Rojas', 1800000, 'Bancolombia', 'con_contrato']);
    });

    it('lo que se envía vacío se deja sin valor (se puede quitar un teléfono o el salario)', async () => {
        const e = await crear();
        const r = await api('PUT', `/api/empleados/${e.id}`, { telefono: '', salario: null, banco: '  ' });
        assert.deepEqual([r.json.telefono, r.json.salario, r.json.banco], [null, null, null]);
        assert.equal(r.json.nombre, 'Luis Rojas');
    });

    it('el nombre no se puede dejar vacío y los datos raros dan 400 sin cambiar nada', async () => {
        const e = await crear();
        for (const m of [{ nombre: '' }, { nombre: '  ' }, { tipoContrato: 'x' }, { salario: -5 }, { salario: 'abc' }, { documento: 99 }, { banco: 'b'.repeat(81) }]) {
            assert.equal((await api('PUT', `/api/empleados/${e.id}`, m)).status, 400, JSON.stringify(m));
        }
        const lista = (await api('GET', '/api/empleados')).json as any[];
        assert.deepEqual(lista[0], e);
    });

    it('ids raros: 404, nunca 500', async () => {
        for (const id of ['abc', '1', UUID_FALSO, "x'; drop table empleados;--"]) {
            assert.equal((await api('PUT', `/api/empleados/${encodeURIComponent(id)}`, { nombre: 'X' })).status, 404, id);
            assert.equal((await api('DELETE', `/api/empleados/${encodeURIComponent(id)}`)).status, 404, id);
        }
        assert.equal(await contar('empleados'), 0);
    });
});

describe('borrar', () => {
    it('es lógico: deja de aparecer pero la información se conserva', async () => {
        const e = await crear();
        assert.equal((await api('DELETE', `/api/empleados/${e.id}`)).status, 200);
        assert.equal(((await api('GET', '/api/empleados')).json as any[]).length, 0);
        assert.equal(await contar('empleados'), 1);
    });

    it('borrar dos veces: la segunda dice que no existe', async () => {
        const e = await crear();
        assert.equal((await api('DELETE', `/api/empleados/${e.id}`)).status, 200);
        assert.equal((await api('DELETE', `/api/empleados/${e.id}`)).status, 404);
    });
});
