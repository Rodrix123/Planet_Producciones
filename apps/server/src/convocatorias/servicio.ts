// Lógica de las convocatorias de disponibilidad de personal (Numeral 3).
//
// Reutiliza lo que ya existe en la base (ver supabase/migrations/0010_*.sql): los trabajadores son
// cuentas (profiles) con el rol "trabajador" y su teléfono sale de auth.users; el nombre, la fecha y
// el lugar del evento salen de quote/venue; y cada convocado es una fila de event_staff con su
// estado de envío y de respuesta. Las consultas están escritas contra el esquema REAL de Supabase:
// la fecha, hora, tipo y lugar del evento viven en quote; events solo agrega la confirmación, los
// pagos y el contrato. Todo lo que toca la base recibe la conexión por parámetro (ver consulta.ts)
// para poder probarlo.
//
// Alcance: crear, consultar e iniciar el envío (BORRADOR -> ENVIANDO), registrar los mensajes
// que llegan de n8n y entregar a la pantalla (Numeral 4) lo necesario para armar una convocatoria:
// si el evento admite convocatorias y a qué trabajadores se puede convocar. Mandar los mensajes por
// WhatsApp (Numeral 7) y aplicar la respuesta a cada trabajador (Numeral 9) se agregan después.

import type { Consulta } from './consulta';
import { normalizarTelefono, telefonoDesdeWhatsApp } from './telefono';

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

/** Rol de profiles que identifica al personal de logística a quien se le pregunta la disponibilidad. */
export const ROL_PERSONAL_LOGISTICA = 'trabajador';

export type EstadoConvocatoria = 'BORRADOR' | 'ENVIANDO' | 'ENVIADA' | 'CANCELADA';
export type EstadoRespuesta = 'PENDIENTE' | 'CONFIRMADO' | 'RECHAZADO';
export type EstadoEnvio = 'PENDIENTE' | 'ENVIANDO' | 'ENVIADO' | 'ERROR';

export interface SolicitudCrear {
    cotizacionId: number;
    trabajadorIds: string[];
    horaInicio?: string;
    horaFin: string;
    nombreEvento?: string;
    lugar?: string;
}

export interface DestinatarioDto {
    trabajadorId: string;
    nombre: string;
    telefono: string | null;
    estadoRespuesta: EstadoRespuesta;
    respondidoEn: string | null;
    estadoEnvio: EstadoEnvio;
    enviadoEn: string | null;
    error: string | null;
}

export interface ConvocatoriaDto {
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
    resumen: {
        total: number;
        confirmados: number;
        rechazados: number;
        pendientes: number;
        enviados: number;
        conError: number;
    };
    destinatarios: DestinatarioDto[];
}

export interface MensajeEntrante {
    waMessageId: string;
    telefono: string;
    tipo: string;
    contenido: string | null;
    payload: string | null;
    contextoWaMessageId: string | null;
    recibidoEn: string;
    respuesta: 'CONFIRMADO' | 'RECHAZADO' | null;
}

/** Error esperado con su código HTTP; el router lo convierte en { status: 'error', codigo, message }. */
export class ErrorConvocatoria extends Error {
    constructor(
        readonly estadoHttp: number,
        readonly codigo: string,
        mensaje: string,
        readonly detalles?: unknown
    ) {
        super(mensaje);
    }
}

const falla = (estadoHttp: number, codigo: string, mensaje: string, detalles?: unknown) =>
    new ErrorConvocatoria(estadoHttp, codigo, mensaje, detalles);

// ---------------------------------------------------------------------------------------------
// Validación de lo que llega por HTTP
// ---------------------------------------------------------------------------------------------

const HORA = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TRABAJADORES = 100;
const MAX_NOMBRE_EVENTO = 120;
const MAX_LUGAR = 200;
/** quote.hour es obligatoria: 00:00 es lo que queda cuando nadie indicó la hora real. */
const HORA_SIN_DEFINIR = '00:00';

export const esUuid = (valor: unknown): valor is string => typeof valor === 'string' && UUID.test(valor);

/** Una sola línea, sin espacios repetidos: así viajan las variables de la plantilla de WhatsApp. */
export function limpiarTexto(valor: string): string {
    return valor.replace(/\s+/g, ' ').trim();
}

