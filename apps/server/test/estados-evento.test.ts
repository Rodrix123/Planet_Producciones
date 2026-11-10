// Pruebas de los estados de un evento y del contrato firmado.
//
// Caso que las motivó: un evento que ya estaba confirmado pero nunca tuvo contrato enviado (el de Pepe)
// salía en "En proceso" con la etiqueta "Contrato enviado", decía que el contrato no se había generado y
// no dejaba subir el firmado. La causa: el filtro de la lista y derivarEstado() no decían lo mismo.
//
// Ejecutar:  npm run test --workspace apps/server

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
    api, cotizacionCompleta, ctx, detenerServidor, iniciarServidor, PDF_VALIDO, reiniciarDatos, subirArchivo
} from './helpers/servidor';

before(iniciarServidor);
after(detenerServidor);
beforeEach(reiniciarDatos);

const ESTADOS = ['recibida', 'en_revision', 'finalizada', 'contrato_enviado', 'programada'];

/** Evento "como el de Pepe": confirmado desde el principio, sin contrato enviado ni firmado. */
async function eventoConfirmadoSinContrato(nombre = 'Pepe', correo = 'pepe@correo.com'): Promise<number> {
    const id = await cotizacionCompleta(nombre, correo);
    await api('POST', `/api/cotizaciones/${id}/finalizar`);
    await ctx.db.exec(`UPDATE events SET confirmed = true WHERE quote_id = ${id}`);
    return id;
}

/** En qué listas aparece una cotización y con qué estado. */
async function dondeAparece(id: number): Promise<{ estado: string; listas: string[] }> {
    const listas: string[] = [];
    let estado = '';
    for (const e of ESTADOS) {
        const lista = (await api('GET', `/api/cotizaciones?estado=${e}`)).json as any[];
        const c = lista.find((x) => x.id === id);
        if (c) { listas.push(e); estado = c.estado; }
    }
    return { estado, listas };
}

