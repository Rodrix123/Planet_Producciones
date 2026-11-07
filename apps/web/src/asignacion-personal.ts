// Ventana "Asignar personal" del menú Eventos (historia de usuario 2).
//
// Muestra el evento, el personal ya asignado y todo el personal con su disponibilidad. Las reglas
// (evento confirmado, choques de horario, días no disponibles, duplicados) viven solo en el
// servidor: esta ventana muestra lo que responde GET /api/eventos/:id/personal y, al escribir la
// hora de finalización, vuelve a preguntar con esa hora.

import { api } from './api';
import { esc } from './shared/panelShell';

type EstadoPersona =
    | 'DISPONIBLE'
    | 'ASIGNADO'
    | 'CONVOCADO'
    | 'RECHAZO_WHATSAPP'
    | 'NO_DISPONIBLE'
    | 'SIN_CELULAR'
    | 'SIN_COMPROBAR';

interface Motivo {
    codigo: string;
    mensaje: string;
}

interface EventoDto {
    id: number;
    nombre: string;
    fecha: string | null;
    horaInicio: string | null;
    horaFin: string | null;
    lugar: string | null;
    confirmado: boolean;
    asignable: boolean;
    motivo: Motivo | null;
}

interface AsignadoDto {
    perfilId: string;
    nombre: string;
    origen: 'manual' | 'whatsapp';
    horaInicio: string | null;
    horaFin: string | null;
    puedeQuitarse: boolean;
    motivos: Motivo[];
}

interface PersonaDto {
    clave: string;
    nombre: string;
    detalle: string;
    estado: EstadoPersona;
    seleccionable: boolean;
    motivos: Motivo[];
}

interface ConsultaPersonal {
    evento: EventoDto;
    horaFinEvaluada: string | null;
    terminaAlDiaSiguiente: boolean;
    asignados: AsignadoDto[];
    personal: PersonaDto[];
}

interface ResultadoCambio extends ConsultaPersonal {
    mensaje: string;
}

export interface OpcionesAsignacion {
    /** Aviso flotante de la página. */
    avisar: (mensaje: string) => void;
    /** Se llama después de guardar o quitar, para refrescar la lista de eventos. */
    alCambiar: () => Promise<void> | void;
}

const ETIQUETA_ESTADO: Record<EstadoPersona, string> = {
    DISPONIBLE: 'Disponible',
    ASIGNADO: 'Asignado',
    CONVOCADO: 'Convocado',
    RECHAZO_WHATSAPP: 'Rechazó',
    NO_DISPONIBLE: 'No disponible',
    SIN_CELULAR: 'Sin celular',
    SIN_COMPROBAR: 'Sin comprobar'
};

const ESPERA_HORA_MS = 400;

const dialogo = document.getElementById('dlgAsignacion') as HTMLDialogElement;

let eventoId = 0;
let opciones: OpcionesAsignacion = { avisar: () => undefined, alCambiar: () => undefined };
let datos: ConsultaPersonal | null = null;
let error: string | null = null;
const seleccion = new Set<string>();
/** Cada carga lleva un número: si llega una respuesta vieja (otra hora, otro evento), se descarta. */
let generacion = 0;
let guardando = false;
let quitarPendiente: string | null = null;
let horaTimer: number | undefined;