/** Acepta 12 o "12"; cualquier otra cosa (0, -3, 1.5, "abc", arreglos...) es null. */
export function aEnteroPositivo(valor: unknown): number | null {
    const numero =
        typeof valor === 'number' ? valor : typeof valor === 'string' && /^[0-9]{1,15}$/.test(valor) ? Number(valor) : NaN;
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

function textoOpcional(valor: unknown, campo: string, maximo: number): string | undefined {
    if (valor === undefined || valor === null) return undefined;
    if (typeof valor !== 'string') throw falla(400, 'TEXTO_INVALIDO', `${campo} debe ser texto`);
    const limpio = limpiarTexto(valor);
    if (limpio.length > maximo) throw falla(400, 'TEXTO_MUY_LARGO', `${campo} no puede superar ${maximo} caracteres`);
    return limpio || undefined;
}

export function validarSolicitudCrear(cuerpo: unknown): SolicitudCrear {
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
        throw falla(400, 'SOLICITUD_INVALIDA', 'El cuerpo de la solicitud debe ser un objeto JSON');
    }
    const datos = cuerpo as Record<string, unknown>;

    const cotizacionId = aEnteroPositivo(datos.cotizacionId);
    if (cotizacionId === null) {
        throw falla(400, 'COTIZACION_INVALIDA', 'Indica el evento con un cotizacionId válido');
    }

    if (!Array.isArray(datos.trabajadorIds) || datos.trabajadorIds.length === 0) {
        throw falla(400, 'TRABAJADORES_REQUERIDOS', 'Selecciona al menos un trabajador');
    }
    if (datos.trabajadorIds.length > MAX_TRABAJADORES) {
        throw falla(400, 'DEMASIADOS_TRABAJADORES', `Una convocatoria admite hasta ${MAX_TRABAJADORES} trabajadores`);
    }
    const trabajadorIds: string[] = [];
    for (const id of datos.trabajadorIds as unknown[]) {
        if (!esUuid(id)) throw falla(400, 'TRABAJADOR_INVALIDO', 'trabajadorIds debe contener identificadores válidos');
        trabajadorIds.push(id.toLowerCase());
    }
    if (new Set(trabajadorIds).size !== trabajadorIds.length) {
        throw falla(400, 'TRABAJADORES_DUPLICADOS', 'Un trabajador no puede repetirse en la misma convocatoria');
    }

    if (datos.horaFin === undefined || datos.horaFin === null) {
        throw falla(400, 'HORA_FIN_REQUERIDA', 'Indica la hora de fin del evento (formato HH:MM)');
    }
    if (typeof datos.horaFin !== 'string' || !HORA.test(datos.horaFin)) {
        throw falla(400, 'HORA_INVALIDA', 'La hora de fin debe tener el formato HH:MM (24 horas)');
    }
    if (datos.horaInicio !== undefined && datos.horaInicio !== null) {
        if (typeof datos.horaInicio !== 'string' || !HORA.test(datos.horaInicio)) {
            throw falla(400, 'HORA_INVALIDA', 'La hora de inicio debe tener el formato HH:MM (24 horas)');
        }
    }

    const solicitud: SolicitudCrear = { cotizacionId, trabajadorIds, horaFin: datos.horaFin };
    if (typeof datos.horaInicio === 'string') solicitud.horaInicio = datos.horaInicio;
    const nombreEvento = textoOpcional(datos.nombreEvento, 'nombreEvento', MAX_NOMBRE_EVENTO);
    if (nombreEvento) solicitud.nombreEvento = nombreEvento;
    const lugar = textoOpcional(datos.lugar, 'lugar', MAX_LUGAR);
    if (lugar) solicitud.lugar = lugar;
    return solicitud;
}

// ---------------------------------------------------------------------------------------------
// Evento habilitado para convocar
// ---------------------------------------------------------------------------------------------

interface FilaEvento {
    cotizacion_id: string | number;
    evento_id: string | number | null;
    confirmado: boolean | null;
    cotizacion_estado: string;
    fecha: string | null;
    hora: string;
    fecha_vigente: boolean | null;
    tipo_evento: string | null;
    sede: string | null;
    ciudad: string | null;
}

export interface EventoConvocable {
    cotizacionId: number;
    eventoId: number;
    fecha: string;
    hora: string;
    tipoEvento: string | null;
    lugar: string;
}

/** Lo que la pantalla necesita para decidir si ofrece "Solicitar disponibilidad" y con qué datos. */
export interface EventoParaConvocar {
    cotizacionId: number;
    convocable: boolean;
    /** Por qué no admite convocatorias (null si las admite). */
    motivo: { codigo: string; mensaje: string } | null;
    fecha: string | null;
    horaInicio: string;
    nombre: string | null;
    lugar: string | null;
    /** Datos que la cotización no trae y la administradora debe indicar al convocar. */
    requiereHoraInicio: boolean;
    requiereNombre: boolean;
    requiereLugar: boolean;
}

