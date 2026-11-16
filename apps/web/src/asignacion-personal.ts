// Panel "Asignar personal" del menú Eventos (historia de usuario 2).
//
// Es la pestaña Personal del panel del evento (panel-evento.ts).
// Ocupa el lugar de la vista de eventos (como el detalle ampliado de Consulta) y se cierra con
// "Volver al evento". A la izquierda está todo el personal, con buscador, tipo de contrato y su
// disponibilidad; se eligen una o varias personas y se asignan a las funciones marcadas en
// "Asignar a" (Todos, o una o varias de Carga, Organización y Desmonte). A la derecha, el personal
// del evento por función, con su horario, donde se puede quitar a alguien de una función.
//
// La hora de finalización del evento se define en la pestaña Horarios; aquí se usa la que el evento
// tiene guardada. Las reglas (evento confirmado, choques de horario, días no disponibles, duplicados)
// viven solo en el servidor: el panel muestra lo que responde GET /api/eventos/:id/personal. Los
// filtros y el orden de la lista (primero quienes están disponibles para las funciones de destino)
// solo cambian lo que se muestra.

import { api } from './api';
import { esc } from './shared/panelShell';
import {
    alternarDestino,
    disponibleEn,
    etapasPendientes,
    personasVisibles,
    planDeAsignacion,
    sonTodas,
    unirNombres
} from './shared/listaPersonal';
import {
    agruparPorEtapa,
    claveContrato,
    CONTRATO_INFO,
    ETAPA_INFO,
    ETAPAS,
    formatearFecha,
    formatearHora,
    horario,
    TIPOS_CONTRATO,
    type AsignadoDto,
    type ConsultaPersonal,
    type EstadoPersona,
    type Etapa,
    type EventoDto,
    type Motivo,
    type PersonaDto,
    type ResultadoCambio,
    type TipoContrato
} from './shared/etapasPersonal';

export interface OpcionesAsignacion {
    /** Aviso flotante de la página. */
    avisar: (mensaje: string) => void;
    /** Al volver al evento; `huboCambios` indica si hay que refrescar la lista de eventos. */
    alCerrar: (huboCambios: boolean) => void | Promise<void>;
    /** Tras asignar o quitar: la respuesta trae el evento (con su hora de finalización) actualizado. */
    alActualizar?: (respuesta: ResultadoCambio) => void;
    /** Pasar a la pestaña Horarios (el evento todavía no tiene hora de finalización). */
    irAHorarios?: () => void;
}

const ETIQUETA_ESTADO: Record<Exclude<EstadoPersona, 'ASIGNADO'>, string> = {
    DISPONIBLE: 'Disponible',
    CONVOCADO: 'Convocado',
    RECHAZO_WHATSAPP: 'Rechazó',
    NO_DISPONIBLE: 'No disponible',
    SIN_CELULAR: 'Sin celular',
    SIN_COMPROBAR: 'Sin comprobar'
};

/** Máximo de seleccionados con etiqueta en el pie; se muestran menos si no caben enteras (ver ajustarElegidos). */
const ELEGIDOS_MAXIMO = 4;

/** La pestaña Personal del panel del evento; panel-evento.ts la muestra u oculta. */
const panel = document.getElementById('vistaPersonal') as HTMLElement;

let eventoId = 0;
let opciones: OpcionesAsignacion = { avisar: () => undefined, alCerrar: () => undefined };
let datos: ConsultaPersonal | null = null;
let error: string | null = null;
const seleccion = new Set<string>();
/** Funciones de "Asignar a"; las tres = "Todos". Nunca queda vacía. */
let destinos: Etapa[] = [...ETAPAS];
let busqueda = '';
let soloDisponibles = false;
/** '' = todos los contratos. */
let contrato: TipoContrato | '' = '';
/** Cada carga lleva un número: si llega una respuesta vieja (otro evento), se descarta. */
let generacion = 0;
let guardando = false;
let huboCambios = false;
let quitarPendiente: { perfilId: string; etapa: Etapa | null } | null = null;

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const nombreEtapa = (etapa: Etapa): string => ETAPA_INFO[etapa].nombre;
const nombresDestino = (): string => unirNombres(destinos.map(nombreEtapa));
/** El evento tiene hora de finalización: el servidor pudo comprobar la disponibilidad. */
const conHoraFin = (): boolean => !!datos?.evento.horaFin;

