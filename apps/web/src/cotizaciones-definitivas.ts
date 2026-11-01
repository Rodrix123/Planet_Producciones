// Panel de la secretaria (Mariana): cotizaciones ya finalizadas por la administradora. Desde aquí
// revisa los datos, ve la vista previa del contrato y lo genera y envía por correo al cliente.
// No puede editar la cotización: si falta un dato (documento, fecha) se lo pide a la administradora.

import { esc } from './shared/panelShell';
import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

declare const Swal: any;

// Un servicio de la cotización.
interface ItemSeleccionado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
    nota?: string | null;
}

// Una cotización tal como la devuelve /api/cotizaciones.
interface Cotizacion {
    id: string;
    numeroReferencia: string;
    clienteNombre: string;
    clienteCorreo: string;
    clienteTelefono: string;
    clienteDocumento: string | null;
    tipoEvento: string | null;
    lugar: string | null;
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    total: number;
    estado: string;
}

// Estado del contrato que devuelve /api/contratos/:id.
interface ContratoInfo {
    enviadoEn: string | null;
    firmadoSubidoEn: string | null;
    tieneFirmado: boolean;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
// Cómo se nombra cada estado en pantalla.
const ESTADO_LABEL: Record<string, string> = {
    finalizada: 'Lista para contrato', contrato_enviado: 'Contrato enviado', programada: 'Evento definitivo'
};

// La cotización abierta en el detalle (null cuando se ve la lista).
let cotizacionActual: Cotizacion | null = null;

const listaEl = document.getElementById('listaCotizaciones') as HTMLElement;
const detalleEl = document.getElementById('detalleCotizacion') as HTMLElement;

// Trae las cotizaciones que la secretaria puede ver (de "finalizada" en adelante).
async function cargarLista() {
    const res = await apiFetch('/api/cotizaciones?estado=finalizada,contrato_enviado,programada');
    const cotizaciones = (await res.json()) as Cotizacion[];
    renderLista(cotizaciones);
}

// Dibuja la lista de cotizaciones (o el aviso de que no hay).
function renderLista(cotizaciones: Cotizacion[]) {
    listaEl.innerHTML = '';
    if (cotizaciones.length === 0) {
        listaEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-signature" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>No hay cotizaciones definitivas todavía.</div>`;
        return;
    }

    cotizaciones.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${esc(c.clienteNombre)} <span class="badge">${ESTADO_LABEL[c.estado] || c.estado}</span></h3>
                <p>Ref: ${esc(c.numeroReferencia)} · ${esc(c.tipoEvento || 'N/A')} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${formatterCOP.format(c.total)}</div>
                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(() => abrirDetalle(c.id)));
        listaEl.appendChild(card);
    });
}

