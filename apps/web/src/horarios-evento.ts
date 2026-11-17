// Pestaña Horarios del panel del evento (panel-evento.ts).
//
// Define la hora de inicio y de finalización del evento para uno, dos o los tres tipos de actividad
// (Carga, Organización y Desmonte), con ajustes rápidos y un resumen que cambia al instante. Los
// cálculos (duración, medianoche, ajustes y qué se puede guardar) están en shared/horarioEvento.ts.
//
// Guardado: hoy la base tiene un solo horario por evento (su hora de inicio y events.hora_fin), el
// mismo para los tres tipos. "Guardar y confirmar" guarda la hora de finalización con el endpoint
// que ya usa la pestaña Personal (POST /api/eventos/:id/personal, sin personas), así que el servidor
// aplica sus mismas reglas (evento confirmado, plazo de 12 horas, choques del personal ya asignado),
// y luego pasa a la pestaña Personal, como antes.
// Un horario solo para algunos tipos, o con otra hora de inicio, todavía no tiene dónde guardarse en
// la base: queda como borrador en el navegador (shared/borradorHorario.ts).

import './horarios-evento.css';
import { api } from './api';
import { esc } from './shared/panelShell';
import { datosDelEvento, htmlEncabezadoEvento, htmlEstadoEvento } from './shared/encabezadoEvento';
import {
    ETAPA_INFO,
    ETAPAS,
    formatearFecha,
    type ConsultaPersonal,
    type Etapa,
    type EventoDto,
    type ResultadoCambio
} from './shared/etapasPersonal';
import {
    a12Horas,
    AJUSTES_HORAS,
    AJUSTES_MINUTOS,
    ajustarDuracion,
    alternarEtapa,
    alternarTodas,
    aMinutos,
    cambiarFin,
    cambiarInicio,
    de12Horas,
    duracion,
    estadoDeTodas,
    estadosDeAsignacion,
    etiquetaAjuste,
    evaluarGuardado,
    fechaDeFin,
    formatearDuracion,
    formatearFechaCorta,
    formatearHora12,
    mismoHorario,
    nombreDelTipo,
    terminaAlDiaSiguiente,
    todasLasEtapas,
    DURACION_MAXIMA,
    type Horario,
    type Periodo
} from './shared/horarioEvento';
import { borrarBorradorHorario, formatearGuardadoEn, guardarBorradorHorario, leerBorradorHorario } from './shared/borradorHorario';

export interface OpcionesHorarios {
    /** Aviso flotante de la página. */
    avisar: (mensaje: string) => void;
    /** "Cancelar": cerrar el panel sin guardar ("Volver al evento" lo atiende panel-evento.ts). */
    alCancelar: () => void;
    /** Se cargó el evento o cambiaron sus datos. */
    alCargarEvento: (evento: EventoDto) => void;
    /** Se guardó en el servidor: la respuesta trae el evento y su personal ya actualizados. */
    alGuardar: (respuesta: ResultadoCambio) => void;
    /** Después de "Guardar y confirmar": pasar a la pestaña Personal. */
    alContinuar: () => void;
}

type Cual = 'inicio' | 'fin';
type Modo = 'extender' | 'quitar';

const MINUTOS_EN_LISTA = Array.from({ length: 12 }, (_, i) => i * 5);
const ID: Record<Cual, { hora: string; minuto: string; nombre: string }> = {
    inicio: { hora: 'horInicioHora', minuto: 'horInicioMinuto', nombre: 'Hora de inicio' },
    fin: { hora: 'horFinHora', minuto: 'horFinMinuto', nombre: 'Hora de finalización' }
};

const raiz = document.getElementById('vistaHorarios') as HTMLElement;

let eventoId = 0;
let opciones: OpcionesHorarios = {
    avisar: () => undefined,
    alCancelar: () => undefined,
    alCargarEvento: () => undefined,
    alGuardar: () => undefined,
    alContinuar: () => undefined
};
let evento: EventoDto | null = null;
/** Horario que el evento tiene guardado en el servidor. */
let guardado: Horario = { inicio: null, fin: null };
/** Horario que se está editando. */
let horario: Horario = { inicio: null, fin: null };
let etapas: Etapa[] = [...ETAPAS];
let modo: Modo = 'extender';
/** La hora de inicio del evento está bloqueada hasta pulsar "Cambiar". */
let editandoInicio = false;
let guardando = false;
let error: string | null = null;
/** Cuándo se guardó el borrador que se está mostrando (null = no hay borrador). */
let borradorGuardadoEn: string | null = null;
/** Cada carga y cada guardado llevan un número: lo que llegue de un evento anterior se descarta. */
let generacion = 0;

