// Bloque "Personal" del detalle de un evento (menú Eventos): el personal asignado dividido por
// etapa (Carga, Organización, Desmonte) y, si los hay, los que todavía no tienen etapa.
//
// El detalle se pinta primero con los nombres que ya trae la lista de eventos y luego se completa
// con GET /api/eventos/:id/personal?vista=asignados, que trae las etapas. Si esa consulta falla
// (p. ej. falta aplicar una migración), se quedan los nombres en una sola lista y se avisa.

import { api } from './api';
import { esc } from './shared/panelShell';
import { agruparPorEtapa, ETAPA_INFO, ETAPAS, type AsignadoDto, type ConsultaPersonal } from './shared/etapasPersonal';

interface EventoResumen {
    id: number;
    confirmado: boolean;
    personal: string[];
}

const chips = (nombres: string[]): string =>
    `<div class="personal-lista">${nombres.map((n) => `<span>${esc(n)}</span>`).join('')}</div>`;

function chipsAsignados(lista: AsignadoDto[]): string {
    return `<div class="personal-lista">${lista
        .map((a) => a.origen === 'whatsapp'
            ? `<span title="Confirmó por WhatsApp">${esc(a.nombre)} <i class="fa-brands fa-whatsapp" aria-label="(confirmó por WhatsApp)"></i></span>`
            : `<span>${esc(a.nombre)}</span>`)
        .join('')}</div>`;
}

/** Bloque inicial; `hidratarBloquePersonal` lo completa con las etapas. Ocupa todo el ancho del detalle. */
export function htmlBloquePersonal(e: EventoResumen): string {
    const total = e.personal.length;
    const contenido = total > 0
        ? `${chips(e.personal)}<p class="personal-nota"><i class="fa-solid fa-spinner fa-spin"></i> Cargando etapas...</p>`
        : '<p>Sin personal asignado</p>';
    const nota = e.confirmado ? '' : '<p><small>Solo los eventos confirmados admiten asignar personal.</small></p>';
    // Solo se consulta el servidor si puede haber personal (los no confirmados no admiten asignaciones).
    const hidratar = e.confirmado || total > 0 ? ` data-personal-evento="${e.id}"` : '';
    return `
        <section class="detalle-bloque detalle-personal"${hidratar} aria-labelledby="personalTitulo">
            <h3 id="personalTitulo">Personal <span class="personal-total" data-personal-total>${total}</span></h3>
            <div data-personal-contenido>${contenido}</div>
            ${nota}
        </section>`;
}

function htmlEtapas(datos: ConsultaPersonal): string {
    const { porEtapa, sinEtapa } = agruparPorEtapa(datos.asignados);
    const columnas = ETAPAS.map((etapa) => {
        const lista = porEtapa[etapa];
        const info = ETAPA_INFO[etapa];
        return `
            <section class="personal-etapa" aria-label="${info.nombre}">
                <h4><i class="fa-solid ${info.icono}" aria-hidden="true"></i> ${info.nombre} <span class="personal-conteo">${lista.length}</span></h4>
                ${lista.length ? chipsAsignados(lista) : '<p class="personal-vacio">Nadie asignado</p>'}
            </section>`;
    });
    if (sinEtapa.length > 0) {
        columnas.push(`
            <section class="personal-etapa personal-sin-etapa" aria-label="Sin etapa">
                <h4><i class="fa-regular fa-circle-question" aria-hidden="true"></i> Sin etapa <span class="personal-conteo">${sinEtapa.length}</span></h4>
                ${chipsAsignados(sinEtapa)}
                <p class="personal-nota">Asígnales una etapa desde «Asignar personal».</p>
            </section>`);
    }
    return `<div class="personal-etapas">${columnas.join('')}</div>`;
}

/** Completa con las etapas el bloque "Personal" que haya dentro de `raiz` (si lo hay). */
export async function hidratarBloquePersonal(raiz: HTMLElement): Promise<void> {
    const bloque = raiz.querySelector<HTMLElement>('[data-personal-evento]');
    if (!bloque) return;
    const id = bloque.dataset.personalEvento;
    try {
        const datos = await api<ConsultaPersonal>('GET', `/api/eventos/${id}/personal?vista=asignados`);
        if (!bloque.isConnected) return; // mientras tanto se eligió otro evento
        bloque.querySelector('[data-personal-total]')!.textContent = String(datos.asignados.length);
        bloque.querySelector('[data-personal-contenido]')!.innerHTML = htmlEtapas(datos);
    } catch (err) {
        if (!bloque.isConnected) return;
        const nota = bloque.querySelector('.personal-nota');
        if (nota) nota.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar las etapas: ${esc((err as Error).message)}`;
    }
}
