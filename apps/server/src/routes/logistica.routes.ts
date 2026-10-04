import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

interface ItemSeleccionado {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
}

interface CotizacionRow {
    id: string;
    numero_referencia: string;
    cliente_nombre: string;
    tipo_evento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fecha_evento: string | null;
    items: ItemSeleccionado[];
}

export const logisticaRouter = Router();
logisticaRouter.use(requireAuth, requireRole('jefe_logistica'));

// Andrés nunca debe ver precios: se devuelven solo tag/nombre/descripción de cada ítem.
logisticaRouter.get('/eventos', asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<CotizacionRow>(
        `select id, numero_referencia, cliente_nombre, tipo_evento, ciudad, lugar, fecha_evento, items
         from cotizaciones
         where estado = 'programada'
         order by fecha_evento asc nulls last`
    );

    res.json(rows.map((row) => ({
        id: row.id,
        numeroReferencia: row.numero_referencia,
        clienteNombre: row.cliente_nombre,
        tipoEvento: row.tipo_evento,
        ciudad: row.ciudad,
        lugar: row.lugar,
        fechaEvento: row.fecha_evento,
        equipos: row.items.map((item) => ({
            tag: item.tag,
            nombre: item.nombre,
            descripcion: item.descripcion
        }))
    })));
}));
