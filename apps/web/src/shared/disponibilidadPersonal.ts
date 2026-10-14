// Lógica de la sección "Disponibilidad del personal" del detalle de un evento programado
// (Numeral 4). Aquí viven los tipos de la API, los textos, las reglas de la interfaz y el HTML de
// las listas; disponibilidad-personal.ts los conecta con la página, el servidor y las ventanas.
// No toca el DOM ni la red, para poder probarlo sin navegador (apps/web/test).
//
// Regla de oro: la pantalla nunca afirma que un mensaje salió si el servidor no lo confirmó. Los
// avisos salen solo de los estados que devuelve la API (ver avisoDeConvocatoria).

// ---------------------------------------------------------------------------------------------
// Tipos de la API (apps/server/src/convocatorias/servicio.ts)
// ---------------------------------------------------------------------------------------------

export type EstadoConvocatoria = 'BORRADOR' | 'ENVIANDO' | 'ENVIADA' | 'CANCELADA';
export type EstadoRespuesta = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';
export type EstadoEnvio = 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'ERROR';

export interface DestinatarioApi {
    trabajadorId: string;
    nombre: string;
    telefono: string | null;
    estadoRespuesta: EstadoRespuesta;
    respondidoEn: string | null;
    estadoEnvio: EstadoEnvio;
    enviadoEn: string | null;
    error: string | null;
}

export interface ResumenApi {
    total: number;
    confirmados: number;
    rechazados: number;
    pendientes: number;
    enviados: number;
    conError: number;
}

export interface ConvocatoriaApi {
    id: string;
    eventoId: number;
    cotizacionId: number;
    nombreEvento: string | null;
    fechaEvento: string | null;
    horaInicio: string;
    horaFin: string;
    lugar: string | null;
    estado: EstadoConvocatoria;
    envioIniciadoEn: string | null;
    creadoEn: string;
    resumen: ResumenApi;
    destinatarios: DestinatarioApi[];
}

export interface EventoApi {
    cotizacionId: number;
    convocable: boolean;
    motivo: { codigo: string; mensaje: string } | null;
    fecha: string | null;
    horaInicio: string;
    nombre: string | null;
    lugar: string | null;
    requiereHoraInicio: boolean;
    requiereNombre: boolean;
    requiereLugar: boolean;
}

export interface TrabajadorApi {
    id: string;
    nombre: string;
    telefono: string | null;
    elegible: boolean;
    motivo: { codigo: string; mensaje: string } | null;
    noDisponibleEseDia: boolean;
}

export interface SolicitudCrear {
    cotizacionId: number;
    trabajadorIds: string[];
    horaInicio?: string;
    horaFin: string;
    nombreEvento?: string;
    lugar?: string;
}

/** Máximo de trabajadores por convocatoria que acepta el servidor. */
export const MAX_TRABAJADORES = 100;

// ---------------------------------------------------------------------------------------------
// Utilidades de texto
// ---------------------------------------------------------------------------------------------

