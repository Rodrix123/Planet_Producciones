// Personal del detalle de un evento (menú Eventos):
// - "Composición del personal": cuántas personas asignadas hay de cada tipo de contrato y el total
//   (a la derecha de "Logística y contrato").
// - El personal dividido por etapa (Carga, Organización, Desmonte) y los que todavía no tienen
//   etapa, cada uno con la etiqueta de su tipo de contrato.
//
// El detalle se pinta primero con los nombres que ya trae la lista de eventos y luego se completa
// con GET /api/eventos/:id/personal?vista=asignados, que trae etapas y tipo de contrato. Como el
// detalle se vuelve a pintar al asignar o quitar personal, todo se recalcula con los datos reales.
// Si esa consulta falla (p. ej. falta aplicar una migración), quedan los nombres y un aviso.

import { api } from './api';
import { esc } from './shared/panelShell';
import {
    agruparPorEtapa,
    claveContrato,
    CONTRATO_INFO,
    ETAPA_INFO,
    ETAPAS,
    TIPOS_CONTRATO,
    type AsignadoDto,
    type ConsultaPersonal,
    type TipoContrato
} from './shared/etapasPersonal';

interface EventoResumen {
    id: number;
    confirmado: boolean;
    personal: string[];
}

const chips = (nombres: string[]): string =>
    `<div class="personal-lista">${nombres.map((n) => `<span>${esc(n)}</span>`).join('')}</div>`;

const etiquetaPersonas = (n: number): string => (n === 1 ? 'persona' : 'personas');

// ---------- Composición del personal ----------
type Conteo = Record<TipoContrato | 'sin', number>;

/** Cada persona asignada cuenta una sola vez, aunque esté en varias etapas. */
function contar(asignados: AsignadoDto[]): Conteo {
    const conteo: Conteo = { con_contrato: 0, freelance_fijo: 0, freelance_no_fijo: 0, sin: 0 };
    for (const a of asignados) conteo[claveContrato(a.tipoContrato)] += 1;
    return conteo;
}

function htmlTipo(clave: TipoContrato | 'sin', valor: number | null): string {
    const info = CONTRATO_INFO[clave];
    return `
        <li class="composicion-tipo ${info.clase}">
            <span class="composicion-icono" aria-hidden="true"><i class="fa-solid ${info.icono}"></i></span>
            <span class="composicion-dato">
                <strong data-composicion-valor="${clave}">${valor ?? '–'}</strong>
                <span>${info.nombre}</span>
            </span>
        </li>`;
}

/** `conteo` null = todavía cargando (solo se sabe el total por los nombres). */
function htmlComposicion(conteo: Conteo | null, total: number): string {
    const tipos = TIPOS_CONTRATO.map((t) => htmlTipo(t.valor, conteo ? conteo[t.valor] : null));
    // Quien no está en la nómina no tiene tipo: se muestra aparte para que las cifras cuadren con el total.
    if (conteo && conteo.sin > 0) tipos.push(htmlTipo('sin', conteo.sin));
    return `
        <div class="composicion-titulo">
            <i class="fa-solid fa-users" aria-hidden="true"></i>
            <div>
                <h3 id="composicionTitulo">Composición del personal</h3>
                <p>Distribución por tipo de contrato</p>
            </div>
        </div>
        <span class="composicion-divisor" aria-hidden="true"></span>
        <ul class="composicion-tipos" aria-label="Personas asignadas por tipo de contrato">${tipos.join('')}</ul>
        <span class="composicion-divisor" aria-hidden="true"></span>
        <div class="composicion-total">
            <span>Total</span>
            <strong><b data-composicion-total>${total}</b> ${etiquetaPersonas(total)}</strong>
        </div>`;
}

// ---------- Personal por etapa ----------
function htmlEtiquetaContrato(tipo: string | null): string {
    const info = CONTRATO_INFO[claveContrato(tipo)];
    return `<span class="contrato-tag ${info.clase}"><i class="fa-solid ${info.icono}" aria-hidden="true"></i> ${info.nombre}</span>`;
}

function htmlFila(a: AsignadoDto): string {
    const whatsapp = a.origen === 'whatsapp'
        ? ' <i class="fa-brands fa-whatsapp" title="Confirmó por WhatsApp" aria-label="(confirmó por WhatsApp)"></i>'
        : '';
    return `
        <li class="personal-fila">
            <i class="fa-regular fa-user personal-fila-icono" aria-hidden="true"></i>
            <span class="personal-fila-datos">
                <span class="personal-fila-nombre">${esc(a.nombre)}${whatsapp}</span>
                ${htmlEtiquetaContrato(a.tipoContrato)}
            </span>
        </li>`;
}

