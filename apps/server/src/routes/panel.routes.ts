import { Router } from 'express';
import { pool } from '../db';
import { requireAuth } from '../auth';
import { asyncHandler } from '../asyncHandler';

export const panelRouter = Router();

// Contadores de "cosas nuevas por revisar" para las señales del menú lateral.
// Cada rol ve solo los contadores que le aplican.
panelRouter.get('/contadores', requireAuth, asyncHandler(async (req, res) => {
    const rol = req.usuario!.rol;

    if (rol === 'administrador') {
        const [cotizaciones, eventos] = await Promise.all([
            pool.query(
                `select count(*) from quote q left join events e on e.quote_id = q.id
                 where q.estado in ('recibida', 'en_revision') and e.id is null`
            ),
            // "Necesita acción de Maritza": sin contrato enviado todavía, o ya firmado
            // y listo para oficializar (lo demás está esperando al cliente, no a ella).
            pool.query(
                `select count(*) from events e
                 where e.confirmed = false
                   and (e.contrato_enviado_en is null or e.contrato_firmado_nombre is not null)`
            )
        ]);
        return res.json({
            cotizaciones: Number(cotizaciones.rows[0].count),
            eventosProceso: Number(eventos.rows[0].count)
        });
    }

    if (rol === 'secretaria') {
        const [pqrs, cotizaciones] = await Promise.all([
            pool.query(`select count(*) from pqrs where respondido_en is null`),
            // "Necesita acción de Mariana": finalizada y sin contrato enviado todavía.
            pool.query(
                `select count(*) from events e where e.confirmed = false and e.contrato_enviado_en is null`
            )
        ]);
        return res.json({
            pqrs: Number(pqrs.rows[0].count),
            cotizaciones: Number(cotizaciones.rows[0].count)
        });
    }

    res.json({});
}));
