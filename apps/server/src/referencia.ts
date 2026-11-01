/** Número de referencia que ve el cliente: PL-<año>-<id con ceros>, p. ej. PL-2026-0048. */
export function numeroReferencia(id: number | string, creadaEn: string | Date): string {
    const anio = new Date(creadaEn).getFullYear();
    return `PL-${anio}-${String(id).padStart(4, '0')}`;
}
