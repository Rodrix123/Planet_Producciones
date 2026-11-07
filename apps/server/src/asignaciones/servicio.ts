// Asignación de personal a eventos confirmados (historia de usuario 2).
//
// Reutiliza lo que ya existe en la base (ver supabase/migrations/0011_asignacion_personal.sql):
// - Cada asignación es una fila de event_staff (evento + perfil). Las hechas aquí, a mano, van sin
//   convocatoria y sin respuesta; las que llegan del flujo de WhatsApp (rama
//   feature/disponibilidad-personal-whatsapp) traen su convocatoria y cuentan solo si quedaron
//   CONFIRMADO. Las PENDIENTE o RECHAZADO no son personal asignado.
// - El personal es la nómina activa (empleados) más las cuentas con el rol "trabajador". Como
//   event_staff apunta a profiles, cada persona de la nómina se asigna con su cuenta: la de su
//   celular si ya existe y, si no, una que se crea aquí la primera vez que se le asigna (usuario de
//   Supabase Auth solo con su celular, sin correo ni contraseña, y su perfil "trabajador").
// - Fecha y hora de inicio salen del evento o, si faltan, de su cotización; la hora de fin es
//   events.hora_fin, que la administradora define al asignar.
//
// Las consultas reciben la conexión por parámetro (ver conexion.ts) para poder probarlas con un
// Postgres embebido sin tocar la base real.

import type { BaseDeDatos, Conexion } from './conexion';
import {
    esHora,
    intervaloDe,
    motivoDelEvento,
    motivosDePersona,
    normalizarCelular,
    terminaAlDiaSiguiente,
    diasQueOcupa,
    type Compromiso,
    type Intervalo,
    type MotivoPersona
} from './reglas';

/** Rol de profiles del personal operativo (el mismo nombre que usa la rama de WhatsApp). */
export const ROL_TRABAJADOR = 'trabajador';