const $ = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const referenciaDe = (e: EventoDto): Horario => ({ inicio: aMinutos(e.horaInicio), fin: aMinutos(e.horaFin) });
const hayCambios = (): boolean => !mismoHorario(horario, guardado) || !todasLasEtapas(etapas);
const textoPeriodo = (periodo: Periodo): string => (periodo === 'am' ? 'a. m.' : 'p. m.');

// ---------- Estructura ----------
function esqueleto(): string {
    return `
        ${htmlEncabezadoEvento({ idTitulo: 'horTitulo', idSub: 'horSub', titulo: 'Definir horarios', icono: 'fa-regular fa-calendar', evento: null })}
        <div id="horAviso"></div>
        <div class="hor-contenido" id="horContenido">
            <p class="asig-estado-carga"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Cargando horario...</p>
        </div>`;
}

function htmlOpciones(valores: number[], texto: (v: number) => string): string {
    return `<option value="" hidden>--</option>${valores.map((v) => `<option value="${v}">${texto(v)}</option>`).join('')}`;
}

function htmlSelect(id: string, etiqueta: string, valores: number[], texto: (v: number) => string): string {
    return `
        <span class="hor-select">
            <select id="${id}" aria-label="${esc(etiqueta)}">${htmlOpciones(valores, texto)}</select>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </span>`;
}

/** Hora, minutos y a. m./p. m. de la hora de inicio o de finalización. */
function htmlControlesHora(cual: Cual, periodoInicial: Periodo): string {
    const { hora, minuto, nombre } = ID[cual];
    return `
        ${htmlSelect(hora, `${nombre}: hora`, Array.from({ length: 12 }, (_, i) => i + 1), String)}
        <span class="hor-dos-puntos" aria-hidden="true">:</span>
        ${htmlSelect(minuto, `${nombre}: minutos`, MINUTOS_EN_LISTA, (m) => String(m).padStart(2, '0'))}
        <button type="button" class="hor-periodo" data-hor-periodo="${cual}" data-periodo="${periodoInicial}">${textoPeriodo(periodoInicial)}</button>`;
}

function htmlBotonAjuste(minutos: number): string {
    return `<button type="button" class="hor-ajuste" data-hor-ajuste="${minutos}">${etiquetaAjuste(minutos)}</button>`;
}

