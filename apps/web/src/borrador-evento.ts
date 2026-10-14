// Evento en creación. El formulario de eventos.html guarda aquí los datos del
// evento y pasa a la página de cotizaciones (cotizador.html); allí se eligen los
// servicios y, al guardar la cotización, se crea el evento con ella. Vive en
// sessionStorage: dura lo que la pestaña y se borra al cancelar o al terminar.

export interface BorradorEvento {
    tipo: string;
    fecha: string; // YYYY-MM-DD
    hora: string; // HH:MM
    confirmado: boolean;
    venueId: number | null;
    lugarManual: string;
    direccionLugarManual: string;
    direccion: string;
    transporteId: number | null;
    cliente: { nombre: string; email: string; telefono: string; documento: string };
}

const CLAVE = 'planet.eventoBorrador';

/** Devuelve false si el navegador no permite guardar (p. ej. almacenamiento bloqueado). */
export function guardarBorrador(borrador: BorradorEvento): boolean {
    try {
        sessionStorage.setItem(CLAVE, JSON.stringify(borrador));
        return true;
    } catch {
        return false;
    }
}

export function leerBorrador(): BorradorEvento | null {
    try {
        const crudo = sessionStorage.getItem(CLAVE);
        if (!crudo) return null;
        const b = JSON.parse(crudo) as Partial<BorradorEvento> | null;
        return b && typeof b.tipo === 'string' && typeof b.fecha === 'string' && b.cliente
            ? (b as BorradorEvento)
            : null;
    } catch {
        return null;
    }
}

export function borrarBorrador(): void {
    try {
        sessionStorage.removeItem(CLAVE);
    } catch {
        // sin almacenamiento no hay nada que borrar
    }
}
