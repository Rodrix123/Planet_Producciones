// PQRS (peticiones, quejas, reclamos y sugerencias) de la página principal (/api/pqrs).
// Cualquier visitante puede enviar uno; solo la secretaria los lista y responde.

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { limitePqrs } from '../limitador';
import { esCorreoValido } from '../cotizacionEntrada';
import { enviarCorreo } from '../mailer';

export const pqrsRouter = Router();

// Largos máximos de lo que escribe quien manda un PQRS (la base guarda texto sin límite: aquí se pone).
const MAX = { nombre: 100, correo: 150, telefono: 30, mensaje: 2000, respuesta: 5000 } as const;

/** Texto recortado; lo que no sea texto (números, listas, null) cuenta como vacío. Conserva los saltos de línea. */
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

// El id de un PQRS es un uuid: cualquier otra cosa es un PQRS que no existe (antes: error 500 de la base).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Público: formulario de PQRS en la página principal.
pqrsRouter.post('/', limitePqrs, asyncHandler(async (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;

    const nombre = texto(body.nombre);
    const correo = texto(body.correo).toLowerCase();
    const telefono = texto(body.telefono);
    const mensaje = texto(body.mensaje);

    if (!nombre || !correo || !mensaje) {
        return res.status(400).json({ status: 'error', message: 'Nombre, correo y mensaje son obligatorios' });
    }
    if (!esCorreoValido(correo)) return res.status(400).json({ status: 'error', message: 'El correo no es válido' });
    if (nombre.length > MAX.nombre) return res.status(400).json({ status: 'error', message: `El nombre es demasiado largo (máximo ${MAX.nombre} caracteres)` });
    if (correo.length > MAX.correo) return res.status(400).json({ status: 'error', message: `El correo es demasiado largo (máximo ${MAX.correo} caracteres)` });
    if (telefono.length > MAX.telefono) return res.status(400).json({ status: 'error', message: `El teléfono es demasiado largo (máximo ${MAX.telefono} caracteres)` });
    if (mensaje.length > MAX.mensaje) return res.status(400).json({ status: 'error', message: `El mensaje es demasiado largo (máximo ${MAX.mensaje} caracteres)` });

    const { rows } = await pool.query<{ id: string }>(
        `insert into pqrs (nombre, correo, telefono, mensaje) values ($1, $2, $3, $4) returning id`,
        [nombre, correo, telefono || null, mensaje]
    );

    // Aviso a la secretaria (si está configurado). Se envía sin esperar la respuesta: un fallo del
    // correo se registra pero no afecta a quien escribió el PQRS.
    if (process.env.EMAIL_SECRETARIA) {
        enviarCorreo({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_SECRETARIA,
            subject: `Nuevo PQRS recibido: ${nombre}`,
            text: `Se recibió un nuevo PQRS para responder en el panel.\n\nNombre: ${nombre}\nCorreo: ${correo}\n${telefono ? `Teléfono: ${telefono}\n` : ''}\nMensaje:\n${mensaje}\n\nIngresa a tu panel para responderlo.`
        }).catch((err: Error) => console.error('Error enviando aviso de nuevo PQRS:', err.message));
    }

    res.status(201).json({ status: 'ok', id: rows[0].id });
}));

// De aquí en adelante, solo la secretaria (Mariana).
pqrsRouter.use(requireAuth, requireRole('secretaria'));

// Lista: primero los pendientes de respuesta y luego los respondidos, del más nuevo al más viejo.
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

// Responde por correo al cliente y SOLO si el correo salió marca el PQRS como respondido; si el
// correo falla (502), queda pendiente para reintentar.
pqrsRouter.post('/:id/responder', asyncHandler(async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(404).json({ status: 'error', message: 'PQRS no encontrado' });
    const respuesta = texto((req.body as { respuesta?: unknown } | undefined)?.respuesta);
    if (!respuesta) {
        return res.status(400).json({ status: 'error', message: 'La respuesta no puede estar vacía' });
    }
    if (respuesta.length > MAX.respuesta) {
        return res.status(400).json({ status: 'error', message: `La respuesta es demasiado larga (máximo ${MAX.respuesta} caracteres)` });
    }

    // Se "reclama" el PQRS antes de mandar el correo, en una sola sentencia: con un doble clic (o dos personas
    // a la vez) solo una llamada lo consigue y el cliente recibe un único correo.
    const { rows } = await pool.query<{ nombre: string; correo: string; mensaje: string }>(
        `update pqrs set respuesta = $1, respondido_en = now(), respondido_por = $2
         where id = $3 and respondido_en is null
         returning nombre, correo, mensaje`,
        [respuesta, req.usuario!.id, req.params.id]
    );
    const fila = rows[0];
    if (!fila) {
        const existe = await pool.query('select 1 from pqrs where id = $1', [req.params.id]);
        return existe.rows.length > 0
            ? res.status(409).json({ status: 'error', message: 'Este PQRS ya fue respondido' })
            : res.status(404).json({ status: 'error', message: 'PQRS no encontrado' });
    }

    try {
        await enviarCorreo({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: fila.correo,
            subject: 'Respuesta a tu PQRS - Planet Producciones',
            text: `Hola ${fila.nombre},\n\nGracias por contactarnos. Esta es la respuesta a tu mensaje:\n\n"${fila.mensaje}"\n\nRespuesta:\n${respuesta}\n\nPlanet Producciones.`
        });
    } catch (err) {
        console.error('Error enviando respuesta de PQRS por correo:', (err as Error).message);
        // Si el correo no salió, el PQRS vuelve a quedar pendiente para reintentar.
        await pool.query('update pqrs set respuesta = null, respondido_en = null, respondido_por = null where id = $1', [req.params.id]);
        return res.status(502).json({ status: 'error', message: 'No se pudo enviar el correo con la respuesta. Revisa la configuración de correo (EMAIL_USER/EMAIL_PASS) e intenta de nuevo.' });
    }

    res.json({ status: 'ok' });
}));