function htmlFormulario(e: EventoDto): string {
    // Sin hora, el a. m./p. m. arranca en el del inicio (o p. m.), para que lo que se ve sea lo que se elige.
    const periodoInicio: Periodo = horario.inicio === null ? 'pm' : a12Horas(horario.inicio).periodo;
    return `
        <div class="hor-cuerpo">
            <section class="hor-card hor-config" aria-labelledby="horTituloConfig">
                <div class="hor-card-head">
                    <span class="hor-icono-grande" aria-hidden="true"><i class="fa-regular fa-clock"></i></span>
                    <div>
                        <h3 id="horTituloConfig">Horario del evento</h3>
                        <p>Define la hora de inicio y de finalización para uno o varios tipos de actividad del evento. Este horario se usa para coordinar al personal y las actividades.</p>
                    </div>
                </div>

                <div class="hor-fila">
                    <span class="hor-etiqueta" id="horEtiquetaTipos"><i class="fa-solid fa-user-group" aria-hidden="true"></i> Asignar a:</span>
                    <div class="hor-tipos">
                        <div class="hor-chips" role="group" aria-labelledby="horEtiquetaTipos">
                            <button type="button" class="hor-chip hor-chip-todos" data-hor-todos aria-pressed="false">
                                <i class="fa-solid fa-layer-group" aria-hidden="true"></i> Todos</button>
                            <span class="hor-chips-divisor" aria-hidden="true"></span>
                            ${ETAPAS.map((et) => `
                            <button type="button" class="hor-chip" data-hor-etapa="${et}" aria-pressed="false">
                                <i class="fa-solid ${ETAPA_INFO[et].icono}" aria-hidden="true"></i> ${ETAPA_INFO[et].nombre}
                                <i class="fa-solid fa-check hor-chip-marca" aria-hidden="true"></i></button>`).join('')}
                        </div>
                        <p class="hor-nota"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                            Selección múltiple: puedes aplicar el horario a uno, dos o a los tres tipos de actividad.</p>
                    </div>
                </div>

                <div class="hor-fila">
                    <span class="hor-etiqueta"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Fecha del evento</span>
                    <div class="hor-fecha">
                        <span>${e.fecha ? esc(formatearFecha(e.fecha)) : 'Fecha por definir'}</span>
                        <span class="hor-fecha-nota"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Fecha fija del evento</span>
                    </div>
                </div>

                <div class="hor-horas">
                    <fieldset class="hor-hora">
                        <legend class="hor-etiqueta"><i class="fa-regular fa-clock" aria-hidden="true"></i> Hora de inicio</legend>
                        <div class="hor-controles">
                            ${htmlControlesHora('inicio', periodoInicio)}
                            <button type="button" class="hor-btn-sec hor-cambiar" data-hor-cambiar-inicio></button>
                        </div>
                        <p class="hor-ayuda" id="horInicioAyuda"></p>
                    </fieldset>
                    <span class="hor-divisor-v" aria-hidden="true"></span>
                    <fieldset class="hor-hora">
                        <legend class="hor-etiqueta"><i class="fa-regular fa-flag" aria-hidden="true"></i> Hora de finalización</legend>
                        <div class="hor-controles">
                            ${htmlControlesHora('fin', periodoInicio)}
                            <span class="hor-fecha-fin" id="horFechaFin"></span>
                        </div>
                        <p class="hor-ayuda" id="horFinAyuda"></p>
                    </fieldset>
                </div>

                <div class="hor-total">
                    <span class="hor-total-icono" aria-hidden="true"><i class="fa-solid fa-hourglass-half"></i></span>
                    <span class="hor-total-divisor" aria-hidden="true"></span>
                    <p class="hor-total-dato">Tipo: <span class="hor-tipo" data-hor-tipo></span></p>
                    <span class="hor-total-divisor" aria-hidden="true"></span>
                    <p class="hor-total-dato" id="horTotalDuracion"></p>
                    <span class="hor-total-ilustracion" aria-hidden="true">
                        <i class="fa-regular fa-calendar-days"></i>
                        <i class="fa-regular fa-clock hor-total-reloj"></i>
                    </span>
                </div>

                <details class="hor-plegable">
                    <summary>
                        <i class="fa-solid fa-sliders" aria-hidden="true"></i>
                        <span id="horEtiquetaAjuste">Ajustar tiempo desde el inicio</span>
                        <i class="fa-solid fa-chevron-down hor-plegable-flecha" aria-hidden="true"></i>
                    </summary>
                    <div class="hor-plegable-cuerpo">
                        <div class="asig-segmentos hor-modo" role="group" aria-labelledby="horEtiquetaAjuste">
                            <button type="button" class="asig-segmento" data-hor-modo="extender" aria-pressed="true">
                                <i class="fa-solid fa-arrow-up" aria-hidden="true"></i> Extender</button>
                            <button type="button" class="asig-segmento" data-hor-modo="quitar" aria-pressed="false">
                                <i class="fa-solid fa-arrow-down" aria-hidden="true"></i> Quitar</button>
                        </div>
                        <div class="hor-ajustes">
                            <span class="hor-ajustes-nombre">Ajustar por minutos</span>
                            <div class="hor-ajustes-botones">${AJUSTES_MINUTOS.map(htmlBotonAjuste).join('')}</div>
                            <span class="hor-ajustes-nombre">Ajustar por horas</span>
                            <div class="hor-ajustes-botones">${AJUSTES_HORAS.map(htmlBotonAjuste).join('')}</div>
                        </div>
                    </div>
                </details>
            </section>

            <aside class="hor-card hor-resumen" aria-labelledby="horTituloResumen">
                <div class="hor-resumen-head">
                    <i class="fa-regular fa-calendar-check" aria-hidden="true"></i>
                    <h3 id="horTituloResumen">Resumen del horario</h3>
                    <span class="hor-resumen-divisor" aria-hidden="true"></span>
                    <span class="hor-tipo" data-hor-tipo></span>
                </div>
                <dl class="hor-resumen-lista">
                    <div><dt><i class="fa-regular fa-circle-play" aria-hidden="true"></i> Inicio</dt><dd id="horResumenInicio"></dd></div>
                    <div><dt><i class="fa-regular fa-flag" aria-hidden="true"></i> Finalización</dt><dd id="horResumenFin"></dd></div>
                    <div><dt><i class="fa-regular fa-hourglass-half" aria-hidden="true"></i> Duración estimada</dt><dd id="horResumenDuracion" aria-live="polite"></dd></div>
                </dl>
                <section class="hor-bloque" aria-labelledby="horTituloGeneral">
                    <h4 id="horTituloGeneral"><i class="fa-regular fa-calendar-days" aria-hidden="true"></i> Horario general del evento</h4>
                    <p class="hor-general"><strong>Desde:</strong> <span id="horGeneralDesde"></span></p>
                    <p class="hor-general"><strong>Hasta:</strong> <span id="horGeneralHasta"></span></p>
                    <p class="hor-nota"><i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                        En la pestaña Personal, la disponibilidad de cada persona se revisa con el horario general del evento.</p>
                </section>
                <section class="hor-bloque hor-asignacion" aria-labelledby="horTituloAsignacion">
                    <h4 id="horTituloAsignacion"><i class="fa-solid fa-list-ul" aria-hidden="true"></i> Estado de asignación de horarios</h4>
                    <ul id="horAsignacion"></ul>
                </section>
            </aside>
        </div>

        <div class="hor-pie">
            <div class="hor-pie-estado">
                <p class="hor-estado" id="horEstadoGuardado"></p>
                <p class="hor-borrador" id="horBorrador" hidden></p>
                <p class="form-error hor-error" id="horError" role="alert" hidden></p>
            </div>
            <div class="hor-pie-botones">
                <button type="button" class="hor-btn-sec" data-hor-cancelar>Cancelar</button>
                <button type="button" class="hor-btn-sec" data-hor-borrador><i class="fa-regular fa-floppy-disk" aria-hidden="true"></i> Guardar borrador</button>
                <button type="button" class="asig-btn-primario hor-btn-guardar" data-hor-guardar></button>
            </div>
        </div>`;
}

