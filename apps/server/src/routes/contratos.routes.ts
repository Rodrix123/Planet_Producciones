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

interface CotizacionParaContrato {
    id: string;
    numero_referencia: string;
    cliente_nombre: string;
    cliente_correo: string;
    cliente_documento: string | null;
    tipo_evento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fecha_evento: string | null;
    total: string;
    estado: string;
}

async function obtenerCotizacion(id: string): Promise<CotizacionParaContrato | null> {
    const { rows } = await pool.query<CotizacionParaContrato>('select * from cotizaciones where id = $1', [id]);
    return rows[0] || null;
}

export const contratosRouter = Router();
contratosRouter.use(requireAuth);

contratosRouter.get('/:cotizacionId', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'select enviado_en, firmado_subido_en, pdf_firmado_nombre from contratos where cotizacion_id = $1',
        [req.params.cotizacionId]
    );
    const row = rows[0];
    res.json({
        enviadoEn: row?.enviado_en || null,
        firmadoSubidoEn: row?.firmado_subido_en || null,
        tieneFirmado: !!row?.pdf_firmado_nombre
    });
}));

contratosRouter.get('/:cotizacionId/pdf', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const cotizacion = await obtenerCotizacion(req.params.cotizacionId);
    if (!cotizacion) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });
    if (!cotizacion.cliente_documento || !cotizacion.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Faltan datos del cliente o la fecha del evento' });
    }

    const buffer = await generarContratoPdfBuffer({
        numeroReferencia: cotizacion.numero_referencia,
        clienteNombre: cotizacion.cliente_nombre,
        clienteDocumento: cotizacion.cliente_documento,
        tipoEvento: cotizacion.tipo_evento,
        ciudad: cotizacion.ciudad,
        lugar: cotizacion.lugar,
        fechaEvento: cotizacion.fecha_evento,
        total: Number(cotizacion.total)
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=Contrato_${cotizacion.numero_referencia}.pdf`);
    res.send(buffer);
}));

contratosRouter.post('/:cotizacionId/generar-y-enviar', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const cotizacion = await obtenerCotizacion(req.params.cotizacionId);
    if (!cotizacion) return res.status(404).json({ status: 'error', message: 'Cotización no encontrada' });

    if (cotizacion.estado !== 'finalizada') {
        return res.status(400).json({ status: 'error', message: 'Esta cotización no está lista para generar el contrato (ya tiene uno enviado o aún no fue finalizada)' });
    }
    if (!cotizacion.cliente_documento) {
        return res.status(400).json({ status: 'error', message: 'Falta el documento del cliente. Pídele a la administradora que lo complete en la cotización.' });
    }
    if (!cotizacion.fecha_evento) {
        return res.status(400).json({ status: 'error', message: 'Falta la fecha del evento. Pídele a la administradora que la complete en la cotización.' });
    }

    const buffer = await generarContratoPdfBuffer({
        numeroReferencia: cotizacion.numero_referencia,
        clienteNombre: cotizacion.cliente_nombre,
        clienteDocumento: cotizacion.cliente_documento,
        tipoEvento: cotizacion.tipo_evento,
        ciudad: cotizacion.ciudad,
        lugar: cotizacion.lugar,
        fechaEvento: cotizacion.fecha_evento,
        total: Number(cotizacion.total)
    });

    try {
        await transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: cotizacion.cliente_correo,
            subject: `Contrato de servicios Planet Producciones - ${cotizacion.numero_referencia}`,
            text: `Hola ${cotizacion.cliente_nombre},\n\nAdjuntamos el contrato de prestación de servicios para tu evento. Por favor fírmalo y responde este correo adjuntando el documento firmado.\n\nGracias por elegir a Planet Producciones.`,
            attachments: [{ filename: `Contrato_${cotizacion.numero_referencia}.pdf`, content: buffer }]
        });
    } catch (err) {
        console.error('Error enviando contrato por correo:', (err as Error).message);
        return res.status(502).json({ status: 'error', message: 'No se pudo enviar el correo con el contrato. Revisa la configuración de correo (EMAIL_USER/EMAIL_PASS) e intenta de nuevo.' });
    }

    await pool.query(
        `insert into contratos (cotizacion_id, enviado_en, enviado_por)
         values ($1, now(), $2)
         on conflict (cotizacion_id) do update set enviado_en = now(), enviado_por = $2`,
        [cotizacion.id, req.usuario!.id]
    );

    await pool.query(
        `update cotizaciones set estado = 'contrato_enviado', actualizada_en = now() where id = $1`,
        [cotizacion.id]
    );

    await pool.query(
        `insert into cotizacion_historial (cotizacion_id, usuario_id, tipo, estado_antes, estado_despues)
         values ($1, $2, 'cambio_estado', 'finalizada', 'contrato_enviado')`,
        [cotizacion.id, req.usuario!.id]
    );

    res.json({ status: 'ok' });
}));

contratosRouter.post(
    '/:cotizacionId/firmado',
    requireRole('administradora'),
    upload.single('archivo'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ status: 'error', message: 'Sube un archivo PDF del contrato firmado' });
        }

        await pool.query(
            `insert into contratos (cotizacion_id, pdf_firmado_nombre, firmado_subido_en, firmado_subido_por)
             values ($1, $2, now(), $3)
             on conflict (cotizacion_id) do update set pdf_firmado_nombre = $2, firmado_subido_en = now(), firmado_subido_por = $3`,
            [req.params.cotizacionId, req.file.filename, req.usuario!.id]
        );

        res.json({ status: 'ok' });
    })
);

contratosRouter.get('/:cotizacionId/firmado', requireRole('administradora', 'secretaria'), asyncHandler(async (req, res) => {
    const { rows } = await pool.query('select pdf_firmado_nombre from contratos where cotizacion_id = $1', [req.params.cotizacionId]);
    const nombre = rows[0]?.pdf_firmado_nombre;
    if (!nombre) return res.status(404).json({ status: 'error', message: 'Todavía no se ha subido el contrato firmado' });

    res.sendFile(path.join(UPLOAD_DIR, nombre));
}));
