// Qué personas muestra la lista del panel "Asignar personal", en qué orden y a qué funciones (etapas)
// se asigna. Es solo presentación: la disponibilidad la decide el servidor (estado y `seleccionable`
// de cada persona) y aquí no se cambia.

import { ETAPAS, normalizar, type Etapa, type PersonaDto, type TipoContrato } from './etapasPersonal';

export interface CriteriosLista {
    busqueda: string;
    /** '' = todos los contratos. */
    contrato: TipoContrato | '';
    /** Mostrar solo a quienes se pueden asignar a las funciones de destino. */
    soloDisponibles: boolean;
    /** Funciones a las que se va a asignar (Carga, Organización y/o Desmonte); nunca vacía. */
    destinos: readonly Etapa[];
}

/** Ya está en el evento en esa etapa. */
export const estaEnEtapa = (p: PersonaDto, etapa: Etapa): boolean => (p.etapas ?? []).includes(etapa);

/** Etapas de destino en las que la persona todavía no está: a esas se la asigna. */
export const etapasPendientes = (p: PersonaDto, destinos: readonly Etapa[]): Etapa[] =>
    ETAPAS.filter((e) => destinos.includes(e) && !estaEnEtapa(p, e));

/**
 * Disponible para las funciones de destino: el servidor la deja elegir y le falta al menos una de
 * ellas (a quien está en otra etapa del evento se le suman las que le falten; nadie se repite en
 * una misma etapa).
 */
export const disponibleEn = (p: PersonaDto, destinos: readonly Etapa[]): boolean =>
    p.seleccionable && etapasPendientes(p, destinos).length > 0;

/** Búsqueda (nombre, apellido o contrato), tipo de contrato y "solo disponibles", combinados. */
export function filtrarPersonal(personal: PersonaDto[], c: CriteriosLista): PersonaDto[] {
    const texto = normalizar(c.busqueda);
    return personal.filter((p) =>
        (!texto || normalizar(`${p.nombre} ${p.detalle}`).includes(texto))
        && (!c.contrato || p.tipoContrato === c.contrato)
        && (!c.soloDisponibles || disponibleEn(p, c.destinos)));
}

/**
 * Primero quienes están disponibles para las funciones de destino y al final los demás (no
 * disponibles, ya en esas funciones, sin celular...). Cada grupo conserva el orden en que llegó, que
 * es el alfabético del servidor. No quita ni repite a nadie.
 */
export function ordenarPorDisponibilidad(personas: PersonaDto[], destinos: readonly Etapa[]): PersonaDto[] {
    const disponibles: PersonaDto[] = [];
    const resto: PersonaDto[] = [];
    for (const p of personas) (disponibleEn(p, destinos) ? disponibles : resto).push(p);
    return [...disponibles, ...resto];
}

/** Lo que se ve en la lista: primero se filtra y luego se ordena por disponibilidad. */
export function personasVisibles(personal: PersonaDto[], c: CriteriosLista): PersonaDto[] {
    return ordenarPorDisponibilidad(filtrarPersonal(personal, c), c.destinos);
}

// ---------- "Asignar a": Todos, Carga, Organización, Desmonte ----------

/** "Todos" equivale a las tres funciones. */
export const sonTodas = (destinos: readonly Etapa[]): boolean => ETAPAS.every((e) => destinos.includes(e));

/**
 * Marca o desmarca una función en "Asignar a". Con "Todos" elegido, marcar una función deja solo
 * esa; si se desmarca la última, vuelve a "Todos" (siempre hay a dónde asignar). El resultado queda
 * en el orden de ETAPAS y sin repetir.
 */
export function alternarDestino(destinos: readonly Etapa[], etapa: Etapa): Etapa[] {
    if (sonTodas(destinos)) return [etapa];
    const marcada = destinos.includes(etapa);
    const nuevos = ETAPAS.filter((e) => (e === etapa ? !marcada : destinos.includes(e)));
    return nuevos.length === 0 ? [...ETAPAS] : nuevos;
}

/**
 * Qué enviar al servidor, una solicitud por función (el endpoint recibe una etapa a la vez): a cada
 * función van solo las personas que todavía no están en ella. Las funciones sin nadie nuevo se omiten.
 */
export function planDeAsignacion(elegidas: readonly PersonaDto[], destinos: readonly Etapa[]): { etapa: Etapa; claves: string[] }[] {
    return ETAPAS.filter((e) => destinos.includes(e))
        .map((etapa) => ({ etapa, claves: elegidas.filter((p) => !estaEnEtapa(p, etapa)).map((p) => p.clave) }))
        .filter((paso) => paso.claves.length > 0);
}

/** "Carga", "Carga y Desmonte", "Carga, Organización y Desmonte". */
export function unirNombres(nombres: readonly string[]): string {
    if (nombres.length <= 1) return nombres.join('');
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}