// ---------- Pintar lo que cambia ----------
/** Pone en los controles una hora; sin hora deja lo que haya (puede haber una elección a medias). */
function pintarHora(cual: Cual, minutos: number | null, habilitada: boolean): void {
    const hora = $<HTMLSelectElement>(ID[cual].hora);
    const minuto = $<HTMLSelectElement>(ID[cual].minuto);
    const periodo = raiz.querySelector<HTMLButtonElement>(`[data-hor-periodo="${cual}"]`);
    if (!hora || !minuto || !periodo) return;
    hora.disabled = minuto.disabled = periodo.disabled = !habilitada;
    if (minutos !== null) {
        const h = a12Horas(minutos);
        // Una hora guardada con minutos fuera de la lista (p. ej. 21:07) también se puede mostrar.
        if (!minuto.querySelector(`option[value="${h.minuto}"]`)) {
            minuto.insertAdjacentHTML('beforeend', `<option value="${h.minuto}">${String(h.minuto).padStart(2, '0')}</option>`);
        }
        hora.value = String(h.hora);
        minuto.value = String(h.minuto);
        periodo.dataset.periodo = h.periodo;
    }
    const actual = periodo.dataset.periodo as Periodo;
    periodo.textContent = textoPeriodo(actual);
    periodo.setAttribute('aria-label', `${ID[cual].nombre}: ${textoPeriodo(actual)}. Cambiar a ${textoPeriodo(actual === 'am' ? 'pm' : 'am')}`);
}

function htmlFechaYHora(fecha: string | null, minutos: number | null): string {
    if (minutos === null) return '<span class="hor-por-definir">Por definir</span>';
    return `${fecha ? `<span>${esc(formatearFecha(fecha))}</span>` : ''}<strong>${formatearHora12(minutos)}</strong>`;
}

/** "Domingo, 29 de noviembre de 2026, 8:08 a. m." (horario general del evento). */
function htmlMomento(fecha: string | null, minutos: number | null): string {
    if (minutos === null) return '<span class="hor-por-definir">Por definir</span>';
    return `${fecha ? `${esc(formatearFecha(fecha))}, ` : ''}<strong>${formatearHora12(minutos)}</strong>`;
}

