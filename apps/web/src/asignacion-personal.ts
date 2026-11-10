// Panel "Asignar personal" del menú Eventos (historia de usuario 2).
//
// Ocupa el lugar de la vista de eventos (como el detalle ampliado de Consulta) y se cierra con
// "Volver al evento". A la izquierda está todo el personal, con buscador y su disponibilidad; se
// eligen una o varias personas y se asignan a la etapa elegida (Carga, Organización o Desmonte).
// A la derecha, el personal del evento por etapa, donde se puede quitar a alguien de una etapa.
//
// Las reglas (evento confirmado, choques de horario, días no disponibles, duplicados) viven solo en
// el servidor: el panel muestra lo que responde GET /api/eventos/:id/personal y, al escribir la hora
// de finalización, vuelve a preguntar con esa hora.

import { api } from './api';
import { esc } from './shared/panelShell';
import {
    agruparPorEtapa,
    ETAPA_INFO,
    ETAPAS,
    formatearFecha,
    formatearHora,
    horario,
    normalizar,
    type AsignadoDto,
    type ConsultaPersonal,
    type EstadoPersona,
    type Etapa,
    type Motivo,
    type PersonaDto,
    type ResultadoCambio
} from './shared/etapasPersonal';

export interface OpcionesAsignacion {
    /** Aviso flotante de la página. */
    avisar: (mensaje: string) => void;
    /** Al volver al evento; `huboCambios` indica si hay que refrescar la lista de eventos. */
    alCerrar: (huboCambios: boolean) => void | Promise<void>;
}

const ETIQUETA_ESTADO: Record<Exclude<EstadoPersona, 'ASIGNADO'>, string> = {
    DISPONIBLE: 'Disponible',
    CONVOCADO: 'Convocado',
    RECHAZO_WHATSAPP: 'Rechazó',
    NO_DISPONIBLE: 'No disponible',
    SIN_CELULAR: 'Sin celular',
    SIN_COMPROBAR: 'Sin comprobar'
};

const ESPERA_HORA_MS = 400;

const panel = document.getElementById('panelAsignacion') as HTMLElement;

let eventoId = 0;
let opciones: OpcionesAsignacion = { avisar: () => undefined, alCerrar: () => undefined };
let datos: ConsultaPersonal | null = null;
let error: string | null = null;
const seleccion = new Set<string>();
let destino: Etapa = 'carga';
let busqueda = '';
let soloDisponibles = false;
/** Cada carga lleva un número: si llega una respuesta vieja (otra hora, otro evento), se descarta. */
let generacion = 0;
let guardando = false;
let huboCambios = false;
let quitarPendiente: { perfilId: string; etapa: Etapa | null } | null = null;
let horaTimer: number | undefined;

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const horaEscrita = (): string => $<HTMLInputElement>('asigHoraFin')?.value ?? '';
const nombreEtapa = (etapa: Etapa): string => ETAPA_INFO[etapa].nombre;

/** ¿Se puede elegir a esta persona para la etapa de destino? Quien ya está en ella, no. */
const elegible = (p: PersonaDto): boolean => p.seleccionable && !(p.etapas ?? []).includes(destino);

// ---------- Estructura ----------
function esqueleto(): string {
    return `
        <div class="asig-barra">
            <button type="button" class="btn-secundario asig-volver" data-asig-volver>
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Volver al evento
            </button>
            <div class="asig-titulos">
                <h2 id="asigTitulo" tabindex="-1">Asignar personal</h2>
                <p class="asig-sub" id="asigSub">Cargando evento...</p>
            </div>
            <span id="asigEstadoEvento"></span>
        </div>
        <div id="asigAviso"></div>
        <div class="asig-cuerpo" id="asigCuerpo">
            <p class="asig-estado-carga"><i class="fa-solid fa-spinner fa-spin"></i> Cargando personal...</p>
        </div>`;
}

