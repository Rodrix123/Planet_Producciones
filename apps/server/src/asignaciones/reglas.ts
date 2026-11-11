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
function minutosDesdeEpoca(fecha: string, hora: string): number {
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
    /** La fecha es hoy o futura, en la hora de Colombia. */
    vigente: boolean;
    horaInicio: string | null;
}

const MENSAJE_EVENTO: Record<CodigoEvento, string> = {
    EVENTO_NO_CONFIRMADO: 'Solo se puede asignar personal a eventos confirmados (con el contrato firmado).',
    EVENTO_CANCELADO: 'El evento está cancelado.',
    EVENTO_SIN_FECHA: 'El evento no tiene fecha definida.',
    EVENTO_PASADO: 'La fecha del evento ya pasó.',
    EVENTO_SIN_HORA:
        'El evento no tiene hora de inicio registrada; sin ella no se puede comprobar la disponibilidad del personal.'
};

/** Por qué el evento no admite asignaciones, o null si las admite. El orden importa: la primera causa. */
export function motivoDelEvento(evento: DatosDeEvento): { codigo: CodigoEvento; mensaje: string } | null {
    let codigo: CodigoEvento | null = null;
    if (!evento.confirmado) codigo = 'EVENTO_NO_CONFIRMADO';
    else if (evento.cancelado) codigo = 'EVENTO_CANCELADO';
    else if (!evento.fecha) codigo = 'EVENTO_SIN_FECHA';
    else if (!evento.vigente) codigo = 'EVENTO_PASADO';
    else if (!esHora(evento.horaInicio)) codigo = 'EVENTO_SIN_HORA';
    return codigo ? { codigo, mensaje: MENSAJE_EVENTO[codigo] } : null;
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
