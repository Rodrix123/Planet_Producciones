// Eventos definitivos (con contrato firmado) de la administradora, en un calendario mensual y en una
// lista. Al tocar un día con eventos la lista se filtra a ese día; al abrir uno se ve su detalle y sus
// enlaces al PDF de la cotización y al contrato firmado.

import { esc } from './shared/panelShell';
import './style.css';
import './shared/panelRail.css';
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
    tipoEvento: string | null;
    lugar: string | null;
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    // Elementos adicionales: no salen de la bodega, se consiguen aparte; se muestran como un servicio más.
    extras?: { tag: string; nombre: string; descripcion: string; cantidad: number; precioUnit: number; nota?: string | null }[];
    total: number;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
// Textos del calendario.
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Estado de la pantalla: eventos cargados, mes que se ve en el calendario y día elegido (null = todos).
let eventos: Cotizacion[] = [];
let mesActual = new Date().getMonth();
let anioActual = new Date().getFullYear();
let filtroFecha: string | null = null;

const listaEl = document.getElementById('listaEventos') as HTMLElement;
const detalleEl = document.getElementById('detalleEvento') as HTMLElement;

// Trae los eventos definitivos (estado programada) y pinta calendario y lista.
async function cargarEventos() {
    const res = await apiFetch('/api/cotizaciones?estado=programada');
    eventos = (await res.json()) as Cotizacion[];
    renderCalendario();
    renderLista();
}

// Dibuja el mes: marca con un punto los días que tienen eventos y, al tocarlos, filtra la lista.
function renderCalendario() {
    const titulo = document.getElementById('tituloMes')!;
    titulo.textContent = `${NOMBRES_MES[mesActual]} ${anioActual}`;

    const grid = document.getElementById('calendarioGrid')!;
    grid.innerHTML = '';

    DIAS_SEMANA.forEach((d) => {
        const el = document.createElement('div');
        el.className = 'calendar-day-header';
        el.textContent = d;
        grid.appendChild(el);
    });

    const primerDia = new Date(anioActual, mesActual, 1).getDay();
    const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();

    const eventosPorDia = new Map<number, Cotizacion[]>();
    eventos.forEach((e) => {
        if (!e.fechaEvento) return;
        const [anio, mes, dia] = e.fechaEvento.split('-').map(Number);
        if (anio === anioActual && mes - 1 === mesActual) {
            if (!eventosPorDia.has(dia)) eventosPorDia.set(dia, []);
            eventosPorDia.get(dia)!.push(e);
        }
    });

    for (let i = 0; i < primerDia; i++) {
        const el = document.createElement('div');
        el.className = 'calendar-day empty';
        grid.appendChild(el);
    }

    for (let dia = 1; dia <= diasEnMes; dia++) {
        const el = document.createElement('div');
        const tieneEventos = eventosPorDia.has(dia);
        el.className = `calendar-day${tieneEventos ? ' has-event' : ''}`;
        el.innerHTML = `${dia}${tieneEventos ? '<span class="calendar-day-dot"></span>' : ''}`;
        if (tieneEventos) {
            const fechaStr = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            el.addEventListener('click', () => {
                filtroFecha = filtroFecha === fechaStr ? null : fechaStr;
                renderLista();
            });
        }
        grid.appendChild(el);
    }
}

// Dibuja la lista de eventos (todos o solo los del día elegido).
function renderLista() {
    listaEl.innerHTML = '';

    const visibles = filtroFecha ? eventos.filter((e) => e.fechaEvento === filtroFecha) : eventos;

    if (filtroFecha) {
        const aviso = document.createElement('div');
        aviso.style.cssText = 'margin-bottom:1rem; font-size:0.85rem; color:var(--text-muted);';
        aviso.innerHTML = `Mostrando eventos del ${new Date(filtroFecha + 'T00:00:00').toLocaleDateString('es-CO')} — <a href="#" id="linkVerTodos" style="color:var(--orange-main);">ver todos</a>`;
        listaEl.appendChild(aviso);
        aviso.querySelector('#linkVerTodos')?.addEventListener('click', (e) => {
            e.preventDefault();
            filtroFecha = null;
            renderLista();
        });
    }

    if (visibles.length === 0) {
        listaEl.innerHTML += `<div class="empty-state"><i class="fa-solid fa-calendar-days" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>No hay eventos programados${filtroFecha ? ' en esta fecha' : ''}.</div>`;
        return;
    }

    visibles.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${esc(c.clienteNombre)}</h3>
                <p>Ref: ${esc(c.numeroReferencia)} · ${esc(c.tipoEvento || 'N/A')} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${formatterCOP.format(c.total)}</div>
                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(async () => abrirDetalle(c)));
        listaEl.appendChild(card);
    });
}

