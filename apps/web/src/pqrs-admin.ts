// Panel de PQRS de la secretaria (Mariana): lista de peticiones, quejas, reclamos y sugerencias que
// llegan de la página principal. Los pendientes se responden desde aquí y la respuesta sale por correo.

import { esc } from './shared/panelShell';
import './style.css';
import './shared/panelRail.css';
import { apiFetch, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

declare const Swal: any;

// Un PQRS tal como lo devuelve /api/pqrs.
interface Pqrs {
    id: string;
    nombre: string;
    correo: string;
    telefono: string | null;
    mensaje: string;
    respuesta: string | null;
    respondidoEn: string | null;
    creadoEn: string;
}

// Trae los PQRS y los reparte en dos listas: pendientes y respondidos.
async function cargarPqrs() {
    const res = await apiFetch('/api/pqrs');
    const lista = (await res.json()) as Pqrs[];

    renderGrupo('listaPendientes', lista.filter((p) => !p.respondidoEn), true);
    renderGrupo('listaRespondidos', lista.filter((p) => !!p.respondidoEn), false);
}

// Dibuja una lista de PQRS (o el aviso de que está vacía); cada tarjeta abre su detalle.
function renderGrupo(contenedorId: string, items: Pqrs[], pendientes: boolean) {
    const cont = document.getElementById(contenedorId) as HTMLElement;
    cont.innerHTML = '';

    if (items.length === 0) {
        cont.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem;">${pendientes ? 'No hay PQRS pendientes.' : 'Todavía no se ha respondido ningún PQRS.'}</p>`;
        return;
    }

    items.forEach((p) => {
        const fecha = new Date(p.creadoEn).toLocaleString('es-CO');
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${esc(p.nombre)} <span class="badge">${pendientes ? 'Pendiente' : 'Se le ha dado respuesta'}</span></h3>
                <p>${esc(p.correo + (p.telefono ? ' · ' + p.telefono : ''))} · ${fecha}</p>
            </div>
            <div class="item-card-side">
                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(() => abrirDetalle(p)));
        cont.appendChild(card);
    });
}

// Abre un PQRS en una ventana. Si ya se respondió es solo de lectura; si está pendiente, permite
// escribir la respuesta y enviarla.
async function abrirDetalle(p: Pqrs) {
    const fecha = new Date(p.creadoEn).toLocaleString('es-CO');

    // Ya respondido: se muestra el mensaje y la respuesta que se dio.
    if (p.respondidoEn) {
        const fechaResp = new Date(p.respondidoEn).toLocaleString('es-CO');
        await Swal.fire({
            title: p.nombre,
            html: `
                <div style="text-align:left; font-size:0.9rem;">
                    <p><strong>Correo:</strong> ${esc(p.correo)}</p>
                    ${p.telefono ? `<p><strong>Teléfono:</strong> ${esc(p.telefono)}</p>` : ''}
                    <p><strong>Enviado:</strong> ${fecha}</p>
                    <p style="margin-top:0.75rem;"><strong>Mensaje:</strong><br>${esc(p.mensaje)}</p>
                    <p style="margin-top:0.75rem; color:var(--emerald-green);"><strong>Respuesta (${fechaResp}):</strong><br>${esc(p.respuesta ?? "")}</p>
                </div>
            `,
            confirmButtonColor: '#f97316',
            confirmButtonText: 'Cerrar'
        });
        return;
    }

    // Pendiente: pide la respuesta (obligatoria) antes de enviarla.
    const { value: respuesta, isConfirmed } = await Swal.fire({
        title: p.nombre,
        html: `
            <div style="text-align:left; font-size:0.9rem; margin-bottom:1rem;">
                <p><strong>Correo:</strong> ${esc(p.correo)}</p>
                ${p.telefono ? `<p><strong>Teléfono:</strong> ${esc(p.telefono)}</p>` : ''}
                <p><strong>Enviado:</strong> ${fecha}</p>
                <p style="margin-top:0.75rem;"><strong>Mensaje:</strong><br>${esc(p.mensaje)}</p>
            </div>
        `,
        input: 'textarea',
        inputPlaceholder: 'Escribe la respuesta que se enviará por correo a quien lo envió...',
        showCancelButton: true,
        confirmButtonText: 'Enviar respuesta',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#f97316',
        inputValidator: (value: string) => (!value.trim() ? 'Escribe una respuesta antes de enviar' : undefined)
    });

    // Si cancela, no se hace nada.
    if (!isConfirmed) return;

    const res = await apiFetch(`/api/pqrs/${p.id}/responder`, {
        method: 'POST',
        body: JSON.stringify({ respuesta })
    });

    if (!res.ok) {
        const error = await res.json();
        Swal.fire({ icon: 'error', title: 'No se pudo enviar', text: error.message, confirmButtonColor: '#f97316' });
        return;
    }

    await Swal.fire({ icon: 'success', title: 'Respuesta enviada', confirmButtonColor: '#f97316', timer: 1600, showConfirmButton: false });
    await cargarPqrs();
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('secretaria');
    initPanelLayout(sesion);

    await cargarPqrs();
});
