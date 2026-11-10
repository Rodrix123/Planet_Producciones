// Qué personas muestra la lista del panel "Asignar personal" y en qué orden. Es solo presentación:
// la disponibilidad la decide el servidor (estado y `seleccionable` de cada persona) y aquí no se cambia.

import { normalizar, type Etapa, type PersonaDto, type TipoContrato } from './etapasPersonal';

/** Opciones del desplegable "Mostrar": todos, solo disponibles o los que ya están en la etapa activa. */
export type VistaPersonal = 'todos' | 'disponibles' | 'en-etapa';

export interface CriteriosLista {
    busqueda: string;
    /** '' = todos los contratos. */
    contrato: TipoContrato | '';
    vista: VistaPersonal;
    /** Etapa a la que se va a asignar (Carga, Organización o Desmonte). */
    destino: Etapa;
}

/** Ya está en el evento en esa etapa. */
export const estaEnEtapa = (p: PersonaDto, etapa: Etapa): boolean => (p.etapas ?? []).includes(etapa);

/**
 * Disponible para la etapa de destino: el servidor la deja elegir y no está ya en esa etapa
 * (a quien está en otra etapa del evento se le puede sumar esta).
 */
export const disponibleEn = (p: PersonaDto, destino: Etapa): boolean => p.seleccionable && !estaEnEtapa(p, destino);

/** Búsqueda (nombre, apellido o contrato), tipo de contrato y vista, combinados. */
export function filtrarPersonal(personal: PersonaDto[], c: CriteriosLista): PersonaDto[] {
    const texto = normalizar(c.busqueda);
    return personal.filter((p) =>
        (!texto || normalizar(`${p.nombre} ${p.detalle}`).includes(texto))
        && (!c.contrato || p.tipoContrato === c.contrato)
        && (c.vista === 'todos'
            || (c.vista === 'disponibles' ? disponibleEn(p, c.destino) : estaEnEtapa(p, c.destino))));
}

/**
 * Primero quienes están disponibles para la etapa de destino y al final los demás (no disponibles,
 * ya en esa etapa, sin celular...). Cada grupo conserva el orden en que llegó, que es el alfabético
 * del servidor. No quita ni repite a nadie.
 */
export function ordenarPorDisponibilidad(personas: PersonaDto[], destino: Etapa): PersonaDto[] {
    const disponibles: PersonaDto[] = [];
    const resto: PersonaDto[] = [];
    for (const p of personas) (disponibleEn(p, destino) ? disponibles : resto).push(p);
    return [...disponibles, ...resto];
}

/** Lo que se ve en la lista: primero se filtra y luego se ordena por disponibilidad. */
export function personasVisibles(personal: PersonaDto[], c: CriteriosLista): PersonaDto[] {
    return ordenarPorDisponibilidad(filtrarPersonal(personal, c), c.destino);
}
