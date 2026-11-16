// Reglas puras de la asignación de personal (sin base de datos ni HTTP): horas, intervalos de
// tiempo, choques de horario y por qué un evento o una persona no admite la asignación.

/** Hora del día en formato HH:MM (00:00 a 23:59), como la envía un <input type="time">. */
const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MINUTOS_DIA = 24 * 60;

export function esHora(valor: unknown): valor is string {
    return typeof valor === 'string' && HORA.test(valor);
}

/** Minutos desde el 1970-01-01 (sin zona horaria: fecha y hora son locales de Colombia). */
export function minutosDesdeEpoca(fecha: string, hora: string): number {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const [h, m] = hora.split(':').map(Number);
    const dias = Date.UTC(anio, mes - 1, dia) / 86_400_000;
    return dias * MINUTOS_DIA + h * 60 + m;
}

function fechaDeMinutos(minutos: number): string {
    return new Date(Math.floor(minutos / MINUTOS_DIA) * 86_400_000).toISOString().slice(0, 10);
}

/** Intervalo [desde, hasta) en minutos. */
export interface Intervalo {
    desde: number;
    hasta: number;
}

/**
 * Intervalo de un evento a partir de su fecha y sus horas de inicio y fin. Si la hora de fin es
 * menor que la de inicio, el evento termina al día siguiente. Si son iguales, o falta algún dato,
 * no hay intervalo (null): no se puede saber cuánto dura.
 */
export function intervaloDe(fecha: string | null, inicio: string | null, fin: string | null): Intervalo | null {
    if (!fecha || !FECHA.test(fecha) || !esHora(inicio) || !esHora(fin) || inicio === fin) return null;
    const desde = minutosDesdeEpoca(fecha, inicio);
    const duracion = (minutosDesdeEpoca(fecha, fin) - desde + MINUTOS_DIA) % MINUTOS_DIA;
    return { desde, hasta: desde + duracion };
}

/** Dos intervalos chocan si se cruzan. Terminar a las 18:00 y empezar a las 18:00 no es choque. */
export function seSolapan(a: Intervalo, b: Intervalo): boolean {
    return a.desde < b.hasta && b.desde < a.hasta;
}

/** Días (YYYY-MM-DD) que ocupa el intervalo: el de inicio y, si termina al día siguiente, también ese. */
export function diasQueOcupa(intervalo: Intervalo): string[] {
    const inicio = fechaDeMinutos(intervalo.desde);
    const fin = fechaDeMinutos(intervalo.hasta - 1);
    return inicio === fin ? [inicio] : [inicio, fin];
}

/** ¿El evento termina al día siguiente de empezar? */
export function terminaAlDiaSiguiente(intervalo: Intervalo): boolean {
    return diasQueOcupa(intervalo).length > 1;
}

// ---------------------------------------------------------------------------------------------
// Evento: ¿admite asignar personal?
// ---------------------------------------------------------------------------------------------

export type CodigoEvento =
    | 'EVENTO_NO_CONFIRMADO'
    | 'EVENTO_CANCELADO'
    | 'EVENTO_SIN_FECHA'
    | 'EVENTO_PASADO'
    | 'EVENTO_SIN_HORA';

export interface DatosDeEvento {
    confirmado: boolean;
    cancelado: boolean;
    fecha: string | null;
    horaInicio: string | null;
    /** Hora de finalización guardada (events.hora_fin); null mientras no se haya definido. */
    horaFin: string | null;
    /** El momento actual en Colombia, en minutos como minutosDesdeEpoca (los segundos como fracción). */
    ahora: number;
}

/** Horas después del final del evento durante las que todavía se puede asignar personal. */
export const HORAS_PARA_ASIGNAR_TRAS_EL_FIN = 12;

/**
 * Momento (en minutos, como minutosDesdeEpoca) desde el que el evento ya no admite cambios en su
 * personal: 12 horas después de que termina. Si la hora de fin es menor que la de inicio, el evento
 * termina al día siguiente (ver intervaloDe).
 *
 * Sin horario completo (falta la hora de fin, que la administradora define al asignar, o la de
 * inicio) no se sabe cuándo termina y no se supone ninguna duración: se mantiene la regla de antes,
 * que permite asignar mientras dure el día del evento (se cierra a las 00:00 del día siguiente).
 * null si el evento no tiene fecha.
 */
export function cierreDeAsignacion(fecha: string | null, inicio: string | null, fin: string | null): number | null {
    if (!fecha || !FECHA.test(fecha)) return null;
    const intervalo = intervaloDe(fecha, inicio, fin);
    return intervalo
        ? intervalo.hasta + HORAS_PARA_ASIGNAR_TRAS_EL_FIN * 60
        : minutosDesdeEpoca(fecha, '00:00') + MINUTOS_DIA;
}

/** Milisegundos que faltan para el cierre (0 si ya llegó); null si no hay cierre (evento sin fecha). */
export function msHastaElCierre(cierre: number | null, ahora: number): number | null {
    return cierre === null ? null : Math.max(0, Math.ceil((cierre - ahora) * 60_000));
}

const MENSAJE_EVENTO: Record<CodigoEvento, string> = {
    EVENTO_NO_CONFIRMADO: 'Solo se puede asignar personal a eventos confirmados (con el contrato firmado).',
    EVENTO_CANCELADO: 'El evento está cancelado.',
    EVENTO_SIN_FECHA: 'El evento no tiene fecha definida.',
    EVENTO_PASADO: 'La asignación de personal está cerrada para este evento: su fecha ya pasó.',
    EVENTO_SIN_HORA:
        'El evento no tiene hora de inicio registrada; sin ella no se puede comprobar la disponibilidad del personal.'
};