/** Todo lo que viene de la base (nombres, lugares, errores) se escapa antes de ir al HTML. */
export function escaparHtml(texto: string): string {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
const e = escaparHtml;

export const plural = (cantidad: number, singular: string, varios: string): string =>
    `${cantidad} ${cantidad === 1 ? singular : varios}`;

/** AAAA-MM-DD → fecha local en es-CO, igual que el resto de la pantalla de eventos. */
export function formatearFecha(fecha: string | null): string {
    if (!fecha) return 'Sin fecha';
    const [anio, mes, dia] = fecha.slice(0, 10).split('-').map(Number);
    if (!anio || !mes || !dia) return 'Sin fecha';
    return new Date(anio, mes - 1, dia).toLocaleDateString('es-CO');
}

export function formatearFechaHora(iso: string | null): string {
    if (!iso) return '';
    const fecha = new Date(iso);
    return Number.isNaN(fecha.getTime())
        ? ''
        : fecha.toLocaleString('es-CO', { day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** +573000000001 → +57 300 000 0001. Cualquier otro formato internacional se deja como viene. */
export function formatearTelefono(telefono: string | null): string {
    if (!telefono) return 'Sin celular';
    const colombia = /^\+57(3\d{2})(\d{3})(\d{4})$/.exec(telefono);
    return colombia ? `+57 ${colombia[1]} ${colombia[2]} ${colombia[3]}` : telefono;
}

export function iniciales(nombre: string): string {
    const letras = nombre
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((parte) => parte.charAt(0).toUpperCase())
        .join('');
    return letras || '?';
}

// ---------------------------------------------------------------------------------------------
// Estados y etiquetas
// ---------------------------------------------------------------------------------------------

export interface Etiqueta {
    texto: string;
    clase: string;
}

const ETIQUETA_CONVOCATORIA: Record<EstadoConvocatoria, Etiqueta> = {
    BORRADOR: { texto: 'Borrador', clase: 'chip-neutro' },
    ENVIANDO: { texto: 'Envío iniciado', clase: 'chip-proceso' },
    ENVIADA: { texto: 'Enviada', clase: 'chip-ok' },
    CANCELADA: { texto: 'Cancelada', clase: 'chip-error' }
};

const ETIQUETA_RESPUESTA: Record<EstadoRespuesta, Etiqueta> = {
    PENDIENTE: { texto: 'Pendiente', clase: 'chip-pendiente' },
    CONFIRMADO: { texto: 'Confirmado', clase: 'chip-ok' },
    RECHAZADO: { texto: 'Rechazado', clase: 'chip-error' }
};

const ETIQUETA_ENVIO: Record<EstadoEnvio, Etiqueta> = {
    PENDIENTE: { texto: 'Sin enviar', clase: 'chip-neutro' },
    ENVIANDO: { texto: 'Enviando', clase: 'chip-proceso' },
    ENVIADO: { texto: 'Enviado', clase: 'chip-ok' },
    ERROR: { texto: 'Error de envío', clase: 'chip-error' }
};

// Un estado que la pantalla no conoce se muestra tal cual en vez de ocultarse o romper la lista
const desconocido = (estado: string): Etiqueta => ({ texto: estado, clase: 'chip-neutro' });
export const etiquetaConvocatoria = (estado: EstadoConvocatoria): Etiqueta => ETIQUETA_CONVOCATORIA[estado] ?? desconocido(estado);
export const etiquetaRespuesta = (estado: EstadoRespuesta): Etiqueta => ETIQUETA_RESPUESTA[estado] ?? desconocido(estado);
export const etiquetaEnvio = (estado: EstadoEnvio): Etiqueta => ETIQUETA_ENVIO[estado] ?? desconocido(estado);

export interface TotalesRespuestas {
    total: number;
    confirmados: number;
    rechazados: number;
    pendientes: number;
}

/** Totales de todo el evento. Las convocatorias canceladas ya no cuentan. */
export function sumarResumenes(convocatorias: ConvocatoriaApi[]): TotalesRespuestas {
    const totales: TotalesRespuestas = { total: 0, confirmados: 0, rechazados: 0, pendientes: 0 };
    for (const convocatoria of convocatorias) {
        if (convocatoria.estado === 'CANCELADA') continue;
        totales.total += convocatoria.resumen.total;
        totales.confirmados += convocatoria.resumen.confirmados;
        totales.rechazados += convocatoria.resumen.rechazados;
        totales.pendientes += convocatoria.resumen.pendientes;
    }
    return totales;
}

export type TipoAviso = 'info' | 'aviso' | 'ok' | 'error';
export interface Aviso {
    tipo: TipoAviso;
    texto: string;
}

/**
 * Lo que se le dice a la administradora sobre el envío de una convocatoria. Sale solo de los
 * estados que informa el servidor: "enviado" únicamente cuando hay mensajes confirmados como enviados.
 */
export function avisoDeConvocatoria(convocatoria: ConvocatoriaApi): Aviso | null {
    const { total, enviados, conError } = convocatoria.resumen;
    switch (convocatoria.estado) {
        case 'CANCELADA':
            return { tipo: 'info', texto: 'Esta convocatoria fue cancelada.' };
        case 'BORRADOR':
            return { tipo: 'info', texto: 'Todavía no se ha enviado ningún mensaje. Revisa la lista y pulsa «Enviar solicitud».' };
        case 'ENVIANDO':
            if (enviados === 0 && conError === 0) {
                return { tipo: 'aviso', texto: 'El envío se inició, pero todavía no hay confirmación de que se haya enviado ningún mensaje.' };
            }
            return {
                tipo: conError > 0 ? 'aviso' : 'info',
                texto: `Enviando: ${enviados} de ${plural(total, 'mensaje', 'mensajes')} confirmados como enviados${conError > 0 ? `; ${conError} con error` : ''}.`
            };
        case 'ENVIADA':
            if (conError > 0) {
                return { tipo: 'error', texto: `El envío terminó con ${plural(conError, 'mensaje', 'mensajes')} con error: revisa los marcados en la lista.` };
            }
            if (enviados === total) return { tipo: 'ok', texto: 'Todos los mensajes fueron enviados.' };
            return { tipo: 'aviso', texto: `Figura como enviada, pero solo ${enviados} de ${plural(total, 'mensaje', 'mensajes')} están confirmados como enviados.` };
        default:
            return null;
    }
}

/** Solo un borrador con trabajadores puede enviarse; el servidor lo vuelve a comprobar. */
export const puedeEnviar = (convocatoria: ConvocatoriaApi): boolean =>
    convocatoria.estado === 'BORRADOR' && convocatoria.resumen.total > 0;

// ---------------------------------------------------------------------------------------------
// Confirmación previa al envío
// ---------------------------------------------------------------------------------------------

export interface DatosConfirmacion {
    cantidad: number;
    nombreEvento: string | null;
    fecha: string | null;
    horaInicio: string;
    horaFin: string;
    lugar: string | null;
}

/** Ventana de confirmación con la cantidad de destinatarios (se muestra antes de enviar). */
export function textosConfirmacionEnvio(datos: DatosConfirmacion): { titulo: string; html: string; confirmar: string } {
    const nombre = datos.nombreEvento ? `<strong>${e(datos.nombreEvento)}</strong>` : 'el evento';
    const lugar = datos.lugar ? ` en ${e(datos.lugar)}` : '';
    return {
        titulo: `¿Enviar la solicitud a ${plural(datos.cantidad, 'trabajador', 'trabajadores')}?`,
        html:
            `<p>${datos.cantidad === 1 ? 'Se le pedirá' : 'Se les pedirá'} su disponibilidad para ${nombre} ` +
            `el <strong>${e(formatearFecha(datos.fecha))}</strong>, de <strong>${e(datos.horaInicio)}</strong> ` +
            `a <strong>${e(datos.horaFin)}</strong>${lugar}.</p>` +
            '<p style="margin-top:0.6rem;">Se creará la convocatoria y se iniciará su envío por WhatsApp.</p>',
        confirmar: 'Sí, enviar'
    };
}

// ---------------------------------------------------------------------------------------------
// Formulario de la convocatoria
// ---------------------------------------------------------------------------------------------

export interface EntradaFormulario {
    horaInicio: string;
    horaFin: string;
    nombre: string;
    lugar: string;
    seleccionados: string[];
}

export type ResultadoFormulario = { ok: true; solicitud: SolicitudCrear } | { ok: false; mensaje: string };

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Las mismas comprobaciones que hace el servidor, para avisar antes de enviar; el servidor decide. */
export function validarFormulario(entrada: EntradaFormulario, evento: EventoApi): ResultadoFormulario {
    if (entrada.seleccionados.length === 0) return { ok: false, mensaje: 'Selecciona al menos un trabajador.' };
    if (entrada.seleccionados.length > MAX_TRABAJADORES) {
        return { ok: false, mensaje: `Una convocatoria admite hasta ${MAX_TRABAJADORES} trabajadores.` };
    }

    const horaInicio = entrada.horaInicio.trim();
    const horaFin = entrada.horaFin.trim();
    if (!horaInicio && evento.requiereHoraInicio) {
        return { ok: false, mensaje: 'Indica la hora de inicio: la cotización no la trae definida.' };
    }
    if (horaInicio && !HORA.test(horaInicio)) return { ok: false, mensaje: 'La hora de inicio no es válida.' };
    if (!horaFin) return { ok: false, mensaje: 'Indica la hora de fin del evento.' };
    if (!HORA.test(horaFin)) return { ok: false, mensaje: 'La hora de fin no es válida.' };
    if ((horaInicio || evento.horaInicio) === horaFin) {
        return { ok: false, mensaje: 'La hora de fin no puede ser igual a la de inicio.' };
    }

    const nombre = entrada.nombre.trim();
    const lugar = entrada.lugar.trim();
    if (evento.requiereNombre && !nombre) return { ok: false, mensaje: 'Indica el nombre del evento: la cotización no trae el tipo de evento.' };
    if (evento.requiereLugar && !lugar) return { ok: false, mensaje: 'Indica el lugar del evento: la cotización no trae la sede.' };

    const solicitud: SolicitudCrear = {
        cotizacionId: evento.cotizacionId,
        trabajadorIds: [...entrada.seleccionados],
        horaFin
    };
    if (horaInicio) solicitud.horaInicio = horaInicio;
    if (evento.requiereNombre) solicitud.nombreEvento = nombre;
    if (evento.requiereLugar) solicitud.lugar = lugar;
    return { ok: true, solicitud };
}

/** Los trabajadores que "Seleccionar todos" marca: los que se pueden convocar y no avisaron de un impedimento. */
export const sePuedeMarcarEnBloque = (trabajador: TrabajadorApi): boolean =>
    trabajador.elegible && !trabajador.noDisponibleEseDia;

// ---------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------

const chip = (etiqueta: Etiqueta, titulo?: string): string =>
    `<span class="chip ${etiqueta.clase}"${titulo ? ` title="${e(titulo)}"` : ''}>${e(etiqueta.texto)}</span>`;

const ICONO_AVISO: Record<TipoAviso, string> = {
    info: 'fa-circle-info',
    aviso: 'fa-triangle-exclamation',
    ok: 'fa-circle-check',
    error: 'fa-circle-xmark'
};

export function htmlIndicadores(totales: Pick<TotalesRespuestas, 'confirmados' | 'rechazados' | 'pendientes'>): string {
    const indicador = (clase: string, valor: number, texto: string) =>
        `<div class="indicador ${clase}"><strong>${valor}</strong><span>${texto}</span></div>`;
    return (
        '<div class="indicadores">' +
        indicador('indicador-confirmado', totales.confirmados, 'Confirmados') +
        indicador('indicador-rechazado', totales.rechazados, 'Rechazados') +
        indicador('indicador-pendiente', totales.pendientes, 'Pendientes') +
        '</div>'
    );
}

function htmlDestinatario(destinatario: DestinatarioApi): string {
    const respuesta = etiquetaRespuesta(destinatario.estadoRespuesta);
    const envio = etiquetaEnvio(destinatario.estadoEnvio);
    const respondio = destinatario.respondidoEn
        ? `<div class="detail-row-sub">Respondió el ${e(formatearFechaHora(destinatario.respondidoEn))}</div>`
        : '';
    const enviado = destinatario.enviadoEn
        ? `<div class="detail-row-sub">Enviado el ${e(formatearFechaHora(destinatario.enviadoEn))}</div>`
        : '';
    const error = destinatario.error
        ? `<div class="detail-row-sub destinatario-error"><i class="fa-solid fa-circle-xmark"></i> ${e(destinatario.error)}</div>`
        : '';
    return (
        '<div class="detail-row destinatario">' +
        '<div>' +
        `<div class="detail-row-main"><strong>${e(destinatario.nombre)}</strong></div>` +
        `<div class="detail-row-sub destinatario-telefono">${e(formatearTelefono(destinatario.telefono))}</div>` +
        respondio +
        enviado +
        error +
        '</div>' +
        `<div class="chips">${chip(respuesta)}${chip(envio)}</div>` +
        '</div>'
    );
}

export function htmlConvocatoria(convocatoria: ConvocatoriaApi): string {
    const estado = etiquetaConvocatoria(convocatoria.estado);
    const aviso = avisoDeConvocatoria(convocatoria);
    const titulo = `Solicitud de ${e(convocatoria.horaInicio)} a ${e(convocatoria.horaFin)}`;
    return (
        `<article class="convocatoria" data-convocatoria-id="${e(convocatoria.id)}">` +
        '<div class="convocatoria-cabecera">' +
        `<div><h5>${titulo}</h5><div class="detail-row-sub">Creada el ${e(formatearFechaHora(convocatoria.creadoEn))} · ${e(plural(convocatoria.resumen.total, 'trabajador', 'trabajadores'))}</div></div>` +
        chip(estado) +
        '</div>' +
        htmlIndicadores(convocatoria.resumen) +
        (aviso
            ? `<p class="convocatoria-aviso aviso-${aviso.tipo}"><i class="fa-solid ${ICONO_AVISO[aviso.tipo]}"></i> ${e(aviso.texto)}</p>`
            : '') +
        `<div class="destinatarios">${convocatoria.destinatarios.map(htmlDestinatario).join('')}</div>` +
        (puedeEnviar(convocatoria)
            ? '<div class="convocatoria-acciones">' +
              '<button type="button" class="btn btn-primary btn-sm" data-accion="enviar"><i class="fa-brands fa-whatsapp"></i> Enviar solicitud</button>' +
              '</div>'
            : '') +
        '</article>'
    );
}

export function htmlListaConvocatorias(convocatorias: ConvocatoriaApi[]): string {
    if (convocatorias.length === 0) {
        return '<p class="disp-vacio"><i class="fa-regular fa-comments"></i> Todavía no se ha solicitado la disponibilidad del personal para este evento.</p>';
    }
    return convocatorias.map(htmlConvocatoria).join('');
}

/** Opciones de la lista de selección; `seleccionados` conserva lo marcado al volver a pintarla. */
export function htmlTrabajadores(trabajadores: TrabajadorApi[], seleccionados: ReadonlySet<string> = new Set()): string {
    if (trabajadores.length === 0) {
        return '<p class="disp-vacio">No hay trabajadores registrados. Crea cuentas con el rol «trabajador» en Empleados.</p>';
    }
    return trabajadores
        .map((trabajador) => {
            const marcado = trabajador.elegible && seleccionados.has(trabajador.id);
            const notas =
                (trabajador.motivo ? `<span class="chip chip-error">${e(trabajador.motivo.mensaje)}</span>` : '') +
                (trabajador.noDisponibleEseDia
                    ? '<span class="chip chip-aviso" title="Marcó este día como no disponible en su cuenta. Puedes consultarle igualmente.">No disponible ese día</span>'
                    : '');
            return (
                `<label class="trabajador-opcion${trabajador.elegible ? '' : ' no-elegible'}">` +
                `<input type="checkbox" value="${e(trabajador.id)}"${marcado ? ' checked' : ''}${trabajador.elegible ? '' : ' disabled'}>` +
                `<span class="avatar avatar-sm">${e(iniciales(trabajador.nombre))}</span>` +
                '<span class="trabajador-datos">' +
                `<span class="trabajador-nombre">${e(trabajador.nombre)}</span>` +
                `<span class="trabajador-sub">${e(formatearTelefono(trabajador.telefono))}</span>` +
                '</span>' +
                `<span class="trabajador-notas">${notas}</span>` +
                '</label>'
            );
        })
        .join('');
}

/** Contenido de la ventana "Solicitar disponibilidad de personal". */
export function htmlFormulario(evento: EventoApi, trabajadores: TrabajadorApi[]): string {
    const resumenEvento = [evento.nombre, formatearFecha(evento.fecha), evento.lugar].filter(Boolean).map((parte) => e(String(parte))).join(' · ');
    const campoTexto = (id: string, etiqueta: string, maximo: number, ayuda: string) =>
        `<label class="campo"><span>${etiqueta}</span><input type="text" id="${id}" maxlength="${maximo}" autocomplete="off" placeholder="${e(ayuda)}"></label>`;
    return (
        '<button type="button" class="modal-cerrar" id="dispCerrar" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>' +
        '<h2>Solicitar disponibilidad de personal</h2>' +
        `<p class="modal-texto">${resumenEvento}</p>` +
        '<div class="disp-horario">' +
        `<label class="campo"><span>Hora de inicio</span><input type="time" id="dispHoraInicio" value="${evento.requiereHoraInicio ? '' : e(evento.horaInicio)}" required></label>` +
        '<label class="campo"><span>Hora de fin</span><input type="time" id="dispHoraFin" required></label>' +
        '</div>' +
        (evento.requiereNombre ? campoTexto('dispNombre', 'Nombre del evento', 120, 'Ej. Cumpleaños de Ana') : '') +
        (evento.requiereLugar ? campoTexto('dispLugar', 'Lugar del evento', 200, 'Ej. Hotel Termales, Manizales') : '') +
        '<div class="disp-lista-encabezado">' +
        '<h3>Trabajadores de logística</h3>' +
        '<span class="disp-lista-acciones"><span id="dispContador" class="disp-contador" aria-live="polite">0 seleccionados</span>' +
        '<button type="button" class="btn-secundario" id="dispSeleccionarTodos">Seleccionar todos los disponibles</button></span>' +
        '</div>' +
        `<div class="disp-trabajadores" id="dispTrabajadores">${htmlTrabajadores(trabajadores)}</div>` +
        '<p class="form-error" id="dispError" role="alert" hidden></p>' +
        '<div class="modal-acciones">' +
        '<button type="button" class="btn-secundario" id="dispCancelar">Cancelar</button>' +
        '<button type="button" class="btn-guardar" id="dispContinuar" style="width:auto;" disabled>Revisar y enviar</button>' +
        '</div>'
    );
}
