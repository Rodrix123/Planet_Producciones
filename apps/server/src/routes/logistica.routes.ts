// Panel del jefe de logística (/api/logistica): eventos confirmados con los equipos a cargar y
// la lista de carga en PDF. Esta cuenta nunca ve precios ni datos de dinero.

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { numeroReferencia } from '../referencia';
import { generarListaCargaPdfBuffer } from '../pdf/listaCargaPdf';

export const logisticaRouter = Router();
logisticaRouter.use(requireAuth, requireRole('jefe_logistica'));

// Datos del evento que necesita logística (sin precios).
interface FilaEventoLogistica {
    event_id: string;
    quote_id: number;
    created_at: string;
    event_type: string | null;
    fecha_evento: string | null;
    venue_nombre: string | null;
    venue_direccion_manual: string | null;
    transportation_city: string | null;
    cliente_nombre: string | null;
}

/**
 * Un evento CONFIRMADO por el id de su cotización; si no está confirmado devuelve null.
 */
async function obtenerEventoLogistica(quoteId: string): Promise<FilaEventoLogistica | null> {
    const { rows } = await pool.query<FilaEventoLogistica>(
        `select e.id as event_id, q.id as quote_id, q.created_at,
                coalesce(e.event_type, q.event_type) as event_type,
                coalesce(e.date, q.date) as fecha_evento,
                coalesce(v.name, coalesce(e.venue_nombre_manual, q.venue_nombre_manual)) as venue_nombre,
                coalesce(e.venue_direccion_manual, q.venue_direccion_manual) as venue_direccion_manual,
                t.city as transportation_city,
                coalesce(q.cliente_nombre, u.name) as cliente_nombre
         from events e
         join quote q on q.id = e.quote_id
         left join users u on u.id = q.client_id
         left join venue v on v.id = coalesce(e.venue_id, q.venue_id)
         left join transportation t on t.id = coalesce(e.transportation_id, q.transportation_id)
         where e.confirmed = true and q.id = $1`,
        [quoteId]
    );
    return rows[0] || null;
}

/**
 * Equipos de una cotización: tipo, nombre, descripción y cantidad. Sin precios.
 */
async function obtenerEquiposDeQuote(quoteId: string): Promise<{ tag: string; nombre: string; descripcion: string; cantidad: number }[]> {
    const { rows } = await pool.query(
        `select qi.quantity, iv.simple_description, iv.detailed_description, i.type
         from quote_items qi
         join inventory_variants iv on iv.id = qi.variant_id
         join inventory i on i.id = iv.inventory_id
         where qi.quote_id = $1
         order by i.type, iv.simple_description`,
        [quoteId]
    );
    return rows.map((r) => ({
        tag: r.type,
        nombre: r.simple_description,
        descripcion: r.detailed_description || '',
        cantidad: r.quantity
    }));
}

// Lista de eventos confirmados con sus equipos, del más próximo al más lejano.
// Andrés nunca debe ver precios: la consulta ni siquiera selecciona inventory_variants.price.
logisticaRouter.get('/eventos', asyncHandler(async (_req, res) => {
    const { rows: eventos } = await pool.query(
        `select e.id as event_id, q.id as quote_id, q.created_at,
                coalesce(e.event_type, q.event_type) as event_type,
                coalesce(e.date, q.date) as fecha_evento,
                coalesce(v.name, coalesce(e.venue_nombre_manual, q.venue_nombre_manual)) as venue_nombre,
                coalesce(e.venue_direccion_manual, q.venue_direccion_manual) as venue_direccion_manual,
                t.city as transportation_city,
                coalesce(q.cliente_nombre, u.name) as cliente_nombre
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
        `select qi.quote_id, qi.quantity, iv.simple_description, iv.detailed_description, i.type
         from quote_items qi
         join inventory_variants iv on iv.id = qi.variant_id
         join inventory i on i.id = iv.inventory_id
         where qi.quote_id = any($1)
         order by i.type, iv.simple_description`,
        [eventos.map((e) => e.quote_id)]
    );

    const equiposPorQuote = new Map<number, { tag: string; nombre: string; descripcion: string; cantidad: number }[]>();
    for (const item of items) {
        if (!equiposPorQuote.has(item.quote_id)) equiposPorQuote.set(item.quote_id, []);
        equiposPorQuote.get(item.quote_id)!.push({
            tag: item.type,
            nombre: item.simple_description,
            descripcion: item.detailed_description || '',
            cantidad: item.quantity
        });
    }

    res.json(eventos.map((e) => ({
        id: e.quote_id,
        numeroReferencia: numeroReferencia(e.quote_id, e.created_at),
        clienteNombre: e.cliente_nombre,
        tipoEvento: e.event_type,
        ciudad: e.transportation_city,
        lugar: e.venue_nombre,
        direccion: e.venue_direccion_manual,
        fechaEvento: e.fecha_evento,
        equipos: equiposPorQuote.get(e.quote_id) || []
    })));
}));

// Lista de carga en PDF para alistar el camión (sin precios).
// Lista de carga en PDF de un evento (qué equipos cargar y para dónde).
logisticaRouter.get('/eventos/:id/pdf', asyncHandler(async (req, res) => {
    const fila = await obtenerEventoLogistica(req.params.id);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Evento no encontrado' });

    const equipos = await obtenerEquiposDeQuote(req.params.id);

    const buffer = await generarListaCargaPdfBuffer({
        numeroReferencia: numeroReferencia(fila.quote_id, fila.created_at),
        clienteNombre: fila.cliente_nombre || '',
        tipoEvento: fila.event_type,
        ciudad: fila.transportation_city,
        lugar: fila.venue_nombre,
        direccion: fila.venue_direccion_manual,
        fechaEvento: fila.fecha_evento,
        equipos
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Lista_Carga_${numeroReferencia(fila.quote_id, fila.created_at)}.pdf`);
    res.send(buffer);
}));
