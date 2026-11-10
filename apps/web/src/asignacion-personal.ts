// Panel "Asignar personal" del menú Eventos (historia de usuario 2).
//
// Ocupa el lugar de la vista de eventos (como el detalle ampliado de Consulta) y se cierra con
// "Volver al evento". A la izquierda está todo el personal, con buscador y su disponibilidad; se
// eligen una o varias personas y se asignan a la etapa elegida (Carga, Organización o Desmonte).
// A la derecha, el personal del evento por etapa, donde se puede quitar a alguien de una etapa.
//
// Las reglas (evento confirmado, choques de horario, días no disponibles, duplicados) viven solo en
// el servidor: el panel muestra lo que responde GET /api/eventos/:id/personal y, al escribir la hora
// de finalización, vuelve a preguntar con esa hora. Este archivo solo arma la vista y llama a la API.

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
/** Nombres seleccionados que se muestran en el pie; el resto se resume como "+N" (con sus nombres al pasar el cursor). */
const ELEGIDOS_VISIBLES = 1;

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

/** "MATEO GOMEZ HERNANDEZ" -> "MG" */
function iniciales(nombre: string): string {
    const palabras = nombre.trim().split(/\s+/).filter(Boolean);
    return palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

// ---------- Estructura ----------
function esqueleto(): string {
    return `
        <div class="asig-barra">
            <button type="button" class="asig-volver" data-asig-volver>
                <i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Volver al evento
            </button>
            <span class="asig-divisor-v" aria-hidden="true"></span>
            <span class="asig-barra-icono" aria-hidden="true"><i class="fa-regular fa-calendar"></i></span>
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
                <h3 id="asigTituloPersonal"><i class="fa-solid fa-users" aria-hidden="true"></i> Personal</h3>
                <span class="asig-pastilla" id="asigConteo"></span>
            </div>
            <div class="asig-herramientas">
                <div class="asig-horario">
                    <div class="asig-hora" data-asig-hora>
                        <i class="fa-regular fa-clock asig-hora-icono" aria-hidden="true"></i>
                        <span class="asig-hora-campo">
                            <label for="asigHoraFin">Hora de finalización</label>
                            <input type="time" id="asigHoraFin" value="${esc(d.evento.horaFin ?? '')}" required aria-describedby="asigHoraAyuda">
                        </span>
                        <button type="button" class="asig-hora-abrir" data-asig-hora-selector aria-label="Elegir la hora de finalización">
                            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                        </button>
                    </div>
                    <span class="asig-divisor-v" aria-hidden="true"></span>
                    <span class="asig-inicio">Inicio: ${esc(inicio)}</span>
                    <span class="asig-hora-nota" id="asigHoraAyuda"></span>
                </div>
                <div class="asig-destino">
                    <span class="asig-destino-nombre" id="asigDestinoNombre">Asignar a:</span>
                    <div class="asig-segmentos" role="group" aria-labelledby="asigDestinoNombre">
                        ${ETAPAS.map((et) => `<button type="button" class="asig-segmento" data-asig-destino="${et}" aria-pressed="false">
                            <i class="fa-solid ${ETAPA_INFO[et].icono}" aria-hidden="true"></i> ${nombreEtapa(et)}</button>`).join('')}
                    </div>
                </div>
                <div class="asig-filtros">
                    <label class="asig-buscar">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" id="asigBuscar" placeholder="Buscar por nombre" aria-label="Buscar personal por nombre" autocomplete="off">
                    </label>
                    <div class="asig-filtro-grupo" role="group" aria-label="Mostrar">
                        <button type="button" class="asig-filtro" data-asig-filtro="todos" aria-pressed="true">Todos</button>
                        <button type="button" class="asig-filtro" data-asig-filtro="disponibles" aria-pressed="false">Disponibles</button>
                    </div>
                </div>
            </div>
            <ul class="asig-lista" id="asigLista" aria-label="Personal para asignar"></ul>
            <div class="asig-pie">
                <p class="form-error asig-error" id="asigError" role="alert" hidden></p>
                <div class="asig-pie-barra" id="asigAcciones"></div>
            </div>
        </section>
        <section class="asig-col asig-col-etapas" aria-labelledby="asigTituloEtapas">
            <div class="asig-col-head">
                <h3 id="asigTituloEtapas"><i class="fa-solid fa-users" aria-hidden="true"></i> Personal del evento</h3>
                <span class="asig-pastilla asig-pastilla-fuerte" id="asigTotal"></span>
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
    const marcada = seleccion.has(p.clave);
    const estado = estadoDe(p);
    const etapas = (p.etapas ?? []).map((et) => `<span class="asig-etapa-chip">${nombreEtapa(et)}</span>`).join('');
    return `
        <li>
            <label class="asig-fila asig-opcion${puede ? '' : ' bloqueada'}${marcada ? ' marcada' : ''}">
                <input type="checkbox" class="asig-check" value="${esc(p.clave)}" data-asig-persona ${puede ? '' : 'disabled'} ${marcada ? 'checked' : ''}>
                <span class="asig-avatar" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
                <span class="asig-persona">
                    <strong>${esc(p.nombre)}</strong>
                    <small>${esc(p.detalle)}</small>
                    ${etapas ? `<span class="asig-chips">${etapas}</span>` : ''}
                    ${htmlMotivos(p.motivos)}
                </span>
                <span class="asig-estado asig-estado-${estado.clase}"><span class="asig-punto" aria-hidden="true"></span>${esc(estado.texto)}</span>
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
        : `<li class="asig-vacio asig-lista-vacia"><i class="fa-regular fa-face-meh" aria-hidden="true"></i> ${filtro
            ? `Nadie coincide con «${esc(busqueda.trim())}».`
            : soloDisponibles
                ? `No hay personal disponible para ${esc(nombreEtapa(destino))}.`
                : 'No hay personal registrado. El personal sale de la nómina activa (menú Empleados).'}</li>`;
    const disponibles = datos.personal.filter(elegible).length;
    const resumen = datos.horaFinEvaluada
        ? `${disponibles} disponibles para ${nombreEtapa(destino)} · ${datos.personal.length} en total`
        : `${datos.personal.length} personas`;
    $('asigConteo')!.innerHTML = `<i class="fa-solid fa-users" aria-hidden="true"></i> ${esc(resumen)}`;
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
                <button type="button" class="asig-btn-no" data-asig-quitar-no>No</button>
            </span>`;
    }
    return `<button type="button" class="asig-quitar" data-asig-quitar="${esc(a.perfilId)}" data-asig-etapa="${etapa ?? ''}"
                aria-label="Quitar a ${esc(a.nombre)} ${esc(donde)}" title="Quitar ${esc(donde)}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;
}

function htmlPersonaEtapa(a: AsignadoDto, etapa: Etapa | null): string {
    return `
        <li class="asig-etapa-persona">
            <span class="asig-avatar-icono" aria-hidden="true"><i class="fa-regular fa-user"></i></span>
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
        return `
            <section class="asig-etapa${esDestino ? ' destino' : ''}" aria-labelledby="asigEtapa-${et}">
                <div class="asig-etapa-head">
                    <i class="fa-solid ${ETAPA_INFO[et].icono} asig-etapa-icono" aria-hidden="true"></i>
                    <h4 id="asigEtapa-${et}">${nombreEtapa(et)}</h4>
                    <span class="asig-etapa-conteo" aria-label="${lista.length} asignados">${lista.length}</span>
                    ${asignable
                        ? `<button type="button" class="asig-etapa-elegir" data-asig-destino="${et}" aria-pressed="${esDestino}">Asignar aquí</button>`
                        : ''}
                </div>
                ${lista.length
                    ? `<ul class="asig-etapa-lista">${lista.map((a) => htmlPersonaEtapa(a, et)).join('')}</ul>`
                    : '<p class="asig-etapa-vacia"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Nadie asignado.</p>'}
            </section>`;
    });
    if (sinEtapa.length > 0) {
        tarjetas.push(`
            <section class="asig-etapa asig-sin-etapa" aria-labelledby="asigEtapa-sin">
                <div class="asig-etapa-head">
                    <i class="fa-regular fa-circle-question asig-etapa-icono" aria-hidden="true"></i>
                    <h4 id="asigEtapa-sin">Sin etapa</h4>
                    <span class="asig-etapa-conteo" aria-label="${sinEtapa.length} sin etapa">${sinEtapa.length}</span>
                </div>
                <p class="asig-ayuda">Personas asignadas sin una etapa. ${asignable ? 'Puedes asignarles una etapa en cualquier momento.' : ''}</p>
                <ul class="asig-etapa-lista">${sinEtapa.map((a) => htmlPersonaEtapa(a, null)).join('')}</ul>
            </section>`);
    }
    contenedor.innerHTML = tarjetas.join('');
    $('asigTotal')!.textContent = `${datos.asignados.length} ${datos.asignados.length === 1 ? 'persona' : 'personas'}`;
}

function htmlElegidos(): string {
    if (!datos || seleccion.size === 0) return '';
    const porClave = new Map(datos.personal.map((p) => [p.clave, p]));
    const elegidos = [...seleccion].map((c) => porClave.get(c)).filter((p): p is PersonaDto => !!p);
    const visibles = elegidos.slice(0, ELEGIDOS_VISIBLES).map((p) => `
        <li class="asig-elegido">
            <span class="asig-avatar asig-avatar-mini" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
            <span class="asig-elegido-nombre">${esc(p.nombre)}</span>
            <button type="button" data-asig-deseleccionar="${esc(p.clave)}" aria-label="Quitar a ${esc(p.nombre)} de la selección" title="Quitar de la selección">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </li>`);
    const resto = elegidos.length - ELEGIDOS_VISIBLES;
    if (resto > 0) {
        const nombres = elegidos.slice(ELEGIDOS_VISIBLES).map((p) => p.nombre).join(', ');
        visibles.push(`<li class="asig-elegido asig-elegido-mas" title="${esc(nombres)}">+${resto}</li>`);
    }
    return `<span class="asig-divisor-v" aria-hidden="true"></span><ul class="asig-elegidos" aria-label="Personas seleccionadas">${visibles.join('')}</ul>`;
}

function renderAcciones(): void {
    const acciones = $('asigAcciones');
    if (!acciones || !datos) return;
    const hora = horaEscrita();
    const cambiaHora = hora !== '' && hora !== (datos.evento.horaFin ?? '');
    const n = seleccion.size;
    const texto = guardando
        ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando...'
        : n === 0 && cambiaHora
            ? '<i class="fa-regular fa-clock" aria-hidden="true"></i> Guardar hora'
            : `<i class="fa-solid fa-users" aria-hidden="true"></i> Asignar a ${esc(nombreEtapa(destino))}`;
    const deshabilitado = guardando || hora === '' || (n === 0 && !cambiaHora);
    const casilla = n > 0
        ? `<button type="button" class="asig-check-todos marcada" data-asig-limpiar aria-label="Quitar toda la selección" title="Quitar toda la selección">
               <i class="fa-solid fa-check" aria-hidden="true"></i></button>`
        : '<span class="asig-check-todos" aria-hidden="true"></span>';
    acciones.innerHTML = `
        ${casilla}
        <span class="asig-seleccion">${n === 0 ? 'Nadie seleccionado' : n === 1 ? '1 seleccionado' : `${n} seleccionados`}</span>
        ${htmlElegidos()}
        <button type="button" class="asig-btn-primario asig-btn-asignar" data-asig-guardar ${deshabilitado ? 'disabled' : ''}>${texto}</button>`;
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
    const nota = $('asigHoraAyuda');
    if (nota && datos) {
        nota.innerHTML = !datos.horaFinEvaluada
            ? 'Escríbela para comprobar quién está disponible.'
            : datos.terminaAlDiaSiguiente
                ? '<i class="fa-regular fa-moon" aria-hidden="true"></i> Termina al día siguiente'
                : '';
        nota.classList.toggle('dia-siguiente', !!datos.horaFinEvaluada && datos.terminaAlDiaSiguiente);
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
        ? '<span class="asig-estado-evento confirmado"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Confirmado</span>'
        : '<span class="asig-estado-evento"><i class="fa-regular fa-circle" aria-hidden="true"></i> Sin confirmar</span>';
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
                    <div class="asig-pie-barra"><button type="button" class="asig-btn-primario" data-asig-reintentar>Reintentar</button></div>
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

/** Cambia de etapa de destino y deja ambas columnas en sintonía. */
function elegirDestino(etapa: Etapa): void {
    destino = etapa;
    podarSeleccion();
    renderControles();
    renderLista();
    renderEtapas();
    renderAcciones();
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
    if (t.closest('[data-asig-hora-selector]')) {
        const campo = $<HTMLInputElement>('asigHoraFin');
        campo?.focus();
        try {
            campo?.showPicker();
        } catch {
            // Navegador sin selector: queda el campo enfocado para escribir la hora.
        }
        return;
    }
    if (t.closest('[data-asig-hora]') && !t.closest('input')) {
        $<HTMLInputElement>('asigHoraFin')?.focus();
        return;
    }
    const botonDestino = t.closest<HTMLElement>('[data-asig-destino]');
    if (botonDestino?.dataset.asigDestino) {
        elegirDestino(botonDestino.dataset.asigDestino as Etapa);
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
    const deseleccionar = t.closest<HTMLElement>('[data-asig-deseleccionar]');
    if (deseleccionar?.dataset.asigDeseleccionar) {
        seleccion.delete(deseleccionar.dataset.asigDeseleccionar);
        renderLista();
        renderAcciones();
        $('asigBuscar')?.focus();
        return;
    }
    if (t.closest('[data-asig-limpiar]')) {
        seleccion.clear();
        renderLista();
        renderAcciones();
        $('asigBuscar')?.focus();
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
    t.closest('.asig-opcion')?.classList.toggle('marcada', t.checked);
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
