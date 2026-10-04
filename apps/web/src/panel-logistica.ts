import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

interface Equipo {
    tag: string;
    nombre: string;
    descripcion: string;
}

interface EventoLogistica {
    id: string;
    numeroReferencia: string;
    clienteNombre: string;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fechaEvento: string | null;
    equipos: Equipo[];
}

const listaEl = document.getElementById('listaEventos') as HTMLElement;

function renderLista(eventos: EventoLogistica[]) {
    listaEl.innerHTML = '';

    if (eventos.length === 0) {
        listaEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-calendar-check" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>No hay eventos programados todavía.</div>`;
        return;
    }

    eventos.forEach((e) => {
        const wrapper = document.createElement('div');

        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${e.clienteNombre}</h3>
                <p>${e.tipoEvento || 'N/A'} · ${e.lugar || 'N/A'} (${e.ciudad || 'N/A'})</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${e.fechaEvento ? new Date(e.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</div>
                <i class="fa-solid fa-chevron-down" style="color:var(--text-muted);"></i>
            </div>
        `;

        const detalle = document.createElement('div');
        detalle.className = 'detail-section hidden';
        detalle.style.marginTop = '-0.5rem';
        detalle.innerHTML = e.equipos.length === 0
            ? '<p style="color:var(--text-muted); font-size:0.9rem;">Sin equipos registrados para este evento.</p>'
            : e.equipos.map((eq) => `
                <div class="detail-row">
                    <div>
                        <div class="detail-row-main"><strong>${eq.nombre}</strong></div>
                        <div class="detail-row-sub">${eq.tag}${eq.descripcion ? ' · Incluye: ' + eq.descripcion : ''}</div>
                    </div>
                </div>
            `).join('');

        card.addEventListener('click', () => detalle.classList.toggle('hidden'));

        wrapper.appendChild(card);
        wrapper.appendChild(detalle);
        listaEl.appendChild(wrapper);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('jefe_logistica');
    initPanelLayout(sesion);

    const res = await apiFetch('/api/logistica/eventos');
    const eventos = (await res.json()) as EventoLogistica[];
    renderLista(eventos);
});