const MENSAJE_CERRADO_TRAS_EL_FIN =
    `La asignación de personal está cerrada para este evento: ya pasaron ${HORAS_PARA_ASIGNAR_TRAS_EL_FIN} horas desde que terminó.`;

/** Por qué el evento no admite asignaciones, o null si las admite. El orden importa: la primera causa. */
export function motivoDelEvento(evento: DatosDeEvento): { codigo: CodigoEvento; mensaje: string } | null {
    const cierre = cierreDeAsignacion(evento.fecha, evento.horaInicio, evento.horaFin);
    let codigo: CodigoEvento | null = null;
    if (!evento.confirmado) codigo = 'EVENTO_NO_CONFIRMADO';
    else if (evento.cancelado) codigo = 'EVENTO_CANCELADO';
    else if (!evento.fecha) codigo = 'EVENTO_SIN_FECHA';
    else if (cierre !== null && evento.ahora >= cierre) codigo = 'EVENTO_PASADO';
    else if (!esHora(evento.horaInicio)) codigo = 'EVENTO_SIN_HORA';
    if (!codigo) return null;
    // Con horario completo se sabe cuándo terminó; sin él, el cierre fue por la fecha (regla de antes).
    const trasElFin = codigo === 'EVENTO_PASADO' && intervaloDe(evento.fecha, evento.horaInicio, evento.horaFin) !== null;
    return { codigo, mensaje: trasElFin ? MENSAJE_CERRADO_TRAS_EL_FIN : MENSAJE_EVENTO[codigo] };
}

// ---------------------------------------------------------------------------------------------
// Persona: ¿se puede asignar a este evento?
// ---------------------------------------------------------------------------------------------

/** Otro evento en el que la persona ya está asignada. */
export interface Compromiso {
    eventoId: number;
    nombreEvento: string;
    fecha: string | null;
    horaInicio: string | null;
    horaFin: string | null;
}

export type CodigoPersona = 'SOLAPE' | 'HORARIO_DESCONOCIDO' | 'DIA_NO_DISPONIBLE';

export interface MotivoPersona {
    codigo: CodigoPersona;
    mensaje: string;
}

const HORA_LEGIBLE = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
const FECHA_LEGIBLE = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** "6:00 p. m." */
export function horaLegible(hora: string): string {
    const [h, m] = hora.split(':').map(Number);
    return HORA_LEGIBLE.format(Date.UTC(2000, 0, 1, h, m));
}

/** "20 de noviembre" */
export function fechaLegible(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return FECHA_LEGIBLE.format(Date.UTC(anio, mes - 1, dia));
}

/** «Boda» (17 de noviembre, 6:00 p. m. – 11:00 p. m.): entre paréntesis porque la hora ya termina en punto. */
function describirCompromiso(c: Compromiso): string {
    const horario = esHora(c.horaInicio) && esHora(c.horaFin) ? `${horaLegible(c.horaInicio)} – ${horaLegible(c.horaFin)}` : null;
    const detalle = [c.fecha ? fechaLegible(c.fecha) : null, horario].filter(Boolean).join(', ');
    return `«${c.nombreEvento}»${detalle ? ` (${detalle})` : ''}`;
}

/**
 * Motivos por los que la persona no puede ir al evento (vacío = disponible):
 * - SOLAPE: ya está asignada a otro evento cuyo horario se cruza con este.
 * - HORARIO_DESCONOCIDO: está asignada a otro evento del mismo día que no tiene horario completo;
 *   no se puede comprobar si chocan, así que no se asume que esté libre.
 * - DIA_NO_DISPONIBLE: marcó como no disponible un día que ocupa el evento (unavailability_users).
 */
export function motivosDePersona(
    evento: { fecha: string; intervalo: Intervalo },
    compromisos: Compromiso[],
    diasNoDisponibles: string[]
): MotivoPersona[] {
    const motivos: MotivoPersona[] = [];
    const dias = diasQueOcupa(evento.intervalo);

    for (const c of compromisos) {
        const otro = intervaloDe(c.fecha, c.horaInicio, c.horaFin);
        if (otro === null) {
            if (c.fecha !== null && dias.includes(c.fecha)) {
                motivos.push({
                    codigo: 'HORARIO_DESCONOCIDO',
                    mensaje: `Está asignado a ${describirCompromiso(c)}, que no tiene horario completo; define su hora de finalización para comprobarlo.`
                });
            }
        } else if (seSolapan(evento.intervalo, otro)) {
            motivos.push({ codigo: 'SOLAPE', mensaje: `Ya está asignado a ${describirCompromiso(c)}.` });
        }
    }

    for (const dia of diasNoDisponibles.filter((d) => dias.includes(d)).sort()) {
        motivos.push({ codigo: 'DIA_NO_DISPONIBLE', mensaje: `Marcó el ${fechaLegible(dia)} como día no disponible.` });
    }
    return motivos;
}

// ---------------------------------------------------------------------------------------------
// Celulares de la nómina
// ---------------------------------------------------------------------------------------------

/**
 * Celular en el formato de auth.users.phone (solo dígitos, con indicativo). Un número de 10 dígitos
 * que empieza por 3 es un celular colombiano sin indicativo: se le antepone 57. Devuelve null si no
 * es un número válido. La misma regla está escrita en SQL en servicio.ts (TELEFONO_SQL).
 */
export function normalizarCelular(valor: string | null | undefined): string | null {
    const digitos = (valor ?? '').replace(/\D/g, '');
    const conIndicativo = /^3\d{9}$/.test(digitos) ? `57${digitos}` : digitos;
    return /^[1-9]\d{7,14}$/.test(conIndicativo) ? conIndicativo : null;
}