/** ¿Se puede elegir a esta persona? Debe faltarle al menos una de las funciones de destino. */
const elegible = (p: PersonaDto): boolean => disponibleEn(p, destinos);

/** "MATEO GOMEZ HERNANDEZ" -> "MG" */
function iniciales(nombre: string): string {
    const palabras = nombre.trim().split(/\s+/).filter(Boolean);
    return palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

/** "JEFFERSON MAGAIDER VARGAS QUINTERO" -> "JEFFERSON MAGAIDER" (para las etiquetas del pie) */
function nombreCorto(nombre: string): string {
    return nombre.trim().split(/\s+/).slice(0, 2).join(' ');
}

const hayFiltros = (): boolean => busqueda.trim() !== '' || soloDisponibles || contrato !== '';

/**
 * Personas que se ven con la búsqueda (nombre o contrato), el tipo de contrato y "solo
 * disponibles"; las disponibles para las funciones de destino primero. Se recalcula en cada
 * pintada, así que quien deja de estar disponible (o vuelve a estarlo) cambia de grupo solo.
 */
function filtrados(): PersonaDto[] {
    return datos ? personasVisibles(datos.personal, { busqueda, contrato, soloDisponibles, destinos }) : [];
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

function htmlColumnas(): string {
    return `
        <section class="asig-col asig-col-personal" id="asigColPersonal" aria-labelledby="asigTituloPersonal">
            <div class="asig-col-head">
                <h3 id="asigTituloPersonal"><i class="fa-solid fa-users" aria-hidden="true"></i> Personal</h3>
                <div class="asig-pastilla asig-conteo" id="asigConteo"></div>
            </div>
            <div class="asig-herramientas">
                <div class="asig-destino">
                    <span class="asig-destino-nombre" id="asigDestinoNombre">Asignar a:</span>
                    <div class="asig-funciones" role="group" aria-labelledby="asigDestinoNombre">
                        <label class="asig-funcion asig-funcion-todos">
                            <input type="checkbox" class="asig-check" data-asig-todos>
                            <span>Todos</span>
                        </label>
                        ${ETAPAS.map((et) => `
                        <label class="asig-funcion">
                            <input type="checkbox" class="asig-check" data-asig-funcion="${et}">
                            <span>${nombreEtapa(et)}</span>
                        </label>`).join('')}
                    </div>
                </div>
                <div class="asig-filtros">
                    <label class="asig-buscar">
                        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                        <input type="search" id="asigBuscar" placeholder="Buscar por nombre, apellido o contrato..." aria-label="Buscar personal por nombre, apellido o contrato" autocomplete="off">
                    </label>
                    <span class="asig-contrato">
                        <select id="asigContrato" aria-label="Tipo de contrato">
                            <option value="">Todos los contratos</option>
                            ${TIPOS_CONTRATO.map((t) => `<option value="${t.valor}">${esc(t.nombre)}</option>`).join('')}
                        </select>
                        <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
                    </span>
                    <label class="asig-sel-visibles">
                        <input type="checkbox" class="asig-check" id="asigSelVisibles">
                        <span>Seleccionar visibles</span>
                    </label>
                </div>
                <p class="asig-instruccion"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                    <span>Selecciona uno o varios empleados para asignarlos.
                    <span class="asig-instruccion-extra">Haz clic en la fila o en la casilla para seleccionar.</span></span></p>
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

/**
 * Disponibilidad para las funciones de destino. Quien ya está en el evento en otra función sale
 * "Disponible" (se le pueden sumar las que le falten); sus funciones actuales se ven debajo del nombre.
 */
function estadoDe(p: PersonaDto): { texto: string; clase: string } {
    if (p.estado === 'ASIGNADO') {
        if (etapasPendientes(p, destinos).length > 0) return { texto: ETIQUETA_ESTADO.DISPONIBLE, clase: 'disponible' };
        return { texto: destinos.length === 1 ? `Ya en ${nombreEtapa(destinos[0])}` : 'Ya asignado', clase: 'en-etapa' };
    }
    return { texto: ETIQUETA_ESTADO[p.estado], clase: p.estado.toLowerCase() };
}

/** Debajo del nombre: las funciones en las que ya está, o que está en el evento sin función. */
function htmlEtapasDe(p: PersonaDto): string {
    if (p.estado !== 'ASIGNADO') return '';
    const etapas = p.etapas ?? [];
    const chips = etapas.length
        ? etapas.map((et) => `<span class="asig-etapa-chip">${nombreEtapa(et)}</span>`).join('')
        : '<span class="asig-evento-chip">En el evento · sin etapa</span>';
    return `<span class="asig-chips">${chips}</span>`;
}

/** Etiqueta del tipo de contrato (verde, azul o morado), a la derecha de la fila. */
function htmlContrato(p: PersonaDto): string {
    const info = CONTRATO_INFO[claveContrato(p.tipoContrato)];
    return `<span class="asig-contrato-tag ${info.clase}"><i class="fa-solid ${info.icono}" aria-hidden="true"></i> ${info.nombre}</span>`;
}

function htmlFila(p: PersonaDto): string {
    const puede = elegible(p);
    const marcada = seleccion.has(p.clave);
    const estado = estadoDe(p);
    // Sin hora de finalización el aviso de arriba ya lo explica: no se repite en cada fila.
    const motivos = p.motivos.filter((m) => m.codigo !== 'SIN_HORA_FIN');
    // La fila se identifica por la clave única de la persona (no por su posición en la lista).
    return `
        <li data-clave="${esc(p.clave)}">
            <label class="asig-fila asig-opcion${puede ? '' : ' bloqueada'}${marcada ? ' marcada' : ''}">
                <input type="checkbox" class="asig-check" value="${esc(p.clave)}" data-asig-persona ${puede ? '' : 'disabled'} ${marcada ? 'checked' : ''}>
                <span class="asig-avatar" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
                <span class="asig-persona">
                    <strong>${esc(p.nombre)}</strong>
                    ${htmlEtapasDe(p)}
                    ${htmlMotivos(motivos)}
                </span>
                <span class="asig-fila-etiquetas">
                    ${htmlContrato(p)}
                    <span class="asig-estado asig-estado-${estado.clase}"><span class="asig-punto" aria-hidden="true"></span>${esc(estado.texto)}</span>
                </span>
            </label>
        </li>`;
}

/** "17 disponibles · 21 en total"; "17 disponibles" alterna mostrar solo a quienes se pueden asignar. */
function htmlConteo(d: ConsultaPersonal): string {
    const total = d.personal.length;
    const icono = '<i class="fa-solid fa-users" aria-hidden="true"></i>';
    if (!conHoraFin()) return `${icono} <span>${total} ${total === 1 ? 'persona' : 'personas'}</span>`;
    const disponibles = d.personal.filter(elegible).length;
    const accion = soloDisponibles ? 'Mostrar a todo el personal' : `Mostrar solo los ${disponibles} disponibles`;
    return `${icono}
        <button type="button" class="asig-conteo-filtro" data-asig-solo-disponibles aria-pressed="${soloDisponibles}"
            title="${esc(accion)}" aria-label="${disponibles} disponibles. ${esc(accion)}">${disponibles} ${disponibles === 1 ? 'disponible' : 'disponibles'}</button>
        <span aria-hidden="true">·</span>
        <span>${total} en total</span>`;
}

function htmlListaVacia(): string {
    const mensaje = busqueda.trim()
        ? `Nadie coincide con «${esc(busqueda.trim())}».`
        : soloDisponibles && contrato === ''
            ? `Nadie está disponible para ${esc(nombresDestino())}.`
            : hayFiltros()
                ? 'Nadie coincide con los filtros elegidos.'
                : 'No hay personal registrado. El personal sale de la nómina activa (menú Empleados).';
    return `<li class="asig-vacio asig-lista-vacia"><i class="fa-regular fa-face-meh" aria-hidden="true"></i>
        ${mensaje}
        ${hayFiltros() ? '<button type="button" class="asig-btn-texto" data-asig-quitar-filtros>Quitar filtros</button>' : ''}</li>`;
}

function renderLista(): void {
    const lista = $('asigLista');
    if (!lista || !datos) return;
    const visibles = filtrados();
    lista.innerHTML = visibles.length ? visibles.map(htmlFila).join('') : htmlListaVacia();
    const conteo = $('asigConteo')!;
    conteo.innerHTML = htmlConteo(datos);
    conteo.classList.toggle('activa', soloDisponibles && conHoraFin());
    renderSeleccionarVisibles(visibles);
}

/** "Seleccionar visibles": marcada si todos los visibles que se pueden elegir ya están elegidos. */
function renderSeleccionarVisibles(visibles = filtrados()): void {
    const casilla = $<HTMLInputElement>('asigSelVisibles');
    if (!casilla) return;
    const elegibles = visibles.filter(elegible);
    const elegidos = elegibles.filter((p) => seleccion.has(p.clave)).length;
    casilla.disabled = elegibles.length === 0;
    casilla.checked = elegibles.length > 0 && elegidos === elegibles.length;
    casilla.indeterminate = elegidos > 0 && elegidos < elegibles.length;
    casilla.closest('label')?.classList.toggle('deshabilitado', casilla.disabled);
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

/**
 * Horario de cada función. Hoy el evento tiene un solo horario (su hora de inicio y su hora de
 * finalización) para las tres funciones: es el que se usa para comprobar los choques.
 */
function htmlHorarioEtapa(e: EventoDto): string {
    const hora = (valor: string | null): string => (valor ? esc(formatearHora(valor)) : 'Por definir');
    return `
        <p class="asig-etapa-horario">
            <span><span class="asig-etapa-rotulo">Hora de inicio:</span> ${hora(e.horaInicio)}</span>
            <span class="asig-etapa-sep" aria-hidden="true">•</span>
            <span><span class="asig-etapa-rotulo">Hora de fin:</span> ${hora(e.horaFin)}</span>
        </p>`;
}

function renderEtapas(): void {
    const contenedor = $('asigEtapas');
    if (!contenedor || !datos) return;
    const asignable = datos.evento.asignable;
    const { porEtapa, sinEtapa } = agruparPorEtapa(datos.asignados);
    // Con funciones concretas en "Asignar a" se resaltan esas; con "Todos" no se resalta ninguna.
    const resaltar = asignable && !sonTodas(destinos);
    const tarjetas = ETAPAS.map((et) => {
        const lista = porEtapa[et];
        const esDestino = resaltar && destinos.includes(et);
        return `
            <section class="asig-etapa${esDestino ? ' destino' : ''}" aria-labelledby="asigEtapa-${et}">
                <div class="asig-etapa-head">
                    <span class="asig-etapa-nombre">
                        <i class="fa-solid ${ETAPA_INFO[et].icono} asig-etapa-icono" aria-hidden="true"></i>
                        <h4 id="asigEtapa-${et}">${nombreEtapa(et)}</h4>
                        <span class="asig-etapa-conteo" aria-label="${lista.length} asignados">${lista.length}</span>
                    </span>
                    ${htmlHorarioEtapa(datos!.evento)}
                </div>
                ${lista.length
                    ? `<ul class="asig-etapa-lista">${lista.map((a) => htmlPersonaEtapa(a, et)).join('')}</ul>`
                    : `<div class="asig-etapa-vacia"><i class="fa-solid fa-users" aria-hidden="true"></i>
                        <p>Aún no hay personal asignado a ${nombreEtapa(et)}.</p></div>`}
            </section>`;
    });
    if (sinEtapa.length > 0) {
        tarjetas.push(`
            <section class="asig-etapa asig-sin-etapa" aria-labelledby="asigEtapa-sin">
                <div class="asig-etapa-head">
                    <span class="asig-etapa-nombre">
                        <i class="fa-regular fa-circle-question asig-etapa-icono" aria-hidden="true"></i>
                        <h4 id="asigEtapa-sin">Sin etapa</h4>
                        <span class="asig-etapa-conteo" aria-label="${sinEtapa.length} sin etapa">${sinEtapa.length}</span>
                    </span>
                </div>
                <p class="asig-ayuda">Personas asignadas sin una etapa. ${asignable ? 'Puedes asignarles una etapa en cualquier momento.' : ''}</p>
                <ul class="asig-etapa-lista">${sinEtapa.map((a) => htmlPersonaEtapa(a, null)).join('')}</ul>
            </section>`);
    }
    contenedor.innerHTML = tarjetas.join('');
    $('asigTotal')!.textContent = `${datos.asignados.length} ${datos.asignados.length === 1 ? 'persona' : 'personas'}`;
}

function elegidosEnOrden(): PersonaDto[] {
    if (!datos) return [];
    const porClave = new Map(datos.personal.map((p) => [p.clave, p]));
    return [...seleccion].map((c) => porClave.get(c)).filter((p): p is PersonaDto => !!p);
}

/** Etiquetas de los primeros `limite` seleccionados y "+N" con los nombres del resto. */
function htmlElegidos(limite = ELEGIDOS_MAXIMO): string {
    const elegidos = elegidosEnOrden();
    if (elegidos.length === 0) return '';
    const visibles = elegidos.slice(0, limite).map((p) => `
        <li class="asig-elegido" title="${esc(p.nombre)}">
            <span class="asig-avatar asig-avatar-mini" aria-hidden="true">${esc(iniciales(p.nombre))}</span>
            <span class="asig-elegido-nombre">${esc(nombreCorto(p.nombre))}</span>
            <button type="button" data-asig-deseleccionar="${esc(p.clave)}" aria-label="Quitar a ${esc(p.nombre)} de la selección">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
        </li>`);
    const resto = elegidos.length - limite;
    if (resto > 0) {
        const nombres = elegidos.slice(limite).map((p) => p.nombre).join(', ');
        visibles.push(`<li class="asig-elegido asig-elegido-mas" title="${esc(nombres)}">+${resto}</li>`);
    }
    return `<ul class="asig-elegidos" aria-label="Personas seleccionadas">${visibles.join('')}</ul>`;
}

/**
 * Deja en el pie solo las etiquetas que caben enteras (con su ×) y resume las demás en "+N", para
 * que el botón de asignar nunca quede tapado. Se mide el espacio real, así sirve con cualquier
 * ancho y zoom.
 */
function ajustarElegidos(acciones: HTMLElement): void {
    let lista = acciones.querySelector<HTMLElement>('.asig-elegidos');
    if (!lista || getComputedStyle(lista).display === 'none') return;
    let limite = Math.min(ELEGIDOS_MAXIMO, seleccion.size);
    while (limite > 1 && lista.scrollWidth > lista.clientWidth + 1) {
        limite -= 1;
        lista.outerHTML = htmlElegidos(limite);
        lista = acciones.querySelector<HTMLElement>('.asig-elegidos');
        if (!lista) return;
    }
}

function renderAcciones(): void {
    const acciones = $('asigAcciones');
    if (!acciones || !datos) return;
    const n = seleccion.size;
    const texto = guardando
        ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando...'
        : '<i class="fa-solid fa-users" aria-hidden="true"></i> Asignar a seleccionados';
    const deshabilitado = guardando || n === 0 || !conHoraFin();
    const ayuda = !conHoraFin()
        ? 'Define primero la hora de finalización en la pestaña Horarios'
        : `Asignar a ${nombresDestino()}`;
    acciones.innerHTML = `
        <span class="asig-seleccion${n === 0 ? ' vacia' : ''}" aria-live="polite">
            <strong class="asig-seleccion-numero">${n}</strong>
            <span class="asig-seleccion-texto">${n === 1 ? 'empleado <br>seleccionado' : 'empleados <br>seleccionados'}</span>
        </span>
        ${htmlElegidos()}
        ${n > 1 ? '<button type="button" class="asig-btn-texto asig-limpiar" data-asig-limpiar title="Quitar toda la selección">Limpiar</button>' : ''}
        <button type="button" class="asig-btn-primario asig-btn-asignar" data-asig-guardar title="${esc(ayuda)}" ${deshabilitado ? 'disabled' : ''}>${texto}</button>`;
    ajustarElegidos(acciones);
}

function renderError(): void {
    const el = $('asigError');
    if (!el) return;
    el.textContent = error ?? '';
    el.hidden = !error;
}

/** "Asignar a": "Todos" marcado equivale a las tres funciones; si no, las funciones elegidas. */
function renderControles(): void {
    const todas = sonTodas(destinos);
    const casillaTodos = panel.querySelector<HTMLInputElement>('[data-asig-todos]');
    if (casillaTodos) casillaTodos.checked = todas;
    panel.querySelectorAll<HTMLInputElement>('[data-asig-funcion]').forEach((c) => {
        c.checked = !todas && destinos.includes(c.dataset.asigFuncion as Etapa);
    });
    const selectContrato = $<HTMLSelectElement>('asigContrato');
    if (selectContrato && selectContrato.value !== contrato) selectContrato.value = contrato;
    selectContrato?.closest('.asig-contrato')?.classList.toggle('activa', contrato !== '');
}

function renderAviso(e: EventoDto): void {
    const aviso = $('asigAviso')!;
    if (e.motivo) {
        aviso.innerHTML = `<p class="asig-aviso"><i class="fa-solid fa-circle-info"></i> ${esc(e.motivo.mensaje)}</p>`;
    } else if (!e.horaFin) {
        aviso.innerHTML = `
            <div class="asig-aviso">
                <i class="fa-regular fa-clock" aria-hidden="true"></i>
                <span>Este evento aún no tiene hora de finalización. Defínela en la pestaña Horarios para comprobar quién está disponible y asignar personal.</span>
                ${opciones.irAHorarios ? '<button type="button" class="asig-btn-texto asig-aviso-accion" data-asig-ir-horarios>Ir a Horarios</button>' : ''}
            </div>`;
    } else {
        aviso.innerHTML = '';
    }
}

/** Pinta todo salvo el campo de búsqueda, para no interrumpir a quien escribe. */
function render(): void {
    if (!datos) return;
    const e = datos.evento;
    const partes = [e.nombre, e.fecha ? formatearFecha(e.fecha) : 'Fecha por definir', horario(e.horaInicio, e.horaFin)];
    if (e.lugar) partes.push(e.lugar);
    $('asigSub')!.textContent = partes.join(' · ');
    $('asigEstadoEvento')!.innerHTML = e.confirmado
        ? '<span class="asig-estado-evento confirmado"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Confirmado</span>'
        : '<span class="asig-estado-evento"><i class="fa-regular fa-circle" aria-hidden="true"></i> Sin confirmar</span>';
    renderAviso(e);

    const cuerpo = $('asigCuerpo')!;
    if (!$('asigColPersonal')) cuerpo.innerHTML = htmlColumnas();
    $('asigColPersonal')!.hidden = !e.asignable;
    cuerpo.classList.toggle('solo-etapas', !e.asignable);

    renderControles();
    renderLista();
    renderEtapas();
    renderAcciones();
    renderError();
}

/** Tras cambiar la selección desde la lista o el pie, sin redibujar la lista entera. */
function renderSeleccion(): void {
    renderSeleccionarVisibles();
    renderAcciones();
}

// ---------- Datos ----------
async function cargar(): Promise<void> {
    const mia = ++generacion;
    try {
        const respuesta = await api<ConsultaPersonal>('GET', `/api/eventos/${eventoId}/personal`);
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

/** Quien ya no se puede elegir (cambiaron las funciones de destino o la disponibilidad) sale de la selección. */
function podarSeleccion(): void {
    if (!datos) return;
    for (const clave of [...seleccion]) {
        const p = datos.personal.find((x) => x.clave === clave);
        if (!p || !elegible(p)) seleccion.delete(clave);
    }
}

/**
 * Asigna la selección a las funciones de destino. El servidor recibe una función por solicitud, así
 * que se envía una por función, cada una solo con quienes todavía no están en ella. La primera es la
 * que agrega a las personas nuevas al evento y el servidor la guarda todo o nada (si alguien choca con
 * otro evento, no se guarda nada); las siguientes solo les suman la función.
 */
async function guardar(): Promise<void> {
    if (!datos || guardando) return;
    const horaFin = datos.evento.horaFin;
    if (!horaFin) {
        error = 'Define la hora de finalización del evento en la pestaña Horarios.';
        renderError();
        return;
    }
    const elegidas = elegidosEnOrden();
    const pasos = planDeAsignacion(elegidas, destinos);
    if (pasos.length === 0) return;

    guardando = true;
    error = null;
    renderError();
    renderAcciones();
    const hechas: Etapa[] = [];
    let ultima: ResultadoCambio | null = null;
    let falla: { etapa: Etapa; mensaje: string } | null = null;
    for (const paso of pasos) {
        try {
            ultima = await api<ResultadoCambio>('POST', `/api/eventos/${eventoId}/personal`, {
                horaFin,
                etapa: paso.etapa,
                personal: paso.claves
            });
            hechas.push(paso.etapa);
        } catch (err) {
            falla = { etapa: paso.etapa, mensaje: (err as Error).message };
            break;
        }
    }
    generacion += 1; // descarta cualquier consulta que siga en camino
    guardando = false;
    if (ultima) {
        datos = ultima;
        huboCambios = true;
        opciones.alActualizar?.(ultima);
    }

    if (!falla) {
        seleccion.clear();
        render();
        const n = elegidas.length;
        opciones.avisar(hechas.length === 1 && ultima
            ? ultima.mensaje
            : `Se ${n === 1 ? 'asignó 1 persona' : `asignaron ${n} personas`} a ${unirNombres(hechas.map(nombreEtapa))}.`);
        return;
    }
    error = hechas.length > 0
        ? `Se asignó a ${unirNombres(hechas.map(nombreEtapa))}, pero no a ${nombreEtapa(falla.etapa)}: ${falla.mensaje}`
        : falla.mensaje;
    podarSeleccion();
    render();
    await cargar(); // la disponibilidad pudo cambiar: se muestra la actual sin borrar el mensaje
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
        opciones.alActualizar?.(respuesta);
        opciones.avisar(respuesta.mensaje);
    } catch (err) {
        error = (err as Error).message;
        render();
    }
}

/** Vacía la pestaña; lo que siga en camino ya no se pinta. panel-evento.ts la usa al cerrar el panel. */
export function cerrarAsignacionPersonal(): void {
    generacion += 1;
    panel.innerHTML = '';
}

function cerrar(): void {
    cerrarAsignacionPersonal();
    void opciones.alCerrar(huboCambios);
}

/** Cambia las funciones de destino y deja ambas columnas en sintonía. */
function elegirDestinos(nuevos: Etapa[]): void {
    destinos = nuevos;
    podarSeleccion();
    renderControles();
    renderLista();
    renderEtapas();
    renderAcciones();
}

function quitarFiltros(): void {
    busqueda = '';
    soloDisponibles = false;
    contrato = '';
    const buscar = $<HTMLInputElement>('asigBuscar');
    if (buscar) buscar.value = '';
    renderControles();
    renderLista();
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
    if (t.closest('[data-asig-ir-horarios]')) {
        opciones.irAHorarios?.();
        return;
    }
    if (t.closest('[data-asig-solo-disponibles]')) {
        soloDisponibles = !soloDisponibles;
        renderLista();
        panel.querySelector<HTMLElement>('[data-asig-solo-disponibles]')?.focus();
        return;
    }
    if (t.closest('[data-asig-quitar-filtros]')) {
        quitarFiltros();
        $('asigBuscar')?.focus();
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
    if (t.matches('[data-asig-todos]')) {
        elegirDestinos([...ETAPAS]);
        return;
    }
    if (t.dataset.asigFuncion) {
        elegirDestinos(alternarDestino(destinos, t.dataset.asigFuncion as Etapa));
        return;
    }
    if (t.id === 'asigContrato') {
        contrato = (t as unknown as HTMLSelectElement).value as TipoContrato | '';
        renderControles();
        renderLista();
        return;
    }
    if (t.id === 'asigSelVisibles') {
        // Actúa solo sobre lo que se ve con los filtros y respeta quién se puede elegir.
        const elegibles = filtrados().filter(elegible);
        for (const p of elegibles) {
            if (t.checked) seleccion.add(p.clave);
            else seleccion.delete(p.clave);
        }
        renderLista();
        renderAcciones();
        return;
    }
    if (!t.matches('[data-asig-persona]')) return;
    if (t.checked) seleccion.add(t.value);
    else seleccion.delete(t.value);
    t.closest('.asig-opcion')?.classList.toggle('marcada', t.checked);
    error = null;
    renderError();
    renderSeleccion();
});

panel.addEventListener('input', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.id !== 'asigBuscar') return;
    busqueda = (t as HTMLInputElement).value;
    renderLista();
});

// Al cambiar el tamaño de la ventana (o el zoom), las etiquetas del pie se vuelven a acomodar.
let redimensionTimer: number | undefined;
window.addEventListener('resize', () => {
    window.clearTimeout(redimensionTimer);
    redimensionTimer = window.setTimeout(() => {
        if (!panel.hidden && datos && seleccion.size > 0) renderAcciones();
    }, 120);
});

/**
 * Otra pestaña guardó la hora de finalización (Horarios): se muestra la respuesta del servidor, que
 * ya trae el personal con su disponibilidad para la hora nueva.
 */
export function actualizarAsignacionPersonal(respuesta: ConsultaPersonal): void {
    if (respuesta.evento.id !== eventoId || !$('asigCuerpo')) return;
    generacion += 1; // descarta cualquier consulta que siga en camino
    datos = respuesta;
    error = null;
    podarSeleccion();
    render();
}

/** Abre la pestaña para un evento y carga su personal. panel-evento.ts la muestra. */
export function abrirAsignacionPersonal(id: number, opts: OpcionesAsignacion): void {
    eventoId = id;
    opciones = opts;
    datos = null;
    error = null;
    guardando = false;
    huboCambios = false;
    quitarPendiente = null;
    destinos = [...ETAPAS];
    busqueda = '';
    soloDisponibles = false;
    contrato = '';
    seleccion.clear();
    panel.innerHTML = esqueleto();
    $('asigTitulo')?.focus();
    void cargar();
}
