import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

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
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    total: number;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

let eventos: Cotizacion[] = [];
let mesActual = new Date().getMonth();
let anioActual = new Date().getFullYear();
let filtroFecha: string | null = null;

const listaEl = document.getElementById('listaEventos') as HTMLElement;
const detalleEl = document.getElementById('detalleEvento') as HTMLElement;

async function cargarEventos() {
    const res = await apiFetch('/api/cotizaciones?estado=programada');
    eventos = (await res.json()) as Cotizacion[];
    renderCalendario();
    renderLista();
}

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
                <h3>${c.clienteNombre}</h3>
                <p>Ref: ${c.numeroReferencia} · ${c.tipoEvento || 'N/A'} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</p>
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

async function abrirDetalle(c: Cotizacion) {
    document.getElementById('resumenCliente')!.innerHTML = `
        <div class="detail-row"><div class="detail-row-main"><strong>Cliente:</strong> ${c.clienteNombre}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Correo:</strong> ${c.clienteCorreo} &nbsp;·&nbsp; <strong>Teléfono:</strong> ${c.clienteTelefono}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Evento:</strong> ${c.tipoEvento || 'N/A'} · ${c.lugar || 'N/A'} (${c.ciudad || 'N/A'})</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Fecha del evento:</strong> ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin definir'}</div></div>
    `;

    document.getElementById('listaItemsDetalle')!.innerHTML = c.items.map((item) => `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>${item.nombre}</strong></div>
                <div class="detail-row-sub">${item.tag}${item.descripcion ? ' · Incluye: ' + item.descripcion : ''}</div>
            </div>
            <div class="detail-row-price">${formatterCOP.format(item.precio)}</div>
        </div>
    `).join('');
    document.getElementById('totalDetalle')!.textContent = formatterCOP.format(c.total);
    (document.getElementById('linkVerPdfCotizacion') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${c.id}/pdf`);
    (document.getElementById('linkVerContratoFirmado') as HTMLAnchorElement).href = apiUrl(`/api/contratos/${c.id}/firmado`);

    listaEl.classList.add('hidden');
    document.querySelector('.calendar-grid')?.parentElement?.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

function volverALista() {
    detalleEl.classList.add('hidden');
    listaEl.classList.remove('hidden');
    document.querySelector('.calendar-grid')?.parentElement?.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administradora');
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

    await cargarEventos();
});
