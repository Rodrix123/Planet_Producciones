// Pruebas del recorrido completo de una cotización entre los tres perfiles:
//   cliente (cotiza) -> Maritza (revisa, finaliza, sube el contrato firmado, deja definitivo)
//   -> Mariana (genera y envía el contrato) -> Andrés (ve el evento y sus equipos).
//
// Cubren los PDF, el envío de correos, el paso de un perfil a otro, el agendado del evento y la
// subida del contrato firmado, incluidos los errores y los doble clic. Usan el servidor real
// sobre un Postgres embebido (ver test/helpers/servidor.ts): no tocan la base real.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
    api, contar, cotizacionCompleta, cotizar, ctx, descargar, detenerServidor, iniciarServidor, MANIZALES, MESA, PDF_VALIDO,
    pedido, PISO_3X3, PISO_5X5, reiniciarDatos, subirArchivo
} from './helpers/servidor';

before(iniciarServidor);
after(detenerServidor);
beforeEach(reiniciarDatos);

const carpetaFirmados = () => path.join(ctx.carpetaSubidas, 'contratos-firmados');
const archivosFirmados = () => fs.readdirSync(carpetaFirmados());
const estado = async (id: number, token = ctx.tokenAdmin) => (await api('GET', `/api/cotizaciones/${id}`, undefined, token)).json.estado;
const historial = async (id: number) => (await ctx.db.query('SELECT tipo, estado_antes, estado_despues, profile_nombre FROM quote_historial WHERE quote_id = $1 ORDER BY id', [id])).rows as any[];

// ---------------------------------------------------------------------------------------------
// 1. Maritza finaliza la cotización (se agenda el evento)
// ---------------------------------------------------------------------------------------------

describe('finalizar la cotización (agendar el evento)', () => {
    it('crea el evento, cambia el estado y deja el historial', async () => {
        const id = await cotizacionCompleta();
        assert.equal(await estado(id), 'recibida');
        const r = await api('POST', `/api/cotizaciones/${id}/finalizar`);
        assert.equal(r.status, 200);
        assert.equal(r.json.estado, 'finalizada');
        assert.equal(await contar('events'), 1);
        assert.deepEqual(await historial(id), [{ tipo: 'cambio_estado', estado_antes: 'recibida', estado_despues: 'finalizada', profile_nombre: 'Maritza' }]);
        const ev = (await ctx.db.query('SELECT date, hour, confirmed, total_paid, client_id, venue_id FROM events')).rows[0] as any;
        assert.equal(ev.date, '2026-12-05');
        assert.equal(ev.confirmed, false);
        assert.equal(Number(ev.total_paid), 0);
        assert.equal(ev.venue_id, 1);
    });

    it('sin fecha del evento no se puede finalizar y no deja nada creado', async () => {
        const r0 = await cotizar(pedido('Ana', 'a@a.co'));
        const r = await api('POST', `/api/cotizaciones/${r0.json.id}/finalizar`);
        assert.equal(r.status, 400);
        assert.match(r.json.message, /fecha del evento/);
        assert.equal(await contar('events'), 0);
        assert.equal(await contar('quote_historial'), 0);
    });

    it('finalizar dos veces seguidas: la segunda dice que ya fue finalizada', async () => {
        const id = await cotizacionCompleta();
        assert.equal((await api('POST', `/api/cotizaciones/${id}/finalizar`)).status, 200);
        const otra = await api('POST', `/api/cotizaciones/${id}/finalizar`);
        assert.equal(otra.status, 400);
        assert.match(otra.json.message, /ya fue finalizada/);
        assert.equal(await contar('events'), 1);
    });

    it('doble clic simultáneo: una sola respuesta correcta, un solo evento y un solo historial (antes daba un 500)', async () => {
        const id = await cotizacionCompleta();
        const r = await Promise.all([1, 2, 3].map(() => api('POST', `/api/cotizaciones/${id}/finalizar`)));
        const estados = r.map((x) => x.status).sort();
        assert.deepEqual(estados, [200, 400, 400], 'una correcta y las demás avisan que ya estaba finalizada');
        assert.equal(await contar('events'), 1);
        assert.equal(await contar('quote_historial'), 1);
        assert.equal(await estado(id), 'finalizada');
    });

    it('cotización inexistente: 404; solo la administradora puede finalizar', async () => {
        assert.equal((await api('POST', '/api/cotizaciones/9999/finalizar')).status, 404);
        const id = await cotizacionCompleta();
        assert.equal((await api('POST', `/api/cotizaciones/${id}/finalizar`, undefined, ctx.tokenSecretaria)).status, 403);
        assert.equal((await api('POST', `/api/cotizaciones/${id}/finalizar`, undefined, null)).status, 401);
        assert.equal(await contar('events'), 0);
    });
});

