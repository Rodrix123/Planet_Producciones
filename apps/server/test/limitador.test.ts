// Pruebas del límite de peticiones (src/limitador.ts) y de cómo está conectado a las rutas públicas.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { correoDelCuerpo, limitar } from '../src/limitador';

/** Mini servidor con un límite y un reloj que se mueve a mano. */
async function montar(opciones: Parameters<typeof limitar>[0] & { estado?: () => number }) {
    const reloj = { t: 1_000_000 };
    const app = express();
    app.use(express.json());
    app.post('/probar', limitar({ ...opciones, ahora: () => reloj.t }), (req, res) => {
        res.status(opciones.estado ? opciones.estado() : (req.body?.fallar ? 401 : 200)).json({ ok: true });
    });
    const srv = http.createServer(app);
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    const llamar = async (cuerpo: unknown = {}) => {
        const r = await fetch(`${base}/probar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
        return { status: r.status, retry: r.headers.get('retry-after'), json: await r.json() as any };
    };
    return { llamar, reloj, cerrar: () => new Promise((r) => srv.close(r)) };
}

describe('limitar: cuenta todas las peticiones', () => {
    it('permite hasta el máximo, bloquea la siguiente con 429 y Retry-After, y se libera al terminar la ventana', async () => {
        const s = await montar({ maximo: 3, ventanaMs: 60_000, mensaje: 'Demasiadas' });
        for (let i = 0; i < 3; i++) assert.equal((await s.llamar()).status, 200);
        const bloqueada = await s.llamar();
        assert.equal(bloqueada.status, 429);
        assert.equal(bloqueada.json.message, 'Demasiadas');
        assert.equal(bloqueada.retry, '60');

        s.reloj.t += 30_000;
        assert.equal((await s.llamar()).status, 429, 'a mitad de la ventana sigue bloqueado');
        assert.equal((await s.llamar()).retry, '30');

        s.reloj.t += 30_001;
        assert.equal((await s.llamar()).status, 200, 'pasada la ventana vuelve a permitir');
        await s.cerrar();
    });

    it('lo bloqueado no se cuenta otra vez ni alarga el bloqueo', async () => {
        const s = await montar({ maximo: 1, ventanaMs: 10_000, mensaje: 'x' });
        assert.equal((await s.llamar()).status, 200);
        for (let i = 0; i < 20; i++) assert.equal((await s.llamar()).status, 429);
        s.reloj.t += 10_001;
        assert.equal((await s.llamar()).status, 200);
        await s.cerrar();
    });
});

describe('limitar: solo fallos (inicio de sesión)', () => {
    it('entrar bien no gasta intentos; solo los 401', async () => {
        const s = await montar({ maximo: 2, ventanaMs: 60_000, mensaje: 'x', soloFallos: true, clave: correoDelCuerpo });
        for (let i = 0; i < 10; i++) assert.equal((await s.llamar({ correo: 'a@x.co' })).status, 200);
        assert.equal((await s.llamar({ correo: 'a@x.co', fallar: true })).status, 401);
        assert.equal((await s.llamar({ correo: 'a@x.co', fallar: true })).status, 401);
        assert.equal((await s.llamar({ correo: 'a@x.co' })).status, 429, 'tras 2 fallos queda bloqueado, incluso con la clave buena');
        await s.cerrar();
    });

    it('cada correo cuenta aparte, sin distinguir mayúsculas ni espacios', async () => {
        const s = await montar({ maximo: 1, ventanaMs: 60_000, mensaje: 'x', soloFallos: true, clave: correoDelCuerpo });
        await s.llamar({ correo: 'A@x.co', fallar: true });
        assert.equal((await s.llamar({ correo: '  a@X.CO ' })).status, 429, 'es el mismo correo');
        assert.equal((await s.llamar({ correo: 'otro@x.co' })).status, 200, 'otro correo no se ve afectado');
        await s.cerrar();
    });

    it('un cuerpo raro no rompe el límite', () => {
        assert.equal(correoDelCuerpo({ body: undefined } as any), '');
        assert.equal(correoDelCuerpo({ body: { correo: 123 } } as any), '');
        assert.equal(correoDelCuerpo({ body: { correo: 'x'.repeat(500) } } as any).length, 150);
    });
});

// ---------------------------------------------------------------------------------------------
// Conexión con la ruta pública de cotizar (con los límites activados, a diferencia de las demás pruebas)
// ---------------------------------------------------------------------------------------------

describe('POST /api/cotizaciones tiene límite', () => {
    let h: typeof import('./helpers/servidor');
    before(async () => {
        process.env.PROBAR_LIMITES = '1';
        h = await import('./helpers/servidor');
        await h.iniciarServidor();
        await h.reiniciarDatos();
    });
    after(async () => { await h.detenerServidor(); delete process.env.PROBAR_LIMITES; });

    it('tras 40 cotizaciones seguidas desde la misma IP responde 429 y no guarda la siguiente', async () => {
        for (let i = 0; i < 40; i++) {
            const r = await h.cotizar(h.pedido(`Persona ${i}`, `p${i}@correo.com`));
            assert.equal(r.status, 201, `la ${i + 1} debería pasar`);
        }
        const r = await h.cotizar(h.pedido('Una más', 'una-mas@correo.com'));
        assert.equal(r.status, 429);
        assert.match(r.json.message, /muchas cotizaciones/);
        assert.equal(await h.contar('quote'), 40);
        // la administradora, con sesión, sigue pudiendo consultar
        assert.equal((await h.api('GET', '/api/cotizaciones')).status, 200);
    });
});
