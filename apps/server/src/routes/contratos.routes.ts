// Contratos (/api/contratos): generar el contrato en PDF, enviarlo por correo al cliente (Mariana)
// y guardar el contrato firmado que devuelve el cliente (Maritza).

import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { enviarCorreo } from '../mailer';
import { generarContratoPdfBuffer, type ItemContratoPdf } from '../pdf/contratoPdf';
import { numeroReferencia } from '../referencia';
import { CARPETA_SUBIDAS } from '../rutas';

// Carpeta de los contratos firmados. UPLOADS_DIR permite apuntarla a un disco persistente
// (en un contenedor, una carpeta sin volumen se pierde al volver a desplegar).
const UPLOAD_DIR = path.join(CARPETA_SUBIDAS, 'contratos-firmados');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        // Solo dígitos del id y siempre .pdf: ni el id de la URL ni el nombre original del archivo
        // pueden sacar el archivo de la carpeta ni cambiar su tipo.
        filename: (req, _file, cb) => cb(null, `${String(req.params.cotizacionId).replace(/\D/g, '')}-${Date.now()}.pdf`)
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf')
});

/** Un PDF de verdad empieza por "%PDF-"; el tipo que declara el navegador no es de fiar. */
function esPdf(ruta: string): boolean {
    const fd = fs.openSync(ruta, 'r');
    try {
        const cabecera = Buffer.alloc(5);
        fs.readSync(fd, cabecera, 0, 5, 0);
        return cabecera.toString('latin1') === '%PDF-';
    } finally {
        fs.closeSync(fd);
    }
}

function borrarArchivo(nombre: string | null | undefined): void {
    if (nombre) fs.unlink(path.join(UPLOAD_DIR, path.basename(nombre)), () => undefined);
}

// Datos de la cotización y del evento que necesita el contrato.
interface FilaContrato {
    id: number;
    created_at: string;
    total: string;
    event_type: string | null;
    fecha_evento: string | null;
    venue_nombre: string | null;
    cliente_nombre: string | null;
    cliente_correo: string | null;
    cliente_documento: string | null;
    event_id: number | null;
    quote_estado: string;
    contrato_enviado_en: string | null;
    contrato_firmado_nombre: string | null;
    contrato_firmado_subido_en: string | null;
}

/**
 * Cotización + evento + cliente de un id, o null si no existe.
 */
async function obtenerFila(id: string): Promise<FilaContrato | null> {
    const { rows } = await pool.query<FilaContrato>(
        `select
            q.id, q.created_at, q.total, q.estado as quote_estado,
            coalesce(e.event_type, q.event_type) as event_type,
            coalesce(e.date, q.date) as fecha_evento,
            coalesce(q.cliente_nombre, u.name) as cliente_nombre, u.email as cliente_correo, coalesce(q.cliente_documento, u.documento) as cliente_documento,
            v.name as venue_nombre,
            e.id as event_id, e.contrato_enviado_en, e.contrato_firmado_nombre, e.contrato_firmado_subido_en
         from quote q
         left join users u on u.id = q.client_id
         left join events e on e.quote_id = q.id
         left join venue v on v.id = coalesce(e.venue_id, q.venue_id)
         where q.id = $1`,
        [id]
    );
    return rows[0] || null;
}

/**
 * Servicios del contrato: solo cantidad y nombre (el contrato no muestra precios por ítem).
 */
async function obtenerItemsContrato(quoteId: number): Promise<ItemContratoPdf[]> {
    const { rows } = await pool.query<{ quantity: number; simple_description: string }>(
        `select qi.quantity, iv.simple_description
         from quote_items qi
         join inventory_variants iv on iv.id = qi.variant_id
         where qi.quote_id = $1
         order by iv.simple_description asc`,
        [quoteId]
    );
    return rows.map((r) => ({ cantidad: r.quantity, nombre: r.simple_description }));
}