/** Lo que el evento tiene guardado en el servidor: su horario general y el estado de cada tipo de actividad. */
function pintarRegistrado(fecha: string | null): void {
    $('horGeneralDesde')!.innerHTML = htmlMomento(fecha, guardado.inicio);
    $('horGeneralHasta')!.innerHTML = htmlMomento(fecha ? fechaDeFin(fecha, guardado) : null, guardado.fin);
    $('horAsignacion')!.innerHTML = estadosDeAsignacion(guardado)
        .map(({ etapa, estado }) => `
            <li>
                <span class="hor-asig-tipo"><i class="fa-solid ${ETAPA_INFO[etapa].icono}" aria-hidden="true"></i> ${ETAPA_INFO[etapa].nombre}</span>
                ${estado === 'asignado'
                    ? '<span class="hor-asig-estado asignado"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Asignado</span>'
                    : '<span class="hor-asig-estado"><i class="fa-regular fa-circle" aria-hidden="true"></i> Sin asignar</span>'}
            </li>`)
        .join('');
}

function textoAjuste(minutos: number): string {
    const horas = minutos / 60;
    return Number.isInteger(horas) ? `${horas} ${horas === 1 ? 'hora' : 'horas'}` : `${minutos} minutos`;
}

function pintar(): void {
    if (!evento || !$('horContenido')?.querySelector('.hor-cuerpo')) return;
    const soloLectura = !evento.asignable;
    const fecha = evento.fecha;

    // Tipos de actividad
    raiz.querySelector('[data-hor-todos]')?.setAttribute('aria-pressed', estadoDeTodas(etapas));
    raiz.querySelectorAll<HTMLButtonElement>('[data-hor-todos], [data-hor-etapa]').forEach((b) => {
        b.disabled = soloLectura;
        if (b.dataset.horEtapa) b.setAttribute('aria-pressed', String(etapas.includes(b.dataset.horEtapa as Etapa)));
    });

    // Hora de inicio: la del evento queda bloqueada hasta pulsar "Cambiar" (si no tiene, se elige directamente).
    const inicioLibre = editandoInicio || guardado.inicio === null;
    pintarHora('inicio', horario.inicio, !soloLectura && inicioLibre);
    const cambiar = raiz.querySelector<HTMLButtonElement>('[data-hor-cambiar-inicio]');
    if (cambiar) {
        cambiar.hidden = guardado.inicio === null;
        cambiar.disabled = soloLectura;
        cambiar.innerHTML = editandoInicio
            ? '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restablecer'
            : '<i class="fa-solid fa-pen" aria-hidden="true"></i> Cambiar';
        cambiar.setAttribute('aria-label', editandoInicio ? 'Volver a la hora de inicio del evento' : 'Cambiar la hora de inicio');
    }
    const ayudaInicio = $('horInicioAyuda');
    if (ayudaInicio) {
        ayudaInicio.textContent =
            guardado.inicio !== null && horario.inicio !== guardado.inicio
                ? `La hora de inicio del evento es ${formatearHora12(guardado.inicio)}.`
                : guardado.inicio === null
                    ? 'El evento no tiene hora de inicio registrada.'
                    : '';
    }

    // Hora de finalización, con la fecha en que termina
    pintarHora('fin', horario.fin, !soloLectura);
    const fechaFin = fecha ? fechaDeFin(fecha, horario) : null;
    const diaSiguiente = terminaAlDiaSiguiente(horario);
    const pastillaFin = $('horFechaFin');
    if (pastillaFin) {
        pastillaFin.textContent = fechaFin ? formatearFechaCorta(fechaFin) : '';
        pastillaFin.hidden = !fechaFin;
        pastillaFin.classList.toggle('dia-siguiente', diaSiguiente);
    }
    const ayudaFin = $('horFinAyuda');
    if (ayudaFin) {
        const iguales = horario.inicio !== null && horario.fin !== null && duracion(horario) === null;
        ayudaFin.innerHTML = iguales
            ? '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Debe ser distinta de la hora de inicio.'
            : diaSiguiente
                ? '<i class="fa-regular fa-moon" aria-hidden="true"></i> Termina al día siguiente'
                : '';
        ayudaFin.classList.toggle('alerta', iguales);
        ayudaFin.classList.toggle('dia-siguiente', diaSiguiente);
    }

    // Ajustes rápidos
    raiz.querySelectorAll<HTMLElement>('[data-hor-modo]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.horModo === modo));
        (b as HTMLButtonElement).disabled = soloLectura;
    });
    const signo = modo === 'extender' ? 1 : -1;
    raiz.querySelectorAll<HTMLButtonElement>('[data-hor-ajuste]').forEach((b) => {
        const minutos = Number(b.dataset.horAjuste);
        const posible = ajustarDuracion(horario, signo * minutos) !== null;
        b.disabled = soloLectura || !posible;
        b.setAttribute('aria-label', `${modo === 'extender' ? 'Extender' : 'Quitar'} ${textoAjuste(minutos)}`);
        b.title = posible || soloLectura
            ? ''
            : horario.inicio === null
                ? 'Primero elige la hora de inicio.'
                : modo === 'extender'
                    ? `La duración no puede pasar de ${formatearDuracion(DURACION_MAXIMA)}.`
                    : 'La duración no puede quedar en cero ni ser negativa.';
    });
    const minutosDuracion = duracion(horario);
    const textoDuracion = minutosDuracion === null ? null : formatearDuracion(minutosDuracion);

    // Tipo de horario ("General" con los tres tipos) y duración
    const tipo = nombreDelTipo(etapas);
    raiz.querySelectorAll<HTMLElement>('[data-hor-tipo]').forEach((el) => {
        el.textContent = tipo ?? 'Sin elegir';
        el.classList.toggle('vacio', !tipo);
    });
    $('horTotalDuracion')!.innerHTML = `Duración: ${textoDuracion ?? '<span class="hor-por-definir">Por definir</span>'}`;

    // Resumen
    $('horResumenInicio')!.innerHTML = htmlFechaYHora(fecha, horario.inicio);
    $('horResumenFin')!.innerHTML = htmlFechaYHora(fechaFin, horario.fin);
    $('horResumenDuracion')!.innerHTML = textoDuracion ? `<strong>${textoDuracion}</strong>` : '<span class="hor-por-definir">Por definir</span>';
    pintarRegistrado(fecha);

    pintarPie(soloLectura);
}

