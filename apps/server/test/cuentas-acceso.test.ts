// Pruebas de las cuentas de acceso (/api/cuentas-acceso): crear, editar, borrar personas y sus días no
// disponibles. Supabase Auth se sustituye por un doble que registra lo que se le pide; la base es PGlite
// con el esquema de producción. Nunca se crea ni se borra una cuenta real.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, contar, ctx, detenerServidor, ID_ADMIN, iniciarServidor, reiniciarDatos } from './helpers/servidor';

type Llamada = { metodo: string; args: any[] };
const llamadas: Llamada[] = [];
let siguienteUsuario = 'aaaaaaaa-0000-4000-8000-000000000001';
let errorAlCrear: { message: string } | null = null;
let errorAlActualizar: { message: string } | null = null;
const originales: Record<string, unknown> = {};

before(async () => {
    await iniciarServidor();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabaseAdmin } = require('../src/supabaseAdmin');
    const admin = supabaseAdmin.auth.admin;
    for (const m of ['createUser', 'updateUserById', 'deleteUser', 'listUsers']) originales[m] = admin[m];
    admin.createUser = async (...args: any[]) => {
        llamadas.push({ metodo: 'createUser', args });
        return errorAlCrear ? { data: { user: null }, error: errorAlCrear } : { data: { user: { id: siguienteUsuario } }, error: null };
    };
    admin.updateUserById = async (...args: any[]) => {
        llamadas.push({ metodo: 'updateUserById', args });
        return { data: {}, error: errorAlActualizar };
    };
    admin.deleteUser = async (...args: any[]) => {
        llamadas.push({ metodo: 'deleteUser', args });
        return { data: {}, error: null };
    };
    admin.listUsers = async () => ({ data: { users: [{ id: ID_ADMIN, phone: '573001234567', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null }] }, error: null });
});
after(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { supabaseAdmin } = require('../src/supabaseAdmin');
    Object.assign(supabaseAdmin.auth.admin, originales);
    await detenerServidor();
});
beforeEach(async () => {
    await reiniciarDatos();
    llamadas.length = 0;
    errorAlCrear = null;
    errorAlActualizar = null;
    siguienteUsuario = 'aaaaaaaa-0000-4000-8000-000000000001';
    await ctx.db.exec(`
        INSERT INTO role (id, name) VALUES (1, 'administrador'), (2, 'secretaria'), (3, 'jefe_logistica');
        INSERT INTO profiles (id, role_id, nombre, correo, debe_cambiar_password) VALUES
            ('${ID_ADMIN}', 1, 'Maritza', 'maritza@prueba.co', false),
            ('bbbbbbbb-0000-4000-8000-000000000002', 2, 'Mariana', 'mariana@prueba.co', false);
    `);
});

const OTRA = 'bbbbbbbb-0000-4000-8000-000000000002';
const nueva = { nombre: 'Pedro Díaz', correo: 'Pedro@Prueba.co', password: 'clave-larga-1', rolId: 3, telefono: '+57 (300) 123-4567' };
const veces = (metodo: string) => llamadas.filter((l) => l.metodo === metodo).length;
const perfil = async (id: string) => (await ctx.db.query(`SELECT * FROM profiles WHERE id = '${id}'`)).rows[0] as any;

describe('permisos', () => {
    it('solo la administradora', async () => {
        for (const [token, esperado] of [[ctx.tokenSecretaria, 403], [ctx.tokenLogistica, 403], [null, 401]] as const) {
            assert.equal((await api('GET', '/api/cuentas-acceso', undefined, token)).status, esperado);
            assert.equal((await api('POST', '/api/cuentas-acceso', nueva, token)).status, esperado);
            assert.equal((await api('PUT', `/api/cuentas-acceso/${OTRA}`, { nombre: 'X' }, token)).status, esperado);
            assert.equal((await api('DELETE', `/api/cuentas-acceso/${OTRA}`, undefined, token)).status, esperado);
            assert.equal((await api('POST', `/api/cuentas-acceso/${OTRA}/no-disponible`, { fecha: '2026-12-01' }, token)).status, esperado);
        }
        assert.equal(llamadas.length, 0, 'ninguna petición llegó a Supabase');
    });
});