function htmlColumnas(d: ConsultaPersonal): string {
    const inicio = d.evento.horaInicio ? formatearHora(d.evento.horaInicio) : '—';
    return `
        <section class="asig-col asig-col-personal" id="asigColPersonal" aria-labelledby="asigTituloPersonal">
            <div class="asig-col-head">
                <h3 id="asigTituloPersonal">Personal</h3>
                <span class="asig-conteo" id="asigConteo"></span>
            </div>
            <div class="asig-herramientas">
                <div class="asig-horario">
                    <label for="asigHoraFin">Hora de finalización</label>
                    <div class="asig-horario-fila">
                        <input type="time" id="asigHoraFin" value="${esc(d.evento.horaFin ?? '')}" required aria-describedby="asigHoraAyuda">
                        <span class="asig-inicio">Inicio: ${esc(inicio)}</span>
                    </div>
                    <p class="field-hint" id="asigHoraAyuda"></p>
                </div>
                <div class="asig-destino">
                    <span class="asig-destino-nombre" id="asigDestinoNombre">Asignar a</span>
                    <div class="segmentos asig-segmentos" role="group" aria-labelledby="asigDestinoNombre">
                        ${ETAPAS.map((et) => `<button type="button" class="segmento" data-asig-destino="${et}" aria-pressed="false">
                            <i class="fa-solid ${ETAPA_INFO[et].icono}" aria-hidden="true"></i> ${nombreEtapa(et)}</button>`).join('')}
                    </div>
                </div>
                <div class="asig-filtros">
                    <label class="asig-buscar">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" id="asigBuscar" placeholder="Buscar por nombre" aria-label="Buscar personal por nombre" autocomplete="off">
                    </label>
                    <div class="segmentos" role="group" aria-label="Mostrar">
                        <button type="button" class="segmento" data-asig-filtro="todos" data-valor="todos" aria-pressed="true">Todos</button>
                        <button type="button" class="segmento" data-asig-filtro="disponibles" aria-pressed="false">Disponibles</button>
                    </div>
                </div>
            </div>
            <ul class="asig-lista" id="asigLista" aria-label="Personal para asignar"></ul>
            <div class="asig-pie">
                <p class="form-error asig-error" id="asigError" role="alert" hidden></p>
                <div class="asig-pie-acciones" id="asigAcciones"></div>
            </div>
        </section>
        <section class="asig-col asig-col-etapas" aria-labelledby="asigTituloEtapas">
            <div class="asig-col-head">
                <h3 id="asigTituloEtapas">Personal del evento</h3>
                <span class="asig-conteo" id="asigTotal"></span>
            </div>
            <div class="asig-etapas" id="asigEtapas"></div>
        </section>`;
}

// ---------- Render ----------
function htmlMotivos(motivos: Motivo[], clase = 'asig-motivo'): string {
    return motivos.map((m) => `<small class="${clase}">${esc(m.mensaje)}</small>`).join('');
}

function estadoDe(p: PersonaDto): { texto: string; clase: string } {
    if (p.estado === 'ASIGNADO') {
        return (p.etapas ?? []).includes(destino)
            ? { texto: `Ya en ${nombreEtapa(destino)}`, clase: 'en-etapa' }
            : { texto: 'En el evento', clase: 'en-evento' };
    }
    return { texto: ETIQUETA_ESTADO[p.estado], clase: p.estado.toLowerCase() };
}

function htmlFila(p: PersonaDto): string {
    const puede = elegible(p);
    const estado = estadoDe(p);
    const etapas = (p.etapas ?? []).map((et) => `<span class="asig-etapa-chip">${nombreEtapa(et)}</span>`).join('');
    return `
        <li>
            <label class="asig-fila asig-opcion${puede ? '' : ' bloqueada'}">
                <input type="checkbox" value="${esc(p.clave)}" data-asig-persona ${puede ? '' : 'disabled'} ${seleccion.has(p.clave) ? 'checked' : ''}>
                <span class="asig-persona">
                    <strong>${esc(p.nombre)}</strong>
                    <small>${esc(p.detalle)}</small>
                    ${etapas ? `<span class="asig-chips">${etapas}</span>` : ''}
                    ${htmlMotivos(p.motivos)}
                </span>
                <span class="asig-estado asig-estado-${estado.clase}">${esc(estado.texto)}</span>
            </label>
        </li>`;
}

function renderLista(): void {
    const lista = $('asigLista');
    if (!lista || !datos) return;
    const filtro = normalizar(busqueda);
    const visibles = datos.personal.filter((p) => (!filtro || normalizar(p.nombre).includes(filtro)) && (!soloDisponibles || elegible(p)));
    lista.innerHTML = visibles.length
        ? visibles.map(htmlFila).join('')
        : `<li class="asig-vacio">${filtro
            ? `Nadie coincide con «${esc(busqueda.trim())}».`
            : soloDisponibles
                ? `No hay personal disponible para ${esc(nombreEtapa(destino))}.`
                : 'No hay personal registrado. El personal sale de la nómina activa (menú Empleados).'}</li>`;
    const disponibles = datos.personal.filter(elegible).length;
    $('asigConteo')!.textContent = datos.horaFinEvaluada
        ? `${disponibles} disponibles para ${nombreEtapa(destino)} · ${datos.personal.length} en total`
        : `${datos.personal.length} personas`;
}