function pintarPie(soloLectura: boolean): void {
    const resultado = evaluarGuardado(horario, etapas, guardado);
    const estado = $('horEstadoGuardado');
    if (estado) {
        const [clase, icono, texto] = soloLectura
            ? ['pendiente', 'fa-lock', evento?.motivo?.mensaje ?? 'Este horario ya no se puede modificar.']
            : resultado.estado === 'listo'
                ? ['listo', 'fa-circle-check', 'Al guardar se actualiza la hora de finalización del evento para Carga, Organización y Desmonte.']
                : resultado.estado === 'sin-cambios'
                    ? ['', 'fa-circle-check', 'El horario es el que ya tiene guardado el evento.']
                    : [resultado.estado === 'pendiente' ? 'pendiente' : '', 'fa-circle-info', resultado.mensaje];
        estado.className = `hor-estado ${clase}`.trim();
        estado.innerHTML = `<i class="fa-solid ${icono}" aria-hidden="true"></i> ${esc(texto)}`;
    }

    const borrador = $('horBorrador');
    if (borrador) {
        borrador.hidden = !borradorGuardadoEn;
        borrador.innerHTML = borradorGuardadoEn
            ? `<i class="fa-regular fa-floppy-disk" aria-hidden="true"></i> Borrador guardado en este navegador el ${esc(formatearGuardadoEn(borradorGuardadoEn))}.
               <button type="button" class="asig-btn-texto" data-hor-descartar ${soloLectura || guardando ? 'disabled' : ''}>Descartar borrador</button>`
            : '';
    }

    const errorEl = $('horError');
    if (errorEl) {
        errorEl.textContent = error ?? '';
        errorEl.hidden = !error;
    }

    const guardar = raiz.querySelector<HTMLButtonElement>('[data-hor-guardar]');
    if (guardar) {
        guardar.disabled = soloLectura || guardando || resultado.estado === 'invalido' || resultado.estado === 'pendiente';
        guardar.innerHTML = guardando
            ? '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Guardando...'
            : '<i class="fa-solid fa-file-circle-check" aria-hidden="true"></i> Guardar y confirmar';
    }
    const botonBorrador = raiz.querySelector<HTMLButtonElement>('[data-hor-borrador]');
    if (botonBorrador) botonBorrador.disabled = soloLectura || guardando;
}