async function leerEvento(db: Consulta, cotizacionId: number): Promise<FilaEvento> {
    const { rows } = await db.query<FilaEvento>(
        `select q.id as cotizacion_id,
                e.id as evento_id,
                e.confirmed as confirmado,
                q.estado as cotizacion_estado,
                q.date::text as fecha,
                to_char(q.hour, 'HH24:MI') as hora,
                (q.date >= (now() at time zone 'America/Bogota')::date) as fecha_vigente,
                q.event_type as tipo_evento,
                coalesce(v.name, q.venue_nombre_manual, e.venue_nombre_manual) as sede,
                coalesce(v.city, t.city) as ciudad
           from public.quote q
           left join public.events e on e.quote_id = q.id
           left join public.venue v on v.id = q.venue_id
           left join public.transportation t on t.id = q.transportation_id
          where q.id = $1`,
        [cotizacionId]
    );
    const fila = rows[0];
    if (!fila) throw falla(404, 'EVENTO_NO_ENCONTRADO', 'No existe un evento con ese identificador');
    return fila;
}

/** Por qué el evento no admite convocatorias, o null si las admite. */
function motivoNoConvocable(fila: FilaEvento): ErrorConvocatoria | null {
    if (fila.evento_id === null) {
        return falla(409, 'EVENTO_NO_HABILITADO', 'La cotización todavía no se ha convertido en un evento');
    }
    if (!fila.confirmado) {
        return falla(409, 'EVENTO_NO_CONFIRMADO', 'El evento aún no está confirmado (falta el contrato firmado)');
    }
    if (fila.cotizacion_estado === 'cancelada') {
        return falla(409, 'EVENTO_CANCELADO', 'El evento está cancelado');
    }
    if (fila.fecha === null) {
        return falla(409, 'EVENTO_SIN_FECHA', 'El evento no tiene fecha definida');
    }
    if (!fila.fecha_vigente) {
        return falla(409, 'EVENTO_PASADO', 'La fecha del evento ya pasó');
    }
    return null;
}

const nombreDelEvento = (tipoEvento: string | null): string => limpiarTexto(tipoEvento ?? '').slice(0, MAX_NOMBRE_EVENTO);
const lugarDelEvento = (fila: FilaEvento): string =>
    limpiarTexto([fila.sede, fila.ciudad].filter(Boolean).join(', ')).slice(0, MAX_LUGAR);

/**
 * Un evento admite convocatorias si ya es evento (tiene fila en events), está confirmado
 * (contrato firmado), no está cancelado y su fecha es hoy o futura. "Hoy" se calcula en la
 * hora de Colombia: con la hora UTC del servidor, desde las 7 p. m. un evento de hoy parecería pasado.
 */
export async function obtenerEventoConvocable(db: Consulta, cotizacionId: number): Promise<EventoConvocable> {
    const fila = await leerEvento(db, cotizacionId);
    const motivo = motivoNoConvocable(fila);
    if (motivo) throw motivo;

    return {
        cotizacionId: Number(fila.cotizacion_id),
        eventoId: Number(fila.evento_id),
        fecha: fila.fecha as string, // motivoNoConvocable ya descartó la fecha vacía
        hora: fila.hora,
        tipoEvento: fila.tipo_evento,
        lugar: lugarDelEvento(fila)
    };
}

/**
 * Lo mismo que obtenerEventoConvocable pero sin lanzar error cuando el evento no admite
 * convocatorias: la pantalla usa `convocable` para mostrar u ocultar el botón, de modo que la
 * regla de negocio vive solo aquí y no se repite en el navegador.
 */
export async function describirEvento(db: Consulta, cotizacionId: number): Promise<EventoParaConvocar> {
    const fila = await leerEvento(db, cotizacionId);
    const motivo = motivoNoConvocable(fila);
    const nombre = nombreDelEvento(fila.tipo_evento);
    const lugar = lugarDelEvento(fila);
    return {
        cotizacionId: Number(fila.cotizacion_id),
        convocable: motivo === null,
        motivo: motivo ? { codigo: motivo.codigo, mensaje: motivo.message } : null,
        fecha: fila.fecha,
        horaInicio: fila.hora,
        nombre: nombre || null,
        lugar: lugar || null,
        requiereHoraInicio: fila.hora === HORA_SIN_DEFINIR,
        requiereNombre: !nombre,
        requiereLugar: !lugar
    };
}

// ---------------------------------------------------------------------------------------------
// Trabajadores que se pueden convocar
// ---------------------------------------------------------------------------------------------

interface FilaTrabajador {
    id: string;
    nombre: string | null;
    correo: string | null;
    rol: string | null;
    telefono: string | null;
    en_evento: boolean;
    convocatoria_id: string | null;
}

interface TrabajadorConvocado {
    trabajadorId: string;
    nombre: string;
    telefono: string;
}

