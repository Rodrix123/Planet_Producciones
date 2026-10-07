import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const logisticaRouter = Router();
logisticaRouter.use(requireAuth, requireRole('jefe_logistica'));

// Andrés nunca debe ver precios: la consulta ni siquiera selecciona inventory_variants.price.
logisticaRouter.get('/eventos', asyncHandler(async (_req, res) => {
    const { rows: eventos } = await pool.query(
        `select e.id as event_id, q.id as quote_id, q.created_at,
                coalesce(e.event_type, q.event_type) as event_type,
                coalesce(e.date, q.date) as fecha_evento,
                v.name as venue_nombre, t.city as transportation_city,
                u.name as cliente_nombre
         from events e
         join quote q on q.id = e.quote_id
         left join users u on u.id = q.client_id
         left join venue v on v.id = coalesce(e.venue_id, q.venue_id)
         left join transportation t on t.id = coalesce(e.transportation_id, q.transportation_id)
         where e.confirmed = true
         order by coalesce(e.date, q.date) asc nulls last`
    );

    if (eventos.length === 0) return res.json([]);

    const { rows: items } = await pool.query(
        `select qi.quote_id, iv.simple_description, iv.detailed_description, i.type
         from quote_items qi
         join inventory_variants iv on iv.id = qi.variant_id
         join inventory i on i.id = iv.inventory_id
         where qi.quote_id = any($1)
         order by i.type, iv.simple_description`,
        [eventos.map((e) => e.quote_id)]
    );

    const equiposPorQuote = new Map<number, { tag: string; nombre: string; descripcion: string }[]>();
    for (const item of items) {
        if (!equiposPorQuote.has(item.quote_id)) equiposPorQuote.set(item.quote_id, []);
        equiposPorQuote.get(item.quote_id)!.push({
            tag: item.type,
            nombre: item.simple_description,
            descripcion: item.detailed_description || ''
        });
    }

    res.json(eventos.map((e) => ({
        id: e.quote_id,
        numeroReferencia: `PL-${new Date(e.created_at).getFullYear()}-${String(e.quote_id).padStart(4, '0')}`,
        clienteNombre: e.cliente_nombre,
        tipoEvento: e.event_type,
        ciudad: e.transportation_city,
        lugar: e.venue_nombre,
        fechaEvento: e.fecha_evento,
        equipos: equiposPorQuote.get(e.quote_id) || []
    })));
}));