function pintarEncabezado(): void {
    if (!evento) return;
    const sub = $('horSub');
    if (sub) sub.textContent = datosDelEvento(evento);
    const pastilla = raiz.querySelector('[data-estado-evento]');
    if (pastilla) pastilla.innerHTML = htmlEstadoEvento(evento);
    const aviso = $('horAviso');
    if (aviso) {
        aviso.innerHTML = evento.motivo
            ? `<p class="asig-aviso"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ${esc(evento.motivo.mensaje)}</p>`
            : '';
    }
}

// ---------- Datos ----------
/** Arranca el formulario con el horario del evento o, si lo hay, con el borrador guardado. */
function iniciarFormulario(e: EventoDto): void {
    evento = e;
    guardado = referenciaDe(e);
    const borrador = e.fecha ? leerBorradorHorario(eventoId, e.fecha) : null;
    horario = borrador ? { inicio: borrador.inicio, fin: borrador.fin } : { ...guardado };
    etapas = borrador ? borrador.etapas : [...ETAPAS];
    borradorGuardadoEn = borrador?.guardadoEn ?? null;
    editandoInicio = guardado.inicio !== null && horario.inicio !== guardado.inicio;
    $('horContenido')!.innerHTML = htmlFormulario(e);
    pintarEncabezado();
    pintar();
    opciones.alCargarEvento(e);
}

/** Datos nuevos del evento; si no se estaba editando nada, el formulario pasa a mostrarlos. */
function aplicarEvento(e: EventoDto, reiniciar: boolean): void {
    const limpio = !hayCambios();
    evento = e;
    guardado = referenciaDe(e);
    if (reiniciar || limpio) {
        horario = { ...guardado };
        etapas = [...ETAPAS];
        editandoInicio = false;
    }
    pintarEncabezado();
    pintar();
    opciones.alCargarEvento(e);
}

async function cargar(): Promise<void> {
    const mia = ++generacion;
    try {
        const consulta = await api<ConsultaPersonal>('GET', `/api/eventos/${eventoId}/personal?vista=asignados`);
        if (mia !== generacion) return;
        iniciarFormulario(consulta.evento);
    } catch (err) {
        if (mia !== generacion) return;
        $('horSub')!.textContent = 'No se pudo cargar el evento.';
        $('horContenido')!.innerHTML = `
            <div class="hor-card">
                <p class="asig-aviso asig-aviso-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> No se pudo cargar el horario: ${esc((err as Error).message)}</p>
                <div class="hor-pie-botones"><button type="button" class="asig-btn-primario" data-hor-reintentar>Reintentar</button></div>
            </div>`;
    }
}

function guardarBorrador(): void {
    if (!evento?.fecha) return;
    const guardadoEn = new Date().toISOString();
    const ok = guardarBorradorHorario(eventoId, { fecha: evento.fecha, inicio: horario.inicio, fin: horario.fin, etapas: [...etapas], guardadoEn });
    if (ok) {
        borradorGuardadoEn = guardadoEn;
        error = null;
        opciones.avisar('Borrador guardado en este navegador.');
    } else {
        error = 'No se pudo guardar el borrador: este navegador no permite guardar datos (revisa si está en modo privado).';
    }
    pintar();
}

function descartarBorrador(): void {
    borrarBorradorHorario(eventoId);
    borradorGuardadoEn = null;
    horario = { ...guardado };
    etapas = [...ETAPAS];
    editandoInicio = false;
    error = null;
    pintar();
    opciones.avisar('Se descartó el borrador del horario.');
}

async function guardarYConfirmar(): Promise<void> {
    const resultado = evaluarGuardado(horario, etapas, guardado);
    if (resultado.estado === 'invalido' || resultado.estado === 'pendiente') {
        error = resultado.mensaje;
        pintar();
        return;
    }
    if (resultado.estado === 'sin-cambios') {
        // Ya es el horario guardado del evento: un borrador igual no hace falta.
        borrarBorradorHorario(eventoId);
        borradorGuardadoEn = null;
        editandoInicio = false;
        error = null;
        pintar();
        opciones.alContinuar();
        return;
    }
    guardando = true;
    error = null;
    pintar();
    const mia = generacion;
    try {
        const respuesta = await api<ResultadoCambio>('POST', `/api/eventos/${eventoId}/personal`, { horaFin: resultado.horaFin, personal: [] });
        if (mia !== generacion) return;
        guardando = false;
        borrarBorradorHorario(eventoId);
        borradorGuardadoEn = null;
        aplicarEvento(respuesta.evento, true);
        opciones.alGuardar(respuesta);
        opciones.avisar(respuesta.mensaje);
        opciones.alContinuar();
    } catch (err) {
        if (mia !== generacion) return;
        guardando = false;
        error = (err as Error).message;
        pintar();
    }
}

