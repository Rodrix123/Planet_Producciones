// Montaje común de las pruebas de integración: el servidor real (rutas de cotizaciones,
// contratos y logística) sobre un Postgres embebido (PGlite) con el esquema, las restricciones
// y los triggers de producción. Nunca toca la base real, no manda correos y guarda los
// archivos subidos en una carpeta temporal.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { PGlite, types } from '@electric-sql/pglite';

const RAIZ_REPO = path.resolve(__dirname, '..', '..', '..', '..');

export const SQL_ESQUEMA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'esquema_cotizaciones.sql'), 'utf8');
export const SQL_MIGRACION = fs.readFileSync(
    path.join(RAIZ_REPO, 'packages', 'db', 'supabase', 'migrations', '20261101120000_datos_del_cliente_en_cotizacion.sql'),
    'utf8'
);
export const SQL_REVERSA = fs.readFileSync(
    path.join(RAIZ_REPO, 'packages', 'db', 'supabase', 'respaldos', '20261101120000_datos_del_cliente_en_cotizacion.revertir.sql'),
    'utf8'
);

export const SQL_CATALOGO = `
    INSERT INTO venue (name, city) VALUES ('Club Campestre', 'Manizales');
    INSERT INTO transportation (city, price) VALUES ('Manizales', 450000), ('Pereira', 600000);
    INSERT INTO inventory (name, type, control_type) VALUES ('Piso', 'PISO', 'select'), ('Espejos', 'ESPEJOS', 'select'), ('Mesas', 'MOBILIARIO', 'qty');
    INSERT INTO inventory_variants (inventory_id, simple_description) VALUES (1, '3D infinito 3 x 3'), (1, '3D infinito 5 x 5'), (2, 'Bola de espejos'), (3, 'Mesa cóctel');
    INSERT INTO "PriceVariants" (id_variant, quantity, price) VALUES (1, 1, 1400000), (2, 1, 3800000), (3, 1, 100000), (3, 8, 600000), (4, 1, 40000);
`;

// Ids del catálogo de prueba
export const PISO_3X3 = 1; // $1.400.000
export const PISO_5X5 = 2; // $3.800.000
export const ESPEJOS = 3; // $100.000 c/u; 8 unidades = $600.000 (tramo exacto)
export const MESA = 4; // $40.000 c/u
export const MANIZALES = 1; // transporte $450.000
export const SEDE = 1;

export const ID_ADMIN = '00000000-0000-0000-0000-0000000000a1';
export const ID_SECRETARIA = '00000000-0000-0000-0000-0000000000b2';
export const ID_LOGISTICA = '00000000-0000-0000-0000-0000000000c3';

export interface CorreoEnviado {
    to?: string;
    cc?: string;
    subject?: string;
    text?: string;
    attachments?: { filename: string; content: Buffer }[];
}

export interface Contexto {
    db: PGlite;
    base: string;
    carpetaSubidas: string;
    tokenAdmin: string;
    tokenSecretaria: string;
    tokenLogistica: string;
    /** Correos que el servidor "envió" (el transporte de nodemailer está sustituido). */
    correos: CorreoEnviado[];
    /** Si es true, el siguiente envío falla (como una caída de Gmail). */
    fallarCorreo: boolean;
    /** Milisegundos que tarda cada envío (para simular un correo lento y probar doble clic). */
    retrasoCorreo: number;
    /** Milisegundos que tarda cada consulta a la base. La real (remota) tarda ~250 ms; con una base
     *  instantánea las carreras entre dos clics casi nunca se producen y las pruebas no las ven. */
    latenciaConsulta: number;
}

export const ctx = {
    correos: [] as CorreoEnviado[],
    fallarCorreo: false,
    retrasoCorreo: 0,
    latenciaConsulta: 8
} as Contexto;

let servidor: http.Server;

