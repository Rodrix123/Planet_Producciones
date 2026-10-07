import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../db';
import { requireAuth, requireRole } from '../auth';
import { asyncHandler } from '../asyncHandler';
import { transporter } from '../mailer';
import { generarContratoPdfBuffer } from '../pdf/contratoPdf';

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'contratos-firmados');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => cb(null, `${req.params.cotizacionId}-${Date.now()}${path.extname(file.originalname) || '.pdf'}`)
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, file.mimetype === 'application/pdf')
});

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

async function obtenerFila(id: string): Promise<FilaContrato | null> {
    const { rows } = await pool.query<FilaContrato>(
        `select
            q.id, q.created_at, q.total, q.estado as quote_estado,
            coalesce(e.event_type, q.event_type) as event_type,
            coalesce(e.date, q.date) as fecha_evento,
            u.name as cliente_nombre, u.email as cliente_correo, u.documento as cliente_documento,
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

function numeroReferencia(id: number, creadaEn: string): string {
    const anio = new Date(creadaEn).getFullYear();
    return `PL-${anio}-${String(id).padStart(4, '0')}`;
}

export const contratosRouter = Router();
contratosRouter.use(requireAuth);

contratosRouter.get('/:cotizacionId', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFila(req.params.cotizacionId);
    if (!fila) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    res.json({
        enviadoEn: fila.contrato_enviado_en,
        firmadoSubidoEn: fila.contrato_firmado_subido_en,
        tieneFirmado: !!fila.contrato_firmado_nombre
    });
}));

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
        total: Number(fila.total)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Contrato_${numeroReferencia(fila.id, fila.created_at)}.pdf`);
    res.send(buffer);
}));

contratosRouter.post('/:cotizacionId/generar-y-enviar', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
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
        total: Number(fila.total)
    });

    try {
        await transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: fila.cliente_correo,
            subject: `Contrato de servicios Planet Producciones - ${numeroReferencia(fila.id, fila.created_at)}`,
            text: `Hola ${fila.cliente_nombre},\n\nAdjuntamos el contrato de prestación de servicios para tu evento. Por favor fírmalo y responde este correo adjuntando el documento firmado.\n\nGracias por elegir a Planet Producciones.`,
            attachments: [{ filename: `Contrato_${numeroReferencia(fila.id, fila.created_at)}.pdf`, content: buffer }]
        });
    } catch (err) {
        console.error('Error enviando contrato por correo:', (err as Error).message);
        return res.status(502).json({ status: 'error', message: 'No se pudo enviar el correo con el contrato. Revisa la configuración de correo (EMAIL_USER/EMAIL_PASS) e intenta de nuevo.' });
    }

    await pool.query(
        'update events set contrato_enviado_en = now(), contrato_enviado_por = $1, updated_at = now() where id = $2',
        [req.usuario!.id, fila.event_id]
    );

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

        const fila = await obtenerFila(req.params.cotizacionId);
        if (!fila?.event_id) {
            return res.status(400).json({ status: 'error', message: 'Esta cotización todavía no es un evento en proceso' });
        }

        await pool.query(
            'update events set contrato_firmado_nombre = $1, contrato_firmado_subido_en = now(), contrato_firmado_subido_por = $2, updated_at = now() where id = $3',
            [req.file.filename, req.usuario!.id, fila.event_id]
        );

        res.json({ status: 'ok' });
    })
);

contratosRouter.get('/:cotizacionId/firmado', requireRole('administrador', 'secretaria'), asyncHandler(async (req, res) => {
    const fila = await obtenerFila(req.params.cotizacionId);
    if (!fila?.contrato_firmado_nombre) {
        return res.status(404).json({ status: 'error', message: 'Todavía no se ha subido el contrato firmado' });
    }

    res.sendFile(path.join(UPLOAD_DIR, fila.contrato_firmado_nombre));
}));
