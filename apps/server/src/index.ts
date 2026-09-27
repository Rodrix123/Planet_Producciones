import 'dotenv/config';
import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

interface CotizacionRequestBody {
    nombre?: string;
    correo?: string;
    telefono?: string;
    fechaEvento?: string;
    tipoEvento?: string;
    ciudad?: string;
    lugar?: string;
    espacioElegido?: string;
    sonido?: string;
    iluminacion?: string;
    sparkulas?: string;
    niebla?: string;
    total?: number;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'assets')));
// Sirve el frontend compilado (apps/web/dist) para abrir la app en http://localhost:PORT
app.use(express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

// Configuración SMTP para Outlook/Hotmail
const transporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Configuración WhatsApp Cloud API (Meta) para el envío automático a la dueña
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const WHATSAPP_DUENA_NUMERO = process.env.WHATSAPP_DUENA_NUMERO;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }
});

function urlWhatsApp(recurso: string): string {
    return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/${recurso}`;
}

// Sube un archivo (PDF/Excel) a la API de medios de WhatsApp y devuelve su media id
async function subirMediaWhatsApp(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', new Blob([buffer], { type: mimeType }), filename);

    const respuesta = await fetch(urlWhatsApp('media'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        body: form
    });

    const data: any = await respuesta.json();
    if (!respuesta.ok || !data.id) {
        throw new Error(`Error subiendo archivo a WhatsApp: ${JSON.stringify(data)}`);
    }
    return data.id;
}

async function enviarMensajeWhatsApp(payload: Record<string, unknown>): Promise<void> {
    const respuesta = await fetch(urlWhatsApp('messages'), {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: WHATSAPP_DUENA_NUMERO, ...payload })
    });

    if (!respuesta.ok) {
        const data = await respuesta.json();
        throw new Error(`Error enviando mensaje de WhatsApp: ${JSON.stringify(data)}`);
    }
}

async function enviarDocumentoWhatsApp(mediaId: string, filename: string): Promise<void> {
    await enviarMensajeWhatsApp({
        type: 'document',
        document: { id: mediaId, filename }
    });
}

// Generador de PDF Rediseñado y Armónico
function generarPdfBuffer(datos: CotizacionRequestBody): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            const buffers: Buffer[] = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
            const tieneLogo = fs.existsSync(logoPath);

            // 1. MARCA DE AGUA EN EL CENTRO
            if (tieneLogo) {
                doc.save();
                doc.opacity(0.04);
                doc.image(logoPath, (595.28 - 320) / 2, (841.89 - 320) / 2, { width: 320 });
                doc.restore();
            }

            // 2. ENCABEZADO Y LOGO DE LA CABECERA
            doc.rect(0, 0, doc.page.width, 6).fill('#8b5cf6');

            let textX = 40;
            if (tieneLogo) {
                doc.image(logoPath, 40, 20, { width: 42 });
                textX = 92;
            }

            doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text('PLANET PRODUCCIONES', textX, 20);
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('Producción Técnica & Eventos VIP 2026 | NIT: 900.123.456-7', textX, 38);

            doc.moveTo(40, 68).lineTo(555, 68).strokeColor('#cbd5e1').lineWidth(0.8).stroke();

            // 3. BLOQUE DE INFORMACIÓN DEL CLIENTE Y EVENTO
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#8b5cf6').text('INFORMACIÓN DE LA COTIZACIÓN', 40, 80);

            doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
            doc.text(`Fecha Emisión: ${new Date().toLocaleDateString('es-CO')}`, 40, 96);
            doc.text(`Cliente: ${datos.nombre || 'N/A'}`, 40, 109);
            doc.text(`Correo: ${datos.correo || 'N/A'}`, 40, 122);

            doc.text(`Fecha del Evento: ${datos.fechaEvento || 'No definida'}`, 300, 96);
            doc.text(`Teléfono / WA: ${datos.telefono || 'N/A'}`, 300, 109);
            doc.text(`Tipo de Evento: ${datos.tipoEvento || 'N/A'}`, 300, 122);

            doc.moveTo(40, 138).lineTo(555, 138).strokeColor('#e2e8f0').lineWidth(0.5).stroke();

            // 4. DESGLOSE DE SERVICIOS
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#8b5cf6').text('DESGLOSE DE SERVICIOS TÉCNICOS', 40, 148);

            const items: [string, string | undefined][] = [
                ['Ubicación / Cobertura', datos.ciudad],
                ['Lugar / Sede', datos.lugar],
                ['Modalidad Espacio', datos.espacioElegido],
                ['Sistema de Sonido', datos.sonido],
                ['Iluminación Profesional', datos.iluminacion],
                ['Sparkulas (Chispas Frías)', datos.sparkulas],
                ['Niebla Baja (Hielo Seco)', datos.niebla]
            ];

            let yPos = 163;
            items.forEach(([item, val]) => {
                doc.rect(40, yPos, 515, 18).fill(yPos % 36 === 0 ? '#f8fafc' : '#ffffff');
                doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#1e293b').text(item, 48, yPos + 4);
                doc.fontSize(8.5).font('Helvetica').fillColor('#475569').text(val || 'N/A', 220, yPos + 4);
                yPos += 19;
            });

            // 5. CUADRO DE TOTAL ESTIMADO
            yPos += 8;
            const totalFormateado = (datos.total || 0).toLocaleString('es-CO');

            doc.rect(40, yPos, 515, 38).fill('#0f172a');
            doc.fontSize(9).font('Helvetica').fillColor('#cbd5e1').text('PRESUPUESTO TOTAL ESTIMADO', 52, yPos + 8);
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#4ade80').text(`$ ${totalFormateado} COP`, 52, yPos + 20);

            // 6. CONDICIONES COMERCIALES Y PIE DE PÁGINA
            yPos += 48;
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748b').text('CONDICIONES COMERCIALES:', 40, yPos);
            doc.fontSize(7.5).font('Helvetica').fillColor('#94a3b8');
            doc.text('1. Esta cotización tiene validez formal por 30 días calendario.', 40, yPos + 11);
            doc.text('2. La reserva de fecha se confirma mediante el anticipo del 30% del valor total.', 40, yPos + 21);
            doc.text('3. Incluye montaje, desmontaje y personal técnico especializado en sitio.', 40, yPos + 31);

            doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#8b5cf6').text('¡Gracias por elegir a Planet Producciones para hacer inolvidable tu evento!', 40, yPos + 48, { align: 'center' });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

// Endpoint Principal
app.post('/api/enviar-cotizacion', async (req: Request<{}, {}, CotizacionRequestBody>, res: Response) => {
    try {
        const datos = req.body;
        const nombreLimpio = (datos.nombre || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
        const totalFormateado = (datos.total || 0).toLocaleString('es-CO');

        // Construcción de Excel en memoria
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Cotización Planet');

        sheet.columns = [
            { header: 'Concepto / Campo', key: 'campo', width: 25 },
            { header: 'Detalle Seleccionado', key: 'detalle', width: 45 }
        ];

        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '8B5CF6' } };

        sheet.addRows([
            { campo: 'Fecha Emisión', detalle: new Date().toLocaleDateString('es-CO') },
            { campo: 'Fecha del Evento', detalle: datos.fechaEvento || 'No especificada' },
            { campo: 'Cliente', detalle: datos.nombre },
            { campo: 'Correo', detalle: datos.correo },
            { campo: 'Teléfono', detalle: datos.telefono },
            { campo: 'Tipo de Evento', detalle: datos.tipoEvento },
            { campo: 'Ubicación', detalle: datos.ciudad },
            { campo: 'Lugar / Sede', detalle: datos.lugar },
            { campo: 'Espacio', detalle: datos.espacioElegido },
            { campo: 'Sonido', detalle: datos.sonido },
            { campo: 'Iluminación', detalle: datos.iluminacion },
            { campo: 'Sparkulas', detalle: datos.sparkulas },
            { campo: 'Niebla Baja', detalle: datos.niebla },
            { campo: 'TOTAL INVERSIÓN', detalle: `$ ${totalFormateado} COP` }
        ]);

        const [bufferPdf, bufferExcel] = await Promise.all([
            generarPdfBuffer(datos),
            workbook.xlsx.writeBuffer()
        ]);

        // Envío por correo a la jefe
        transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_JEFE,
            subject: `🚨 Nueva Cotización: ${datos.nombre} - Evento: ${datos.fechaEvento || 'S/F'} - $${totalFormateado} COP`,
            text: `Hola Maritza,\n\nSe ha recibido una nueva solicitud de cotización VIP:\n\n- Cliente: ${datos.nombre}\n- Fecha del Evento: ${datos.fechaEvento || 'No indicada'}\n- Teléfono: ${datos.telefono}\n- Correo: ${datos.correo}\n- Total: $${totalFormateado} COP\n\nSe adjuntan la cotización oficial en PDF y el reporte detallado en Excel.`,
            attachments: [
                { filename: `Cotizacion_${nombreLimpio}.xlsx`, content: bufferExcel as unknown as Buffer },
                { filename: `Cotizacion_${nombreLimpio}.pdf`, content: bufferPdf }
            ]
        }).then(() => {
            console.log(`✅ Correo enviado a gerencia: ${process.env.EMAIL_JEFE}`);
        }).catch((err: Error) => {
            console.error('❌ Error enviando correo:', err.message);
        });

        // Descarga del PDF para el usuario
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Cotizacion_Planet_${nombreLimpio}.pdf`);
        res.send(bufferPdf);

    } catch (error) {
        console.error('❌ Error general:', (error as Error).message);
        res.status(500).json({ status: 'error', message: 'Error procesando la cotización' });
    }
});

