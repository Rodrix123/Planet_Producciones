import 'dotenv/config';
import express, { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

interface AsistenciaCorreoRequestBody {
    correo?: string;
    nombre?: string;
    mensaje?: string;
}

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

// Campos de texto (multipart) que envía el navegador junto con el PDF y el Excel
interface CotizacionCorreoRequestBody {
    nombre?: string;
    correo?: string;
    telefono?: string;
    tipoEvento?: string;
    ciudad?: string;
    lugar?: string;
    total?: string;
    refNum?: string;
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'assets')));
// Sirve el frontend compilado (apps/web/dist) para abrir la app en http://localhost:PORT
app.use(express.static(path.join(__dirname, '..', '..', 'web', 'dist')));

// Configuración SMTP para Gmail (EMAIL_USER es una cuenta @gmail.com)
const transporter = nodemailer.createTransport({
    service: 'gmail',
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

// Plantillas aprobadas por Meta (necesarias para enviar el primer mensaje sin que
// la dueña le haya escrito antes al número de WhatsApp Business)
const WHATSAPP_TEMPLATE_IDIOMA = 'es_CO';
const WHATSAPP_TEMPLATE_PDF = 'cotizacion_pdf';
const WHATSAPP_TEMPLATE_EXCEL = 'cotizacion_excel';

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
    console.log('[WhatsApp media]', JSON.stringify(data));
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

    const data: any = await respuesta.json();
    console.log('[WhatsApp messages]', JSON.stringify(data));
    if (!respuesta.ok) {
        throw new Error(`Error enviando mensaje de WhatsApp: ${JSON.stringify(data)}`);
    }
}

// Envía un documento (PDF/Excel) usando una plantilla aprobada por Meta, con el
// archivo como encabezado y los datos de la cotización como variables del cuerpo
async function enviarPlantillaDocumentoWhatsApp(
    nombrePlantilla: string,
    mediaId: string,
    filename: string,
    parametrosCuerpo: string[]
): Promise<void> {
    await enviarMensajeWhatsApp({
        type: 'template',
        template: {
            name: nombrePlantilla,
            language: { code: WHATSAPP_TEMPLATE_IDIOMA },
            components: [
                {
                    type: 'header',
                    parameters: [{ type: 'document', document: { id: mediaId, filename } }]
                },
                {
                    type: 'body',
                    parameters: parametrosCuerpo.map((texto) => ({ type: 'text', text: texto }))
                }
            ]
        }
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

            const pdfMediaId = await subirMediaWhatsApp(archivoPdf.buffer, archivoPdf.originalname, 'application/pdf');
            await enviarPlantillaDocumentoWhatsApp(WHATSAPP_TEMPLATE_PDF, pdfMediaId, archivoPdf.originalname, [
                nombre,
                tipoEvento || 'No especificado',
                refNum
            ]);

            const excelMediaId = await subirMediaWhatsApp(
                archivoExcel.buffer,
                archivoExcel.originalname,
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            );
            await enviarPlantillaDocumentoWhatsApp(WHATSAPP_TEMPLATE_EXCEL, excelMediaId, archivoExcel.originalname, [refNum]);

            console.log(`✅ Cotización ${refNum} enviada por WhatsApp a la dueña.`);
            res.json({ status: 'ok', message: 'Cotización enviada por WhatsApp exitosamente.' });
        } catch (error) {
            console.error('❌ Error enviando cotización por WhatsApp:', (error as Error).message);
            res.status(500).json({ status: 'error', message: 'No se pudo enviar la cotización por WhatsApp.' });
        }
    }
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Envía un correo de confirmación al correo ingresado por el visitante que pidió
// asistencia desde el botón flotante de contacto (canal "Correo")
app.post('/api/enviar-asistencia-correo', async (req: Request<{}, {}, AsistenciaCorreoRequestBody>, res: Response) => {
    try {
        const { correo, nombre, mensaje } = req.body;

        if (!correo || !EMAIL_REGEX.test(correo)) {
            res.status(400).json({ status: 'error', message: 'Ingresa un correo electrónico válido.' });
            return;
        }

        await transporter.sendMail({
            from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
            to: correo,
            subject: 'Hemos recibido tu solicitud de asistencia - Planet Producciones',
            text: `Hola${nombre ? ` ${nombre}` : ''},\n\n¡Gracias por contactar a Planet Producciones! Hemos recibido tu solicitud de asistencia y muy pronto uno de nuestros asesores se pondrá en contacto contigo por este correo.\n\nResumen de tu solicitud:\n${mensaje || 'Sin detalles adicionales.'}\n\n¡Gracias por elegirnos para hacer inolvidable tu evento!\nEquipo Planet Producciones`
        });

        console.log(`✅ Correo de asistencia enviado a ${correo}`);
        res.json({ status: 'ok', message: 'Correo de asistencia enviado correctamente.' });
    } catch (error) {
        console.error('❌ Error enviando correo de asistencia:', (error as Error).message);
        res.status(500).json({ status: 'error', message: 'No se pudo enviar el correo de asistencia.' });
    }
});

// Correos internos que reciben cada cotización generada (se definen en apps/server/.env)
const DESTINATARIOS_COTIZACION = [
    { rol: 'secretaria', variable: 'EMAIL_SECRETARIA' },
    { rol: 'jefe', variable: 'EMAIL_JEFE' },
    { rol: 'administrador', variable: 'EMAIL_ADMINISTRADOR' }
];

const REF_COTIZACION_REGEX = /^[A-Za-z0-9-]{1,30}$/;

// Devuelve los correos configurados y válidos, sin repetir si una misma persona cubre varios roles
function obtenerDestinatariosCotizacion(): string[] {
    const correos = new Map<string, string>();
    for (const { rol, variable } of DESTINATARIOS_COTIZACION) {
        const correo = process.env[variable]?.trim();
        if (!correo || !EMAIL_REGEX.test(correo)) {
            console.warn(`⚠️ ${variable} vacío o inválido: la cotización no se enviará al rol "${rol}".`);
            continue;
        }
        if (!correos.has(correo.toLowerCase())) {
            correos.set(correo.toLowerCase(), correo);
        }
    }
    return Array.from(correos.values());
}

// Texto en una sola línea y de largo acotado: evita que quien llena el formulario inserte
// saltos de línea (líneas falsas en el asunto o el cuerpo) en el correo que recibe la empresa
function limpiarTexto(valor: unknown, maxLargo = 200): string {
    return String(valor ?? '').replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim().slice(0, maxLargo);
}

// Nombre de archivo sin tildes, espacios ni caracteres especiales
function nombreArchivoSeguro(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'Cliente';
}

// Los archivos llegan desde el navegador: se confirma por su firma que sean un PDF y un .xlsx (ZIP)
const esPdf = (buffer: Buffer): boolean => buffer.toString('latin1', 0, 5) === '%PDF-';
const esXlsx = (buffer: Buffer): boolean => buffer.toString('latin1', 0, 4) === 'PK\u0003\u0004';

const direccionDeCorreo = (destino: string | { address: string }): string =>
    typeof destino === 'string' ? destino : destino.address;

// Envía por correo el PDF y el Excel de la cotización recién generada (los mismos que se
// descargan en el navegador) a la secretaria, el jefe y el administrador, para que puedan
// coordinar con logística los equipos, el personal y los espacios del evento
app.post(
    '/api/enviar-cotizacion-correo',
    upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'excel', maxCount: 1 }]),
    async (req: Request, res: Response) => {
        try {
            const destinatarios = obtenerDestinatariosCotizacion();
            if (destinatarios.length === 0) {
                console.error('❌ No hay correos de destino válidos: define EMAIL_SECRETARIA, EMAIL_JEFE o EMAIL_ADMINISTRADOR en apps/server/.env.');
                res.status(500).json({ status: 'error', message: 'No hay correos de destino configurados en el servidor.' });
                return;
            }

            const archivos = req.files as { pdf?: Express.Multer.File[]; excel?: Express.Multer.File[] };
            const archivoPdf = archivos?.pdf?.[0];
            const archivoExcel = archivos?.excel?.[0];
            const datos = req.body as CotizacionCorreoRequestBody;
            const nombre = limpiarTexto(datos.nombre);
            const refNum = limpiarTexto(datos.refNum);

            if (!archivoPdf || !archivoExcel || !nombre || !REF_COTIZACION_REGEX.test(refNum)) {
                console.warn('⚠️ Cotización por correo rechazada: faltan datos o archivos (pdf, excel, nombre o refNum válido).');
                res.status(400).json({ status: 'error', message: 'Faltan datos o archivos de la cotización.' });
                return;
            }

            if (!esPdf(archivoPdf.buffer) || !esXlsx(archivoExcel.buffer)) {
                console.warn(`⚠️ Cotización ${refNum} por correo rechazada: los adjuntos no son un PDF y un Excel válidos.`);
                res.status(400).json({ status: 'error', message: 'Los archivos adjuntos no son un PDF y un Excel válidos.' });
                return;
            }

            const total = Number(datos.total);
            const totalFormateado = (Number.isFinite(total) ? total : 0).toLocaleString('es-CO');
            const tipoEvento = limpiarTexto(datos.tipoEvento) || 'No especificado';
            const nombreArchivo = `Cotizacion_${refNum}_${nombreArchivoSeguro(nombre)}`;

            console.log(`📧 Enviando cotización ${refNum} por correo a ${destinatarios.length} destinatario(s)...`);
            const info = await transporter.sendMail({
                from: `"Planet Producciones" <${process.env.EMAIL_USER}>`,
                to: destinatarios,
                subject: `🚨 Nueva Cotización ${refNum}: ${nombre} - ${tipoEvento} - $${totalFormateado} COP`,
                text: [
                    'Hola equipo de Planet Producciones,',
                    '',
                    'Se generó una nueva cotización VIP desde el cotizador web. Se adjuntan el Excel, para coordinar con logística los equipos, el personal y los espacios del evento, y el PDF con la cotización oficial.',
                    '',
                    `- Referencia: ${refNum}`,
                    `- Cliente: ${nombre}`,
                    `- Correo: ${limpiarTexto(datos.correo) || 'N/A'}`,
                    `- WhatsApp: ${limpiarTexto(datos.telefono) || 'N/A'}`,
                    `- Tipo de evento: ${tipoEvento}`,
                    `- Ubicación / Sede: ${limpiarTexto(datos.ciudad) || 'N/A'} (${limpiarTexto(datos.lugar) || 'Sede a confirmar'})`,
                    `- Total estimado: $${totalFormateado} COP`
                ].join('\n'),
                attachments: [
                    { filename: `${nombreArchivo}.xlsx`, content: archivoExcel.buffer },
                    { filename: `${nombreArchivo}.pdf`, content: archivoPdf.buffer }
                ]
            });

            const rechazados = (info.rejected || []).map(direccionDeCorreo);
            if (rechazados.length > 0) {
                console.warn(`⚠️ Cotización ${refNum}: el servidor de correo rechazó a ${rechazados.join(', ')}`);
            }
            console.log(`✅ Cotización ${refNum} enviada por correo a: ${(info.accepted || []).map(direccionDeCorreo).join(', ')}`);
            res.json({ status: 'ok', message: 'Cotización enviada por correo exitosamente.' });
        } catch (error) {
            console.error('❌ Error enviando cotización por correo:', (error as Error).message);
            res.status(500).json({ status: 'error', message: 'No se pudo enviar la cotización por correo.' });
        }
    }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