// ---------------------------------------------------------------------------------------------
// 2. Qué ve cada perfil
// ---------------------------------------------------------------------------------------------

describe('qué ve cada perfil', () => {
    it('Mariana (secretaria) no ve las cotizaciones que Maritza todavía está revisando', async () => {
        const id = await cotizacionCompleta();
        assert.equal((await api('GET', '/api/cotizaciones', undefined, ctx.tokenSecretaria)).json.length, 0);
        assert.equal((await api('GET', `/api/cotizaciones/${id}`, undefined, ctx.tokenSecretaria)).status, 403);
        assert.equal((await descargar(`/api/cotizaciones/${id}/pdf`, ctx.tokenSecretaria)).status, 403);
    });

    it('al finalizar, Mariana la ve en su lista y puede abrirla', async () => {
        const id = await cotizacionCompleta();
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        const lista = (await api('GET', '/api/cotizaciones', undefined, ctx.tokenSecretaria)).json;
        assert.equal(lista.length, 1);
        assert.equal(lista[0].estado, 'finalizada');
        assert.equal((await api('GET', `/api/cotizaciones/${id}`, undefined, ctx.tokenSecretaria)).status, 200);
    });

    it('Andrés (logística) no accede a cotizaciones ni a contratos', async () => {
        const id = await cotizacionCompleta();
        assert.equal((await api('GET', '/api/cotizaciones', undefined, ctx.tokenLogistica)).status, 403);
        assert.equal((await api('GET', `/api/contratos/${id}`, undefined, ctx.tokenLogistica)).status, 403);
    });

    it('sin sesión nadie entra a los datos internos', async () => {
        for (const ruta of ['/api/cotizaciones', '/api/cotizaciones/1', '/api/contratos/1', '/api/logistica/eventos']) {
            assert.equal((await api('GET', ruta, undefined, null)).status, 401, ruta);
        }
    });
});

// ---------------------------------------------------------------------------------------------
// 3. Los PDF
// ---------------------------------------------------------------------------------------------

describe('PDF', () => {
    it('la cotización se descarga como PDF válido', async () => {
        const id = await cotizacionCompleta();
        const r = await descargar(`/api/cotizaciones/${id}/pdf`);
        assert.equal(r.status, 200);
        assert.match(r.tipo, /application\/pdf/);
        assert.equal(r.cuerpo.subarray(0, 5).toString(), '%PDF-');
        assert.ok(r.cuerpo.length > 1000);
    });

    it('el PDF de una cotización inexistente es 404', async () => {
        assert.equal((await descargar('/api/cotizaciones/9999/pdf')).status, 404);
    });

    it('el contrato en PDF exige documento y fecha; con ellos se genera', async () => {
        const sinDatos = await cotizar(pedido('Ana', 'a@a.co'));
        assert.equal((await descargar(`/api/contratos/${sinDatos.json.id}/pdf`)).status, 400);
        const id = await cotizacionCompleta('Beto', 'b@a.co');
        const r = await descargar(`/api/contratos/${id}/pdf`);
        assert.equal(r.status, 200);
        assert.equal(r.cuerpo.subarray(0, 5).toString(), '%PDF-');
    });

    it('con muchos servicios el PDF sigue generándose (varias páginas)', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), fechaEvento: '2026-12-01', items: [{ variantId: PISO_3X3, cantidad: 1 }, { variantId: PISO_5X5, cantidad: 1 }, { variantId: MESA, cantidad: 30 }, { variantId: 3, cantidad: 8 }] });
        const pdf = await descargar(`/api/cotizaciones/${r.json.id}/pdf`);
        assert.equal(pdf.status, 200);
    });
});

// ---------------------------------------------------------------------------------------------
// 4. Mariana genera y envía el contrato
// ---------------------------------------------------------------------------------------------