export async function crearBase(): Promise<PGlite> {
    // Igual que db.ts: las fechas llegan como texto AAAA-MM-DD, no como objetos Date.
    return PGlite.create({ parsers: { [types.DATE]: (v: string) => v } });
}

/**
 * Sustituye a pg.Pool por un adaptador sobre PGlite. PGlite tiene una sola conexión, así que se
 * serializa el acceso: quien abre una transacción (connect) la tiene entera para sí, igual que
 * ocurre con una conexión propia del pool real.
 */
function instalarPoolFalso(): void {
    const pg = require('pg');
    const ejecutar = async (text: string, params: unknown[] = []) => {
        if (ctx.latenciaConsulta) await new Promise((r) => setTimeout(r, ctx.latenciaConsulta));
        const r = await ctx.db.query(text, params);
        return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    };
    class PoolFalso {
        private cola: Promise<void> = Promise.resolve();
        private adquirir(): Promise<() => void> {
            let liberar!: () => void;
            const turno = new Promise<void>((r) => { liberar = r; });
            const anterior = this.cola;
            this.cola = anterior.then(() => turno);
            return anterior.then(() => liberar);
        }
        async query(text: string, params?: unknown[]) {
            const liberar = await this.adquirir();
            try { return await ejecutar(text, params); } finally { liberar(); }
        }
        async connect() {
            const liberar = await this.adquirir();
            return { query: (t: string, p?: unknown[]) => ejecutar(t, p), release: liberar };
        }
    }
    pg.Pool = PoolFalso;
}

export async function iniciarServidor(): Promise<void> {
    process.env.DATABASE_URL = 'postgres://prueba/prueba';
    process.env.JWT_SECRET = 'secreto-solo-para-pruebas';
    process.env.EMAIL_USER = 'planet@prueba.co';
    process.env.EMAIL_ADMINISTRADOR = 'maritza@prueba.co';
    delete process.env.EMAIL_JEFE; // ninguna prueba manda correos
    ctx.carpetaSubidas = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-subidas-'));
    process.env.UPLOADS_DIR = ctx.carpetaSubidas;

    ctx.db = await crearBase();
    await ctx.db.exec(SQL_ESQUEMA);
    await ctx.db.exec(SQL_MIGRACION);
    instalarPoolFalso();

    // El envío de correos se sustituye a nivel del transporte de nodemailer.
    const { transporter } = require('../../src/mailer');
    (transporter as { sendMail: unknown }).sendMail = async (opciones: CorreoEnviado) => {
        if (ctx.retrasoCorreo) await new Promise((r) => setTimeout(r, ctx.retrasoCorreo));
        if (ctx.fallarCorreo) throw Object.assign(new Error('Fallo simulado del correo'), { code: 'EAUTH' });
        ctx.correos.push(opciones);
        return { messageId: 'prueba' };
    };

    const express = require('express');
    const cookieParser = require('cookie-parser');
    const { cotizacionesRouter } = require('../../src/routes/cotizaciones.routes');
    const { contratosRouter } = require('../../src/routes/contratos.routes');
    const { logisticaRouter } = require('../../src/routes/logistica.routes');
    const { signSessionToken } = require('../../src/auth');
    const { manejadorErrores } = require('../../src/manejadorErrores');

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/cotizaciones', cotizacionesRouter);
    app.use('/api/contratos', contratosRouter);
    app.use('/api/logistica', logisticaRouter);
    app.use(manejadorErrores); // el mismo que usa src/index.ts

    const sesion = (id: string, rol: string, nombre: string) => signSessionToken({ id, rol, nombre, correo: `${rol}@prueba.co`, debeCambiarPassword: false });
    ctx.tokenAdmin = sesion(ID_ADMIN, 'administrador', 'Maritza');
    ctx.tokenSecretaria = sesion(ID_SECRETARIA, 'secretaria', 'Mariana');
    ctx.tokenLogistica = sesion(ID_LOGISTICA, 'jefe_logistica', 'Andrés');

    servidor = http.createServer(app);
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    ctx.base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}