// Abre una cotización: sus datos y el estado del contrato. Solo ofrece "generar y enviar" si el
// contrato aún no se envió y no faltan el documento del cliente ni la fecha del evento.
async function abrirDetalle(id: string) {
    const [resCot, resContrato] = await Promise.all([
        apiFetch(`/api/cotizaciones/${id}`),
        apiFetch(`/api/contratos/${id}`)
    ]);
    const cotizacion = (await resCot.json()) as Cotizacion;
    const contrato = (await resContrato.json()) as ContratoInfo;
    cotizacionActual = cotizacion;

    document.getElementById('resumenCliente')!.innerHTML = `
        <div class="detail-row"><div class="detail-row-main"><strong>Cliente:</strong> ${esc(cotizacion.clienteNombre)} ${cotizacion.clienteDocumento ? esc('(CC ' + cotizacion.clienteDocumento + ')') : ''}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Correo:</strong> ${esc(cotizacion.clienteCorreo)} &nbsp;·&nbsp; <strong>Teléfono:</strong> ${esc(cotizacion.clienteTelefono)}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Evento:</strong> ${esc(cotizacion.tipoEvento || 'N/A')} · ${esc(cotizacion.lugar || 'N/A')}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Fecha del evento:</strong> ${cotizacion.fechaEvento ? new Date(cotizacion.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin definir'}</div></div>
    `;

    document.getElementById('listaItemsDetalle')!.innerHTML = cotizacion.items.map((item) => `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>${esc(item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre)}</strong></div>
                <div class="detail-row-sub">${esc(item.tag + (item.descripcion ? ' · Incluye: ' + item.descripcion : ''))}</div>
                ${item.nota ? `<div class="detail-row-sub" style="color:var(--orange-main); margin-top:0.3rem;"><i class="fa-solid fa-note-sticky"></i> ${esc(item.nota)}</div>` : ''}
            </div>
            <div class="detail-row-price">${formatterCOP.format(item.precioUnit * item.cantidad)}</div>
        </div>
    `).join('');
    document.getElementById('totalDetalle')!.textContent = formatterCOP.format(cotizacion.total);
    (document.getElementById('linkVerPdfCotizacion') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${id}/pdf`);

    const estadoEl = document.getElementById('estadoContrato')!;
    const btnGenerar = document.getElementById('btnGenerarContrato') as HTMLButtonElement;
    const linkVistaPrevia = document.getElementById('linkVistaPreviaContrato') as HTMLAnchorElement;
    btnGenerar.classList.add('hidden');
    linkVistaPrevia.classList.add('hidden');

    const datosCompletos = !!cotizacion.clienteDocumento && !!cotizacion.fechaEvento;
    if (datosCompletos) {
        linkVistaPrevia.href = apiUrl(`/api/contratos/${id}/pdf`);
        linkVistaPrevia.classList.remove('hidden');
    }

    if (!contrato.enviadoEn) {
        if (!datosCompletos) {
            estadoEl.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color:#b42318;"></i> Falta ${!cotizacion.clienteDocumento ? 'el documento del cliente' : ''}${!cotizacion.clienteDocumento && !cotizacion.fechaEvento ? ' y ' : ''}${!cotizacion.fechaEvento ? 'la fecha del evento' : ''}. Pídele a la administradora que lo complete antes de generar el contrato.`;
        } else {
            estadoEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color:var(--orange-main);"></i> El contrato todavía no se ha enviado. Revisa la vista previa antes de enviarlo.';
            btnGenerar.classList.remove('hidden');
        }
    } else {
        const fechaEnviado = new Date(contrato.enviadoEn).toLocaleString('es-CO');
        estadoEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--emerald-green);"></i> Contrato enviado el ${fechaEnviado}.${contrato.tieneFirmado ? ' El cliente ya envió el contrato firmado.' : ' A la espera de que el cliente lo firme y lo devuelva.'}`;
    }

    listaEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

// Vuelve del detalle a la lista y la recarga (por si cambió algún estado).
function volverALista() {
    cotizacionActual = null;
    detalleEl.classList.add('hidden');
    listaEl.classList.remove('hidden');
    cargarLista();
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('secretaria');
    initPanelLayout(sesion);

    document.getElementById('btnVolverLista')?.addEventListener('click', conManejoDeErrores(async () => volverALista()));

    document.getElementById('btnGenerarContrato')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActual) return;
        const confirmacion = await Swal.fire({
            icon: 'question',
            title: '¿Generar y enviar el contrato?',
            text: `Se enviará un correo a ${cotizacionActual.clienteCorreo} con el contrato en PDF para su firma.`,
            showCancelButton: true,
            confirmButtonText: 'Sí, enviar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#f97316'
        });
        if (!confirmacion.isConfirmed) return;

        const res = await apiFetch(`/api/contratos/${cotizacionActual.id}/generar-y-enviar`, { method: 'POST' });
        const datos = await res.json();
        if (!res.ok) {
            Swal.fire({ icon: 'error', title: 'No se pudo enviar', text: datos.message, confirmButtonColor: '#f97316' });
            return;
        }
        await Swal.fire({ icon: 'success', title: 'Contrato enviado', confirmButtonColor: '#f97316' });
        await abrirDetalle(cotizacionActual.id);
    }));

    await cargarLista();
});