// Muestra el detalle de un evento: cliente, servicios, total y enlaces a los PDF.
async function abrirDetalle(c: Cotizacion) {
    document.getElementById('resumenCliente')!.innerHTML = `
        <div class="detail-row"><div class="detail-row-main"><strong>Cliente:</strong> ${esc(c.clienteNombre)}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Correo:</strong> ${esc(c.clienteCorreo)} &nbsp;·&nbsp; <strong>Teléfono:</strong> ${esc(c.clienteTelefono)}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Evento:</strong> ${esc(c.tipoEvento || 'N/A')} · ${esc(c.lugar || 'N/A')}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Fecha del evento:</strong> ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin definir'}</div></div>
    `;

    document.getElementById('listaItemsDetalle')!.innerHTML = [...c.items, ...(c.extras ?? [])].map((item) => `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>${esc(item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre)}</strong></div>
                <div class="detail-row-sub">${esc(item.tag + (item.descripcion ? ' · Incluye: ' + item.descripcion : ''))}</div>
                ${item.nota ? `<div class="detail-row-sub" style="color:var(--orange-main); margin-top:0.3rem;"><i class="fa-solid fa-note-sticky"></i> ${esc(item.nota)}</div>` : ''}
            </div>
            <div class="detail-row-price">${formatterCOP.format(item.precioUnit * item.cantidad)}</div>
        </div>
    `).join('');
    document.getElementById('totalDetalle')!.textContent = formatterCOP.format(c.total);
    (document.getElementById('linkVerPdfCotizacion') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${c.id}/pdf`);
    (document.getElementById('linkVerContratoFirmado') as HTMLAnchorElement).href = apiUrl(`/api/contratos/${c.id}/firmado`);
    await mostrarContrato(c);

    listaEl.classList.add('hidden');
    document.querySelector('.calendar-grid')?.parentElement?.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

// Evento abierto en el detalle (para subir su contrato firmado).
let eventoAbierto: Cotizacion | null = null;

// Muestra qué hay del contrato de este evento. Un evento confirmado puede no tener contrato en el sistema
// (p. ej. se confirmó por otro medio): en ese caso se avisa y se ofrece subir el firmado.
async function mostrarContrato(c: Cotizacion) {
    eventoAbierto = c;
    const res = await apiFetch(`/api/contratos/${c.id}`);
    const contrato = res.ok ? ((await res.json()) as { enviadoEn: string | null; firmadoSubidoEn: string | null; tieneFirmado: boolean }) : null;
    const estadoEl = document.getElementById('estadoContrato') as HTMLElement;
    const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-CO') : '');

    document.getElementById('linkVerContratoFirmado')!.classList.toggle('hidden', !contrato?.tieneFirmado);
    document.getElementById('etiquetaArchivoFirmado')!.textContent = contrato?.tieneFirmado ? 'Reemplazar contrato firmado (PDF)' : 'Subir contrato firmado (PDF)';
    (document.getElementById('btnSubirFirmado') as HTMLButtonElement).innerHTML = `<i class="fa-solid fa-upload"></i> ${contrato?.tieneFirmado ? 'Reemplazar contrato firmado' : 'Subir contrato firmado'}`;

    if (!contrato) {
        estadoEl.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--orange-main);"></i> No se pudo consultar el estado del contrato.';
    } else if (contrato.tieneFirmado) {
        estadoEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--emerald-green);"></i> Contrato firmado guardado el ${esc(fecha(contrato.firmadoSubidoEn))}`;
    } else if (contrato.enviadoEn) {
        estadoEl.innerHTML = `<i class="fa-solid fa-paper-plane" style="color:var(--orange-main);"></i> Contrato enviado el ${esc(fecha(contrato.enviadoEn))}, pero todavía no hay un contrato firmado guardado.`;
    } else {
        estadoEl.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--orange-main);"></i> Sin contrato en el sistema: este evento se confirmó sin generar ni enviar un contrato desde aquí. Si ya existe uno firmado, súbelo para dejarlo guardado.';
    }
}

// Vuelve del detalle al calendario y la lista.
function volverALista() {
    detalleEl.classList.add('hidden');
    listaEl.classList.remove('hidden');
    document.querySelector('.calendar-grid')?.parentElement?.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);

    document.getElementById('btnMesAnterior')?.addEventListener('click', () => {
        mesActual -= 1;
        if (mesActual < 0) { mesActual = 11; anioActual -= 1; }
        renderCalendario();
    });
    document.getElementById('btnMesSiguiente')?.addEventListener('click', () => {
        mesActual += 1;
        if (mesActual > 11) { mesActual = 0; anioActual += 1; }
        renderCalendario();
    });
    document.getElementById('btnVolverLista')?.addEventListener('click', volverALista);

    // Sube (o reemplaza) el contrato firmado de este evento; el servidor verifica que sea un PDF de hasta 10 MB.
    document.getElementById('btnSubirFirmado')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!eventoAbierto) return;
        const input = document.getElementById('inputArchivoFirmado') as HTMLInputElement;
        const archivo = input.files?.[0];
        if (!archivo) {
            Swal.fire({ icon: 'warning', title: 'Selecciona un archivo PDF', confirmButtonColor: '#f97316' });
            return;
        }
        const formData = new FormData();
        formData.append('archivo', archivo);
        const res = await apiFetch(`/api/contratos/${eventoAbierto.id}/firmado`, { method: 'POST', body: formData });
        const datos = await res.json();
        if (!res.ok) {
            Swal.fire({ icon: 'error', title: 'No se pudo subir', text: datos.message, confirmButtonColor: '#f97316' });
            return;
        }
        input.value = '';
        await Swal.fire({ icon: 'success', title: 'Contrato firmado guardado', confirmButtonColor: '#f97316', timer: 1600, showConfirmButton: false });
        await mostrarContrato(eventoAbierto);
    }));

    await cargarEventos();
});