type MotivoRechazo =
    | 'NO_ENCONTRADO'
    | 'NO_ES_TRABAJADOR'
    | 'YA_CONVOCADO'
    | 'YA_ASIGNADO'
    | 'TELEFONO_INVALIDO'
    | 'TELEFONO_DUPLICADO';

const ETIQUETA_MOTIVO: Record<MotivoRechazo, string> = {
    NO_ENCONTRADO: 'no existe',
    NO_ES_TRABAJADOR: `su cuenta no tiene el rol ${ROL_PERSONAL_LOGISTICA}`,
    YA_CONVOCADO: 'ya fue convocado a este evento',
    YA_ASIGNADO: 'ya está asignado a este evento',
    TELEFONO_INVALIDO: 'no tiene un celular válido para WhatsApp',
    TELEFONO_DUPLICADO: 'comparte el celular con otro trabajador seleccionado'
};

/**
 * Todo o nada: si alguno no se puede convocar no se crea nada y se informa el motivo de cada uno.
 * El teléfono es el de su cuenta (auth.users.phone, solo dígitos); un trabajador que ya figura en
 * event_staff para este evento (asignado a mano o convocado antes) no se puede convocar otra vez.
 */
async function validarTrabajadores(db: Consulta, eventoId: number, ids: string[]): Promise<TrabajadorConvocado[]> {
    const { rows } = await db.query<FilaTrabajador>(
        `select p.id, p.nombre, p.correo, r.name as rol, u.phone as telefono,
                (s.profile_id is not null) as en_evento, s.convocatoria_id
           from public.profiles p
           left join public.role r on r.id = p.role_id
           left join auth.users u on u.id = p.id
           left join public.event_staff s on s.profile_id = p.id and s.event_id = $2
          where p.id = any($1::uuid[])`,
        [ids, eventoId]
    );
    const porId = new Map(rows.map((fila) => [fila.id, fila]));

    const validos: TrabajadorConvocado[] = [];
    const problemas: { trabajadorId: string; nombre: string | null; motivo: MotivoRechazo }[] = [];
    for (const id of ids) {
        const fila = porId.get(id);
        if (!fila) {
            problemas.push({ trabajadorId: id, nombre: null, motivo: 'NO_ENCONTRADO' });
            continue;
        }
        const nombre = limpiarTexto(fila.nombre ?? fila.correo ?? 'Sin nombre');
        if (fila.rol !== ROL_PERSONAL_LOGISTICA) {
            problemas.push({ trabajadorId: id, nombre, motivo: 'NO_ES_TRABAJADOR' });
        } else if (fila.convocatoria_id !== null) {
            problemas.push({ trabajadorId: id, nombre, motivo: 'YA_CONVOCADO' });
        } else if (fila.en_evento) {
            problemas.push({ trabajadorId: id, nombre, motivo: 'YA_ASIGNADO' });
        } else {
            const telefono = normalizarTelefono(fila.telefono);
            if (telefono) validos.push({ trabajadorId: id, nombre, telefono });
            else problemas.push({ trabajadorId: id, nombre, motivo: 'TELEFONO_INVALIDO' });
        }
    }

    // Con dos trabajadores en el mismo número no se sabría de quién es cada respuesta
    const porTelefono = new Map<string, TrabajadorConvocado[]>();
    for (const trabajador of validos) {
        porTelefono.set(trabajador.telefono, [...(porTelefono.get(trabajador.telefono) ?? []), trabajador]);
    }
    for (const grupo of porTelefono.values()) {
        if (grupo.length < 2) continue;
        for (const trabajador of grupo) {
            problemas.push({ trabajadorId: trabajador.trabajadorId, nombre: trabajador.nombre, motivo: 'TELEFONO_DUPLICADO' });
        }
    }

    if (problemas.length > 0) {
        const resumen = problemas
            .slice(0, 5)
            .map((problema) => `${problema.nombre ?? problema.trabajadorId} (${ETIQUETA_MOTIVO[problema.motivo]})`)
            .join('; ');
        const resto = problemas.length > 5 ? ` y ${problemas.length - 5} más` : '';
        throw falla(422, 'TRABAJADORES_NO_VALIDOS', `No se puede convocar a: ${resumen}${resto}`, problemas);
    }
    return validos;
}

// ---------------------------------------------------------------------------------------------
// A quién se puede convocar (lista para la pantalla de selección)
// ---------------------------------------------------------------------------------------------

type MotivoCandidato = 'YA_CONVOCADO' | 'YA_ASIGNADO' | 'SIN_TELEFONO' | 'TELEFONO_INVALIDO';

const MENSAJE_CANDIDATO: Record<MotivoCandidato, string> = {
    YA_CONVOCADO: 'Ya fue convocado a este evento',
    YA_ASIGNADO: 'Ya está asignado a este evento',
    SIN_TELEFONO: 'No tiene un celular registrado en su cuenta',
    TELEFONO_INVALIDO: 'Su celular no es válido para WhatsApp'
};

