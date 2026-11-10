// Tipos y ayudas compartidas por el bloque "Personal" del detalle del evento (personal-evento.ts)
// y el panel "Asignar personal" (asignacion-personal.ts). Reflejan lo que responde
// GET /api/eventos/:id/personal (apps/server/src/asignaciones/servicio.ts).

/** Etapas fijas del evento, en su orden. Una persona puede estar en varias. */
export const ETAPAS = ['carga', 'organizacion', 'desmonte'] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_INFO: Record<Etapa, { nombre: string; icono: string }> = {
    carga: { nombre: 'Carga', icono: 'fa-dolly' },
    organizacion: { nombre: 'Organización', icono: 'fa-people-group' },
    desmonte: { nombre: 'Desmonte', icono: 'fa-screwdriver-wrench' }
};

export type EstadoPersona =
    | 'DISPONIBLE'
    | 'ASIGNADO'
    | 'CONVOCADO'
    | 'RECHAZO_WHATSAPP'
    | 'NO_DISPONIBLE'
    | 'SIN_CELULAR'
    | 'SIN_COMPROBAR';

export interface Motivo {
    codigo: string;
    mensaje: string;
}

export interface EventoDto {
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

export interface AsignadoDto {
    perfilId: string;
    nombre: string;
    origen: 'manual' | 'whatsapp';
    horaInicio: string | null;
    horaFin: string | null;
    puedeQuitarse: boolean;
    /** null = asignado sin etapa (antes de existir las etapas, o confirmado por WhatsApp). */
    etapas: Etapa[] | null;
    motivos: Motivo[];
}

export interface PersonaDto {
    clave: string;
    nombre: string;
    detalle: string;
    estado: EstadoPersona;
    seleccionable: boolean;
    /** Etapas en las que ya está en este evento (si está ASIGNADO). */
    etapas: Etapa[] | null;
    motivos: Motivo[];
}

export interface ConsultaPersonal {
    evento: EventoDto;
    horaFinEvaluada: string | null;
    terminaAlDiaSiguiente: boolean;
    asignados: AsignadoDto[];
    personal: PersonaDto[];
}

export interface ResultadoCambio extends ConsultaPersonal {
    mensaje: string;
}

/** "6:00 p. m." */
export function formatearHora(hora: string): string {
    const [h = '0', m = '0'] = hora.split(':');
    return new Date(2000, 0, 1, Number(h), Number(m)).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

/** "Martes, 17 de noviembre de 2026" */
export function formatearFecha(iso: string): string {
    const texto = new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function horario(inicio: string | null, fin: string | null): string {
    if (!inicio) return 'Hora por definir';
    return fin ? `${formatearHora(inicio)} – ${formatearHora(fin)}` : `Desde ${formatearHora(inicio)}`;
}

/** Personal asignado agrupado por etapa (quien está en varias aparece en cada una) y los sin etapa. */
export function agruparPorEtapa(asignados: AsignadoDto[]): { porEtapa: Record<Etapa, AsignadoDto[]>; sinEtapa: AsignadoDto[] } {
    const porEtapa: Record<Etapa, AsignadoDto[]> = { carga: [], organizacion: [], desmonte: [] };
    const sinEtapa: AsignadoDto[] = [];
    for (const a of asignados) {
        if (!a.etapas || a.etapas.length === 0) sinEtapa.push(a);
        else for (const etapa of a.etapas) porEtapa[etapa]?.push(a);
    }
    return { porEtapa, sinEtapa };
}

/** Para buscar sin importar mayúsculas ni tildes. */
export function normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
