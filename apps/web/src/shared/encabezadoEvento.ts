// Encabezado de las pestañas Horarios y Resumen del panel del evento: "Volver al evento", título,
// datos del evento y si está confirmado. Usa las mismas clases que el encabezado de la pestaña
// Personal (asignacion-personal.ts) para que las tres se vean iguales. El botón lleva
// data-panel-volver, que atiende panel-evento.ts.

import { esc } from './panelShell';
import { formatearFecha, type EventoDto } from './etapasPersonal';

/** "Grado / Prom Night · Domingo, 29 de noviembre de 2026 · Pereira 1 · Pereira": tipo, fecha y lugar. */
export function datosDelEvento(evento: EventoDto): string {
    const partes = [evento.nombre, evento.fecha ? formatearFecha(evento.fecha) : 'Fecha por definir'];
    if (evento.lugar) partes.push(evento.lugar);
    return partes.join(' · ');
}

export function htmlEstadoEvento(evento: EventoDto | null): string {
    if (!evento) return '';
    return evento.confirmado
        ? '<span class="asig-estado-evento confirmado"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Confirmado</span>'
        : '<span class="asig-estado-evento"><i class="fa-regular fa-circle" aria-hidden="true"></i> Sin confirmar</span>';
}

/**
 * @param idTitulo id del título (tabindex -1: recibe el foco al abrir la pestaña)
 * @param idSub    id del párrafo con los datos del evento, para actualizarlo después
 */
export function htmlEncabezadoEvento(opciones: { idTitulo: string; idSub: string; titulo: string; icono: string; evento: EventoDto | null }): string {
    const { idTitulo, idSub, titulo, icono, evento } = opciones;
    return `
        <div class="asig-barra">
            <button type="button" class="asig-volver" data-panel-volver>
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Volver al evento
            </button>
            <span class="asig-divisor-v" aria-hidden="true"></span>
            <span class="asig-barra-icono" aria-hidden="true"><i class="${icono}"></i></span>
            <div class="asig-titulos">
                <h2 id="${idTitulo}" tabindex="-1">${esc(titulo)}</h2>
                <p class="asig-sub" id="${idSub}">${evento ? esc(datosDelEvento(evento)) : 'Cargando evento...'}</p>
            </div>
            <span data-estado-evento>${htmlEstadoEvento(evento)}</span>
        </div>`;
}