export interface TrabajadorConvocableDto {
    id: string;
    nombre: string;
    /** Celular en formato internacional (+57...), o null si no tiene uno válido. */
    telefono: string | null;
    /** false si hoy no se le puede enviar la solicitud para este evento (ver `motivo`). */
    elegible: boolean;
    motivo: { codigo: MotivoCandidato; mensaje: string } | null;
    /** Marcó como no disponible el día del evento. Es solo una advertencia: no impide convocarlo. */
    noDisponibleEseDia: boolean;
}

interface FilaCandidato {
    id: string;
    nombre: string;
    telefono: string | null;
    en_evento: boolean;
    convocatoria_id: string | null;
    no_disponible: boolean;
}

/**
 * Los trabajadores (cuentas con rol "trabajador") con lo que la administradora necesita para elegir:
 * quiénes se pueden convocar a este evento y, de los demás, por qué no. Aplica las mismas reglas que
 * crearConvocatoria (que es la que decide), así la pantalla no ofrece lo que luego se rechazaría.
 */
export async function listarTrabajadoresConvocables(db: Consulta, cotizacionId: number): Promise<TrabajadorConvocableDto[]> {
    const evento = await obtenerEventoConvocable(db, cotizacionId);
    const { rows } = await db.query<FilaCandidato>(
        `select p.id,
                coalesce(nullif(btrim(p.nombre), ''), p.correo, 'Sin nombre') as nombre,
                u.phone as telefono,
                (s.profile_id is not null) as en_evento,
                s.convocatoria_id,
                exists (select 1 from public.unavailability_users n
                         where n.id_user = p.id and n.date = $2::date) as no_disponible
           from public.profiles p
           join public.role r on r.id = p.role_id
           left join auth.users u on u.id = p.id
           left join public.event_staff s on s.profile_id = p.id and s.event_id = $1
          where r.name = $3
          order by nombre, p.id`,
        [evento.eventoId, evento.fecha, ROL_PERSONAL_LOGISTICA]
    );

    return rows.map((fila) => {
        const telefono = normalizarTelefono(fila.telefono);
        let codigo: MotivoCandidato | null = null;
        if (fila.convocatoria_id !== null) codigo = 'YA_CONVOCADO';
        else if (fila.en_evento) codigo = 'YA_ASIGNADO';
        else if (fila.telefono === null || fila.telefono.trim() === '') codigo = 'SIN_TELEFONO';
        else if (!telefono) codigo = 'TELEFONO_INVALIDO';

        return {
            id: fila.id,
            nombre: limpiarTexto(fila.nombre),
            telefono,
            elegible: codigo === null,
            motivo: codigo ? { codigo, mensaje: MENSAJE_CANDIDATO[codigo] } : null,
            noDisponibleEseDia: fila.no_disponible
        };
    });
}

// ---------------------------------------------------------------------------------------------
// Lectura de convocatorias
// ---------------------------------------------------------------------------------------------

interface FilaConvocatoria {
    id: string;
    event_id: string | number;
    cotizacion_id: string | number;
    nombre_evento: string | null;
    fecha_evento: string | null;
    hora_inicio: string;
    hora_fin: string;
    lugar: string | null;
    estado: EstadoConvocatoria;
    envio_iniciado_en: Date | string | null;
    creado_en: Date | string;
}

interface FilaDestinatario {
    convocatoria_id: string;
    profile_id: string;
    nombre_trabajador: string;
    telefono: string | null;
    estado_respuesta: EstadoRespuesta;
    respondido_en: Date | string | null;
    estado_envio: EstadoEnvio;
    enviado_en: Date | string | null;
    error_envio: string | null;
}

// El nombre, la fecha y el lugar salen de la cotización, salvo que la convocatoria los corrija
const SELECT_CONVOCATORIA = `
    select c.id, c.event_id, e.quote_id as cotizacion_id,
           coalesce(c.nombre_evento, q.event_type) as nombre_evento,
           q.date::text as fecha_evento,
           to_char(c.hora_inicio, 'HH24:MI') as hora_inicio,
           to_char(c.hora_fin, 'HH24:MI') as hora_fin,
           coalesce(c.lugar, nullif(concat_ws(', ', coalesce(v.name, q.venue_nombre_manual, e.venue_nombre_manual), coalesce(v.city, t.city)), '')) as lugar,
           c.estado, c.envio_iniciado_en, c.creado_en
      from public.convocatorias c
      join public.events e on e.id = c.event_id
      join public.quote q on q.id = e.quote_id
      left join public.venue v on v.id = q.venue_id
      left join public.transportation t on t.id = q.transportation_id`;