export const contratosRouter = Router();
// Un id que no es un número es una cotización que no existe (antes: error 500 al convertirlo).
contratosRouter.param('cotizacionId', (_req, res, next, valor) => {
    if (/^[0-9]{1,15}$/.test(String(valor))) return next();
    res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
});

contratosRouter.use(requireAuth);

// Estado del contrato: cuándo se envió, cuándo se subió el firmado y si ya hay archivo.
contratosRouter.get('/:cotizacionId', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFila(req.params.cotizacionId);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    res.json({
        enviadoEn: fila.contrato_enviado_en,
        firmadoSubidoEn: fila.contrato_firmado_subido_en,
        tieneFirmado: !!fila.contrato_firmado_nombre
    });
}));

// Vista previa del contrato en PDF. Exige documento del cliente y fecha del evento.
contratosRouter.get('/:cotizacionId/pdf', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFila(req.params.cotizacionId);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!fila.cliente_documento || !fila.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Faltan datos del cliente o la fecha del evento' });
    }

    const buffer = await generarContratoPdfBuffer({
        numeroReferencia: numeroReferencia(fila.id, fila.created_at),
        clienteNombre: fila.cliente_nombre || '',
        clienteDocumento: fila.cliente_documento,
        tipoEvento: fila.event_type,
        ciudad: null,
        lugar: fila.venue_nombre,
        fechaEvento: fila.fecha_evento,
        total: Number(fila.total),
        items: await obtenerItemsContrato(fila.id)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Contrato_${numeroReferencia(fila.id, fila.created_at)}.pdf`);
    res.send(buffer);
}));

// Enviar el contrato por correo es responsabilidad exclusiva de Mariana (secretaria);
// Maritza (administradora) solo revisa/sube el firmado y oficializa el evento.
contratosRouter.post('/:cotizacionId/generar-y-enviar', requireRole('secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFila(req.params.cotizacionId);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    if (!fila.event_id || fila.contrato_enviado_en) {
        return res.status(400).json({ status: 'error', message: 'Esta cotización no está lista para generar el contrato (ya tiene uno enviado o aún no fue finalizada)' });
    }
    if (!fila.cliente_documento) {
        return res.status(400).json({ status: 'error', message: 'Falta el documento del cliente. Pídele a la administradora que lo complete en la cotización.' });
    }
    if (!fila.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Falta la fecha del evento. Pídele a la administradora que la complete en la cotización.' });
    }
    if (!fila.cliente_correo) {
        return res.status(400).json({ status: 'error', message: 'La cotización no tiene un correo de cliente válido.' });
    }

    const buffer = await generarContratoPdfBuffer({
        numeroReferencia: numeroReferencia(fila.id, fila.created_at),
        clienteNombre: fila.cliente_nombre || '',
        clienteDocumento: fila.cliente_documento,
        tipoEvento: fila.event_type,
        ciudad: null,
        lugar: fila.venue_nombre,
        fechaEvento: fila.fecha_evento,
        total: Number(fila.total),
        items: await obtenerItemsContrato(fila.id)
    });

    // Maritza recibe copia del contrato enviado. EMAIL_ADMINISTRADOR permite apuntar
    // esa copia a un correo de prueba mientras se verifica el envío; si no está puesto,
    // se usa su correo real (profiles.correo) para producción.
    let correoAdmin = process.env.EMAIL_ADMINISTRADOR;
    if (!correoAdmin) {
        const { rows: adminRows } = await pool.query<{ correo: string }>(
            `select p.correo from profiles p join role r on r.id = p.role_id where r.name = 'administrador' limit 1`
        );
        correoAdmin = adminRows[0]?.correo;
    }

    // Se "reserva" el envío ANTES de mandar el correo, con una sola actualización condicional: si
    // dos clics (o dos personas) lo piden a la vez, solo uno lo consigue y el cliente no recibe el
    // contrato repetido (el correo tarda segundos, y antes el contrato se marcaba como enviado
    // recién al terminar). Si el correo falla, la reserva se libera para poder reintentar.
    const reservado = await pool.query(
        'update events set contrato_enviado_en = now(), contrato_enviado_por = $1, updated_at = now() where id = $2 and contrato_enviado_en is null',
        [req.usuario!.id, fila.event_id]
    );
    if (!reservado.rowCount) {
        return res.status(400).json({ status: 'error', message: 'Esta cotización no está lista para generar el contrato (ya tiene uno enviado o aún no fue finalizada)' });
    }

    try {
        await enviarCorreo({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: fila.cliente_correo,
            ...(correoAdmin ? { cc: correoAdmin } : {}),
            subject: `Contrato de servicios Planet Producciones - ${numeroReferencia(fila.id, fila.created_at)}`,
            text: `Hola ${fila.cliente_nombre},\n\nAdjuntamos el contrato de prestación de servicios para tu evento. Por favor fírmalo y responde este correo adjuntando el documento firmado.\n\nGracias por elegir a Planet Producciones.`,
            attachments: [{ filename: `Contrato_${numeroReferencia(fila.id, fila.created_at)}.pdf`, content: buffer }]
        });
    } catch (err) {
        console.error('Error enviando contrato por correo:', (err as Error).message);
        await pool.query(
            'update events set contrato_enviado_en = null, contrato_enviado_por = null, updated_at = now() where id = $1',
            [fila.event_id]
        );
        return res.status(502).json({ status: 'error', message: 'No se pudo enviar el correo con el contrato. Revisa la configuración de correo (EMAIL_USER/EMAIL_PASS) e intenta de nuevo.' });
    }

    await pool.query(
        `insert into quote_historial (quote_id, profile_id, profile_nombre, tipo, estado_antes, estado_despues)
         values ($1, $2, $3, 'cambio_estado', 'finalizada', 'contrato_enviado')`,
        [fila.id, req.usuario!.id, req.usuario!.nombre]
    );

    res.json({ status: 'ok' });
}));

contratosRouter.post(
    '/:cotizacionId/firmado',
    requireRole('administrador'),
    upload.single('archivo'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'Sube un archivo PDF del contrato firmado' });
        }

        // Si algo de lo siguiente no se cumple, el archivo recién subido se descarta: no deben
        // quedar archivos sueltos en el disco.
        if (!esPdf(req.file.path)) {
            borrarArchivo(req.file.filename);
            return res.status(400).json({ status: 'error', message: 'El archivo no es un PDF válido' });
        }

        const fila = await obtenerFila(req.params.cotizacionId);
        if (!fila?.event_id) {
            borrarArchivo(req.file.filename);
            return res.status(400).json({ status: 'error', message: 'Esta cotización todavía no es un evento en proceso' });
        }

        try {
            await pool.query(
                'update events set contrato_firmado_nombre = $1, contrato_firmado_subido_en = now(), contrato_firmado_subido_por = $2, updated_at = now() where id = $3',
                [req.file.filename, req.usuario!.id, fila.event_id]
            );
        } catch (error) {
            borrarArchivo(req.file.filename);
            throw error;
        }

        // La versión anterior ya no se necesita: no se acumulan archivos en el disco.
        if (fila.contrato_firmado_nombre && fila.contrato_firmado_nombre !== req.file.filename) {
            borrarArchivo(fila.contrato_firmado_nombre);
        }

        res.json({ status: 'ok' });
    })
);

// Descarga el contrato firmado que se subió.
contratosRouter.get('/:cotizacionId/firmado', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFila(req.params.cotizacionId);
    if (!fila?.contrato_firmado_nombre) {
        return res.status(404).json({ status: 'error', message: 'Todavía no se ha subido el contrato firmado' });
    }

    res.sendFile(path.join(UPLOAD_DIR, fila.contrato_firmado_nombre));
}));
