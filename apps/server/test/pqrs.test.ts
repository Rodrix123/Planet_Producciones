// Pruebas de PQRS: el formulario público (peticiones, quejas, reclamos y sugerencias) y la respuesta
// de Mariana por correo. Sobre el esquema de producción en PGlite; los correos se capturan, no salen.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { api, contar, ctx, detenerServidor, iniciarServidor, reiniciarDatos } from './helpers/servidor';

before(async () => {
    process.env.EMAIL_SECRETARIA = 'mariana@prueba.co';
    await iniciarServidor();
});
after(async () => {
    delete process.env.EMAIL_SECRETARIA;
    await detenerServidor();
});
beforeEach(reiniciarDatos);

const enviar = (cuerpo: unknown) => api('POST', '/api/pqrs', cuerpo, null);
const valido = { nombre: 'Carlos Gómez', correo: 'Carlos@Correo.com', telefono: '3001234567', mensaje: 'Quisiera saber si cubren eventos en Pereira.\nGracias.' };
const crear = async () => (await enviar(valido)).json.id as string;
const responder = (id: string, respuesta: unknown, token: string | null = ctx.tokenSecretaria) => api('POST', `/api/pqrs/${id}/responder`, { respuesta }, token);

describe('enviar un PQRS (público)', () => {
    it('lo guarda con el correo en minúsculas, conserva los saltos de línea y avisa a la secretaria', async () => {
        const r = await enviar(valido);
        assert.equal(r.status, 201);
        const fila = (await ctx.db.query('SELECT nombre, correo, telefono, mensaje, respondido_en FROM pqrs')).rows[0] as any;
        assert.equal(fila.correo, 'carlos@correo.com');
        assert.equal(fila.mensaje, valido.mensaje);
        assert.equal(fila.respondido_en, null);
        await new Promise((x) => setTimeout(x, 50));
        assert.equal(ctx.correos.length, 1);
        assert.equal(ctx.correos[0]!.to, 'mariana@prueba.co');
        assert.match(ctx.correos[0]!.text || '', /Quisiera saber/);
    });

    it('el teléfono es opcional', async () => {
        assert.equal((await enviar({ ...valido, telefono: undefined })).status, 201);
        assert.equal((await ctx.db.query('SELECT telefono FROM pqrs')).rows[0]!['telefono' as never], null);
    });

    it('rechaza con 400 (nunca 500) lo que falta, no es texto o no cabe', async () => {
        const malos: unknown[] = [
            undefined, null, 'texto', [], {},
            { ...valido, nombre: '' }, { ...valido, nombre: '   ' }, { ...valido, nombre: 123 }, { ...valido, nombre: ['a'] },
            { ...valido, correo: '' }, { ...valido, correo: 'sin-arroba' }, { ...valido, correo: 'a@b' }, { ...valido, correo: { x: 1 } },
            { ...valido, mensaje: '' }, { ...valido, mensaje: null }, { ...valido, mensaje: 42 },
            { ...valido, nombre: 'a'.repeat(101) }, { ...valido, correo: 'a'.repeat(150) + '@x.co' },
            { ...valido, telefono: '1'.repeat(31) }, { ...valido, mensaje: 'a'.repeat(2001) }
        ];
        for (const m of malos) {
            const r = await enviar(m);
            assert.equal(r.status, 400, `debería ser 400: ${JSON.stringify(m)?.slice(0, 80)} (fue ${r.status})`);
        }
        assert.equal(await contar('pqrs'), 0, 'no se guardó nada');
    });

    it('en el límite exacto sí cabe', async () => {
        const r = await enviar({ nombre: 'a'.repeat(100), correo: 'x@y.co', telefono: '1'.repeat(30), mensaje: 'm'.repeat(2000) });
        assert.equal(r.status, 201);
    });

    it('un texto con HTML o comillas se guarda tal cual (los paneles lo escapan al mostrarlo)', async () => {
        const raro = '<script>alert(1)</script> "hola" \'chao\'';
        assert.equal((await enviar({ ...valido, mensaje: raro })).status, 201);
        assert.equal((await ctx.db.query('SELECT mensaje FROM pqrs')).rows[0]!['mensaje' as never], raro);
    });
});