const aIso = (valor: Date | string | null): string | null =>
    valor === null ? null : new Date(valor).toISOString();

async function armarConvocatorias(db: Consulta, filas: FilaConvocatoria[]): Promise<ConvocatoriaDto[]> {
    if (filas.length === 0) return [];
    const { rows } = await db.query<FilaDestinatario>(
        `select s.convocatoria_id, s.profile_id,
                coalesce(nullif(btrim(p.nombre), ''), p.correo, 'Sin nombre') as nombre_trabajador,
                u.phone as telefono, s.estado_respuesta, s.respondido_en, s.estado_envio, s.enviado_en, s.error_envio
           from public.event_staff s
           join public.profiles p on p.id = s.profile_id
           left join auth.users u on u.id = s.profile_id
          where s.convocatoria_id = any($1::uuid[])
          order by nombre_trabajador, s.profile_id`,
        [filas.map((fila) => fila.id)]
    );

    const porConvocatoria = new Map<string, DestinatarioDto[]>();
    for (const fila of rows) {
        const destinatario: DestinatarioDto = {
            trabajadorId: fila.profile_id,
            nombre: fila.nombre_trabajador,
            telefono: normalizarTelefono(fila.telefono),
            estadoRespuesta: fila.estado_respuesta,
            respondidoEn: aIso(fila.respondido_en),
            estadoEnvio: fila.estado_envio,
            enviadoEn: aIso(fila.enviado_en),
            error: fila.error_envio
        };
        porConvocatoria.set(fila.convocatoria_id, [...(porConvocatoria.get(fila.convocatoria_id) ?? []), destinatario]);
    }

    return filas.map((fila) => {
        const destinatarios = porConvocatoria.get(fila.id) ?? [];
        const contar = (condicion: (d: DestinatarioDto) => boolean) => destinatarios.filter(condicion).length;
        return {
            id: fila.id,
            eventoId: Number(fila.event_id),
            cotizacionId: Number(fila.cotizacion_id),
            nombreEvento: fila.nombre_evento,
            fechaEvento: fila.fecha_evento,
            horaInicio: fila.hora_inicio,
            horaFin: fila.hora_fin,
            lugar: fila.lugar,
            estado: fila.estado,
            envioIniciadoEn: aIso(fila.envio_iniciado_en),
            creadoEn: aIso(fila.creado_en) as string,
            resumen: {
                total: destinatarios.length,
                confirmados: contar((d) => d.estadoRespuesta === 'CONFIRMADO'),
                rechazados: contar((d) => d.estadoRespuesta === 'RECHAZADO'),
                pendientes: contar((d) => d.estadoRespuesta === 'PENDIENTE'),
                enviados: contar((d) => d.estadoEnvio === 'ENVIADO'),
                conError: contar((d) => d.estadoEnvio === 'ERROR')
            },
            destinatarios
        };
    });
}

async function obtenerConvocatoria(db: Consulta, id: string): Promise<ConvocatoriaDto | null> {
    const { rows } = await db.query<FilaConvocatoria>(`${SELECT_CONVOCATORIA} where c.id = $1`, [id]);
    return (await armarConvocatorias(db, rows))[0] ?? null;
}

/** Todas las convocatorias de un evento, cada una con sus trabajadores y respuestas (sin mezclarlas). */
export async function listarConvocatorias(db: Consulta, cotizacionId: number): Promise<ConvocatoriaDto[]> {
    const existe = await db.query('select 1 from public.quote where id = $1', [cotizacionId]);
    if (existe.rows.length === 0) throw falla(404, 'EVENTO_NO_ENCONTRADO', 'No existe un evento con ese identificador');

    const { rows } = await db.query<FilaConvocatoria>(
        `${SELECT_CONVOCATORIA} where e.quote_id = $1 order by c.creado_en desc, c.id`,
        [cotizacionId]
    );
    return armarConvocatorias(db, rows);
}

// ---------------------------------------------------------------------------------------------
// Crear una convocatoria
// ---------------------------------------------------------------------------------------------

// Una sola sentencia: la convocatoria y todos sus trabajadores se crean juntos o no se crea nada
const SQL_INSERTAR_CONVOCATORIA = `
    with nueva as (
        insert into public.convocatorias (event_id, hora_inicio, hora_fin, nombre_evento, lugar)
        values ($1, $2::time, $3::time, $4, $5)
        returning id
    )
    insert into public.event_staff (event_id, profile_id, convocatoria_id, estado_respuesta, estado_envio)
    select $1, t.profile_id, nueva.id, 'PENDIENTE', 'PENDIENTE'
      from nueva, unnest($6::uuid[]) as t(profile_id)
    returning convocatoria_id`;

