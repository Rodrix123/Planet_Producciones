// Borrador del horario de un evento ("Guardar borrador" en la pestaña Horarios).
//
// La base de datos todavía no tiene dónde guardar un horario por tipo de actividad, así que el
// borrador vive en el navegador, como el del evento en creación (borrador-evento.ts). Usa
// localStorage para que dure aunque se cierre la pestaña; solo lo ve quien lo guardó, en ese
// navegador. Se borra al guardar el horario en el servidor o al descartarlo.

import { ETAPAS, type Etapa } from './etapasPersonal';
import { MINUTOS_DIA, type Horario } from './horarioEvento';

export interface BorradorHorario extends Horario {
    /** Fecha del evento cuando se guardó: si el evento cambia de fecha, el borrador ya no sirve. */
    fecha: string;
    etapas: Etapa[];
    /** Momento en que se guardó (ISO 8601). */
    guardadoEn: string;
}

/** Lo que se usa del almacenamiento; las pruebas pasan uno en memoria. */
export type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const PREFIJO = 'planet.horarioBorrador.';

function almacenDelNavegador(): Almacen | null {
    try {
        return window.localStorage;
    } catch {
        return null; // sin navegador o con el almacenamiento bloqueado
    }
}

const esMinuto = (valor: unknown): valor is number | null =>
    valor === null || (Number.isInteger(valor) && (valor as number) >= 0 && (valor as number) < MINUTOS_DIA);

/** Devuelve false si no se pudo guardar (almacenamiento bloqueado o lleno). */
export function guardarBorradorHorario(eventoId: number, borrador: BorradorHorario, almacen = almacenDelNavegador()): boolean {
    try {
        almacen?.setItem(PREFIJO + eventoId, JSON.stringify(borrador));
        return almacen !== null;
    } catch {
        return false;
    }
}

/** El borrador del evento, o null si no hay, está dañado o es de otra fecha del evento. */
export function leerBorradorHorario(eventoId: number, fecha: string, almacen = almacenDelNavegador()): BorradorHorario | null {
    try {
        const crudo = almacen?.getItem(PREFIJO + eventoId);
        if (!crudo) return null;
        const b = JSON.parse(crudo) as Partial<BorradorHorario> | null;
        if (!b || b.fecha !== fecha || !esMinuto(b.inicio) || !esMinuto(b.fin) || typeof b.guardadoEn !== 'string') return null;
        if (!Array.isArray(b.etapas)) return null;
        const etapas = ETAPAS.filter((e) => b.etapas!.includes(e));
        if (etapas.length !== b.etapas.length) return null;
        return { fecha, inicio: b.inicio, fin: b.fin, etapas, guardadoEn: b.guardadoEn };
    } catch {
        return null;
    }
}

export function borrarBorradorHorario(eventoId: number, almacen = almacenDelNavegador()): void {
    try {
        almacen?.removeItem(PREFIJO + eventoId);
    } catch {
        // sin almacenamiento no hay nada que borrar
    }
}

/** "16 nov. 2026, 10:30 a. m." para el aviso del borrador. */
export function formatearGuardadoEn(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return '';
    return fecha.toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
