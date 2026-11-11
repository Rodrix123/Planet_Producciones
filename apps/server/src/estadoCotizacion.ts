// Estado de una cotización (no depende de la base ni de Express), compartido por las rutas que
// necesitan mostrarlo. El número de referencia vive en referencia.ts.

export const ESTADOS_VALIDOS = ['recibida', 'en_revision', 'finalizada', 'contrato_enviado', 'programada', 'cancelada'] as const;
export type EstadoCotizacion = (typeof ESTADOS_VALIDOS)[number];

export interface DatosDeEstado {
    quote_estado: EstadoCotizacion;
    event_id: number | null;
    confirmed: boolean | null;
    contrato_enviado_en: string | null;
}

export function derivarEstado(fila: DatosDeEstado): EstadoCotizacion {
    if (!fila.event_id) return fila.quote_estado;
    if (fila.confirmed) return 'programada';
    if (fila.contrato_enviado_en) return 'contrato_enviado';
    return 'finalizada';
}
