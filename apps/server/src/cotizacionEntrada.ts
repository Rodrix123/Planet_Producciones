// Validación y normalización de lo que manda el cotizador al guardar una cotización.
// Es lógica pura (sin base de datos) para poder probarla a fondo: cada regla responde a un
// límite real de la base (varchar(100) del nombre, enteros en las cantidades, PK por variante).

export interface ItemEntrada {
    variantId: number;
    cantidad: number;
    nota?: string;
}

export interface CotizacionEntrada {
    cliente: { nombre: string; correo: string; telefono: string; documento: string | null };
    tipoEvento: string | null;
    venueId: number | null;
    venueNombreManual: string | null;
    venueDireccionManual: string | null;
    transportationId: number | null;
    fechaEvento: string | null;
    items: ItemEntrada[];
}

export type ResultadoEntrada = { ok: true; datos: CotizacionEntrada } | { ok: false; message: string };

export const LIMITES = {
    nombre: 100,
    correo: 150,
    telefono: 30,
    documento: 50,
    tipoEvento: 100,
    lugar: 255,
    cantidad: 100000
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Texto limpio: recorta, junta espacios repetidos y descarta lo que no sea texto. */
export function limpiarTexto(valor: unknown): string {
    return typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '';
}

export function esCorreoValido(correo: string): boolean {
    return correo.length <= LIMITES.correo && EMAIL_RE.test(correo);
}

/** true solo para fechas reales en formato AAAA-MM-DD (rechaza 2026-02-31, 2026-13-01, etc.). */
export function esFechaValida(fecha: string): boolean {
    if (!FECHA_RE.test(fecha)) return false;
    const [a, m, d] = fecha.split('-').map(Number);
    const f = new Date(Date.UTC(a, m - 1, d));
    return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/**
 * Identificador entero positivo. La base entrega los ids (bigint) como texto ("7"), y el
 * cotizador los reenvía tal cual, así que se aceptan números y números escritos como texto.
 */
export function aIdentificador(valor: unknown): number | undefined {
    const n = typeof valor === 'string' && /^\d{1,15}$/.test(valor.trim()) ? Number(valor.trim()) : valor;
    return Number.isSafeInteger(n) && (n as number) > 0 ? (n as number) : undefined;
}

function idOpcional(valor: unknown): number | null | undefined {
    if (valor === undefined || valor === null || valor === 0 || valor === '') return null;
    return aIdentificador(valor);
}

export function normalizarItems(items: unknown): ItemEntrada[] | null {
    if (items === undefined || items === null) return [];
    if (!Array.isArray(items)) return null;
    const vistos = new Set<number>();
    const salida: ItemEntrada[] = [];
    for (const crudo of items) {
        if (!crudo || typeof crudo !== 'object') return null;
        const it = crudo as Record<string, unknown>;
        const variantId = aIdentificador(it.variantId);
        const cantidad = it.cantidad;
        if (variantId === undefined) return null;
        if (!Number.isSafeInteger(cantidad) || (cantidad as number) <= 0 || (cantidad as number) > LIMITES.cantidad) return null;
        if (vistos.has(variantId)) return null; // la tabla no admite el mismo servicio dos veces
        vistos.add(variantId);
        salida.push({ variantId, cantidad: cantidad as number, nota: limpiarTexto(it.nota) || undefined });
    }
    return salida;
}

export function normalizarCotizacion(body: unknown): ResultadoEntrada {
    if (!body || typeof body !== 'object') return { ok: false, message: 'Solicitud inválida' };
    const b = body as Record<string, unknown>;
    const c = (b.cliente && typeof b.cliente === 'object' ? b.cliente : {}) as Record<string, unknown>;

    const nombre = limpiarTexto(c.nombre);
    const correo = limpiarTexto(c.correo).toLowerCase();
    const telefono = limpiarTexto(c.telefono);
    if (!nombre || !correo || !telefono) {
        return { ok: false, message: 'Faltan los datos de contacto del cliente' };
    }
    if (nombre.length > LIMITES.nombre) return { ok: false, message: `El nombre es demasiado largo (máximo ${LIMITES.nombre} caracteres)` };
    if (!esCorreoValido(correo)) return { ok: false, message: 'El correo no es válido' };
    if (telefono.length > LIMITES.telefono) return { ok: false, message: `El teléfono es demasiado largo (máximo ${LIMITES.telefono} caracteres)` };
    const documento = limpiarTexto(c.documento);
    if (documento.length > LIMITES.documento) return { ok: false, message: `El documento es demasiado largo (máximo ${LIMITES.documento} caracteres)` };

    const tipoEvento = limpiarTexto(b.tipoEvento);
    if (tipoEvento.length > LIMITES.tipoEvento) return { ok: false, message: 'El tipo de evento es demasiado largo' };

    const venueId = idOpcional(b.venueId);
    const transportationId = idOpcional(b.transportationId);
    if (venueId === undefined) return { ok: false, message: 'La sede no es válida' };
    if (transportationId === undefined) return { ok: false, message: 'El transporte no es válido' };

    const venueNombreManual = limpiarTexto(b.venueNombreManual);
    const venueDireccionManual = limpiarTexto(b.venueDireccionManual);
    if (venueNombreManual.length > LIMITES.lugar || venueDireccionManual.length > LIMITES.lugar) {
        return { ok: false, message: 'El nombre o la dirección del lugar es demasiado largo' };
    }

    const fecha = limpiarTexto(b.fechaEvento);
    if (fecha && !esFechaValida(fecha)) return { ok: false, message: 'La fecha del evento no es válida' };

    const items = normalizarItems(b.items);
    if (items === null) return { ok: false, message: 'La lista de servicios no es válida' };

    return {
        ok: true,
        datos: {
            cliente: { nombre, correo, telefono, documento: documento || null },
            tipoEvento: tipoEvento || null,
            venueId,
            venueNombreManual: venueId ? null : venueNombreManual || null,
            venueDireccionManual: venueId ? null : venueDireccionManual || null,
            transportationId,
            fechaEvento: fecha || null,
            items
        }
    };
}
