// Lista de carga en PDF para el jefe de logística: los equipos de un evento agrupados por tipo,
// con una casilla para marcar cada uno al cargarlo en el camión. Nunca incluye precios.

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { CARPETA_ASSETS } from '../rutas';

// Un equipo a cargar y cuántas unidades.
export interface EquipoListaCarga {
    tag: string;
    nombre: string;
    descripcion: string;
    cantidad: number;
}

// Datos que necesita la lista; el módulo no consulta la base de datos.
export interface ListaCargaParaPdf {
    numeroReferencia: string;
    clienteNombre: string;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    direccion: string | null;
    fechaEvento: string | null; // 'YYYY-MM-DD' o null
    equipos: EquipoListaCarga[];
}

// AAAA-MM-DD -> DD/MM/AAAA (o "Sin fecha").
const formatearFecha = (fecha: string | null) => {
    if (!fecha) return 'Sin fecha';
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
};

// Lista de carga para Andrés y su equipo: qué subir al camión, agrupado por tipo,
// con casilla para marcar al cargar. Nunca incluye precios.
export function generarListaCargaPdfBuffer(lista: ListaCargaParaPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
            const buffers: Buffer[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const logoPath = path.join(CARPETA_ASSETS, 'logo.png');
            const tieneLogo = fs.existsSync(logoPath);
            const ANCHO = doc.page.width;
            const MARGEN = 40;
            const LIMITE_INFERIOR = doc.page.height - 60;

            // Franja naranja, logo y referencia; se repite en cada página.
            function encabezado() {
                doc.rect(0, 0, ANCHO, 6).fill('#f97316');

                let textX = MARGEN;
                if (tieneLogo) {
                    doc.image(logoPath, MARGEN, 18, { width: 38 });
                    textX = MARGEN + 48;
                }

                doc.fillColor('#0f172a').fontSize(15).font('Helvetica-Bold').text('PLANET PRODUCCIONES', textX, 18);
                doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('Lista de carga — Logística', textX, 36);

                doc.fontSize(9).font('Helvetica-Bold').fillColor('#ea580c')
                    .text(`Ref: ${lista.numeroReferencia}`, 0, 20, { align: 'right', width: ANCHO - MARGEN });

                doc.moveTo(MARGEN, 64).lineTo(ANCHO - MARGEN, 64).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
            }

            // Si lo que sigue no cabe en la página, abre una nueva (con su encabezado) y devuelve dónde seguir.
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

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#ea580c').text('DATOS DEL EVENTO', MARGEN, y);
            y += 16;
            doc.fontSize(8.5).font('Helvetica').fillColor('#334155');
            doc.text(`Cliente: ${lista.clienteNombre}`, MARGEN, y);
            doc.text(`Fecha del evento: ${formatearFecha(lista.fechaEvento)}`, 300, y);
            y += 13;
            doc.text(`Tipo de evento: ${lista.tipoEvento || 'N/A'}`, MARGEN, y);
            doc.text(`Ciudad: ${lista.ciudad || 'N/A'}`, 300, y);
            y += 13;
            doc.text(`Lugar: ${lista.lugar || 'Por definir'}${lista.direccion ? ' — ' + lista.direccion : ''}`, MARGEN, y, { width: ANCHO - MARGEN * 2 });
            y += 24;

            doc.moveTo(MARGEN, y).lineTo(ANCHO - MARGEN, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
            y += 14;

            doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e293b').text('EQUIPOS A CARGAR', MARGEN, y);
            y += 18;

            const grupos = new Map<string, EquipoListaCarga[]>();
            lista.equipos.forEach((item) => {
                if (!grupos.has(item.tag)) grupos.set(item.tag, []);
                grupos.get(item.tag)!.push(item);
            });

            if (grupos.size === 0) {
                doc.fontSize(9).font('Helvetica-Oblique').fillColor('#94a3b8').text('Sin equipos registrados para este evento.', MARGEN, y);
                y += 16;
            }

            const ladoCasilla = 10;

            grupos.forEach((items, tag) => {
                y = asegurarEspacio(18 + items.length * 24, y);

                doc.rect(MARGEN, y, ANCHO - MARGEN * 2, 16).fill('#ffedd5');
                doc.fontSize(8).font('Helvetica-Bold').fillColor('#c2410c').text(tag, MARGEN + 6, y + 4);
                y += 20;

                items.forEach((item) => {
                    y = asegurarEspacio(26, y);

                    // Casilla para marcar al cargar en el camión.
                    doc.rect(MARGEN, y + 1, ladoCasilla, ladoCasilla).strokeColor('#94a3b8').lineWidth(0.8).stroke();

                    const nombreMostrado = item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre;
                    doc.fontSize(9).font('Helvetica-Bold').fillColor('#0f172a')
                        .text(nombreMostrado, MARGEN + ladoCasilla + 8, y, { width: ANCHO - MARGEN * 2 - ladoCasilla - 8 });
                    y += 13;
                    if (item.descripcion) {
                        doc.fontSize(7.5).font('Helvetica').fillColor('#64748b')
                            .text(`Incluye: ${item.descripcion}`, MARGEN + ladoCasilla + 8, y, { width: ANCHO - MARGEN * 2 - ladoCasilla - 8 });
                        y += 11;
                    }
                    y += 6;
                });
            });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
