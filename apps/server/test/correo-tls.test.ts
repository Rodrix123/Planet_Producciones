// Pruebas de la seguridad de la conexión de correo (src/mailer.ts, opcionesTls).
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { afterEach, before, describe, it } from 'node:test';

// mailer.ts crea el transporte al cargarse: sus variables de entorno deben existir antes.
before(() => {
    process.env.EMAIL_USER = 'prueba@prueba.co';
    process.env.EMAIL_PASS = 'x';
});

const cargar = () => require('../src/mailer') as typeof import('../src/mailer');

describe('opcionesTls', () => {
    let carpeta: string | undefined;
    afterEach(() => {
        if (carpeta) fs.rmSync(carpeta, { recursive: true, force: true });
        carpeta = undefined;
    });

    it('por defecto verifica el certificado (no pone rejectUnauthorized en false)', () => {
        const { opcionesTls } = cargar();
        assert.deepEqual(opcionesTls({}), {});
        assert.equal(opcionesTls({}).rejectUnauthorized, undefined);
    });

    it('EMAIL_TLS_INSECURE=true es la única forma de desactivar la verificación, y avisa en el registro', () => {
        const { opcionesTls } = cargar();
        const avisos: unknown[][] = [];
        const original = console.warn;
        console.warn = (...a: unknown[]) => { avisos.push(a); };
        try {
            assert.deepEqual(opcionesTls({ EMAIL_TLS_INSECURE: 'true' }), { rejectUnauthorized: false });
        } finally {
            console.warn = original;
        }
        assert.equal(avisos.length, 1);
        assert.match(String(avisos[0]![0]), /NO se verifica/);
    });

    it('cualquier otro valor de EMAIL_TLS_INSECURE no desactiva la verificación', () => {
        const { opcionesTls } = cargar();
        for (const v of ['false', '1', 'yes', 'TRUE', '', ' true']) {
            assert.deepEqual(opcionesTls({ EMAIL_TLS_INSECURE: v }), {}, JSON.stringify(v));
        }
    });

    it('EMAIL_CA_FILE agrega esa autoridad a las de confianza, sin quitar las normales', () => {
        const { opcionesTls } = cargar();
        carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-ca-'));
        const archivo = path.join(carpeta, 'antivirus.pem');
        fs.writeFileSync(archivo, '-----BEGIN CERTIFICATE-----\nPRUEBA\n-----END CERTIFICATE-----\n');
        const o = opcionesTls({ EMAIL_CA_FILE: archivo });
        assert.equal(o.rejectUnauthorized, undefined, 'sigue verificando');
        assert.equal(o.ca!.length, tls.rootCertificates.length + 1);
        assert.match(o.ca![o.ca!.length - 1]!, /PRUEBA/);
    });

    it('si EMAIL_CA_FILE apunta a un archivo que no existe, falla en vez de ignorarlo en silencio', () => {
        const { opcionesTls } = cargar();
        assert.throws(() => opcionesTls({ EMAIL_CA_FILE: path.join(os.tmpdir(), 'no-existe-xyz.pem') }));
    });

    it('EMAIL_TLS_INSECURE gana sobre EMAIL_CA_FILE (la opción explícita de no verificar manda)', () => {
        const { opcionesTls } = cargar();
        const original = console.warn;
        console.warn = () => undefined;
        try {
            assert.deepEqual(opcionesTls({ EMAIL_TLS_INSECURE: 'true', EMAIL_CA_FILE: 'no-importa.pem' }), { rejectUnauthorized: false });
        } finally {
            console.warn = original;
        }
    });
});