// Envío automático de la cotización (PDF + Excel) por WhatsApp a la dueña
app.post(
    '/api/enviar-whatsapp',
    upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'excel', maxCount: 1 }]),
    async (req: Request, res: Response) => {
        try {
            if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_DUENA_NUMERO) {
                res.status(500).json({ status: 'error', message: 'La integración de WhatsApp no está configurada en el servidor.' });
                return;
            }

            const archivos = req.files as { pdf?: Express.Multer.File[]; excel?: Express.Multer.File[] };
            const archivoPdf = archivos?.pdf?.[0];
            const archivoExcel = archivos?.excel?.[0];
            const { nombre, tipoEvento, refNum } = req.body as { nombre?: string; tipoEvento?: string; refNum?: string };

            if (!archivoPdf || !archivoExcel || !nombre || !refNum) {
                res.status(400).json({ status: 'error', message: 'Faltan datos o archivos de la cotización.' });
                return;
            }

            const mensaje = `Nueva cotización para revisión\nCliente: ${nombre}\nEvento: ${tipoEvento || 'No especificado'}\nCotización: ${refNum}\n\nSe adjuntan los archivos PDF y Excel de la cotización para su revisión.`;

            await enviarMensajeWhatsApp({ type: 'text', text: { body: mensaje } });

            const pdfMediaId = await subirMediaWhatsApp(archivoPdf.buffer, archivoPdf.originalname, 'application/pdf');
            await enviarDocumentoWhatsApp(pdfMediaId, archivoPdf.originalname);

            const excelMediaId = await subirMediaWhatsApp(
                archivoExcel.buffer,
                archivoExcel.originalname,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            await enviarDocumentoWhatsApp(excelMediaId, archivoExcel.originalname);

            console.log(`✅ Cotización ${refNum} enviada por WhatsApp a la dueña.`);
            res.json({ status: 'ok', message: 'Cotización enviada por WhatsApp exitosamente.' });
        } catch (error) {
            console.error('❌ Error enviando cotización por WhatsApp:', (error as Error).message);
            res.status(500).json({ status: 'error', message: 'No se pudo enviar la cotización por WhatsApp.' });
        }
    }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
