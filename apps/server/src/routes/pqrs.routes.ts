import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { transporter } from '../mailer';

export const pqrsRouter = Router();

// Público: formulario de PQRS en la página principal.
pqrsRouter.post('/', asyncHandler(async (req, res) => {
    const body = req.body as { nombre?: string; correo?: string; telefono?: string; mensaje?: string };

    const nombre = body.nombre?.trim();
    const correo = body.correo?.trim().toLowerCase();
    const mensaje = body.mensaje?.trim();

    if (!nombre || !correo || !mensaje) {
        return res.status(400).json({ status: 'error', message: 'Nombre, correo y mensaje son obligatorios' });
    }

    const { rows } = await pool.query<{ id: string }>(
        `insert into pqrs (nombre, correo, telefono, mensaje) values ($1, $2, $3, $4) returning id`,
        [nombre, correo, body.telefono?.trim() || null, mensaje]
    );

    res.status(201).json({ status: 'ok', id: rows[0].id });
}));

pqrsRouter.use(requireAuth, requireRole('administrador'));

pqrsRouter.get('/', asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
        `select id, nombre, correo, telefono, mensaje, respuesta, respondido_en, creado_en
         from pqrs order by (respondido_en is not null), creado_en desc`
    );

    res.json(rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        correo: r.correo,
        telefono: r.telefono,
        mensaje: r.mensaje,
        respuesta: r.respuesta,
        respondidoEn: r.respondido_en,
        creadoEn: r.creado_en
    })));
}));

pqrsRouter.post('/:id/responder', asyncHandler(async (req, res) => {
    const { respuesta } = req.body as { respuesta?: string };
    if (!respuesta?.trim()) {
        return res.status(400).json({ status: 'error', message: 'La respuesta no puede estar vacía' });
    }

    const { rows } = await pool.query<{ nombre: string; correo: string; mensaje: string }>(
        'select nombre, correo, mensaje from pqrs where id = $1',
        [req.params.id]
    );
    const fila = rows[0];
    if (!fila) return res.status(404).json({ status: 'error', message: 'PQRS no encontrado' });

    try {
        await transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: fila.correo,
            subject: 'Respuesta a tu PQRS - Planet Producciones',
            text: `Hola ${fila.nombre},\n\nGracias por contactarnos. Esta es la respuesta a tu mensaje:\n\n"${fila.mensaje}"\n\nRespuesta:\n${respuesta.trim()}\n\nPlanet Producciones.`
        });
    } catch (err) {
        console.error('Error enviando respuesta de PQRS por correo:', (err as Error).message);
        return res.status(502).json({ status: 'error', message: 'No se pudo enviar el correo con la respuesta. Revisa la configuración de correo (EMAIL_USER/EMAIL_PASS) e intenta de nuevo.' });
    }

    await pool.query(
        'update pqrs set respuesta = $1, respondido_en = now(), respondido_por = $2 where id = $3',
        [respuesta.trim(), req.usuario!.id, req.params.id]
    );

    res.json({ status: 'ok' });
}));