export async function detenerServidor(): Promise<void> {
    await new Promise((r) => servidor.close(r));
    await ctx.db.close();
    fs.rmSync(ctx.carpetaSubidas, { recursive: true, force: true });
}

/** Deja la base con solo el catálogo de prueba, la carpeta de subidas vacía y el correo normal. */
export async function reiniciarDatos(): Promise<void> {
    await ctx.db.exec('TRUNCATE users, venue, transportation, inventory, quote RESTART IDENTITY CASCADE');
    await ctx.db.exec(SQL_CATALOGO);
    const firmados = path.join(ctx.carpetaSubidas, 'contratos-firmados');
    fs.mkdirSync(firmados, { recursive: true });
    for (const f of fs.readdirSync(firmados)) fs.rmSync(path.join(firmados, f), { recursive: true, force: true });
    ctx.correos.length = 0;
    ctx.fallarCorreo = false;
    ctx.retrasoCorreo = 0;
}

export interface Respuesta { status: number; json: any }

export async function api(metodo: string, ruta: string, cuerpo?: unknown, token: string | null = ctx.tokenAdmin): Promise<Respuesta> {
    const res = await fetch(ctx.base + ruta, {
        method: metodo,
        headers: {
            'content-type': 'application/json',
            ...(token ? { cookie: `pp_session=${token}` } : {})
        },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const texto = await res.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { json = texto; }
    return { status: res.status, json };
}

/** Sube un archivo como lo hace el navegador (multipart/form-data). */
export async function subirArchivo(ruta: string, contenido: Uint8Array | string, nombre: string, tipo: string, token: string | null = ctx.tokenAdmin): Promise<Respuesta> {
    const datos = new FormData();
    datos.append('archivo', new Blob([contenido as BlobPart], { type: tipo }), nombre);
    const res = await fetch(ctx.base + ruta, { method: 'POST', body: datos, headers: token ? { cookie: `pp_session=${token}` } : {} });
    const texto = await res.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { json = texto; }
    return { status: res.status, json };
}

export async function descargar(ruta: string, token: string | null = ctx.tokenAdmin): Promise<{ status: number; tipo: string; cuerpo: Buffer }> {
    const res = await fetch(ctx.base + ruta, { headers: token ? { cookie: `pp_session=${token}` } : {} });
    return { status: res.status, tipo: res.headers.get('content-type') || '', cuerpo: Buffer.from(await res.arrayBuffer()) };
}

export const cotizar = (cuerpo: unknown) => api('POST', '/api/cotizaciones', cuerpo, null);

export function pedido(nombre: string, correo: string, extra: Record<string, unknown> = {}) {
    return {
        cliente: { nombre, correo, telefono: '3000000000' },
        items: [{ variantId: PISO_3X3, cantidad: 1 }],
        ...extra
    };
}

/** Cotización lista para llevarla por todo el flujo: con documento, fecha, sede y dos servicios. */
export async function cotizacionCompleta(nombre = 'Ana Pérez', correo = 'ana@correo.com', fecha = '2026-12-05'): Promise<number> {
    const r = await cotizar({
        cliente: { nombre, correo, telefono: '3001234567', documento: '1012345678' },
        tipoEvento: 'Boda VIP / Matrimonio',
        fechaEvento: fecha,
        venueId: SEDE,
        transportationId: MANIZALES,
        items: [{ variantId: PISO_5X5, cantidad: 1 }, { variantId: MESA, cantidad: 10 }]
    });
    if (r.status !== 201) throw new Error(`No se pudo crear la cotización de prueba: ${r.status} ${JSON.stringify(r.json)}`);
    return Number(r.json.id);
}

export async function contar(tabla: string): Promise<number> {
    return Number((await ctx.db.query(`SELECT count(*) AS n FROM ${tabla}`)).rows[0]!['n' as never]);
}

/** PDF mínimo válido (empieza por %PDF-). */
export const PDF_VALIDO = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
