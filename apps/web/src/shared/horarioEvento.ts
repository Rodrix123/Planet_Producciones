// Horario del evento por tipo de actividad (pestaña Horarios del panel del evento).
//
// Funciones puras, sin navegador ni servidor, para poder probarlas (test/horarioEvento.test.ts).
// Las horas se manejan en minutos desde las 00:00 del día del evento (0 a 1439), igual que el
// servidor guarda el horario: la hora de inicio del evento y events.hora_fin, sin fecha propia.
// Si la hora de finalización es menor que la de inicio, el evento termina al día siguiente; si son
// iguales, el horario no es válido (apps/server/src/asignaciones/reglas.ts, intervaloDe).

import { ETAPAS, type Etapa } from './etapasPersonal';

export const MINUTOS_DIA = 24 * 60;
/** La duración va de 1 minuto a 23 h 59 min: el fin es una hora del día distinta de la de inicio. */
export const DURACION_MINIMA = 1;
export const DURACION_MAXIMA = MINUTOS_DIA - 1;

/** Ajustes rápidos de "Ajustar tiempo desde el inicio", en minutos. */
export const AJUSTES_MINUTOS = [5, 10, 15, 30, 45] as const;
export const AJUSTES_HORAS = [1, 2, 3, 4, 5].map((h) => h * 60);

export interface Horario {
    /** Minutos desde las 00:00 del día del evento; null = sin definir. */
    inicio: number | null;
    /** Hora del día en que termina, en minutos; menor que el inicio = termina al día siguiente. */
    fin: number | null;
}

export type Periodo = 'am' | 'pm';

/** Hora en formato de 12 horas, como la muestran los controles: 9:00 p. m. */
export interface Hora12 {
    hora: number; // 1 a 12
    minuto: number; // 0 a 59
    periodo: Periodo;
}

const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

const enElDia = (minutos: number): number => ((minutos % MINUTOS_DIA) + MINUTOS_DIA) % MINUTOS_DIA;

/** "21:00" o "21:00:00" -> 1260; null si no es una hora válida. */
export function aMinutos(hora: string | null | undefined): number | null {
    const partes = FORMATO_HORA.exec(hora ?? '');
    return partes ? Number(partes[1]) * 60 + Number(partes[2]) : null;
}

/** 1260 -> "21:00" (el formato que recibe el servidor). */
export function aHora(minutos: number): string {
    const m = enElDia(minutos);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** 1260 -> { hora: 9, minuto: 0, periodo: 'pm' }; 0 -> 12:00 a. m.; 720 -> 12:00 p. m. */
export function a12Horas(minutos: number): Hora12 {
    const m = enElDia(minutos);
    const h24 = Math.floor(m / 60);
    return { hora: h24 % 12 || 12, minuto: m % 60, periodo: h24 < 12 ? 'am' : 'pm' };
}

export function de12Horas({ hora, minuto, periodo }: Hora12): number {
    return ((hora % 12) + (periodo === 'pm' ? 12 : 0)) * 60 + minuto;
}

/** "9:00 p. m." */
export function formatearHora12(minutos: number): string {
    const { hora, minuto, periodo } = a12Horas(minutos);
    return `${hora}:${String(minuto).padStart(2, '0')} ${periodo === 'am' ? 'a. m.' : 'p. m.'}`;
}

/** Minutos entre el inicio y el fin (pasando la medianoche si hace falta); null si falta algo o son iguales. */
export function duracion(h: Horario): number | null {
    if (h.inicio === null || h.fin === null) return null;
    const minutos = enElDia(h.fin - h.inicio);
    return minutos === 0 ? null : minutos;
}

export function terminaAlDiaSiguiente(h: Horario): boolean {
    return h.inicio !== null && h.fin !== null && h.fin < h.inicio;
}

/** "2026-11-29" + 1 -> "2026-11-30". Fechas de calendario, sin zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Fecha en que termina: la del evento o, si pasa la medianoche, la del día siguiente. */
export function fechaDeFin(fecha: string, h: Horario): string | null {
    if (h.fin === null) return null;
    return terminaAlDiaSiguiente(h) ? sumarDias(fecha, 1) : fecha;
}

/** Cambia la hora de inicio y conserva la duración (el fin se mueve con ella), como en un calendario. */
export function cambiarInicio(h: Horario, inicio: number): Horario {
    const minutos = duracion(h);
    return { inicio: enElDia(inicio), fin: minutos === null ? h.fin : enElDia(inicio + minutos) };
}

export function cambiarFin(h: Horario, fin: number): Horario {
    return { inicio: h.inicio, fin: enElDia(fin) };
}

/**
 * "Ajustar tiempo desde el inicio": extiende (minutos > 0) o acorta (minutos < 0) la duración, y con
 * ella la hora de finalización; el inicio no cambia. Sin hora de finalización se cuenta desde el
 * inicio. Devuelve null si no hay inicio o si la duración quedaría fuera de 1 minuto a 23 h 59 min.
 */
export function ajustarDuracion(h: Horario, minutos: number): Horario | null {
    if (h.inicio === null) return null;
    const nueva = (duracion(h) ?? 0) + minutos;
    if (nueva < DURACION_MINIMA || nueva > DURACION_MAXIMA) return null;
    return { inicio: h.inicio, fin: enElDia(h.inicio + nueva) };
}

/** "4 horas", "1 hora", "45 minutos", "4 h 30 min". */
export function formatearDuracion(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    if (horas > 0 && resto > 0) return `${horas} h ${resto} min`;
    if (horas > 0) return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    return `${resto} ${resto === 1 ? 'minuto' : 'minutos'}`;
}

/** Texto de un botón de ajuste: "5 min", "1 h". */
export function etiquetaAjuste(minutos: number): string {
    return minutos % 60 === 0 ? `${minutos / 60} h` : `${minutos} min`;
}

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];