describe('listar', () => {
    it('devuelve roles y cuentas con su teléfono y sus días no disponibles', async () => {
        await ctx.db.exec(`INSERT INTO unavailability_users (id_user, date) VALUES ('${ID_ADMIN}', '2026-12-05')`);
        const r = await api('GET', '/api/cuentas-acceso');
        assert.equal(r.status, 200);
        assert.equal(r.json.roles.length, 3);
        const maritza = r.json.cuentas.find((c: any) => c.nombre === 'Maritza');
        assert.equal(maritza.telefono, '+573001234567');
        assert.deepEqual(maritza.diasNoDisponibles, ['2026-12-05']);
    });
});

describe('crear una cuenta', () => {
    it('crea el usuario en Auth (teléfono sin símbolos) y su perfil, obligándola a cambiar la clave', async () => {
        const r = await api('POST', '/api/cuentas-acceso', nueva);
        assert.equal(r.status, 201);
        const pedido = llamadas.find((l) => l.metodo === 'createUser')!.args[0];
        assert.equal(pedido.email, 'pedro@prueba.co');
        assert.equal(pedido.phone, '573001234567');
        const p = await perfil(siguienteUsuario);
        assert.deepEqual([p.nombre, p.correo, p.role_id, p.debe_cambiar_password], ['Pedro Díaz', 'pedro@prueba.co', 3, true]);
    });

    it('rechaza con 400 (nunca 500) datos inválidos y no llega a crear nada', async () => {
        const malos: Record<string, unknown>[] = [
            { nombre: '' }, { nombre: 12 }, { nombre: ['a'] }, { nombre: 'a'.repeat(101) },
            { correo: '' }, { correo: 'sin-arroba' }, { correo: 'a@b' }, { correo: 5 }, { correo: 'a'.repeat(150) + '@x.co' },
            { password: '' }, { password: 'corta' }, { password: 12345678 }, { password: ['abcdefgh'] },
            { rolId: 0 }, { rolId: 99 }, { rolId: '3' }, { rolId: 1.5 }, { rolId: -1 }, { rolId: {} }, { rolId: null },
            { telefono: 'x'.repeat(31) }
        ];
        for (const m of malos) {
            const r = await api('POST', '/api/cuentas-acceso', { ...nueva, ...m });
            assert.equal(r.status, 400, `debería ser 400: ${JSON.stringify(m)} (fue ${r.status})`);
        }
        for (const cuerpo of [undefined, null, 'texto', [], 7]) assert.equal((await api('POST', '/api/cuentas-acceso', cuerpo)).status, 400);
        assert.equal(veces('createUser'), 0);
        assert.equal(await contar('profiles'), 2);
    });

    it('un correo o teléfono ya usado responde 409', async () => {
        errorAlCrear = { message: 'A user with this email address has already been registered' };
        assert.equal((await api('POST', '/api/cuentas-acceso', nueva)).status, 409);
        assert.equal(await contar('profiles'), 2);
    });

    it('si el perfil no se puede guardar, se deshace el usuario de Auth (no quedan cuentas huérfanas)', async () => {
        siguienteUsuario = OTRA; // ese id ya tiene perfil: el insert falla
        const r = await api('POST', '/api/cuentas-acceso', nueva);
        assert.equal(r.status, 500);
        assert.equal(veces('deleteUser'), 1);
        assert.equal(llamadas.find((l) => l.metodo === 'deleteUser')!.args[0], OTRA);
        assert.equal(await contar('profiles'), 2);
    });
});