function htmlTarjeta(clase: string, titulo: string, icono: string, lista: AsignadoDto[], extra = ''): string {
    return `
        <section class="personal-etapa ${clase}" aria-label="${titulo}">
            <div class="personal-etapa-head">
                <i class="${icono}" aria-hidden="true"></i>
                <h4>${titulo}</h4>
                <span class="personal-conteo">${lista.length}</span>
            </div>
            ${lista.length
                ? `<ul class="personal-filas">${lista.map(htmlFila).join('')}</ul>`
                : '<p class="personal-vacio"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Nadie asignado</p>'}
            ${extra}
        </section>`;
}

function htmlEtapas(datos: ConsultaPersonal): string {
    const { porEtapa, sinEtapa } = agruparPorEtapa(datos.asignados);
    const tarjetas = ETAPAS.map((etapa) =>
        htmlTarjeta('', ETAPA_INFO[etapa].nombre, `fa-solid ${ETAPA_INFO[etapa].icono}`, porEtapa[etapa]));
    if (sinEtapa.length > 0) {
        tarjetas.push(htmlTarjeta('personal-sin-etapa', 'Sin etapa', 'fa-regular fa-circle-question', sinEtapa,
            '<p class="personal-nota">Asígnales una etapa desde «Asignar personal».</p>'));
    }
    return `<div class="personal-etapas${sinEtapa.length > 0 ? ' con-sin-etapa' : ''}">${tarjetas.join('')}</div>`;
}

// ---------- Bloques del detalle ----------
/**
 * Dos piezas del detalle: la composición (a la derecha de "Logística y contrato") y el personal por
 * etapa (a todo el ancho). `hidratarBloquePersonal` las completa con los datos del servidor.
 */
export function htmlBloquePersonal(e: EventoResumen): string {
    const total = e.personal.length;
    // Solo se consulta el servidor si puede haber personal (los no confirmados no admiten asignaciones).
    const conDatos = e.confirmado || total > 0;
    const contenido = total > 0
        ? `${chips(e.personal)}<p class="personal-nota"><i class="fa-solid fa-spinner fa-spin"></i> Cargando etapas...</p>`
        : '<p>Sin personal asignado</p>';
    const nota = e.confirmado ? '' : '<p><small>Solo los eventos confirmados admiten asignar personal.</small></p>';
    const composicion = conDatos
        ? `<section class="detalle-composicion" data-personal-composicion aria-labelledby="composicionTitulo" aria-busy="true">
               ${htmlComposicion(null, total)}
           </section>`
        : '';
    return `
        ${composicion}
        <section class="detalle-bloque detalle-personal"${conDatos ? ` data-personal-evento="${e.id}"` : ''} aria-labelledby="personalTitulo">
            <h3 id="personalTitulo">Personal <span class="personal-total" data-personal-total>${total}</span></h3>
            <div data-personal-contenido>${contenido}</div>
            ${nota}
        </section>`;
}

/** Completa la composición y el personal por etapa que haya dentro de `raiz` (si los hay). */
export async function hidratarBloquePersonal(raiz: HTMLElement): Promise<void> {
    const bloque = raiz.querySelector<HTMLElement>('[data-personal-evento]');
    if (!bloque) return;
    const composicion = raiz.querySelector<HTMLElement>('[data-personal-composicion]');
    const id = bloque.dataset.personalEvento;
    try {
        const datos = await api<ConsultaPersonal>('GET', `/api/eventos/${id}/personal?vista=asignados`);
        if (!bloque.isConnected) return; // mientras tanto se eligió otro evento
        const total = datos.asignados.length;
        bloque.querySelector('[data-personal-total]')!.textContent = String(total);
        bloque.querySelector('[data-personal-contenido]')!.innerHTML = htmlEtapas(datos);
        if (composicion) {
            composicion.innerHTML = htmlComposicion(contar(datos.asignados), total);
            composicion.removeAttribute('aria-busy');
        }
    } catch (err) {
        if (!bloque.isConnected) return;
        composicion?.removeAttribute('aria-busy');
        const nota = bloque.querySelector('.personal-nota');
        if (nota) nota.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar las etapas: ${esc((err as Error).message)}`;
    }
}
