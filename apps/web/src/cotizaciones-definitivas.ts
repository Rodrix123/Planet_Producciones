import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

declare const Swal: any;

interface ItemSeleccionado {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
}

interface Cotizacion {
    id: string;
    numeroReferencia: string;
    clienteNombre: string;
    clienteCorreo: string;
    clienteTelefono: string;
    clienteDocumento: string | null;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    total: number;
    estado: string;
}

interface ContratoInfo {
    enviadoEn: string | null;
    firmadoSubidoEn: string | null;
    tieneFirmado: boolean;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
const ESTADO_LABEL: Record<string, string> = {
    finalizada: 'Lista para contrato', contrato_enviado: 'Contrato enviado', programada: 'Evento definitivo'
};

let cotizacionActual: Cotizacion | null = null;

const listaEl = document.getElementById('listaCotizaciones') as HTMLElement;
const detalleEl = document.getElementById('detalleCotizacion') as HTMLElement;

async function cargarLista() {
    const res = await apiFetch('/api/cotizaciones?estado=finalizada,contrato_enviado,programada');
    const cotizaciones = (await res.json()) as Cotizacion[];
    renderLista(cotizaciones);
}

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
                <h3>${c.clienteNombre} <span class="badge">${ESTADO_LABEL[c.estado] || c.estado}</span></h3>
                <p>Ref: ${c.numeroReferencia} · ${c.tipoEvento || 'N/A'} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</p>
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

async function abrirDetalle(id: string) {
    const [resCot, resContrato] = await Promise.all([
        apiFetch(`/api/cotizaciones/${id}`),
        apiFetch(`/api/contratos/${id}`)
    ]);
    const cotizacion = (await resCot.json()) as Cotizacion;
    const contrato = (await resContrato.json()) as ContratoInfo;
    cotizacionActual = cotizacion;

    document.getElementById('resumenCliente')!.innerHTML = `
        <div class="detail-row"><div class="detail-row-main"><strong>Cliente:</strong> ${cotizacion.clienteNombre} ${cotizacion.clienteDocumento ? '(CC ' + cotizacion.clienteDocumento + ')' : ''}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Correo:</strong> ${cotizacion.clienteCorreo} &nbsp;·&nbsp; <strong>Teléfono:</strong> ${cotizacion.clienteTelefono}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Evento:</strong> ${cotizacion.tipoEvento || 'N/A'} · ${cotizacion.lugar || 'N/A'} (${cotizacion.ciudad || 'N/A'})</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Fecha del evento:</strong> ${cotizacion.fechaEvento ? new Date(cotizacion.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin definir'}</div></div>
    `;

    document.getElementById('listaItemsDetalle')!.innerHTML = cotizacion.items.map((item) => `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>${item.nombre}</strong></div>
                <div class="detail-row-sub">${item.tag}${item.descripcion ? ' · Incluye: ' + item.descripcion : ''}</div>
            </div>
            <div class="detail-row-price">${formatterCOP.format(item.precio)}</div>
        </div>
    `).join('');
    document.getElementById('totalDetalle')!.textContent = formatterCOP.format(cotizacion.total);
    (document.getElementById('linkVerPdfCotizacion') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${id}/pdf`);

    const estadoEl = document.getElementById('estadoContrato')!;
    const btnGenerar = document.getElementById('btnGenerarContrato') as HTMLButtonElement;
    btnGenerar.classList.add('hidden');

    if (!contrato.enviadoEn) {
        if (!cotizacion.clienteDocumento || !cotizacion.fechaEvento) {
            estadoEl.innerHTML = `<i class="fa-solid fa-circle-exclamation" style="color:#f87171;"></i> Falta ${!cotizacion.clienteDocumento ? 'el documento del cliente' : ''}${!cotizacion.clienteDocumento && !cotizacion.fechaEvento ? ' y ' : ''}${!cotizacion.fechaEvento ? 'la fecha del evento' : ''}. Pídele a la administradora que lo complete antes de generar el contrato.`;
        } else {
            estadoEl.innerHTML = '<i class="fa-solid fa-circle-info" style="color:var(--orange-main);"></i> El contrato todavía no se ha enviado.';
            btnGenerar.classList.remove('hidden');
        }
    } else {
        const fechaEnviado = new Date(contrato.enviadoEn).toLocaleString('es-CO');
        estadoEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--emerald-green);"></i> Contrato enviado el ${fechaEnviado}.${contrato.tieneFirmado ? ' El cliente ya envió el contrato firmado.' : ' A la espera de que el cliente lo firme y lo devuelva.'}`;
    }

    listaEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

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