function htmlQuitar(a: AsignadoDto, etapa: Etapa | null): string {
    if (!datos?.evento.asignable) return '';
    // Sin etapa solo se puede sacar del evento a quien se asignó aquí; de una etapa, a cualquiera
    // (a quien confirmó por WhatsApp solo se le quita la etapa: sigue asignado).
    if (etapa === null && !a.puedeQuitarse) return '';
    const donde = etapa ? `de ${nombreEtapa(etapa)}` : 'del evento';
    if (quitarPendiente?.perfilId === a.perfilId && quitarPendiente.etapa === etapa) {
        return `
            <span class="asig-confirmar">
                <button type="button" class="asig-btn-peligro" data-asig-quitar-si>Quitar ${esc(donde)}</button>
                <button type="button" class="btn-secundario" data-asig-quitar-no>No</button>
            </span>`;
    }
    return `<button type="button" class="asig-quitar" data-asig-quitar="${esc(a.perfilId)}" data-asig-etapa="${etapa ?? ''}"
                aria-label="Quitar a ${esc(a.nombre)} ${esc(donde)}" title="Quitar ${esc(donde)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
}

function htmlPersonaEtapa(a: AsignadoDto, etapa: Etapa | null): string {
    return `
        <li class="asig-etapa-persona">
            <span class="asig-persona">
                <strong>${esc(a.nombre)}</strong>
                ${a.origen === 'whatsapp' ? '<small><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Confirmó por WhatsApp</small>' : ''}
                ${htmlMotivos(a.motivos, 'asig-motivo asig-motivo-alerta')}
            </span>
            ${htmlQuitar(a, etapa)}
        </li>`;
}

function renderEtapas(): void {
    const contenedor = $('asigEtapas');
    if (!contenedor || !datos) return;
    const asignable = datos.evento.asignable;
    const { porEtapa, sinEtapa } = agruparPorEtapa(datos.asignados);
    const tarjetas = ETAPAS.map((et) => {
        const lista = porEtapa[et];
        const esDestino = asignable && et === destino;
        const accion = !asignable
            ? ''
            : esDestino
                ? '<span class="asig-etapa-marca">Asignando aquí</span>'
                : `<button type="button" class="asig-etapa-elegir" data-asig-destino="${et}">Asignar aquí</button>`;
        return `
            <section class="asig-etapa${esDestino ? ' destino' : ''}" aria-labelledby="asigEtapa-${et}">
                <div class="asig-etapa-head">
                    <h4 id="asigEtapa-${et}"><i class="fa-solid ${ETAPA_INFO[et].icono}" aria-hidden="true"></i> ${nombreEtapa(et)}</h4>
                    <span class="asig-conteo">${lista.length}</span>
                    ${accion}
                </div>
                ${lista.length
                    ? `<ul class="asig-etapa-lista">${lista.map((a) => htmlPersonaEtapa(a, et)).join('')}</ul>`
                    : '<p class="asig-vacio">Nadie asignado.</p>'}
            </section>`;
    });
    if (sinEtapa.length > 0) {
        tarjetas.push(`
            <section class="asig-etapa asig-sin-etapa" aria-labelledby="asigEtapa-sin">
                <div class="asig-etapa-head">
                    <h4 id="asigEtapa-sin"><i class="fa-regular fa-circle-question" aria-hidden="true"></i> Sin etapa</h4>
                    <span class="asig-conteo">${sinEtapa.length}</span>
                </div>
                ${asignable ? '<p class="asig-ayuda">Elígelos en la lista, escoge la etapa y pulsa «Asignar».</p>' : ''}
                <ul class="asig-etapa-lista">${sinEtapa.map((a) => htmlPersonaEtapa(a, null)).join('')}</ul>
            </section>`);
    }
    contenedor.innerHTML = tarjetas.join('');
    $('asigTotal')!.textContent = `${datos.asignados.length} ${datos.asignados.length === 1 ? 'persona' : 'personas'}`;
}

function renderAcciones(): void {
    const acciones = $('asigAcciones');
    if (!acciones || !datos) return;
    const hora = horaEscrita();
    const cambiaHora = hora !== '' && hora !== (datos.evento.horaFin ?? '');
    const n = seleccion.size;
    const texto = guardando
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'
        : n > 0
            ? `Asignar ${n} a ${esc(nombreEtapa(destino))}`
            : cambiaHora ? 'Guardar hora' : `Asignar a ${esc(nombreEtapa(destino))}`;
    const deshabilitado = guardando || hora === '' || (n === 0 && !cambiaHora);
    acciones.innerHTML = `
        <span class="asig-seleccion">${n === 0 ? 'Nadie seleccionado' : n === 1 ? '1 seleccionado' : `${n} seleccionados`}</span>
        ${n > 0 ? '<button type="button" class="btn-secundario" data-asig-limpiar>Limpiar</button>' : ''}
        <button type="button" class="asig-btn-primario" data-asig-guardar ${deshabilitado ? 'disabled' : ''}>${texto}</button>`;
}

function renderError(): void {
    const el = $('asigError');
    if (!el) return;
    el.textContent = error ?? '';
    el.hidden = !error;
}

function renderControles(): void {
    panel.querySelectorAll<HTMLElement>('.asig-destino [data-asig-destino]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.asigDestino === destino));
    });
    panel.querySelectorAll<HTMLElement>('[data-asig-filtro]').forEach((b) => {
        b.setAttribute('aria-pressed', String((b.dataset.asigFiltro === 'disponibles') === soloDisponibles));
    });
    const ayuda = $('asigHoraAyuda');
    if (ayuda && datos) {
        ayuda.innerHTML = !datos.horaFinEvaluada
            ? 'Hora en que se libera al personal. Escríbela para comprobar quién está disponible.'
            : `Hora en que se libera al personal.${datos.terminaAlDiaSiguiente ? ' <strong>El evento termina al día siguiente.</strong>' : ''}`;
    }
}

/** Pinta todo salvo los campos de hora y búsqueda, para no interrumpir a quien escribe. */
function render(): void {
    if (!datos) return;
    const e = datos.evento;
    const partes = [e.nombre, e.fecha ? formatearFecha(e.fecha) : 'Fecha por definir', horario(e.horaInicio, datos.horaFinEvaluada)];
    if (e.lugar) partes.push(e.lugar);
    $('asigSub')!.textContent = partes.join(' · ');
    $('asigEstadoEvento')!.innerHTML = e.confirmado
        ? '<span class="badge on"><i class="fa-solid fa-circle-check"></i> Confirmado</span>'
        : '<span class="badge"><i class="fa-solid fa-circle-check"></i> Sin confirmar</span>';
    $('asigAviso')!.innerHTML = e.motivo
        ? `<p class="asig-aviso"><i class="fa-solid fa-circle-info"></i> ${esc(e.motivo.mensaje)}</p>`
        : '';

    const cuerpo = $('asigCuerpo')!;
    if (!$('asigColPersonal')) cuerpo.innerHTML = htmlColumnas(datos);
    $('asigColPersonal')!.hidden = !e.asignable;
    cuerpo.classList.toggle('solo-etapas', !e.asignable);

    renderControles();
    renderLista();
    renderEtapas();
    renderAcciones();
    renderError();
}

// ---------- Datos ----------
async function cargar(horaFin?: string): Promise<void> {
    const mia = ++generacion;
    try {
        const consulta = horaFin ? `?horaFin=${encodeURIComponent(horaFin)}` : '';
        const respuesta = await api<ConsultaPersonal>('GET', `/api/eventos/${eventoId}/personal${consulta}`);
        if (mia !== generacion) return;
        datos = respuesta;
        podarSeleccion();
        render();
    } catch (err) {
        if (mia !== generacion) return;
        if (datos) {
            error = (err as Error).message;
            renderError();
        } else {
            $('asigSub')!.textContent = 'No se pudo cargar el evento.';
            $('asigCuerpo')!.innerHTML = `
                <div class="asig-col">
                    <p class="asig-aviso asig-aviso-error"><i class="fa-solid fa-triangle-exclamation"></i> No se pudo cargar el personal: ${esc((err as Error).message)}</p>
                    <div class="asig-pie-acciones"><button type="button" class="asig-btn-primario" data-asig-reintentar>Reintentar</button></div>
                </div>`;
        }
    }
}

/** Quien ya no se puede elegir (cambió la hora o la etapa de destino) sale de la selección. */
function podarSeleccion(): void {
    if (!datos) return;
    for (const clave of [...seleccion]) {
        const p = datos.personal.find((x) => x.clave === clave);
        if (!p || !elegible(p)) seleccion.delete(clave);
    }
}

async function guardar(): Promise<void> {
    const horaFin = horaEscrita();
    if (!horaFin) {
        error = 'Indica la hora de finalización del evento.';
        renderError();
        $('asigHoraFin')?.focus();
        return;
    }
    guardando = true;
    error = null;
    renderError();
    renderAcciones();
    try {
        const respuesta = await api<ResultadoCambio>('POST', `/api/eventos/${eventoId}/personal`, {
            horaFin,
            etapa: destino,
            personal: [...seleccion]
        });
        generacion += 1; // descarta cualquier consulta de disponibilidad que siga en camino
        datos = respuesta;
        seleccion.clear();
        huboCambios = true;
        guardando = false;
        render();
        opciones.avisar(respuesta.mensaje);
    } catch (err) {
        guardando = false;
        error = (err as Error).message;
        renderError();
        renderAcciones();
        await cargar(horaFin); // la disponibilidad pudo cambiar: se muestra la actual sin borrar el mensaje
    }
}

async function quitar(perfilId: string, etapa: Etapa | null): Promise<void> {
    quitarPendiente = null;
    error = null;
    renderError();
    try {
        const consulta = etapa ? `?etapa=${etapa}` : '';
        const respuesta = await api<ResultadoCambio>('DELETE', `/api/eventos/${eventoId}/personal/${encodeURIComponent(perfilId)}${consulta}`);
        generacion += 1;
        datos = respuesta;
        podarSeleccion();
        huboCambios = true;
        render();
        opciones.avisar(respuesta.mensaje);
    } catch (err) {
        error = (err as Error).message;
        render();
    }
}

function cerrar(): void {
    generacion += 1; // lo que siga en camino ya no se pinta
    window.clearTimeout(horaTimer);
    panel.hidden = true;
    panel.innerHTML = '';
    void opciones.alCerrar(huboCambios);
}

// ---------- Eventos del panel ----------
panel.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('[data-asig-volver]')) {
        cerrar();
        return;
    }
    if (t.closest('[data-asig-reintentar]')) {
        $('asigCuerpo')!.innerHTML = '<p class="asig-estado-carga"><i class="fa-solid fa-spinner fa-spin"></i> Cargando personal...</p>';
        void cargar();
        return;
    }
    const botonDestino = t.closest<HTMLElement>('[data-asig-destino]');
    if (botonDestino?.dataset.asigDestino) {
        destino = botonDestino.dataset.asigDestino as Etapa;
        podarSeleccion();
        renderControles();
        renderLista();
        renderEtapas();
        renderAcciones();
        if (botonDestino.classList.contains('asig-etapa-elegir')) $('asigBuscar')?.focus();
        return;
    }
    const filtro = t.closest<HTMLElement>('[data-asig-filtro]');
    if (filtro) {
        soloDisponibles = filtro.dataset.asigFiltro === 'disponibles';
        renderControles();
        renderLista();
        return;
    }
    if (t.closest('[data-asig-limpiar]')) {
        seleccion.clear();
        renderLista();
        renderAcciones();
        return;
    }
    if (t.closest('[data-asig-guardar]')) {
        void guardar();
        return;
    }
    const quitarBtn = t.closest<HTMLElement>('[data-asig-quitar]');
    if (quitarBtn?.dataset.asigQuitar) {
        quitarPendiente = { perfilId: quitarBtn.dataset.asigQuitar, etapa: (quitarBtn.dataset.asigEtapa || null) as Etapa | null };
        renderEtapas();
        panel.querySelector<HTMLElement>('[data-asig-quitar-si]')?.focus();
        return;
    }
    if (t.closest('[data-asig-quitar-si]') && quitarPendiente) {
        void quitar(quitarPendiente.perfilId, quitarPendiente.etapa);
        return;
    }
    if (t.closest('[data-asig-quitar-no]')) {
        quitarPendiente = null;
        renderEtapas();
    }
});

panel.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (!t.matches('[data-asig-persona]')) return;
    if (t.checked) seleccion.add(t.value);
    else seleccion.delete(t.value);
    error = null;
    renderError();
    renderAcciones();
});

panel.addEventListener('input', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.id === 'asigBuscar') {
        busqueda = (t as HTMLInputElement).value;
        renderLista();
        return;
    }
    if (t.id !== 'asigHoraFin') return;
    error = null;
    renderError();
    renderAcciones();
    window.clearTimeout(horaTimer);
    horaTimer = window.setTimeout(() => void cargar(horaEscrita() || undefined), ESPERA_HORA_MS);
});

/** Abre el panel para un evento y carga su personal. Quien llama oculta la vista de eventos. */
export function abrirAsignacionPersonal(id: number, opts: OpcionesAsignacion): void {
    eventoId = id;
    opciones = opts;
    datos = null;
    error = null;
    guardando = false;
    huboCambios = false;
    quitarPendiente = null;
    destino = 'carga';
    busqueda = '';
    soloDisponibles = false;
    seleccion.clear();
    panel.innerHTML = esqueleto();
    panel.hidden = false;
    $('asigTitulo')?.focus();
    void cargar();
}
