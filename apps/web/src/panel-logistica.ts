// Panel del jefe de logística (Andrés): lista de eventos confirmados y, al abrir uno, los equipos a
// cargar con un botón para la lista de carga en PDF. Nunca muestra precios.

import { esc } from './shared/panelShell';
import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

// Un equipo que hay que cargar para el evento.
interface Equipo {
    tag: string;
    nombre: string;
    descripcion: string;
    cantidad: number;
}

// Un evento confirmado tal como lo devuelve /api/logistica/eventos.
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

/**
 * Nombre con la cantidad por delante cuando es más de una unidad: "4 x Parlante".
 */
function nombreItem(eq: Equipo): string {
    return eq.cantidad > 1 ? `${eq.cantidad} x ${eq.nombre}` : eq.nombre;
}

/**
 * Dibuja la lista de eventos (o el aviso de que aún no hay ninguno).
 */
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
                <h3>${esc(e.clienteNombre)}</h3>
                <p>${esc(e.tipoEvento || 'N/A')} · ${esc(e.lugar || 'N/A')} (${esc(e.ciudad || 'N/A')})</p>
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

/**
 * Muestra el detalle de un evento: datos generales, equipos y enlace a la lista de carga en PDF.
 */
async function abrirDetalle(e: EventoLogistica) {
    document.getElementById('resumenEvento')!.innerHTML = `
        <div class="detail-row-main" style="font-size:1.15rem; color:#fff; margin-bottom:0.4rem;"><strong>${esc(e.clienteNombre)}</strong></div>
        <div class="detail-row-sub">Ref: ${esc(e.numeroReferencia)} · ${esc(e.tipoEvento || 'N/A')}</div>
        <div class="detail-row-sub">${esc((e.lugar || 'Por definir') + (e.direccion ? ' — ' + e.direccion : ''))} (${esc(e.ciudad || 'N/A')})</div>
        <div class="detail-row-sub">Fecha: ${e.fechaEvento ? new Date(e.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</div>
    `;

    (document.getElementById('linkListaCargaPdf') as HTMLAnchorElement).href = apiUrl(`/api/logistica/eventos/${e.id}/pdf`);

    const cont = document.getElementById('listaEquiposDetalle') as HTMLElement;
    cont.innerHTML = e.equipos.length === 0
        ? '<p style="color:var(--text-muted); font-size:0.9rem;">Sin equipos registrados para este evento.</p>'
        : e.equipos.map((eq) => `
            <div class="detail-row">
                <div>
                    <div class="detail-row-main"><strong>${esc(nombreItem(eq))}</strong></div>
                    <div class="detail-row-sub">${esc(eq.tag + (eq.descripcion ? ' · Incluye: ' + eq.descripcion : ''))}</div>
                </div>
            </div>
        `).join('');

    listaEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

/**
 * Vuelve de un evento a la lista.
 */
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
