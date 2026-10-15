import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

interface Equipo {
    tag: string;
    nombre: string;
    descripcion: string;
    cantidad: number;
}

interface EventoLogistica {
    id: string;
    numeroReferencia: string;
    clienteNombre: string;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    direccion: string | null;
    fechaEvento: string | null;
    equipos: Equipo[];
}

const listaEl = document.getElementById('listaEventos') as HTMLElement;
const detalleEl = document.getElementById('detalleEvento') as HTMLElement;

function nombreItem(eq: Equipo): string {
    return eq.cantidad > 1 ? `${eq.cantidad} x ${eq.nombre}` : eq.nombre;
}

function renderLista(eventos: EventoLogistica[]) {
    listaEl.innerHTML = '';

    if (eventos.length === 0) {
        listaEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-check" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>No hay eventos programados todavía.</div>`;
        return;
    }

    eventos.forEach((e) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${e.clienteNombre}</h3>
                <p>${e.tipoEvento || 'N/A'} · ${e.lugar || 'N/A'} (${e.ciudad || 'N/A'})</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${e.fechaEvento ? new Date(e.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</div>
                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(async () => abrirDetalle(e)));
        listaEl.appendChild(card);
    });
}

async function abrirDetalle(e: EventoLogistica) {
    document.getElementById('resumenEvento')!.innerHTML = `
        <div class="detail-row-main" style="font-size:1.15rem; color:#fff; margin-bottom:0.4rem;"><strong>${e.clienteNombre}</strong></div>
        <div class="detail-row-sub">Ref: ${e.numeroReferencia} · ${e.tipoEvento || 'N/A'}</div>
        <div class="detail-row-sub">${e.lugar || 'Por definir'}${e.direccion ? ' — ' + e.direccion : ''} (${e.ciudad || 'N/A'})</div>
        <div class="detail-row-sub">Fecha: ${e.fechaEvento ? new Date(e.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</div>
    `;

    (document.getElementById('linkListaCargaPdf') as HTMLAnchorElement).href = apiUrl(`/api/logistica/eventos/${e.id}/pdf`);

    const cont = document.getElementById('listaEquiposDetalle') as HTMLElement;
    cont.innerHTML = e.equipos.length === 0
        ? '<p style="color:var(--text-muted); font-size:0.9rem;">Sin equipos registrados para este evento.</p>'
        : e.equipos.map((eq) => `
            <div class="detail-row">
                <div>
                    <div class="detail-row-main"><strong>${nombreItem(eq)}</strong></div>
                    <div class="detail-row-sub">${eq.tag}${eq.descripcion ? ' · Incluye: ' + eq.descripcion : ''}</div>
                </div>
            </div>
        `).join('');

    listaEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

function volverALista() {
    detalleEl.classList.add('hidden');
    listaEl.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('jefe_logistica');
    initPanelLayout(sesion);

    document.getElementById('btnVolverLista')?.addEventListener('click', volverALista);

    const res = await apiFetch('/api/logistica/eventos');
    const eventos = (await res.json()) as EventoLogistica[];
    renderLista(eventos);
});
