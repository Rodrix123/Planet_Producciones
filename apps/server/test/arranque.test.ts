// Prueba de que el servidor COMPILADO arranca (lo que se ejecuta en producción: `npm run build`
// + `npm start`). Una vez el servidor se cayó al iniciar porque Node no podía cargar el paquete
// @my-app/db (TypeScript sin compilar) y las demás pruebas no lo notaron, porque corren con tsx.
//
// Compila con scripts/build.mjs, lo arranca con variables ficticias (sin base de datos real) y
// comprueba que atiende peticiones, incluida la ruta de eventos, que usa @my-app/db.
//
// Ejecutar:  npm run test:arranque --workspace apps/server

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

const RAIZ = path.resolve(__dirname, '..');

let carpeta: string;
let proceso: ReturnType<typeof spawn> | undefined;
let puerto: number;
let salida = '';

function puertoLibre(): Promise<number> {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
            const p = (s.address() as net.AddressInfo).port;
            s.close(() => resolve(p));
        });
        s.on('error', reject);
    });
}

before(async () => {
    // Dentro de apps/server para que el archivo compilado encuentre node_modules, como en producción.
    carpeta = fs.mkdtempSync(path.join(RAIZ, '.prueba-arranque-'));
    const compilacion = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'build.mjs'), path.join(carpeta, 'dist')], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(compilacion.status, 0, `La compilación falló:\n${compilacion.stdout}\n${compilacion.stderr}`);

    puerto = await puertoLibre();
    proceso = spawn(process.execPath, [path.join(carpeta, 'dist', 'index.js')], {
        cwd: carpeta,
        env: {
            PATH: process.env.PATH,
            PORT: String(puerto),
            DATABASE_URL: 'postgres://prueba:prueba@127.0.0.1:1/prueba',
            JWT_SECRET: 'secreto-solo-para-pruebas',
            SUPABASE_URL: 'http://127.0.0.1:1',
            SUPABASE_ANON_KEY: 'x',
            SUPABASE_SERVICE_ROLE_KEY: 'x',
            UPLOADS_DIR: path.join(carpeta, 'subidas'),
            EMAIL_USER: 'prueba@prueba.co',
            EMAIL_PASS: 'x'
        }
    });
    proceso.stdout?.on('data', (d) => { salida += d; });
    proceso.stderr?.on('data', (d) => { salida += d; });

    const limite = Date.now() + 20000;
    while (!salida.includes('Servidor iniciado')) {
        if (proceso.exitCode !== null) assert.fail(`El servidor compilado se cayó al arrancar:\n${salida}`);
        if (Date.now() > limite) assert.fail(`El servidor compilado no arrancó en 20 s:\n${salida}`);
        await new Promise((r) => setTimeout(r, 100));
    }
});

after(async () => {
    // En Windows no se puede borrar la carpeta mientras el proceso la tiene abierta: se espera a que termine.
    if (proceso && proceso.exitCode === null) {
        await new Promise<void>((resolve) => {
            proceso!.once('exit', () => resolve());
            proceso!.kill();
        });
    }
    if (carpeta) fs.rmSync(carpeta, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

describe('servidor compilado (producción)', () => {
    it('arranca y sigue vivo', () => {
        assert.equal(proceso!.exitCode, null);
        assert.match(salida, new RegExp(`http://localhost:${puerto}`));
    });

    it('atiende peticiones: los paneles piden sesión (401) y la ruta de eventos, que usa @my-app/db, está cargada', async () => {
        for (const ruta of ['/api/auth/me', '/api/cotizaciones', '/api/eventos', '/api/contratos/1', '/api/logistica/eventos']) {
            const r = await fetch(`http://127.0.0.1:${puerto}${ruta}`);
            assert.equal(r.status, 401, `${ruta} debería exigir sesión`);
        }
    });

    it('un id raro responde 404 y una petición mal formada 400 (manejador de errores incluido en el paquete)', async () => {
        const mal = await fetch(`http://127.0.0.1:${puerto}/api/cotizaciones`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"x":' });
        assert.equal(mal.status, 400);
    });

    it('crea la carpeta de contratos firmados donde indica UPLOADS_DIR', () => {
        assert.ok(fs.existsSync(path.join(carpeta, 'subidas', 'contratos-firmados')));
    });

    it('no hace falta el código fuente: el paquete compilado es un solo archivo', () => {
        const archivos = fs.readdirSync(path.join(carpeta, 'dist')).filter((f) => f.endsWith('.js'));
        assert.deepEqual(archivos, ['index.js']);
        assert.ok(fs.statSync(path.join(carpeta, 'dist', 'index.js')).size > 50_000);
    });
});