/** "2026-11-30" -> "Lun, 30 nov. 2026" */
export function formatearFechaCorta(fecha: string): string {
    const [anio, mes, dia] = fecha.split('-').map(Number);
    const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
    return `${DIAS_CORTOS[semana]}, ${dia} ${MESES_CORTOS[mes - 1]} ${anio}`;
}

// ---------- Tipos de actividad (selección múltiple) ----------

export const todasLasEtapas = (seleccion: readonly Etapa[]): boolean => ETAPAS.every((e) => seleccion.includes(e));

/** Marca o desmarca un tipo de actividad; el resultado queda en el orden de ETAPAS y sin repetir. */
export function alternarEtapa(seleccion: readonly Etapa[], etapa: Etapa): Etapa[] {
    const marcada = seleccion.includes(etapa);
    return ETAPAS.filter((e) => (e === etapa ? !marcada : seleccion.includes(e)));
}

/** "Todos": si ya están las tres, las quita; si falta alguna, las marca todas. */
export function alternarTodas(seleccion: readonly Etapa[]): Etapa[] {
    return todasLasEtapas(seleccion) ? [] : [...ETAPAS];
}

/** Estado del botón "Todos" para aria-pressed: todas, ninguna o algunas. */
export function estadoDeTodas(seleccion: readonly Etapa[]): 'true' | 'false' | 'mixed' {
    if (todasLasEtapas(seleccion)) return 'true';
    return ETAPAS.some((e) => seleccion.includes(e)) ? 'mixed' : 'false';
}

export const mismoHorario = (a: Horario, b: Horario): boolean => a.inicio === b.inicio && a.fin === b.fin;

// ---------- Qué se puede guardar ----------

/**
 * Lo que pasa al pulsar "Guardar y continuar":
 * - invalido:    falta algo o el horario no tiene sentido (no se envía nada).
 * - pendiente:   es válido, pero la base de datos todavía no tiene dónde guardarlo (horario solo para
 *                algunos tipos de actividad, u otra hora de inicio). Se puede guardar como borrador.
 * - sin-cambios: es el mismo horario que ya tiene el evento; se pasa a Personal sin guardar.
 * - listo:       se guarda la hora de finalización del evento con POST /api/eventos/:id/personal.
 */
export type Guardado =
    | { estado: 'invalido'; mensaje: string }
    | { estado: 'pendiente'; mensaje: string }
    | { estado: 'sin-cambios' }
    | { estado: 'listo'; horaFin: string };

export const MENSAJE_SOLO_ALGUNOS_TIPOS =
    'Por ahora el evento tiene un solo horario para Carga, Organización y Desmonte: todavía no se puede guardar un horario solo para algunos tipos de actividad. Puedes guardarlo como borrador.';
export const MENSAJE_OTRO_INICIO =
    'Por ahora la hora de inicio del evento no se puede cambiar desde aquí. Puedes guardar este horario como borrador.';

/**
 * @param h        horario que se está editando
 * @param etapas   tipos de actividad elegidos
 * @param guardado horario que el evento tiene guardado (su hora de inicio y events.hora_fin)
 */
export function evaluarGuardado(h: Horario, etapas: readonly Etapa[], guardado: Horario): Guardado {
    if (etapas.length === 0) return { estado: 'invalido', mensaje: 'Elige al menos un tipo de actividad: Carga, Organización o Desmonte.' };
    if (h.inicio === null) return { estado: 'invalido', mensaje: 'Elige la hora de inicio.' };
    if (h.fin === null) return { estado: 'invalido', mensaje: 'Elige la hora de finalización.' };
    if (duracion(h) === null) return { estado: 'invalido', mensaje: 'La hora de finalización no puede ser igual a la hora de inicio.' };
    if (!todasLasEtapas(etapas)) return { estado: 'pendiente', mensaje: MENSAJE_SOLO_ALGUNOS_TIPOS };
    if (h.inicio !== guardado.inicio) return { estado: 'pendiente', mensaje: MENSAJE_OTRO_INICIO };
    if (h.fin === guardado.fin) return { estado: 'sin-cambios' };
    return { estado: 'listo', horaFin: aHora(h.fin) };
}