// ---------- Formato ----------
function formatearHora(hora: string): string {
    const [h = '0', m = '0'] = hora.split(':');
    return new Date(2000, 0, 1, Number(h), Number(m)).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

function formatearFecha(iso: string): string {
    const texto = new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function horario(inicio: string | null, fin: string | null): string {
    if (!inicio) return 'Hora por definir';
    return fin ? `${formatearHora(inicio)} – ${formatearHora(fin)}` : `Desde ${formatearHora(inicio)}`;
}

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const inputHora = (): HTMLInputElement | null => $('asigHoraFin');

// ---------- Render ----------
function esqueleto(): string {
    return `
        <div class="modal-card asig-card">
            <div class="asig-head">
                <div>
                    <h2 id="asigTitulo">Asignar personal</h2>
                    <p class="asig-sub" id="asigSub"></p>
                </div>
                <button type="button" class="modal-cerrar" data-asig-cerrar aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div id="asigCuerpo" class="asig-cuerpo"></div>
            <p class="form-error asig-error" id="asigError" role="alert" hidden></p>
            <div class="modal-acciones asig-acciones" id="asigAcciones"></div>
        </div>`;
}

function renderCargando(): void {
    $('asigCuerpo')!.innerHTML = '<p class="asig-estado-carga"><i class="fa-solid fa-spinner fa-spin"></i> Cargando personal...</p>';
    $('asigAcciones')!.innerHTML = '<button type="button" class="btn-secundario" data-asig-cerrar>Cerrar</button>';
}

function renderErrorDeCarga(mensaje: string): void {
    $('asigCuerpo')!.innerHTML = `
        <p class="asig-aviso asig-aviso-error"><i class="fa-solid fa-triangle-exclamation"></i> No se pudo cargar el personal: ${esc(mensaje)}</p>`;
    $('asigAcciones')!.innerHTML = `
        <button type="button" class="btn-secundario" data-asig-cerrar>Cerrar</button>
        <button type="button" class="asig-btn-primario" data-asig-reintentar>Reintentar</button>`;
}

function htmlResumen(d: ConsultaPersonal): string {
    const e = d.evento;
    const partes = [e.fecha ? formatearFecha(e.fecha) : 'Fecha por definir', horario(e.horaInicio, d.horaFinEvaluada)];
    if (e.lugar) partes.push(e.lugar);
    const estado = e.confirmado
        ? '<span class="badge on"><i class="fa-solid fa-circle-check"></i> Confirmado</span>'
        : '<span class="badge"><i class="fa-solid fa-circle-check"></i> Sin confirmar</span>';
    const motivo = e.motivo
        ? `<p class="asig-aviso"><i class="fa-solid fa-circle-info"></i> ${esc(e.motivo.mensaje)}</p>`
        : '';
    return `
        <div class="asig-resumen">
            <div class="asig-resumen-datos">
                <strong>${esc(e.nombre)}</strong>
                <span>${partes.map(esc).join(' · ')}</span>
            </div>
            ${estado}
        </div>
        ${motivo}`;
}

function htmlHorario(d: ConsultaPersonal): string {
    const inicio = d.evento.horaInicio ? formatearHora(d.evento.horaInicio) : '—';
    return `
        <div class="asig-horario">
            <label for="asigHoraFin">Hora de finalización</label>
            <div class="asig-horario-fila">
                <input type="time" id="asigHoraFin" value="${esc(d.evento.horaFin ?? '')}" required aria-describedby="asigHoraAyuda">
                <span class="asig-inicio">Inicio: ${esc(inicio)}</span>
            </div>
            <p class="field-hint" id="asigHoraAyuda"></p>
        </div>`;
}

function textoAyudaHora(d: ConsultaPersonal): string {
    if (!d.horaFinEvaluada) return 'Hora en que se libera al personal. Escríbela para comprobar quién está disponible.';
    const base = 'Hora en que se libera al personal.';
    return d.terminaAlDiaSiguiente ? `${base} <strong>El evento termina al día siguiente.</strong>` : base;
}

function htmlMotivos(motivos: Motivo[], clase = 'asig-motivo'): string {
    return motivos.map((m) => `<small class="${clase}">${esc(m.mensaje)}</small>`).join('');
}

function htmlAsignados(d: ConsultaPersonal): string {
    const filas = d.asignados.map((a) => {
        const origen = a.origen === 'whatsapp' ? 'Confirmó por WhatsApp' : 'Asignado aquí';
        const accion = !a.puedeQuitarse
            ? ''
            : quitarPendiente === a.perfilId
                ? `<span class="asig-confirmar">
                       <button type="button" class="asig-btn-peligro" data-asig-quitar-si="${esc(a.perfilId)}">Quitar</button>
                       <button type="button" class="btn-secundario" data-asig-quitar-no>No</button>
                   </span>`
                : `<button type="button" class="btn-secundario asig-btn-quitar" data-asig-quitar="${esc(a.perfilId)}"
                       aria-label="Quitar a ${esc(a.nombre)} del evento">Quitar</button>`;
        return `
            <li class="asig-fila">
                <span class="asig-persona">
                    <strong>${esc(a.nombre)}</strong>
                    <small>${esc(horario(a.horaInicio, a.horaFin))} · ${origen}</small>
                    ${htmlMotivos(a.motivos, 'asig-motivo asig-motivo-alerta')}
                </span>
                ${accion}
            </li>`;
    });
    return `
        <section class="asig-seccion" aria-labelledby="asigTituloAsignados">
            <h3 id="asigTituloAsignados">Asignados <span class="asig-conteo">${d.asignados.length}</span></h3>
            ${filas.length ? `<ul class="asig-lista">${filas.join('')}</ul>` : '<p class="asig-vacio">Todavía no hay personal asignado.</p>'}
        </section>`;
}

function htmlPersonal(d: ConsultaPersonal): string {
    const candidatos = d.personal.filter((p) => p.estado !== 'ASIGNADO');
    const disponibles = candidatos.filter((p) => p.seleccionable).length;
    const filas = candidatos.map((p) => `
        <li>
            <label class="asig-fila asig-opcion${p.seleccionable ? '' : ' bloqueada'}">
                <input type="checkbox" value="${esc(p.clave)}" data-asig-persona
                    ${p.seleccionable ? '' : 'disabled'} ${seleccion.has(p.clave) ? 'checked' : ''}>
                <span class="asig-persona">
                    <strong>${esc(p.nombre)}</strong>
                    <small>${esc(p.detalle)}</small>
                    ${htmlMotivos(p.motivos)}
                </span>
                <span class="asig-estado asig-estado-${p.estado.toLowerCase()}">${ETIQUETA_ESTADO[p.estado]}</span>
            </label>
        </li>`);
    const resumen = d.horaFinEvaluada ? `${disponibles} disponibles de ${candidatos.length}` : `${candidatos.length} personas`;
    return `
        <section class="asig-seccion" aria-labelledby="asigTituloPersonal">
            <h3 id="asigTituloPersonal">Personal <span class="asig-conteo">${resumen}</span></h3>
            ${filas.length
                ? `<ul class="asig-lista asig-lista-personal">${filas.join('')}</ul>`
                : '<p class="asig-vacio">No hay más personal para asignar. El personal sale de la nómina activa (menú Empleados).</p>'}
        </section>`;
}

function horaEscrita(): string {
    return inputHora()?.value ?? '';
}

function renderAcciones(): void {
    const acciones = $('asigAcciones');
    if (!acciones || !datos) return;
    if (!datos.evento.asignable) {
        acciones.innerHTML = '<button type="button" class="btn-secundario" data-asig-cerrar>Cerrar</button>';
        return;
    }
    const hora = horaEscrita();
    const cambiaHora = hora !== '' && hora !== (datos.evento.horaFin ?? '');
    const n = seleccion.size;
    const texto = guardando
        ? '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'
        : n > 0 ? `Asignar ${n === 1 ? '1 persona' : `${n} personas`}` : cambiaHora ? 'Guardar hora' : 'Asignar';
    acciones.innerHTML = `
        <button type="button" class="btn-secundario" data-asig-cerrar>Cancelar</button>
        <button type="button" class="asig-btn-primario" data-asig-guardar ${guardando || hora === '' || (n === 0 && !cambiaHora) ? 'disabled' : ''}>${texto}</button>`;
}

function renderError(): void {
    const el = $('asigError');
    if (!el) return;
    el.textContent = error ?? '';
    el.hidden = !error;
}

/** Pinta todo salvo el campo de hora, para no interrumpir a quien está escribiendo. */
function render(): void {
    if (!datos) return;
    const d = datos;
    $('asigSub')!.textContent = d.evento.asignable ? 'Elige a quién asignar a este evento.' : 'Personal del evento.';
    const cuerpo = $('asigCuerpo')!;
    if (!cuerpo.querySelector('[data-asig-resumen]')) {
        cuerpo.innerHTML = `
            <div data-asig-resumen></div>
            ${d.evento.asignable ? htmlHorario(d) : ''}
            <div data-asig-asignados></div>
            <div data-asig-personal></div>`;
    }
    cuerpo.querySelector('[data-asig-resumen]')!.innerHTML = htmlResumen(d);
    cuerpo.querySelector('[data-asig-asignados]')!.innerHTML = htmlAsignados(d);
    cuerpo.querySelector('[data-asig-personal]')!.innerHTML = d.evento.asignable ? htmlPersonal(d) : '';
    const ayuda = $('asigHoraAyuda');
    if (ayuda) ayuda.innerHTML = textoAyudaHora(d);
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
        // Quien dejó de estar disponible con la nueva hora sale de la selección.
        for (const clave of [...seleccion]) {
            if (!respuesta.personal.some((p) => p.clave === clave && p.seleccionable)) seleccion.delete(clave);
        }
        render();
    } catch (err) {
        if (mia !== generacion) return;
        if (datos) {
            error = (err as Error).message;
            renderError();
        } else {
            renderErrorDeCarga((err as Error).message);
        }
    }
}

async function guardar(): Promise<void> {
    const horaFin = horaEscrita();
    if (!horaFin) {
        error = 'Indica la hora de finalización del evento.';
        renderError();
        inputHora()?.focus();
        return;
    }
    guardando = true;
    error = null;
    renderError();
    renderAcciones();
    try {
        const respuesta = await api<ResultadoCambio>('POST', `/api/eventos/${eventoId}/personal`, {
            horaFin,
            personal: [...seleccion]
        });
        generacion += 1; // descarta cualquier consulta de disponibilidad que siga en camino
        datos = respuesta;
        seleccion.clear();
        guardando = false;
        render();
        opciones.avisar(respuesta.mensaje);
        await opciones.alCambiar();
    } catch (err) {
        guardando = false;
        error = (err as Error).message;
        renderError();
        renderAcciones();
        await cargar(horaFin); // la disponibilidad pudo cambiar: se muestra la actual sin borrar el mensaje
    }
}

async function quitar(perfilId: string): Promise<void> {
    quitarPendiente = null;
    error = null;
    renderError();
    try {
        const respuesta = await api<ResultadoCambio>('DELETE', `/api/eventos/${eventoId}/personal/${encodeURIComponent(perfilId)}`);
        generacion += 1;
        datos = respuesta;
        render();
        opciones.avisar(respuesta.mensaje);
        await opciones.alCambiar();
    } catch (err) {
        error = (err as Error).message;
        render();
    }
}

// ---------- Eventos de la ventana ----------
dialogo.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (t === dialogo || t.closest('[data-asig-cerrar]')) {
        dialogo.close();
        return;
    }
    if (t.closest('[data-asig-reintentar]')) {
        renderCargando();
        void cargar();
        return;
    }
    if (t.closest('[data-asig-guardar]')) {
        void guardar();
        return;
    }
    const quitarBtn = t.closest<HTMLElement>('[data-asig-quitar]');
    if (quitarBtn) {
        quitarPendiente = quitarBtn.dataset.asigQuitar ?? null;
        render();
        dialogo.querySelector<HTMLElement>('[data-asig-quitar-si]')?.focus();
        return;
    }
    const quitarSi = t.closest<HTMLElement>('[data-asig-quitar-si]');
    if (quitarSi?.dataset.asigQuitarSi) {
        void quitar(quitarSi.dataset.asigQuitarSi);
        return;
    }
    if (t.closest('[data-asig-quitar-no]')) {
        quitarPendiente = null;
        render();
    }
});

dialogo.addEventListener('change', (ev) => {
    const t = ev.target as HTMLInputElement;
    if (!t.matches('[data-asig-persona]')) return;
    if (t.checked) seleccion.add(t.value);
    else seleccion.delete(t.value);
    error = null;
    renderError();
    renderAcciones();
});

dialogo.addEventListener('input', (ev) => {
    if ((ev.target as HTMLElement).id !== 'asigHoraFin') return;
    error = null;
    renderError();
    renderAcciones();
    window.clearTimeout(horaTimer);
    horaTimer = window.setTimeout(() => void cargar(horaEscrita() || undefined), ESPERA_HORA_MS);
});

dialogo.addEventListener('close', () => {
    generacion += 1; // lo que siga en camino ya no se pinta
    window.clearTimeout(horaTimer);
    quitarPendiente = null;
});

/** Abre la ventana para un evento y carga su personal. */
export function abrirAsignacionPersonal(id: number, opts: OpcionesAsignacion): void {
    eventoId = id;
    opciones = opts;
    datos = null;
    error = null;
    guardando = false;
    quitarPendiente = null;
    seleccion.clear();
    dialogo.innerHTML = esqueleto();
    renderCargando();
    if (!dialogo.open) dialogo.showModal();
    void cargar();
}