export async function crearConvocatoria(db: Consulta, solicitud: SolicitudCrear): Promise<ConvocatoriaDto> {
    const evento = await obtenerEventoConvocable(db, solicitud.cotizacionId);

    // Sin nombre ni lugar propios se usan los de la cotización: tiene que haber alguno de los dos
    const nombreEfectivo = solicitud.nombreEvento ?? nombreDelEvento(evento.tipoEvento);
    if (!nombreEfectivo) {
        throw falla(400, 'NOMBRE_EVENTO_REQUERIDO', 'El evento no tiene tipo definido: indica el nombre del evento');
    }
    if (!(solicitud.lugar ?? evento.lugar)) {
        throw falla(400, 'LUGAR_REQUERIDO', 'El evento no tiene lugar definido: indica el lugar');
    }

    // Una hora 00:00 por defecto suele ser un marcador sin completar, no la hora real del evento
    if (solicitud.horaInicio === undefined && evento.hora === HORA_SIN_DEFINIR) {
        throw falla(400, 'HORA_INICIO_REQUERIDA', 'El evento no tiene hora de inicio definida: indícala (formato HH:MM)');
    }
    const horaInicio = solicitud.horaInicio ?? evento.hora;
    if (horaInicio === solicitud.horaFin) {
        throw falla(400, 'HORARIO_INVALIDO', 'La hora de fin no puede ser igual a la de inicio');
    }

    const trabajadores = await validarTrabajadores(db, evento.eventoId, solicitud.trabajadorIds);

    const { rows } = await db.query<{ convocatoria_id: string }>(SQL_INSERTAR_CONVOCATORIA, [
        evento.eventoId,
        horaInicio,
        solicitud.horaFin,
        solicitud.nombreEvento ?? null,
        solicitud.lugar ?? null,
        trabajadores.map((t) => t.trabajadorId)
    ]);
    const convocatoriaId = rows[0]?.convocatoria_id;
    const convocatoria = convocatoriaId ? await obtenerConvocatoria(db, convocatoriaId) : null;
    if (!convocatoria) throw new Error('No se pudo leer la convocatoria recién creada');
    return convocatoria;
}

// ---------------------------------------------------------------------------------------------
// Iniciar el envío
// ---------------------------------------------------------------------------------------------

function errorPorEstado(estado: EstadoConvocatoria): ErrorConvocatoria {
    if (estado === 'CANCELADA') return falla(409, 'CONVOCATORIA_CANCELADA', 'La convocatoria está cancelada', { estado });
    if (estado === 'ENVIADA') return falla(409, 'CONVOCATORIA_YA_ENVIADA', 'La convocatoria ya fue enviada', { estado });
    return falla(409, 'CONVOCATORIA_EN_ENVIO', 'La convocatoria ya está en proceso de envío', { estado });
}

/**
 * Pasa la convocatoria de BORRADOR a ENVIANDO con un UPDATE condicional: si llegan dos
 * solicitudes a la vez (doble clic, reintento) solo una lo consigue y la otra recibe 409, así
 * que el envío nunca se dispara dos veces. Todavía NO manda mensajes: el despacho a n8n se
 * conecta en el Numeral 7, y hasta entonces ningún destinatario figura como enviado.
 */
export async function iniciarEnvio(db: Consulta, convocatoriaId: string): Promise<ConvocatoriaDto> {
    const { rows } = await db.query<{
        estado: EstadoConvocatoria;
        cotizacion_id: string | number;
        destinatarios: string | number;
    }>(
        `select c.estado, e.quote_id as cotizacion_id,
                (select count(*) from public.event_staff s where s.convocatoria_id = c.id) as destinatarios
           from public.convocatorias c
           join public.events e on e.id = c.event_id
          where c.id = $1`,
        [convocatoriaId]
    );
    const actual = rows[0];
    if (!actual) throw falla(404, 'CONVOCATORIA_NO_ENCONTRADA', 'La convocatoria no existe');
    if (actual.estado !== 'BORRADOR') throw errorPorEstado(actual.estado);
    if (Number(actual.destinatarios) === 0) {
        throw falla(409, 'SIN_DESTINATARIOS', 'La convocatoria no tiene trabajadores a quienes enviar');
    }
    // Entre crearla y enviarla el evento pudo cancelarse o vencer
    await obtenerEventoConvocable(db, Number(actual.cotizacion_id));

    const reclamada = await db.query<{ id: string }>(
        `update public.convocatorias
            set estado = 'ENVIANDO', envio_iniciado_en = now()
          where id = $1 and estado = 'BORRADOR'
          returning id`,
        [convocatoriaId]
    );
    if (reclamada.rows.length === 0) {
        const ahora = await db.query<{ estado: EstadoConvocatoria }>(
            'select estado from public.convocatorias where id = $1',
            [convocatoriaId]
        );
        throw errorPorEstado(ahora.rows[0]?.estado ?? 'ENVIANDO');
    }

    const convocatoria = await obtenerConvocatoria(db, convocatoriaId);
    if (!convocatoria) throw new Error('No se pudo leer la convocatoria');
    return convocatoria;
}