const MAX_PERSONAS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALFABETICO = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Error esperado con su código HTTP; el router lo convierte en { status: 'error', codigo, message }. */
export class ErrorAsignacion extends Error {
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
    new ErrorAsignacion(estadoHttp, codigo, mensaje, detalles);

/** Crea los usuarios de Supabase Auth del personal. Se inyecta para probar sin tocar Supabase. */
export interface CuentasDePersonal {
    /** Usuario solo con celular (sin correo ni contraseña). `yaExiste` si ese celular ya tiene usuario. */
    crearUsuario(datos: { telefono: string; nombre: string; empleadoId: string }): Promise<{ id: string } | { yaExiste: true }>;
    eliminarUsuario(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------------------------
// Lo que recibe la pantalla
// ---------------------------------------------------------------------------------------------

export interface EventoDto {
    id: number;
    nombre: string;
    fecha: string | null;
    horaInicio: string | null;
    horaFin: string | null;
    lugar: string | null;
    confirmado: boolean;
    asignable: boolean;
    motivo: { codigo: string; mensaje: string } | null;
}

export interface AsignadoDto {
    perfilId: string;
    nombre: string;
    /** manual = asignado en esta pantalla; whatsapp = confirmó una convocatoria. */
    origen: 'manual' | 'whatsapp';
    horaInicio: string | null;
    horaFin: string | null;
    puedeQuitarse: boolean;
    /** Choques con otros eventos según la hora de finalización evaluada (vacío = sin problema). */
    motivos: MotivoPersona[];
}

export type EstadoPersona =
    | 'DISPONIBLE'
    | 'ASIGNADO'
    | 'CONVOCADO'
    | 'RECHAZO_WHATSAPP'
    | 'NO_DISPONIBLE'
    | 'SIN_CELULAR'
    | 'SIN_COMPROBAR';

export interface PersonaDto {
    /** Lo que se envía al asignar: "p:<perfil>" si ya tiene cuenta, "e:<empleado>" si aún no. */
    clave: string;
    perfilId: string | null;
    empleadoId: string | null;
    nombre: string;
    /** Tipo de vinculación: con contrato, freelance... */
    detalle: string;
    estado: EstadoPersona;
    seleccionable: boolean;
    motivos: { codigo: string; mensaje: string }[];
}

export interface ConsultaPersonalDto {
    evento: EventoDto;
    /** Hora de finalización con la que se calculó la disponibilidad (la propuesta o la guardada). */
    horaFinEvaluada: string | null;
    terminaAlDiaSiguiente: boolean;
    asignados: AsignadoDto[];
    personal: PersonaDto[];
}

// ---------------------------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------------------------

interface FilaEvento {
    id: string;
    confirmado: boolean;
    cancelado: boolean;
    fecha: string | null;
    hora_inicio: string | null;
    hora_fin: string | null;
    nombre: string;
    lugar: string | null;
    vigente: boolean;
}

// La hora 00:00 de events es relleno de "finalizar cotización" cuando nadie indicó la hora: se toma la
// de la cotización. Una medianoche real se conserva porque crearEvento la guarda en las dos tablas.
const HORA_INICIO_SQL = `coalesce(nullif(e.hour, time '00:00'), q.hour)`;
const NOMBRE_EVENTO_SQL = `coalesce(nullif(btrim(e.event_type), ''), nullif(btrim(q.event_type), ''), 'Evento')`;

async function leerEvento(c: Conexion, eventoId: number, bloquear = false): Promise<FilaEvento | null> {
    const { rows } = await c.query<FilaEvento>(
        `select e.id::text as id,
                e.confirmed as confirmado,
                (q.estado = 'cancelada') as cancelado,
                coalesce(e.date, q.date)::text as fecha,
                to_char(${HORA_INICIO_SQL}, 'HH24:MI') as hora_inicio,
                to_char(e.hora_fin, 'HH24:MI') as hora_fin,
                ${NOMBRE_EVENTO_SQL} as nombre,
                nullif(concat_ws(' · ', coalesce(v.name, e.venue_nombre_manual, q.venue_nombre_manual), v.city), '') as lugar,
                coalesce(coalesce(e.date, q.date) >= (now() at time zone 'America/Bogota')::date, false) as vigente
           from public.events e
           join public.quote q on q.id = e.quote_id
           left join public.venue v on v.id = coalesce(e.venue_id, q.venue_id)
          where e.id = $1
          ${bloquear ? 'for update of e' : ''}`,
        [eventoId]
    );
    return rows[0] ?? null;
}

interface FilaDelEvento {
    perfil_id: string;
    nombre: string;
    de_whatsapp: boolean;
    estado_respuesta: string | null;
    conv_inicio: string | null;
    conv_fin: string | null;
}

/** Filas de event_staff de este evento (asignadas, convocadas o que rechazaron). */
async function filasDelEvento(c: Conexion, eventoId: number): Promise<FilaDelEvento[]> {
    const { rows } = await c.query<FilaDelEvento>(
        `select s.profile_id::text as perfil_id,
                coalesce(nullif(btrim(p.nombre), ''), p.correo, 'Sin nombre') as nombre,
                (s.convocatoria_id is not null) as de_whatsapp,
                s.estado_respuesta,
                to_char(cv.hora_inicio, 'HH24:MI') as conv_inicio,
                to_char(cv.hora_fin, 'HH24:MI') as conv_fin
           from public.event_staff s
           join public.profiles p on p.id = s.profile_id
           left join public.convocatorias cv on cv.id = s.convocatoria_id
          where s.event_id = $1`,
        [eventoId]
    );
    return rows;
}

const cuentaComoAsignado = (estadoRespuesta: string | null): boolean =>
    estadoRespuesta === null || estadoRespuesta === 'CONFIRMADO';

interface Candidato {
    empleadoId: string | null;
    perfilId: string | null;
    nombre: string;
    tipoContrato: string | null;
    telefono: string | null;
}

const DETALLE_CONTRATO: Record<string, string> = {
    con_contrato: 'Con contrato',
    freelance_fijo: 'Freelance fijo',
    freelance_no_fijo: 'Freelance no fijo'
};

/**
 * El personal que se puede asignar: la nómina activa (con la cuenta de su celular, si la tiene) y
 * las cuentas "trabajador" que no son de la nómina. Una cuenta de alguien que salió de la nómina
 * (activo = false) no aparece. El celular se normaliza igual que normalizarCelular (reglas.ts).
 */
async function listarCandidatos(c: Conexion): Promise<Candidato[]> {
    const { rows } = await c.query<{
        empleado_id: string | null;
        perfil_id: string | null;
        nombre: string;
        tipo_contrato: string | null;
        telefono: string | null;
    }>(
        `with nomina as (
            select e.id::text as empleado_id, btrim(e.nombre) as nombre, e.tipo_contrato, e.activo,
                   case when x.d ~ '^3[0-9]{9}$' then '57' || x.d else nullif(x.d, '') end as telefono
              from public.empleados e
             cross join lateral (select regexp_replace(coalesce(e.telefono, ''), '[^0-9]', '', 'g') as d) x
         )
         select n.empleado_id, p.id::text as perfil_id, n.nombre, n.tipo_contrato, n.telefono
           from nomina n
           left join auth.users u on u.phone = n.telefono
           left join public.profiles p on p.id = u.id
          where n.activo
         union all
         select null, p.id::text, coalesce(nullif(btrim(p.nombre), ''), p.correo, 'Sin nombre'), null, u.phone
           from public.profiles p
           join public.role r on r.id = p.role_id
           left join auth.users u on u.id = p.id
          where r.name = $1
            and not exists (select 1 from nomina n where n.telefono = u.phone)`,
        [ROL_TRABAJADOR]
    );

    // Dos fichas de nómina con el mismo celular llevarían a la misma cuenta: se lista una sola vez.
    const vistos = new Set<string>();
    const candidatos: Candidato[] = [];
    for (const fila of rows) {
        if (fila.perfil_id) {
            if (vistos.has(fila.perfil_id)) continue;
            vistos.add(fila.perfil_id);
        }
        candidatos.push({
            empleadoId: fila.empleado_id,
            perfilId: fila.perfil_id,
            nombre: fila.nombre || 'Sin nombre',
            tipoContrato: fila.tipo_contrato,
            telefono: fila.telefono
        });
    }
    return candidatos.sort((a, b) => ALFABETICO.compare(a.nombre, b.nombre));
}

const claveDe = (c: Candidato): string => (c.perfilId ? `p:${c.perfilId}` : `e:${c.empleadoId}`);

/** Eventos (distintos de este) en los que cada persona ya está asignada, del día anterior al siguiente. */
async function compromisosDe(
    c: Conexion,
    perfilIds: string[],
    eventoId: number,
    fecha: string
): Promise<Map<string, Compromiso[]>> {
    const porPerfil = new Map<string, Compromiso[]>();
    if (perfilIds.length === 0) return porPerfil;
    const { rows } = await c.query<{
        perfil_id: string;
        evento_id: string;
        nombre: string;
        fecha: string | null;
        hora_inicio: string | null;
        hora_fin: string | null;
    }>(
        `select s.profile_id::text as perfil_id, e.id::text as evento_id,
                ${NOMBRE_EVENTO_SQL} as nombre,
                coalesce(e.date, q.date)::text as fecha,
                to_char(case when cv.id is null then ${HORA_INICIO_SQL} else cv.hora_inicio end, 'HH24:MI') as hora_inicio,
                to_char(case when cv.id is null then e.hora_fin else cv.hora_fin end, 'HH24:MI') as hora_fin
           from public.event_staff s
           join public.events e on e.id = s.event_id
           join public.quote q on q.id = e.quote_id
           left join public.convocatorias cv on cv.id = s.convocatoria_id
          where s.profile_id = any($1::uuid[])
            and s.event_id <> $2
            and (s.estado_respuesta is null or s.estado_respuesta = 'CONFIRMADO')
            and q.estado <> 'cancelada'
            and coalesce(e.date, q.date) between $3::date - 1 and $3::date + 1
          order by fecha, hora_inicio`,
        [perfilIds, eventoId, fecha]
    );
    for (const fila of rows) {
        const lista = porPerfil.get(fila.perfil_id) ?? [];
        lista.push({
            eventoId: Number(fila.evento_id),
            nombreEvento: fila.nombre,
            fecha: fila.fecha,
            horaInicio: fila.hora_inicio,
            horaFin: fila.hora_fin
        });
        porPerfil.set(fila.perfil_id, lista);
    }
    return porPerfil;
}

/** Días marcados como no disponibles (unavailability_users) entre los indicados. */
async function diasNoDisponiblesDe(c: Conexion, perfilIds: string[], dias: string[]): Promise<Map<string, string[]>> {
    const porPerfil = new Map<string, string[]>();
    if (perfilIds.length === 0) return porPerfil;
    const { rows } = await c.query<{ perfil_id: string; fecha: string }>(
        `select id_user::text as perfil_id, date::text as fecha
           from public.unavailability_users
          where id_user = any($1::uuid[]) and date = any($2::date[])`,
        [perfilIds, dias]
    );
    for (const fila of rows) porPerfil.set(fila.perfil_id, [...(porPerfil.get(fila.perfil_id) ?? []), fila.fecha]);
    return porPerfil;
}

/** Motivos por persona para un intervalo del evento: choques con otros eventos y días no disponibles. */
async function evaluarPerfiles(
    c: Conexion,
    eventoId: number,
    fecha: string,
    intervalo: Intervalo,
    perfilIds: string[]
): Promise<Map<string, MotivoPersona[]>> {
    // Una tras otra: dentro de una transacción comparten la misma conexión.
    const compromisos = await compromisosDe(c, perfilIds, eventoId, fecha);
    const noDisponibles = await diasNoDisponiblesDe(c, perfilIds, diasQueOcupa(intervalo));
    const motivos = new Map<string, MotivoPersona[]>();
    for (const id of perfilIds) {
        motivos.set(id, motivosDePersona({ fecha, intervalo }, compromisos.get(id) ?? [], noDisponibles.get(id) ?? []));
    }
    return motivos;
}

function aEventoDto(fila: FilaEvento): EventoDto {
    const motivo = motivoDelEvento({
        confirmado: fila.confirmado,
        cancelado: fila.cancelado,
        fecha: fila.fecha,
        vigente: fila.vigente,
        horaInicio: fila.hora_inicio
    });
    return {
        id: Number(fila.id),
        nombre: fila.nombre,
        fecha: fila.fecha,
        horaInicio: fila.hora_inicio,
        horaFin: fila.hora_fin,
        lugar: fila.lugar,
        confirmado: fila.confirmado,
        asignable: motivo === null,
        motivo
    };
}

async function eventoExistente(c: Conexion, eventoId: number, bloquear = false): Promise<FilaEvento> {
    const fila = await leerEvento(c, eventoId, bloquear);
    if (!fila) throw falla(404, 'EVENTO_NO_ENCONTRADO', 'No existe un evento con ese identificador.');
    return fila;
}

function leerHoraFin(valor: unknown, campo = 'La hora de finalización'): string {
    if (!esHora(valor)) throw falla(400, 'HORA_FIN_INVALIDA', `${campo} debe tener el formato HH:MM (por ejemplo 23:30).`);
    return valor;
}

function intervaloDelEvento(fila: FilaEvento, horaFin: string): Intervalo {
    const intervalo = intervaloDe(fila.fecha, fila.hora_inicio, horaFin);
    if (!intervalo) {
        throw falla(400, 'HORA_FIN_INVALIDA', 'La hora de finalización no puede ser igual a la hora de inicio.');
    }
    return intervalo;
}

// ---------------------------------------------------------------------------------------------
// Consultar (GET)
// ---------------------------------------------------------------------------------------------

/**
 * Evento, personal asignado y, si el evento admite asignaciones, todo el personal con su
 * disponibilidad. La disponibilidad se calcula con `horaFinPropuesta` (lo que la administradora está
 * escribiendo) o, si no viene, con la hora de finalización guardada; sin ninguna no se puede comprobar.
 */
export async function consultarPersonal(
    db: Conexion,
    eventoId: number,
    horaFinPropuesta?: unknown
): Promise<ConsultaPersonalDto> {
    const fila = await eventoExistente(db, eventoId);
    const evento = aEventoDto(fila);
    const propuesta =
        horaFinPropuesta === undefined || horaFinPropuesta === '' ? null : leerHoraFin(horaFinPropuesta);
    const horaFin = propuesta ?? fila.hora_fin;
    const intervalo = evento.asignable && horaFin ? intervaloDelEvento(fila, horaFin) : null;

    const filas = await filasDelEvento(db, eventoId);
    const asignadas = filas.filter((f) => cuentaComoAsignado(f.estado_respuesta));
    const manuales = asignadas.filter((f) => !f.de_whatsapp).map((f) => f.perfil_id);
    const motivosAsignados =
        intervalo && fila.fecha ? await evaluarPerfiles(db, eventoId, fila.fecha, intervalo, manuales) : new Map<string, MotivoPersona[]>();

    const asignados: AsignadoDto[] = asignadas
        .map((f) => ({
            perfilId: f.perfil_id,
            nombre: f.nombre,
            origen: f.de_whatsapp ? ('whatsapp' as const) : ('manual' as const),
            horaInicio: f.de_whatsapp ? f.conv_inicio : fila.hora_inicio,
            horaFin: f.de_whatsapp ? f.conv_fin : horaFin,
            puedeQuitarse: evento.asignable && !f.de_whatsapp,
            motivos: motivosAsignados.get(f.perfil_id) ?? []
        }))
        .sort((a, b) => ALFABETICO.compare(a.nombre, b.nombre));

    const respuesta: ConsultaPersonalDto = {
        evento,
        horaFinEvaluada: horaFin,
        terminaAlDiaSiguiente: intervalo ? terminaAlDiaSiguiente(intervalo) : false,
        asignados,
        personal: []
    };
    if (!evento.asignable) return respuesta;

    const candidatos = await listarCandidatos(db);
    const enEvento = new Map(filas.map((f) => [f.perfil_id, f]));
    const conCuenta = candidatos.map((c) => c.perfilId).filter((id): id is string => id !== null && !enEvento.has(id));
    const motivos =
        intervalo && fila.fecha ? await evaluarPerfiles(db, eventoId, fila.fecha, intervalo, conCuenta) : new Map<string, MotivoPersona[]>();

    respuesta.personal = candidatos.map((c): PersonaDto => {
        const base = {
            clave: claveDe(c),
            perfilId: c.perfilId,
            empleadoId: c.empleadoId,
            nombre: c.nombre,
            detalle: (c.tipoContrato && DETALLE_CONTRATO[c.tipoContrato]) || 'Personal de eventos'
        };
        const propia = c.perfilId ? enEvento.get(c.perfilId) : undefined;
        if (propia) {
            if (cuentaComoAsignado(propia.estado_respuesta)) {
                return { ...base, estado: 'ASIGNADO', seleccionable: false, motivos: [] };
            }
            return propia.estado_respuesta === 'PENDIENTE'
                ? { ...base, estado: 'CONVOCADO', seleccionable: false, motivos: [{ codigo: 'YA_CONVOCADO', mensaje: 'Fue convocado por WhatsApp a este evento y aún no responde.' }] }
                : { ...base, estado: 'RECHAZO_WHATSAPP', seleccionable: false, motivos: [{ codigo: 'RECHAZO_WHATSAPP', mensaje: 'Rechazó la convocatoria de este evento por WhatsApp.' }] };
        }
        if (!c.perfilId && !normalizarCelular(c.telefono)) {
            return {
                ...base,
                estado: 'SIN_CELULAR',
                seleccionable: false,
                motivos: [{ codigo: 'SIN_CELULAR', mensaje: 'Registra un celular válido en su ficha de la nómina para poder asignarlo.' }]
            };
        }
        if (!intervalo) {
            return {
                ...base,
                estado: 'SIN_COMPROBAR',
                seleccionable: false,
                motivos: [{ codigo: 'SIN_HORA_FIN', mensaje: 'Indica la hora de finalización del evento para comprobar su disponibilidad.' }]
            };
        }
        const suyos: MotivoPersona[] = c.perfilId ? motivos.get(c.perfilId) ?? [] : [];
        return suyos.length > 0
            ? { ...base, estado: 'NO_DISPONIBLE', seleccionable: false, motivos: suyos }
            : { ...base, estado: 'DISPONIBLE', seleccionable: true, motivos: [] };
    });
    return respuesta;
}

// ---------------------------------------------------------------------------------------------
// Asignar (POST)
// ---------------------------------------------------------------------------------------------

export interface SolicitudAsignar {
    horaFin: string;
    claves: string[];
}

export function validarSolicitudAsignar(cuerpo: unknown): SolicitudAsignar {
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
        throw falla(400, 'SOLICITUD_INVALIDA', 'El cuerpo de la solicitud debe ser un objeto JSON.');
    }
    const datos = cuerpo as Record<string, unknown>;
    const horaFin = leerHoraFin(datos.horaFin);
    const personal = datos.personal ?? [];
    if (!Array.isArray(personal)) throw falla(400, 'SOLICITUD_INVALIDA', '"personal" debe ser una lista.');
    const claves = [...new Set(personal)];
    for (const clave of claves) {
        if (typeof clave !== 'string' || !/^[pe]:/.test(clave) || !UUID.test(clave.slice(2))) {
            throw falla(400, 'PERSONA_INVALIDA', 'La selección de personal no es válida. Actualiza la ventana e intenta de nuevo.');
        }
    }
    if (claves.length > MAX_PERSONAS) {
        throw falla(400, 'DEMASIADAS_PERSONAS', `No se pueden asignar más de ${MAX_PERSONAS} personas a la vez.`);
    }
    return { horaFin, claves: claves as string[] };
}

interface Problema {
    clave: string;
    nombre: string;
    codigo: string;
    mensaje: string;
}

interface Evaluacion {
    evento: FilaEvento;
    /** Candidatos ya resueltos; los que no tienen cuenta todavía llevan perfilId null. */
    seleccion: Candidato[];
    horaFinCambia: boolean;
    problemas: Problema[];
}

/**
 * Aplica todas las reglas a una solicitud. Con `bloquear` (dentro de la transacción) bloquea el
 * evento y los perfiles para que otra asignación simultánea no use datos viejos.
 */
async function evaluarSolicitud(c: Conexion, eventoId: number, solicitud: SolicitudAsignar, bloquear: boolean): Promise<Evaluacion> {
    const fila = await eventoExistente(c, eventoId, bloquear);
    const evento = aEventoDto(fila);
    if (evento.motivo) throw falla(409, evento.motivo.codigo, evento.motivo.mensaje);
    const intervalo = intervaloDelEvento(fila, solicitud.horaFin);
    const fecha = fila.fecha as string; // motivoDelEvento ya descartó un evento sin fecha
    const horaFinCambia = fila.hora_fin !== solicitud.horaFin;
    if (solicitud.claves.length === 0 && !horaFinCambia) {
        throw falla(400, 'SIN_SELECCION', 'Selecciona al menos una persona para asignar.');
    }

    const candidatos = await listarCandidatos(c);
    const porClave = new Map<string, Candidato>();
    for (const cand of candidatos) {
        porClave.set(claveDe(cand), cand);
        if (cand.empleadoId) porClave.set(`e:${cand.empleadoId}`, cand); // clave vieja de antes de crear su cuenta
    }

    const problemas: Problema[] = [];
    const seleccion: Candidato[] = [];
    const yaElegidos = new Set<Candidato>();
    for (const clave of solicitud.claves) {
        const cand = porClave.get(clave);
        if (!cand) {
            problemas.push({ clave, nombre: 'Persona', codigo: 'NO_ENCONTRADO', mensaje: 'Ya no está en la nómina activa ni es personal de eventos.' });
        } else if (!yaElegidos.has(cand)) {
            yaElegidos.add(cand);
            seleccion.push(cand);
        }
    }

    const perfiles = seleccion.map((s) => s.perfilId).filter((id): id is string => id !== null);
    const filas = await filasDelEvento(c, eventoId);
    const manuales = filas.filter((f) => !f.de_whatsapp && cuentaComoAsignado(f.estado_respuesta));
    if (bloquear) {
        const aBloquear = [...new Set([...perfiles, ...(horaFinCambia ? manuales.map((f) => f.perfil_id) : [])])];
        if (aBloquear.length > 0) {
            await c.query('select id from public.profiles where id = any($1::uuid[]) order by id for update', [aBloquear]);
        }
    }

    const enEvento = new Map(filas.map((f) => [f.perfil_id, f]));
    const libres: string[] = [];
    for (const s of seleccion) {
        const propia = s.perfilId ? enEvento.get(s.perfilId) : undefined;
        if (propia && cuentaComoAsignado(propia.estado_respuesta)) {
            problemas.push({ clave: claveDe(s), nombre: s.nombre, codigo: 'YA_ASIGNADO', mensaje: 'Ya está asignado a este evento.' });
        } else if (propia?.estado_respuesta === 'PENDIENTE') {
            problemas.push({ clave: claveDe(s), nombre: s.nombre, codigo: 'YA_CONVOCADO', mensaje: 'Fue convocado por WhatsApp a este evento y aún no responde.' });
        } else if (propia) {
            problemas.push({ clave: claveDe(s), nombre: s.nombre, codigo: 'RECHAZO_WHATSAPP', mensaje: 'Rechazó la convocatoria de este evento por WhatsApp.' });
        } else if (!s.perfilId && !normalizarCelular(s.telefono)) {
            problemas.push({ clave: claveDe(s), nombre: s.nombre, codigo: 'SIN_CELULAR', mensaje: 'No tiene un celular válido en su ficha de la nómina.' });
        } else if (s.perfilId) {
            libres.push(s.perfilId);
        }
    }

    // Si cambia la hora de finalización, el personal ya asignado a mano también debe seguir sin choques.
    const aRevisar = [...libres, ...(horaFinCambia ? manuales.map((f) => f.perfil_id) : [])];
    const motivos = await evaluarPerfiles(c, eventoId, fecha, intervalo, [...new Set(aRevisar)]);
    for (const s of seleccion) {
        const suyos = s.perfilId && libres.includes(s.perfilId) ? motivos.get(s.perfilId) ?? [] : [];
        if (suyos.length > 0) problemas.push({ clave: claveDe(s), nombre: s.nombre, codigo: suyos[0].codigo, mensaje: suyos.map((m) => m.mensaje).join(' ') });
    }
    if (horaFinCambia) {
        for (const f of manuales) {
            const suyos = motivos.get(f.perfil_id) ?? [];
            if (suyos.length > 0) {
                problemas.push({
                    clave: `p:${f.perfil_id}`,
                    nombre: f.nombre,
                    codigo: 'CAMBIO_HORARIO',
                    mensaje: `Con la nueva hora de finalización tendría un choque: ${suyos.map((m) => m.mensaje).join(' ')}`
                });
            }
        }
    }
    return { evento: fila, seleccion, horaFinCambia, problemas };
}

function errorDeProblemas(problemas: Problema[]): ErrorAsignacion {
    const resumen = problemas
        .slice(0, 5)
        .map((p) => `${p.nombre}: ${p.mensaje}`)
        .join(' ');
    const resto = problemas.length > 5 ? ` Y ${problemas.length - 5} más.` : '';
    return falla(409, 'PERSONAL_NO_DISPONIBLE', `No se guardó ninguna asignación. ${resumen}${resto}`, problemas);
}

interface CuentaPorCelular {
    usuario_id: string;
    perfil_id: string | null;
}

async function cuentaPorCelular(db: Conexion, telefono: string): Promise<CuentaPorCelular | null> {
    const { rows } = await db.query<CuentaPorCelular>(
        `select u.id::text as usuario_id, p.id::text as perfil_id
           from auth.users u left join public.profiles p on p.id = u.id
          where u.phone = $1`,
        [telefono]
    );
    return rows[0] ?? null;
}

/**
 * Perfil con el que se asigna a una persona de la nómina que aún no tiene cuenta: el de su celular si
 * ya existe (otra pestaña pudo crearlo) o uno nuevo con el rol "trabajador". Si el perfil no se puede
 * guardar, se borra el usuario recién creado para no dejar un usuario sin perfil.
 */
async function asegurarCuenta(db: Conexion, cuentas: CuentasDePersonal, persona: Candidato): Promise<string> {
    const telefono = normalizarCelular(persona.telefono) as string; // evaluarSolicitud ya lo exigió
    const existente = await cuentaPorCelular(db, telefono);
    if (existente?.perfil_id) return existente.perfil_id;

    const rol = await db.query<{ id: string }>('select id::text as id from public.role where name = $1 order by id limit 1', [ROL_TRABAJADOR]);
    if (!rol.rows[0]) {
        throw falla(503, 'FALTA_MIGRACION', 'Falta el rol "trabajador": aplica supabase/migrations/0011_asignacion_personal.sql en la base de datos.');
    }

    let usuarioId = existente?.usuario_id ?? null;
    let creadoAqui = false;
    if (!usuarioId) {
        let resultado: { id: string } | { yaExiste: true };
        try {
            resultado = await cuentas.crearUsuario({ telefono, nombre: persona.nombre, empleadoId: persona.empleadoId as string });
        } catch (error) {
            throw falla(502, 'CUENTA_NO_CREADA', `No se pudo crear la cuenta de ${persona.nombre}: ${(error as Error).message}. No se guardó ninguna asignación.`);
        }
        if ('yaExiste' in resultado) {
            const otra = await cuentaPorCelular(db, telefono);
            if (otra?.perfil_id) return otra.perfil_id;
            if (!otra) throw falla(409, 'CUENTA_EN_CREACION', `La cuenta de ${persona.nombre} se está creando en este momento. Intenta de nuevo.`);
            usuarioId = otra.usuario_id;
        } else {
            usuarioId = resultado.id;
            creadoAqui = true;
        }
    }

    try {
        await db.query(
            'insert into public.profiles (id, role_id, nombre) values ($1, $2, $3) on conflict (id) do nothing',
            [usuarioId, Number(rol.rows[0].id), persona.nombre]
        );
    } catch (error) {
        if (creadoAqui) await cuentas.eliminarUsuario(usuarioId).catch(() => undefined);
        throw error;
    }
    return usuarioId;
}

export interface ResultadoAsignacion extends ConsultaPersonalDto {
    mensaje: string;
    asignadosAhora: number;
    cuentasCreadas: number;
}

/**
 * Asigna personal a un evento confirmado, todo o nada: si alguien no se puede asignar (ya está en
 * el evento, choca con otro evento, marcó el día como no disponible...) no se guarda nada y se
 * explica el motivo de cada uno. También guarda la hora de finalización del evento.
 *
 * 1) Se validan las reglas sin escribir nada.
 * 2) Se crean las cuentas que falten (Supabase Auth no participa de la transacción de la base).
 * 3) En una transacción, con el evento y los perfiles bloqueados, se vuelven a validar las reglas y
 *    se guardan la hora de finalización y las filas de event_staff.
 */
export async function asignarPersonal(
    db: BaseDeDatos,
    cuentas: CuentasDePersonal,
    eventoId: number,
    cuerpo: unknown
): Promise<ResultadoAsignacion> {
    const solicitud = validarSolicitudAsignar(cuerpo);

    const previa = await evaluarSolicitud(db, eventoId, solicitud, false);
    if (previa.problemas.length > 0) throw errorDeProblemas(previa.problemas);

    let cuentasCreadas = 0;
    const claves: string[] = [];
    for (const persona of previa.seleccion) {
        if (persona.perfilId) {
            claves.push(`p:${persona.perfilId}`);
        } else {
            claves.push(`p:${await asegurarCuenta(db, cuentas, persona)}`);
            cuentasCreadas += 1;
        }
    }

    const asignadosAhora = await db.transaccion(async (c) => {
        const final = await evaluarSolicitud(c, eventoId, { horaFin: solicitud.horaFin, claves }, true);
        if (final.problemas.length > 0) throw errorDeProblemas(final.problemas);
        if (final.horaFinCambia) {
            await c.query('update public.events set hora_fin = $2, updated_at = now() where id = $1', [eventoId, solicitud.horaFin]);
        }
        const perfiles = final.seleccion.map((s) => s.perfilId as string);
        if (perfiles.length > 0) {
            await c.query(
                `insert into public.event_staff (event_id, profile_id)
                 select $1::bigint, unnest($2::uuid[])`,
                [eventoId, perfiles]
            );
        }
        return perfiles.length;
    });

    const resultado = await consultarPersonal(db, eventoId);
    const mensaje =
        asignadosAhora === 0
            ? 'Se guardó la hora de finalización del evento.'
            : `Se ${asignadosAhora === 1 ? 'asignó 1 persona' : `asignaron ${asignadosAhora} personas`} al evento.`;
    return { ...resultado, mensaje, asignadosAhora, cuentasCreadas };
}

// ---------------------------------------------------------------------------------------------
// Quitar (DELETE)
// ---------------------------------------------------------------------------------------------

/** Quita a una persona asignada a mano. Las confirmaciones por WhatsApp no se borran desde aquí. */
export async function quitarAsignacion(
    db: BaseDeDatos,
    eventoId: number,
    perfilId: string
): Promise<ConsultaPersonalDto & { mensaje: string }> {
    if (!UUID.test(perfilId)) throw falla(400, 'PERSONA_INVALIDA', 'La persona indicada no es válida.');

    const nombre = await db.transaccion(async (c) => {
        const evento = aEventoDto(await eventoExistente(c, eventoId, true));
        if (evento.motivo) throw falla(409, evento.motivo.codigo, evento.motivo.mensaje);
        const { rows } = await c.query<{ nombre: string; de_whatsapp: boolean; estado_respuesta: string | null }>(
            `select coalesce(nullif(btrim(p.nombre), ''), p.correo, 'Sin nombre') as nombre,
                    (s.convocatoria_id is not null) as de_whatsapp, s.estado_respuesta
               from public.event_staff s join public.profiles p on p.id = s.profile_id
              where s.event_id = $1 and s.profile_id = $2
              for update of s`,
            [eventoId, perfilId]
        );
        const fila = rows[0];
        if (!fila || !cuentaComoAsignado(fila.estado_respuesta)) {
            throw falla(404, 'NO_ASIGNADO', 'Esa persona no está asignada a este evento.');
        }
        if (fila.de_whatsapp) {
            throw falla(409, 'ORIGEN_WHATSAPP', 'Esta persona confirmó por WhatsApp; su respuesta no se quita desde aquí.');
        }
        await c.query('delete from public.event_staff where event_id = $1 and profile_id = $2', [eventoId, perfilId]);
        return fila.nombre;
    });

    return { ...(await consultarPersonal(db, eventoId)), mensaje: `Se quitó a ${nombre} del evento.` };
}