async function listaParaContrato(): Promise<number> {
    const id = await cotizacionCompleta('Ana Pérez', 'ana@correo.com');
    await api('POST', `/api/cotizaciones/${id}/finalizar`);
    return id;
}

describe('enviar el contrato por correo', () => {
    it('envía el PDF al cliente con copia a la administradora y deja el estado y el historial', async () => {
        const id = await listaParaContrato();
        const r = await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.equal(r.status, 200);

        assert.equal(ctx.correos.length, 1);
        const c = ctx.correos[0]!;
        assert.equal(c.to, 'ana@correo.com');
        assert.equal(c.cc, 'maritza@prueba.co');
        assert.match(c.subject!, /Contrato de servicios Planet Producciones - PL-\d{4}-0001/);
        assert.match(c.text!, /Hola Ana Pérez/);
        assert.equal(c.attachments![0]!.content.subarray(0, 5).toString(), '%PDF-');
        assert.match(c.attachments![0]!.filename, /^Contrato_PL-\d{4}-0001\.pdf$/);

        assert.equal(await estado(id), 'contrato_enviado');
        assert.equal((await api('GET', `/api/contratos/${id}`)).json.enviadoEn !== null, true);
        const h = await historial(id);
        assert.deepEqual(h[h.length - 1], { tipo: 'cambio_estado', estado_antes: 'finalizada', estado_despues: 'contrato_enviado', profile_nombre: 'Mariana' });
    });

    it('doble clic en "enviar": el cliente recibe UN solo correo (antes llegaban dos)', async () => {
        const id = await listaParaContrato();
        ctx.retrasoCorreo = 150; // un correo lento, como el de Gmail con reintentos
        const r = await Promise.all([1, 2, 3].map(() => api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria)));
        assert.deepEqual(r.map((x) => x.status).sort(), [200, 400, 400]);
        assert.equal(ctx.correos.length, 1, 'el cliente no debe recibir el contrato repetido');
        assert.equal((await historial(id)).filter((h) => h.estado_despues === 'contrato_enviado').length, 1);
    });

    it('si el correo falla: 502, NO queda marcado como enviado y se puede reintentar', async () => {
        const id = await listaParaContrato();
        ctx.fallarCorreo = true;
        const fallo = await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.equal(fallo.status, 502);
        assert.equal(await estado(id), 'finalizada', 'sigue pendiente de enviar');
        assert.equal(ctx.correos.length, 0);

        ctx.fallarCorreo = false;
        const bien = await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.equal(bien.status, 200);
        assert.equal(ctx.correos.length, 1);
        assert.equal(await estado(id), 'contrato_enviado');
    });

    it('no se envía un contrato ya enviado', async () => {
        const id = await listaParaContrato();
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        const otra = await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.equal(otra.status, 400);
        assert.equal(ctx.correos.length, 1);
    });

    it('faltan datos: sin documento o sin evento no se envía nada', async () => {
        const r = await cotizar({ ...pedido('Ana', 'a@a.co'), fechaEvento: '2026-12-01' });
        await api('POST', `/api/cotizaciones/${r.json.id}/finalizar`);
        const sinDocumento = await api('POST', `/api/contratos/${r.json.id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.equal(sinDocumento.status, 400);
        assert.match(sinDocumento.json.message, /documento/);

        const sinEvento = await cotizacionCompleta('Beto', 'b@a.co');
        assert.equal((await api('POST', `/api/contratos/${sinEvento}/generar-y-enviar`, undefined, ctx.tokenSecretaria)).status, 400);
        assert.equal((await api('POST', '/api/contratos/9999/generar-y-enviar', undefined, ctx.tokenSecretaria)).status, 404);
        assert.equal(ctx.correos.length, 0);
    });

    it('solo Mariana envía contratos: Maritza, Andrés y los anónimos no', async () => {
        const id = await listaParaContrato();
        assert.equal((await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenAdmin)).status, 403);
        assert.equal((await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenLogistica)).status, 403);
        assert.equal((await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, null)).status, 401);
        assert.equal(ctx.correos.length, 0);
    });
});

// ---------------------------------------------------------------------------------------------
// 5. Maritza sube el contrato firmado
// ---------------------------------------------------------------------------------------------

describe('subir el contrato firmado', () => {
    it('acepta un PDF, lo guarda y se puede volver a descargar (Maritza y Mariana)', async () => {
        const id = await listaParaContrato();
        const r = await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        assert.equal(r.status, 200);
        assert.equal(archivosFirmados().length, 1);
        assert.match(archivosFirmados()[0]!, new RegExp(`^${id}-\\d+\\.pdf$`));
        assert.equal((await api('GET', `/api/contratos/${id}`)).json.tieneFirmado, true);
        for (const token of [ctx.tokenAdmin, ctx.tokenSecretaria]) {
            const d = await descargar(`/api/contratos/${id}/firmado`, token);
            assert.equal(d.status, 200);
            assert.deepEqual(d.cuerpo, PDF_VALIDO);
        }
    });

    it('rechaza algo que dice ser PDF pero no lo es, y no deja el archivo en el disco', async () => {
        const id = await listaParaContrato();
        const r = await subirArchivo(`/api/contratos/${id}/firmado`, '<html><script>alert(1)</script></html>', 'contrato.pdf', 'application/pdf');
        assert.equal(r.status, 400);
        assert.equal(archivosFirmados().length, 0);
        assert.equal((await api('GET', `/api/contratos/${id}`)).json.tieneFirmado, false);
    });

    it('siempre se guarda con extensión .pdf aunque el nombre original sea otro', async () => {
        const id = await listaParaContrato();
        const r = await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.html', 'application/pdf');
        assert.equal(r.status, 200);
        assert.match(archivosFirmados()[0]!, /\.pdf$/);
    });

    it('rechaza archivos que no son PDF por tipo, y la petición sin archivo', async () => {
        const id = await listaParaContrato();
        assert.equal((await subirArchivo(`/api/contratos/${id}/firmado`, 'hola', 'nota.txt', 'text/plain')).status, 400);
        assert.equal((await api('POST', `/api/contratos/${id}/firmado`, {})).status, 400);
        assert.equal(archivosFirmados().length, 0);
    });

    it('antes de ser evento no se puede subir y no deja archivos sueltos', async () => {
        const id = await cotizacionCompleta();
        const r = await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        assert.equal(r.status, 400);
        assert.equal(archivosFirmados().length, 0);
    });

    it('al subir una versión nueva se elimina la anterior (no se acumulan archivos)', async () => {
        const id = await listaParaContrato();
        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'uno.pdf', 'application/pdf');
        const primero = archivosFirmados()[0]!;
        await new Promise((r) => setTimeout(r, 5)); // el nombre lleva la hora
        await subirArchivo(`/api/contratos/${id}/firmado`, Buffer.concat([PDF_VALIDO, Buffer.from('v2')]), 'dos.pdf', 'application/pdf');
        assert.equal(archivosFirmados().length, 1);
        assert.notEqual(archivosFirmados()[0], primero);
    });

    it('un archivo mayor de 10 MB se rechaza', async () => {
        const id = await listaParaContrato();
        const grande = Buffer.concat([PDF_VALIDO, Buffer.alloc(10 * 1024 * 1024 + 10, 1)]);
        const r = await subirArchivo(`/api/contratos/${id}/firmado`, grande, 'grande.pdf', 'application/pdf');
        assert.equal(r.status, 413, 'aviso claro de archivo demasiado grande (antes: error 500)');
        assert.match(r.json.message, /demasiado grande/);
        assert.equal(archivosFirmados().length, 0);
    });

    it('un identificador con caracteres raros no puede escribir fuera de la carpeta', async () => {
        await listaParaContrato();
        const antes = fs.readdirSync(ctx.carpetaSubidas).sort();
        await subirArchivo('/api/contratos/..%2F..%2Fescape/firmado', PDF_VALIDO, 'x.pdf', 'application/pdf');
        assert.deepEqual(fs.readdirSync(ctx.carpetaSubidas).sort(), antes);
        assert.equal(archivosFirmados().length, 0);
    });

    it('solo Maritza sube; sin contrato firmado la descarga da 404', async () => {
        const id = await listaParaContrato();
        assert.equal((await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'f.pdf', 'application/pdf', ctx.tokenSecretaria)).status, 403);
        assert.equal((await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'f.pdf', 'application/pdf', null)).status, 401);
        assert.equal((await descargar(`/api/contratos/${id}/firmado`)).status, 404);
    });
});

// ---------------------------------------------------------------------------------------------
// 6. Dejar el evento definitivo y que Andrés lo vea
// ---------------------------------------------------------------------------------------------

describe('dejar el evento definitivo', () => {
    it('recorrido completo: cotiza -> finaliza -> contrato -> firmado -> definitivo -> logística lo ve', async () => {
        const id = await listaParaContrato();
        assert.equal((await api('GET', '/api/logistica/eventos', undefined, ctx.tokenLogistica)).json.length, 0, 'aún no es definitivo');

        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        const r = await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`);
        assert.equal(r.status, 200);
        assert.equal(r.json.estado, 'programada');

        const eventos = (await api('GET', '/api/logistica/eventos', undefined, ctx.tokenLogistica)).json;
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].clienteNombre, 'Ana Pérez');
        assert.equal(eventos[0].fechaEvento, '2026-12-05');
        assert.equal(eventos[0].lugar, 'Club Campestre');
        assert.equal(eventos[0].ciudad, 'Manizales');
        assert.deepEqual(eventos[0].equipos.map((e: any) => `${e.cantidad} x ${e.nombre}`).sort(), ['1 x 3D infinito 5 x 5', '10 x Mesa cóctel']);
        assert.ok(!JSON.stringify(eventos).match(/precio|price|total/i), 'Andrés nunca ve precios');

        assert.deepEqual((await historial(id)).map((h) => h.estado_despues), ['finalizada', 'contrato_enviado', 'programada']);
    });

    it('sin contrato enviado o sin firmado no se puede dejar definitivo', async () => {
        const id = await listaParaContrato();
        assert.equal((await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`)).status, 400);
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        const r = await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`);
        assert.equal(r.status, 400);
        assert.match(r.json.message, /contrato firmado/);
        assert.equal(await estado(id), 'contrato_enviado');
    });

    it('doble clic en "definitivo": un solo registro en el historial', async () => {
        const id = await listaParaContrato();
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        const r = await Promise.all([1, 2].map(() => api('POST', `/api/cotizaciones/${id}/marcar-definitivo`)));
        assert.ok(r.every((x) => x.status === 200 || x.status === 400));
        assert.equal((await historial(id)).filter((h) => h.estado_despues === 'programada').length, 1, 'no se duplica el historial');
        assert.equal(await estado(id), 'programada');
    });

    it('solo Maritza deja definitivo', async () => {
        const id = await listaParaContrato();
        assert.equal((await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`, undefined, ctx.tokenSecretaria)).status, 403);
    });
});

// ---------------------------------------------------------------------------------------------
// 7. Maritza edita los servicios de una cotización
// ---------------------------------------------------------------------------------------------

describe('editar los servicios de una cotización', () => {
    it('reemplaza los servicios, recalcula el total, pasa a "en revisión" y deja historial', async () => {
        const id = await cotizacionCompleta(); // piso 5x5 + 10 mesas + transporte = 4.650.000
        const r = await api('PUT', `/api/cotizaciones/${id}/items`, { items: [{ variantId: PISO_3X3, cantidad: 1 }] });
        assert.equal(r.status, 200);
        assert.equal(r.json.estado, 'en_revision');
        assert.equal(r.json.total, 1400000 + 450000);
        assert.equal(r.json.items.length, 1);
        const h = await historial(id);
        assert.equal(h[0]!.tipo, 'edicion');
        assert.equal(h[0]!.estado_despues, 'en_revision');
    });

    it('un servicio inexistente se rechaza y la cotización CONSERVA sus servicios y su total (antes los perdía)', async () => {
        const id = await cotizacionCompleta();
        const antes = (await api('GET', `/api/cotizaciones/${id}`)).json;
        const r = await api('PUT', `/api/cotizaciones/${id}/items`, { items: [{ variantId: PISO_3X3, cantidad: 1 }, { variantId: 99999, cantidad: 1 }] });
        assert.equal(r.status, 400);
        const despues = (await api('GET', `/api/cotizaciones/${id}`)).json;
        assert.equal(despues.items.length, antes.items.length, 'no se pierden servicios');
        assert.equal(despues.total, antes.total, 'el total no cambia');
        assert.equal(despues.estado, 'recibida');
        assert.equal(await contar('quote_historial'), 0);
    });

    it('listas inválidas: repetidos, cantidad 0 o 1,5, y texto', async () => {
        const id = await cotizacionCompleta();
        for (const items of [
            [{ variantId: PISO_3X3, cantidad: 1 }, { variantId: PISO_3X3, cantidad: 2 }],
            [{ variantId: PISO_3X3, cantidad: 0 }],
            [{ variantId: PISO_3X3, cantidad: 1.5 }],
            'hola', 5
        ]) {
            assert.equal((await api('PUT', `/api/cotizaciones/${id}/items`, { items })).status, 400, JSON.stringify(items));
        }
        assert.equal((await api('GET', `/api/cotizaciones/${id}`)).json.items.length, 2);
    });

    it('una lista vacía deja solo el transporte', async () => {
        const id = await cotizacionCompleta();
        const r = await api('PUT', `/api/cotizaciones/${id}/items`, { items: [] });
        assert.equal(r.status, 200);
        assert.equal(r.json.total, 450000);
        assert.equal(r.json.items.length, 0);
    });

    it('un valor demasiado alto da un aviso claro y no cambia nada', async () => {
        const id = await cotizacionCompleta();
        const r = await api('PUT', `/api/cotizaciones/${id}/items`, { items: [{ variantId: MESA, cantidad: 2500 }] });
        assert.equal(r.status, 400);
        assert.equal((await api('GET', `/api/cotizaciones/${id}`)).json.items.length, 2);
    });

    it('cotización inexistente: 404; Mariana no puede editar', async () => {
        assert.equal((await api('PUT', '/api/cotizaciones/9999/items', { items: [] })).status, 404);
        const id = await cotizacionCompleta();
        assert.equal((await api('PUT', `/api/cotizaciones/${id}/items`, { items: [] }, ctx.tokenSecretaria)).status, 403);
    });
});

// ---------------------------------------------------------------------------------------------
// 8. Utilidades compartidas
// ---------------------------------------------------------------------------------------------

describe('número de referencia', () => {
    it('es igual en la cotización, el contrato y el correo', async () => {
        const id = await listaParaContrato();
        const ref = (await api('GET', `/api/cotizaciones/${id}`)).json.numeroReferencia;
        assert.match(ref, /^PL-\d{4}-0001$/);
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.ok(ctx.correos[0]!.subject!.includes(ref));
        assert.equal(ctx.correos[0]!.attachments![0]!.filename, `Contrato_${ref}.pdf`);
    });
});

// ---------------------------------------------------------------------------------------------
// 9. Peticiones mal hechas: avisos claros en vez de "error inesperado"
// ---------------------------------------------------------------------------------------------

describe('peticiones mal hechas', () => {
    it('un id que no es número es una cotización inexistente (404), no un error 500', async () => {
        for (const ruta of ['/api/cotizaciones/abc', '/api/cotizaciones/abc/pdf', '/api/cotizaciones/1e3', '/api/cotizaciones/-1', '/api/contratos/abc', '/api/contratos/abc/pdf', '/api/contratos/abc/firmado']) {
            assert.equal((await api('GET', ruta)).status, 404, ruta);
        }
        assert.equal((await api('POST', '/api/cotizaciones/abc/finalizar')).status, 404);
        assert.equal((await api('PUT', '/api/cotizaciones/abc/items', { items: [] })).status, 404);
        assert.equal((await api('POST', '/api/contratos/abc/generar-y-enviar', undefined, ctx.tokenSecretaria)).status, 404);
    });

    it('un id enorme tampoco rompe nada', async () => {
        assert.equal((await api('GET', '/api/cotizaciones/99999999999999')).status, 404);
        assert.equal((await api('GET', '/api/cotizaciones/9999999999999999999999')).status, 404);
    });

    it('un cuerpo JSON mal formado da 400 con un mensaje claro', async () => {
        const res = await fetch(ctx.base + '/api/cotizaciones', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"cliente": {' });
        assert.equal(res.status, 400);
        assert.match((await res.json()).message, /formato válido/);
    });

    it('un cuerpo vacío o con tipo equivocado también se rechaza con 400', async () => {
        assert.equal((await api('POST', '/api/cotizaciones', {}, null)).status, 400);
        const res = await fetch(ctx.base + '/api/cotizaciones', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hola' });
        assert.equal(res.status, 400);
    });
});
