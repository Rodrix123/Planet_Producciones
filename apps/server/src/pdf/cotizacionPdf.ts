import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface ItemCotizacionPdf {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
}

export interface CotizacionParaPdf {
    numeroReferencia: string;
    clienteNombre: string;
    clienteCorreo: string;
    clienteTelefono: string;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fechaEvento: string | null; // 'YYYY-MM-DD' o null
    items: ItemCotizacionPdf[];
    total: number;
}

const formatearCOP = (valor: number) => `$ ${Math.round(valor).toLocaleString('es-CO')} COP`;

const formatearFecha = (fecha: string | null) => {
    if (!fecha) return 'A convenir';
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
};

export function generarCotizacionPdfBuffer(cotizacion: CotizacionParaPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
            const buffers: Buffer[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const logoPath = path.join(__dirname, '..', '..', 'assets', 'logo.png');
            const tieneLogo = fs.existsSync(logoPath);
            const ANCHO = doc.page.width;
            const MARGEN = 40;
            const LIMITE_INFERIOR = doc.page.height - 60;

            function encabezado() {
                doc.rect(0, 0, ANCHO, 6).fill('#f97316');

                let textX = MARGEN;
                if (tieneLogo) {
                    doc.image(logoPath, MARGEN, 18, { width: 38 });
                    textX = MARGEN + 48;
                }

                doc.fillColor('#0f172a').fontSize(15).font('Helvetica-Bold').text('PLANET PRODUCCIONES', textX, 18);
                doc.fontSize(8).font('Helvetica').fillColor('#64748b')
                    .text('Producción Técnica & Eventos VIP 2026', textX, 36);

                doc.fontSize(9).font('Helvetica-Bold').fillColor('#ea580c')
                    .text(`Ref: ${cotizacion.numeroReferencia}`, 0, 20, { align: 'right', width: ANCHO - MARGEN });

                doc.moveTo(MARGEN, 64).lineTo(ANCHO - MARGEN, 64).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
            }

            function asegurarEspacio(alturaNecesaria: number, yActual: number): number {
                if (yActual + alturaNecesaria > LIMITE_INFERIOR) {
                    doc.addPage();
                    encabezado();
                    return 80;
                }
                return yActual;
            }

            encabezado();
            let y = 78;

            // Datos del cliente
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#ea580c').text('INFORMACIÓN DEL CLIENTE Y EL EVENTO', MARGEN, y);
            y += 16;
            doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
            doc.text(`Cliente: ${cotizacion.clienteNombre}`, MARGEN, y);
            doc.text(`Fecha del evento: ${formatearFecha(cotizacion.fechaEvento)}`, 300, y);
            y += 13;
            doc.text(`Correo: ${cotizacion.clienteCorreo}`, MARGEN, y);
            doc.text(`Tipo de evento: ${cotizacion.tipoEvento || 'N/A'}`, 300, y);
            y += 13;
            doc.text(`Teléfono / WA: ${cotizacion.clienteTelefono}`, MARGEN, y);
            doc.text(`Ubicación: ${cotizacion.ciudad || 'N/A'} — ${cotizacion.lugar || 'N/A'}`, 300, y);
            y += 20;

            doc.moveTo(MARGEN, y).lineTo(ANCHO - MARGEN, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            y += 14;

            // Ítems agrupados por categoría (tag), igual que el PDF del cliente
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('DESGLOSE DE SERVICIOS TÉCNICOS', MARGEN, y);
            y += 18;

            const grupos = new Map<string, ItemCotizacionPdf[]>();
            cotizacion.items.forEach((item) => {
                if (!grupos.has(item.tag)) grupos.set(item.tag, []);
                grupos.get(item.tag)!.push(item);
            });

            if (grupos.size === 0) {
                doc.fontSize(9).font('Helvetica-Oblique').fillColor('#94a3b8').text('No se seleccionaron servicios.', MARGEN, y);
                y += 16;
            }

            grupos.forEach((items, tag) => {
                y = asegurarEspacio(18 + items.length * 24, y);

                doc.rect(MARGEN, y, ANCHO - MARGEN * 2, 16).fill('#ffedd5');
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#c2410c').text(tag, MARGEN + 6, y + 4);
                y += 20;

                items.forEach((item) => {
                    y = asegurarEspacio(24, y);
                    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a')
                        .text(item.nombre, MARGEN, y, { width: ANCHO - MARGEN * 2 - 90 });
                    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a')
                        .text(formatearCOP(item.precio), ANCHO - MARGEN - 90, y, { width: 90, align: 'right' });
                    y += 13;
                    if (item.descripcion) {
                        doc.fontSize(7.5).font('Helvetica').fillColor('#64748b')
                            .text(`Incluye: ${item.descripcion}`, MARGEN, y, { width: ANCHO - MARGEN * 2 - 90 });
                        y += 11;
                    }
                    y += 6;
                });
            });

            // Total
            y = asegurarEspacio(46, y) + 6;
            doc.rect(MARGEN, y, ANCHO - MARGEN * 2, 36).fill('#0f172a');
            doc.fontSize(9).font('Helvetica').fillColor('#cbd5e1').text('PRESUPUESTO TOTAL ESTIMADO', MARGEN + 12, y + 8);
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#4ade80').text(formatearCOP(cotizacion.total), MARGEN + 12, y + 20);

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