/** Lee la hora elegida en los controles; null si todavía no hay hora. */
function horaDeLosControles(cual: Cual): number | null {
    const hora = $<HTMLSelectElement>(ID[cual].hora)?.value ?? '';
    if (hora === '') return null;
    const minuto = $<HTMLSelectElement>(ID[cual].minuto)?.value ?? '';
    const periodo = raiz.querySelector<HTMLElement>(`[data-hor-periodo="${cual}"]`)?.dataset.periodo as Periodo;
    return de12Horas({ hora: Number(hora), minuto: minuto === '' ? 0 : Number(minuto), periodo });
}

function alCambiarHora(cual: Cual): void {
    const minutos = horaDeLosControles(cual);
    if (minutos !== null) horario = cual === 'inicio' ? cambiarInicio(horario, minutos) : cambiarFin(horario, minutos);
    error = null;
    pintar();
}

// ---------- Eventos de la pestaña ----------
raiz.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const boton = t.closest<HTMLButtonElement>('button');
    if (!boton || boton.disabled) return;
    if (boton.matches('[data-hor-reintentar]')) {
        $('horContenido')!.innerHTML = '<p class="asig-estado-carga"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> Cargando horario...</p>';
        void cargar();
        return;
    }
    if (boton.matches('[data-hor-todos]')) {
        etapas = alternarTodas(etapas);
    } else if (boton.dataset.horEtapa) {
        etapas = alternarEtapa(etapas, boton.dataset.horEtapa as Etapa);
    } else if (boton.dataset.horPeriodo) {
        const cual = boton.dataset.horPeriodo as Cual;
        boton.dataset.periodo = boton.dataset.periodo === 'am' ? 'pm' : 'am';
        alCambiarHora(cual);
        return;
    } else if (boton.matches('[data-hor-cambiar-inicio]')) {
        if (editandoInicio && guardado.inicio !== null) {
            horario = cambiarInicio(horario, guardado.inicio);
            editandoInicio = false;
            pintar();
            boton.focus();
        } else {
            editandoInicio = true;
            pintar();
            $(ID.inicio.hora)?.focus();
        }
        return;
    } else if (boton.dataset.horModo) {
        modo = boton.dataset.horModo as Modo;
    } else if (boton.dataset.horAjuste) {
        const minutos = Number(boton.dataset.horAjuste) * (modo === 'extender' ? 1 : -1);
        horario = ajustarDuracion(horario, minutos) ?? horario;
    } else if (boton.matches('[data-hor-cancelar]')) {
        opciones.alCancelar();
        return;
    } else if (boton.matches('[data-hor-borrador]')) {
        guardarBorrador();
        return;
    } else if (boton.matches('[data-hor-descartar]')) {
        descartarBorrador();
        return;
    } else if (boton.matches('[data-hor-guardar]')) {
        void guardarYConfirmar();
        return;
    } else {
        return;
    }
    error = null;
    pintar();
});

raiz.addEventListener('change', (ev) => {
    const id = (ev.target as HTMLElement).id;
    if (id === ID.inicio.hora || id === ID.inicio.minuto) alCambiarHora('inicio');
    else if (id === ID.fin.hora || id === ID.fin.minuto) alCambiarHora('fin');
});

// ---------- Lo que usa panel-evento.ts ----------
/** Abre la pestaña para un evento y carga su horario. */
export function abrirHorarios(id: number, opts: OpcionesHorarios): void {
    eventoId = id;
    opciones = opts;
    evento = null;
    guardado = { inicio: null, fin: null };
    horario = { inicio: null, fin: null };
    etapas = [...ETAPAS];
    modo = 'extender';
    editandoInicio = false;
    guardando = false;
    error = null;
    borradorGuardadoEn = null;
    raiz.innerHTML = esqueleto();
    void cargar();
}

/** Otra pestaña guardó cambios del evento (p. ej. la hora de finalización desde Personal). */
export function actualizarEventoHorarios(e: EventoDto): void {
    if (!evento || e.id !== eventoId || guardando) return;
    aplicarEvento(e, false);
}

/** Al cerrar el panel: lo que siga en camino ya no se pinta. */
export function cerrarHorarios(): void {
    generacion += 1;
    raiz.innerHTML = '';
}