// ---------------------------------------------------------------------------------------------
// Mensajes que llegan de n8n
// ---------------------------------------------------------------------------------------------

function textoLimitado(valor: unknown, campo: string, maximo: number, obligatorio: boolean): string | null {
    if (valor === undefined || valor === null || valor === '') {
        if (obligatorio) throw falla(400, 'CAMPO_REQUERIDO', `Falta el campo ${campo}`);
        return null;
    }
    if (typeof valor !== 'string') throw falla(400, 'TEXTO_INVALIDO', `${campo} debe ser texto`);
    if (valor.length > maximo) throw falla(400, 'TEXTO_MUY_LARGO', `${campo} no puede superar ${maximo} caracteres`);
    return valor;
}

/** Meta entrega la hora en segundos desde 1970; también se acepta una fecha ISO. Sin hora, la actual. */
function fechaDeMensaje(valor: unknown): string {
    if (valor === undefined || valor === null || valor === '') return new Date().toISOString();
    let fecha: Date;
    if (typeof valor === 'number') fecha = new Date(valor * 1000);
    else if (typeof valor === 'string' && /^[0-9]{9,11}$/.test(valor)) fecha = new Date(Number(valor) * 1000);
    else if (typeof valor === 'string') fecha = new Date(valor);
    else fecha = new Date(NaN);
    if (Number.isNaN(fecha.getTime())) throw falla(400, 'FECHA_INVALIDA', 'recibidoEn no es una fecha válida');
    return fecha.toISOString();
}

export function validarMensajeEntrante(cuerpo: unknown): MensajeEntrante {
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
        throw falla(400, 'SOLICITUD_INVALIDA', 'El cuerpo de la solicitud debe ser un objeto JSON');
    }
    const datos = cuerpo as Record<string, unknown>;

    const waMessageId = textoLimitado(datos.waMessageId, 'waMessageId', 255, true) as string;
    if (/\s/.test(waMessageId)) throw falla(400, 'MENSAJE_INVALIDO', 'waMessageId no puede contener espacios');

    const telefono = telefonoDesdeWhatsApp(typeof datos.telefono === 'string' ? datos.telefono : null);
    if (!telefono) throw falla(400, 'TELEFONO_INVALIDO', 'El teléfono del remitente no es válido (formato internacional)');

    if (datos.respuesta !== undefined && datos.respuesta !== null && datos.respuesta !== 'CONFIRMADO' && datos.respuesta !== 'RECHAZADO') {
        throw falla(400, 'RESPUESTA_INVALIDA', 'respuesta debe ser CONFIRMADO o RECHAZADO');
    }

    return {
        waMessageId,
        telefono,
        tipo: textoLimitado(datos.tipo, 'tipo', 50, true) as string,
        contenido: textoLimitado(datos.contenido, 'contenido', 4096, false),
        payload: textoLimitado(datos.payload, 'payload', 1024, false),
        contextoWaMessageId: textoLimitado(datos.contextoWaMessageId, 'contextoWaMessageId', 255, false),
        recibidoEn: fechaDeMensaje(datos.recibidoEn),
        respuesta: datos.respuesta === 'CONFIRMADO' || datos.respuesta === 'RECHAZADO' ? datos.respuesta : null
    };
}

/**
 * Guarda el mensaje en la bitácora. El id de Meta es la clave: si el mismo mensaje llega otra
 * vez (n8n reintenta) no se inserta de nuevo y se avisa como duplicado. Todavía NO asocia el
 * mensaje a un trabajador ni cambia su respuesta: eso es el Numeral 9.
 */
export async function registrarMensajeEntrante(db: Consulta, mensaje: MensajeEntrante): Promise<{ duplicado: boolean }> {
    const { rows } = await db.query<{ wa_message_id: string }>(
        `insert into public.mensajes_whatsapp_entrantes
             (wa_message_id, telefono_remitente, tipo, contenido, payload, contexto_wa_message_id, recibido_en, respuesta)
         values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8)
         on conflict (wa_message_id) do nothing
         returning wa_message_id`,
        [
            mensaje.waMessageId,
            mensaje.telefono,
            mensaje.tipo,
            mensaje.contenido,
            mensaje.payload,
            mensaje.contextoWaMessageId,
            mensaje.recibidoEn,
            mensaje.respuesta
        ]
    );
    return { duplicado: rows.length === 0 };
}