describe('editar una cuenta', () => {
    it('cambia el nombre y el rol de otra persona; el correo y teléfono van a Auth', async () => {
        const r = await api('PUT', `/api/cuentas-acceso/${OTRA}`, { nombre: ' Mariana Ruiz ', correo: 'Nueva@Prueba.co', telefono: '+57 311 000 0000', rolId: 3 });
        assert.equal(r.status, 200);
        const p = await perfil(OTRA);
        assert.deepEqual([p.nombre, p.correo, p.role_id], ['Mariana Ruiz', 'nueva@prueba.co', 3]);
        const attrs = llamadas.find((l) => l.metodo === 'updateUserById')!.args[1];
        assert.equal(attrs.email, 'nueva@prueba.co');
        assert.equal(attrs.phone, '573110000000');
    });

    it('un cambio parcial deja lo demás como estaba y no toca Auth si no hace falta', async () => {
        assert.equal((await api('PUT', `/api/cuentas-acceso/${OTRA}`, { nombre: 'Solo nombre' })).status, 200);
        const p = await perfil(OTRA);
        assert.deepEqual([p.nombre, p.correo, p.role_id], ['Solo nombre', 'mariana@prueba.co', 2]);
        assert.equal(veces('updateUserById'), 0);
    });

    it('nadie puede cambiarse su propio rol, pero sí el nombre', async () => {
        assert.equal((await api('PUT', `/api/cuentas-acceso/${ID_ADMIN}`, { rolId: 2 })).status, 400);
        assert.equal((await perfil(ID_ADMIN)).role_id, 1);
        assert.equal((await api('PUT', `/api/cuentas-acceso/${ID_ADMIN}`, { nombre: 'Maritza P.', rolId: 1 })).status, 200);
        assert.equal((await perfil(ID_ADMIN)).nombre, 'Maritza P.');
    });

    it('datos inválidos: 400 y no cambia nada', async () => {
        const antes = await perfil(OTRA);
        for (const m of [{ nombre: '' }, { nombre: '  ' }, { nombre: 5 }, { nombre: 'a'.repeat(101) }, { correo: 'malo' }, { rolId: 99 }, { rolId: 'x' }, { telefono: 'x'.repeat(31) }]) {
            assert.equal((await api('PUT', `/api/cuentas-acceso/${OTRA}`, m)).status, 400, JSON.stringify(m));
        }
        assert.deepEqual(await perfil(OTRA), antes);
        assert.equal(veces('updateUserById'), 0);
    });

    it('un correo ya usado por otra cuenta responde 409 y no cambia el perfil', async () => {
        errorAlActualizar = { message: 'Email address already registered by another user' };
        assert.equal((await api('PUT', `/api/cuentas-acceso/${OTRA}`, { correo: 'maritza@prueba.co', nombre: 'Otro' })).status, 409);
        assert.equal((await perfil(OTRA)).nombre, 'Mariana');
    });

    it('ids raros: 404', async () => {
        for (const id of ['abc', '1', 'cccccccc-0000-4000-8000-000000000009']) {
            assert.equal((await api('PUT', `/api/cuentas-acceso/${id}`, { nombre: 'X' })).status, 404, id);
        }
    });
});

describe('borrar una cuenta', () => {
    it('borra la de otra persona en Auth', async () => {
        assert.equal((await api('DELETE', `/api/cuentas-acceso/${OTRA}`)).status, 200);
        assert.equal(veces('deleteUser'), 1);
    });
    it('no se puede borrar la propia', async () => {
        assert.equal((await api('DELETE', `/api/cuentas-acceso/${ID_ADMIN}`)).status, 400);
        assert.equal(veces('deleteUser'), 0);
    });
    it('un id que no es uuid: 404 sin llamar a Auth', async () => {
        assert.equal((await api('DELETE', '/api/cuentas-acceso/abc')).status, 404);
        assert.equal(veces('deleteUser'), 0);
    });
});

describe('días no disponibles', () => {
    const marcar = (fecha: unknown, id = OTRA) => api('POST', `/api/cuentas-acceso/${id}/no-disponible`, { fecha });

    it('marcar el mismo día dos veces deja un solo registro', async () => {
        assert.equal((await marcar('2026-12-24')).status, 201);
        assert.equal((await marcar('2026-12-24')).status, 201);
        assert.equal(await contar('unavailability_users'), 1);
    });

    it('fechas inválidas: 400 (nunca 500)', async () => {
        for (const f of ['2026-02-31', '2026-13-01', 'mañana', '24/12/2026', '2026-1-5', 20261224, ['2026-12-24'], {}, '', null]) {
            const r = await marcar(f);
            assert.ok(r.status === 400, `debería ser 400: ${JSON.stringify(f)} (fue ${r.status})`);
        }
        assert.equal(await contar('unavailability_users'), 0);
    });

    it('una cuenta que no existe: 404', async () => {
        assert.equal((await marcar('2026-12-24', 'cccccccc-0000-4000-8000-000000000009')).status, 404);
        assert.equal((await marcar('2026-12-24', 'abc')).status, 404);
    });

    it('quitar un día, y fechas inválidas al quitar dan 400', async () => {
        await marcar('2026-12-24');
        assert.equal((await api('DELETE', `/api/cuentas-acceso/${OTRA}/no-disponible/2026-02-31`)).status, 400);
        assert.equal((await api('DELETE', `/api/cuentas-acceso/${OTRA}/no-disponible/hoy`)).status, 400);
        assert.equal(await contar('unavailability_users'), 1);
        assert.equal((await api('DELETE', `/api/cuentas-acceso/${OTRA}/no-disponible/2026-12-24`)).status, 200);
        assert.equal(await contar('unavailability_users'), 0);
    });
});