describe('listar y responder (Mariana)', () => {
    it('solo la secretaria ve y responde los PQRS', async () => {
        const id = await crear();
        assert.equal((await api('GET', '/api/pqrs', undefined, ctx.tokenSecretaria)).status, 200);
        for (const token of [ctx.tokenAdmin, ctx.tokenLogistica, null]) {
            const esperado = token ? 403 : 401;
            assert.equal((await api('GET', '/api/pqrs', undefined, token)).status, esperado);
            assert.equal((await responder(id, 'hola', token)).status, esperado);
        }
        assert.equal((await ctx.db.query('SELECT respondido_en FROM pqrs')).rows[0]!['respondido_en' as never], null);
    });

    it('lista primero los pendientes', async () => {
        const a = await crear();
        await crear();
        await responder(a, 'Respuesta');
        const lista = (await api('GET', '/api/pqrs', undefined, ctx.tokenSecretaria)).json as any[];
        assert.equal(lista.length, 2);
        assert.equal(lista[0].respondidoEn, null, 'el pendiente va primero');
        assert.equal(lista[1].respuesta, 'Respuesta');
    });

    it('responde: manda el correo al cliente y lo marca como respondido', async () => {
        const id = await crear();
        ctx.correos.length = 0;
        const r = await responder(id, '  Sí, cubrimos Pereira.  ');
        assert.equal(r.status, 200);
        assert.equal(ctx.correos.length, 1);
        assert.equal(ctx.correos[0]!.to, 'carlos@correo.com');
        assert.match(ctx.correos[0]!.text || '', /Sí, cubrimos Pereira\./);
        const fila = (await ctx.db.query('SELECT respuesta, respondido_en, respondido_por FROM pqrs')).rows[0] as any;
        assert.equal(fila.respuesta, 'Sí, cubrimos Pereira.');
        assert.ok(fila.respondido_en);
        assert.equal(fila.respondido_por, '00000000-0000-0000-0000-0000000000b2');
    });

    it('un doble clic manda UN solo correo; la segunda llamada dice que ya fue respondido', async () => {
        const id = await crear();
        ctx.correos.length = 0;
        ctx.retrasoCorreo = 80;
        const r = await Promise.all([responder(id, 'Uno'), responder(id, 'Dos'), responder(id, 'Tres')]);
        ctx.retrasoCorreo = 0;
        assert.deepEqual(r.map((x) => x.status).sort(), [200, 409, 409]);
        assert.equal(ctx.correos.length, 1);
        const texto = (await ctx.db.query('SELECT respuesta FROM pqrs')).rows[0]!['respuesta' as never];
        assert.match(ctx.correos[0]!.text || '', new RegExp(texto));
    });

    it('si el correo falla, responde 502 y el PQRS queda pendiente para reintentar', async () => {
        const id = await crear();
        ctx.fallarCorreo = true;
        const r = await responder(id, 'Respuesta');
        ctx.fallarCorreo = false;
        assert.equal(r.status, 502);
        const fila = (await ctx.db.query('SELECT respuesta, respondido_en, respondido_por FROM pqrs')).rows[0] as any;
        assert.deepEqual([fila.respuesta, fila.respondido_en, fila.respondido_por], [null, null, null]);
        assert.equal((await responder(id, 'Respuesta')).status, 200, 'al reintentar funciona');
    });

    it('respuestas inválidas y ids raros: 400 / 404, nunca 500', async () => {
        const id = await crear();
        for (const mala of ['', '   ', null, undefined, 5, ['x'], 'a'.repeat(5001)]) {
            assert.equal((await responder(id, mala)).status, 400, JSON.stringify(mala)?.slice(0, 30));
        }
        assert.equal((await responder('abc', 'hola')).status, 404);
        assert.equal((await responder('1', 'hola')).status, 404);
        assert.equal((await responder("1'; drop table pqrs;--", 'hola')).status, 404);
        assert.equal((await responder('00000000-0000-0000-0000-000000000000', 'hola')).status, 404);
        assert.equal(await contar('pqrs'), 1);
        assert.equal((await ctx.db.query('SELECT respondido_en FROM pqrs')).rows[0]!['respondido_en' as never], null);
    });
});