describe('cada evento aparece en una sola lista y con su estado real', () => {
    it('recorrido normal: recibida -> finalizada -> contrato enviado -> programada', async () => {
        const id = await cotizacionCompleta();
        assert.deepEqual(await dondeAparece(id), { estado: 'recibida', listas: ['recibida'] });

        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        assert.deepEqual(await dondeAparece(id), { estado: 'finalizada', listas: ['finalizada'] });

        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        assert.deepEqual(await dondeAparece(id), { estado: 'contrato_enviado', listas: ['contrato_enviado'] });

        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        assert.equal((await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`)).status, 200);
        assert.deepEqual(await dondeAparece(id), { estado: 'programada', listas: ['programada'] });
    });

    it('evento confirmado sin contrato (el de Pepe): solo en programados, ya no en "En proceso"', async () => {
        const id = await eventoConfirmadoSinContrato();
        assert.deepEqual(await dondeAparece(id), { estado: 'programada', listas: ['programada'] });

        const enProceso = (await api('GET', '/api/cotizaciones?estado=finalizada,contrato_enviado')).json as any[];
        assert.ok(!enProceso.some((c) => c.id === id), 'no debe salir en "En proceso"');
    });

    it('confirmado con contrato enviado también es programado (una sola lista)', async () => {
        const id = await cotizacionCompleta();
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        await api('POST', `/api/contratos/${id}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        await ctx.db.exec(`UPDATE events SET confirmed = true WHERE quote_id = ${id}`);
        assert.deepEqual(await dondeAparece(id), { estado: 'programada', listas: ['programada'] });
    });

    it('varios eventos mezclados: cada uno en exactamente una lista', async () => {
        const ids = [
            await cotizacionCompleta('Uno', 'uno@correo.com'),
            await cotizacionCompleta('Dos', 'dos@correo.com'),
            await cotizacionCompleta('Tres', 'tres@correo.com'),
            await eventoConfirmadoSinContrato('Cuatro', 'cuatro@correo.com')
        ];
        await api('POST', `/api/cotizaciones/${ids[1]}/finalizar`);
        await api('POST', `/api/cotizaciones/${ids[2]}/finalizar`);
        await api('POST', `/api/contratos/${ids[2]}/generar-y-enviar`, undefined, ctx.tokenSecretaria);
        for (const id of ids) {
            const { listas, estado } = await dondeAparece(id);
            assert.equal(listas.length, 1, `la cotización ${id} salió en ${JSON.stringify(listas)}`);
            assert.equal(listas[0], estado, 'la lista donde sale coincide con su estado');
        }
    });

    it('los contadores de los paneles coinciden con las listas', async () => {
        const pepe = await eventoConfirmadoSinContrato();
        const ana = await cotizacionCompleta('Ana', 'ana@correo.com');
        await api('POST', `/api/cotizaciones/${ana}/finalizar`);

        // Maritza: solo Ana espera su acción (Pepe ya está programado)
        assert.equal((await api('GET', '/api/panel/contadores')).json.eventosProceso, 1);
        // y la secretaria ve a Pepe como programado
        const lista = (await api('GET', '/api/cotizaciones?estado=programada', undefined, ctx.tokenSecretaria)).json as any[];
        assert.ok(lista.some((c) => c.id === pepe));
    });
});

describe('contrato firmado de un evento confirmado sin contrato', () => {
    const archivosFirmados = () => fs.readdirSync(path.join(ctx.carpetaSubidas, 'contratos-firmados'));

    it('el estado del contrato dice la verdad: nada enviado, nada firmado', async () => {
        const id = await eventoConfirmadoSinContrato();
        const r = await api('GET', `/api/contratos/${id}`);
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { enviadoEn: null, firmadoSubidoEn: null, tieneFirmado: false, archivoFirmadoDisponible: false });
    });

    it('Maritza puede subir el contrato firmado y después reemplazarlo sin dejar archivos sueltos', async () => {
        const id = await eventoConfirmadoSinContrato();
        const primero = await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'firmado.pdf', 'application/pdf');
        assert.equal(primero.status, 200);
        let estado = (await api('GET', `/api/contratos/${id}`)).json;
        assert.equal(estado.tieneFirmado, true);
        assert.ok(estado.firmadoSubidoEn);
        assert.equal(archivosFirmados().length, 1);

        const segundo = await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'otro.pdf', 'application/pdf');
        assert.equal(segundo.status, 200);
        assert.equal(archivosFirmados().length, 1, 'el anterior se borra al reemplazarlo');

        const descarga = await fetch(`${ctx.base}/api/contratos/${id}/firmado`, { headers: { cookie: `pp_session=${ctx.tokenAdmin}` } });
        assert.equal(descarga.status, 200);
        estado = (await api('GET', `/api/contratos/${id}`)).json;
        assert.equal(estado.enviadoEn, null, 'subir el firmado no inventa un envío');
    });

    it('lo que no es un PDF se rechaza y no deja nada guardado', async () => {
        const id = await eventoConfirmadoSinContrato();
        const r = await subirArchivo(`/api/contratos/${id}/firmado`, 'no soy un pdf', 'falso.pdf', 'application/pdf');
        assert.equal(r.status, 400);
        assert.equal(archivosFirmados().length, 0);
        assert.equal((await api('GET', `/api/contratos/${id}`)).json.tieneFirmado, false);
    });

    it('solo la administradora sube el firmado, y una cotización sin evento no admite contrato', async () => {
        const id = await eventoConfirmadoSinContrato();
        assert.equal((await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'f.pdf', 'application/pdf', ctx.tokenSecretaria)).status, 403);
        assert.equal((await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'f.pdf', 'application/pdf', null)).status, 401);
        const sinEvento = await cotizacionCompleta('Sin', 'sin@correo.com');
        assert.equal((await subirArchivo(`/api/contratos/${sinEvento}/firmado`, PDF_VALIDO, 'f.pdf', 'application/pdf')).status, 400);
        assert.equal(archivosFirmados().length, 0);
    });

    it('el orden normal se mantiene: no se oficializa un evento en proceso sin contrato enviado', async () => {
        const id = await cotizacionCompleta();
        await api('POST', `/api/cotizaciones/${id}/finalizar`);
        await subirArchivo(`/api/contratos/${id}/firmado`, PDF_VALIDO, 'f.pdf', 'application/pdf');
        const r = await api('POST', `/api/cotizaciones/${id}/marcar-definitivo`);
        assert.equal(r.status, 400);
        assert.equal((await dondeAparece(id)).estado, 'finalizada');
    });
});
