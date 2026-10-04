import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface ContratoParaPdf {
    numeroReferencia: string;
    clienteNombre: string;
    clienteDocumento: string;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fechaEvento: string; // 'YYYY-MM-DD'
    total: number;
}

const formatearFechaLarga = (fecha: string) => {
    const [anio, mes, dia] = fecha.split('-');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${parseInt(dia, 10)} de ${meses[parseInt(mes, 10) - 1]} de ${anio}`;
};

interface Clausula {
    titulo: string;
    texto: string;
}

function construirClausulas(c: ContratoParaPdf): Clausula[] {
    const totalFormateado = `$ ${Math.round(c.total).toLocaleString('es-CO')} MCTE`;
    const fechaEventoLarga = formatearFechaLarga(c.fechaEvento);

    return [
        {
            titulo: 'PRIMERA - DATOS PARA EJECUTAR EL SERVICIO',
            texto: `Tipo de evento: ${c.tipoEvento || 'Por definir'}. Lugar de la recepción: ${c.lugar || 'Por definir'} (${c.ciudad || 'ciudad por definir'}). Fecha del evento: ${fechaEventoLarga}.`
        },
        {
            titulo: 'SEGUNDA - PRECIO',
            texto: `El valor total del presente contrato será la suma de ${totalFormateado}, valor que se establece antes del Impuesto al Valor Agregado (IVA), según la cotización oficial de referencia ${c.numeroReferencia}.`
        },
        {
            titulo: 'TERCERA - FORMA DE PAGO',
            texto: 'El CONTRATANTE se obliga a pagar el 100% del valor total del contrato a más tardar un (1) día antes del evento. Queda expresamente pactado que el CONTRATISTA no dará inicio al montaje de los equipos si no se ha verificado el pago total del servicio.'
        },
        {
            titulo: 'CUARTA - ENTREGA Y LOGÍSTICA',
            texto: 'El CONTRATISTA se compromete a transportar, instalar, desinstalar y monitorear técnicamente de inicio a fin del evento los equipos descritos en la cotización oficial anexa a este contrato. Parágrafo único: todos los equipos serán entregados debidamente instalados. Se garantiza la permanencia de mínimo un (1) técnico de sonido y un (1) técnico de iluminación durante todo el evento. Los equipos se entregan en perfectas condiciones estéticas y operativas, por lo cual el CONTRATANTE (o su delegado) efectuará una inspección visual y solicitará las pruebas de sonido previas necesarias.'
        },
        {
            titulo: 'QUINTA - RESPONSABILIDAD POR DAÑOS',
            texto: 'El CONTRATANTE se hará responsable por los daños estéticos o de funcionamiento que sufran los equipos arrendados durante el evento, siempre que estos sean ocasionados por negligencia o acción directa del contratante o de los asistentes al evento. En dicho caso, el CONTRATANTE asumirá los costos de reparación o la reposición del equipo afectado.'
        },
        {
            titulo: 'SEXTA - SUSPENSIÓN DEL SERVICIO',
            texto: 'El CONTRATISTA se compromete a cumplir estrictamente con el horario convenido, salvo riñas o altercados graves entre los asistentes, agresiones físicas o verbales hacia el personal técnico, o avería voluntaria o manipulación indebida de los equipos por parte de los asistentes. En cualquiera de estos casos, se suspenderá el servicio de manera inmediata sin derecho a reintegro económico para el CONTRATANTE, y se procederá al retiro técnico de los equipos.'
        },
        {
            titulo: 'SÉPTIMA - EXCLUSIÓN DE REEMBOLSOS',
            texto: 'No habrá lugar a devolución de tiempo ni de dinero en los siguientes escenarios: (1) alternación o interferencia con conjuntos musicales u otras agrupaciones ajenas a la empresa contratada sin coordinación previa; (2) cortes o fallas del suministro eléctrico externo, o lluvia en espacios abiertos sin infraestructura techada adecuada; (3) traslado o manipulación de los equipos hacia otra área sin autorización expresa del CONTRATISTA; (4) suspensión del evento por las autoridades por falta de licencias o permisos, o por quejas de orden público ajenas al CONTRATISTA; (5) cancelación unilateral del servicio por parte del CONTRATANTE con menos de ocho (8) días de anticipación a la fecha del evento.'
        },
        {
            titulo: 'OCTAVA - CAMBIOS DE HORARIO O UBICACIÓN',
            texto: 'En caso de que el horario de inicio o la ubicación geográfica del evento cambien, el CONTRATISTA se reserva el derecho de evaluar la viabilidad técnica y renovar el contrato. De aceptarse el cambio, se liquidará un valor adicional por concepto de transportes y logística extra.'
        },
        {
            titulo: 'NOVENA - UBICACIÓN DE EQUIPOS Y SEGURIDAD',
            texto: 'Por motivos de seguridad técnica, bajo ninguna circunstancia se instalarán equipos ni instrumentos en la vía pública; el evento deberá desarrollarse en las instalaciones interiores o áreas comunes autorizadas de la sede pactada. El CONTRATANTE velará por la seguridad general de los equipos y del personal técnico del CONTRATISTA dentro del recinto del evento.'
        },
        {
            titulo: 'DÉCIMA - INCUMPLIMIENTO DEL CONTRATISTA',
            texto: 'Si por razones imputables al CONTRATISTA este no se presentara a cubrir el evento, estará obligado a realizar la devolución total de los dineros recibidos más el 20% del total del servicio, o bien, suplir el servicio con un proveedor colega de igual categoría que garantice la misma ficha técnica, calidad y cantidad de equipos e iluminación aquí contratados, sin costo adicional para el CONTRATANTE.'
        },
        {
            titulo: 'DÉCIMA PRIMERA - CANCELACIÓN DEL EVENTO',
            texto: 'En caso de cancelación definitiva del servicio por parte del CONTRATANTE sin que medie causa de fuerza mayor o caso fortuito legalmente demostrable, el CONTRATISTA no estará obligado a devolver los anticipos recibidos. Si el anticipo aportado fuese superior al porcentaje requerido como reserva, el CONTRATISTA devolverá el saldo a favor del CONTRATANTE. Toda cancelación formal deberá notificarse por escrito con un mínimo de treinta (30) días de anticipación a la fecha pactada para el evento.'
        },
        {
            titulo: 'DÉCIMA SEGUNDA - MODIFICACIÓN DE LA FECHA',
            texto: 'Cualquier solicitud de cambio de fecha del evento por parte del CONTRATANTE estará sujeta estrictamente a la disponibilidad de agenda y nuevos costos del CONTRATISTA.'
        },
        {
            titulo: 'DÉCIMA TERCERA - HORAS EXTRAS',
            texto: 'El valor pactado en la cláusula segunda cubre la totalidad de las horas de servicio fijadas en la cláusula primera. Si durante el evento las partes acuerdan prolongar el servicio, se cobrará una tarifa adicional por hora extra, la cual deberá ser liquidada y pagada en ese mismo instante en efectivo o transferencia verificada; de lo contrario, el servicio finalizará puntualmente en el horario estipulado.'
        },
        {
            titulo: 'DÉCIMA CUARTA - RESPONSABILIDAD LOGÍSTICA Y TÉCNICA ANTE PROVEEDORES EXTERNOS',
            texto: 'El CONTRATISTA no asume responsabilidad por el suministro, funcionamiento o requerimientos del rider técnico de orquestas o proveedores contratados directamente por el CONTRATANTE, ni por fallas eléctricas de equipos externos conectados a su infraestructura. El CONTRATISTA queda exonerado de responsabilidad si dichos proveedores no realizan sus pruebas de sonido con suficiente antelación, y no se hace responsable del desmontaje, ruidos o afectaciones estéticas causadas por el retiro de equipos de terceros mientras los invitados estén presentes.'
        }
    ];
}

export function generarContratoPdfBuffer(contrato: ContratoParaPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
            const buffers: Buffer[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const logoPath = path.join(__dirname, '..', '..', 'assets', 'logo.png');
            const tieneLogo = fs.existsSync(logoPath);
            const ANCHO = doc.page.width;
            const MARGEN = 50;
            const LIMITE_INFERIOR = doc.page.height - 70;

            function encabezado() {
                doc.rect(0, 0, ANCHO, 6).fill('#f97316');
                let textX = MARGEN;
                if (tieneLogo) {
                    doc.image(logoPath, MARGEN, 18, { width: 34 });
                    textX = MARGEN + 42;
                }
                doc.fillColor('#0f172a').fontSize(12).font('Helvetica-Bold').text('PLANETT PRODUCCIONES S.A.S', textX, 20);
                doc.fontSize(7.5).font('Helvetica').fillColor('#64748b').text('Nit. 901.668.571-1', textX, 36);
                doc.moveTo(MARGEN, 56).lineTo(ANCHO - MARGEN, 56).strokeColor('#cbd5e1').lineWidth(0.8).stroke();
            }

            function asegurarEspacio(altura: number, y: number): number {
                if (y + altura > LIMITE_INFERIOR) {
                    doc.addPage();
                    encabezado();
                    return 75;
                }
                return y;
            }

            encabezado();
            let y = 70;

            doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a')
                .text('CONTRATO DE PRESTACIÓN DE SERVICIOS DE PRODUCCIÓN DE SONIDO E ILUMINACIÓN', MARGEN, y, { align: 'center', width: ANCHO - MARGEN * 2 });
            y += 32;

            doc.fontSize(9).font('Helvetica').fillColor('#334155');
            const preambulo = `Entre los suscritos a saber, ${contrato.clienteNombre}, identificado(a) con cédula de ciudadanía No. ${contrato.clienteDocumento}, quien para efectos del presente documento se denominará el CONTRATANTE, por una parte; y por la otra, PLANETT PRODUCCIONES S.A.S, sociedad identificada con Nit. 901.668.571-1, representada legalmente por la señora MARITZA GALEANO MUÑOZ, identificada con cédula de ciudadanía No. 24.335.738 de Manizales, quien en adelante se denominará el CONTRATISTA, hemos acordado celebrar el presente CONTRATO DE PRESTACIÓN DE SERVICIOS, el cual se regirá por las siguientes cláusulas:`;
            const alturaPreambulo = doc.heightOfString(preambulo, { width: ANCHO - MARGEN * 2 });
            y = asegurarEspacio(alturaPreambulo, y);
            doc.text(preambulo, MARGEN, y, { width: ANCHO - MARGEN * 2, align: 'justify' });
            y += alturaPreambulo + 16;

            construirClausulas(contrato).forEach((clausula) => {
                const alturaTitulo = 16;
                doc.fontSize(9).font('Helvetica');
                const alturaTexto = doc.heightOfString(clausula.texto, { width: ANCHO - MARGEN * 2 });
                y = asegurarEspacio(alturaTitulo + alturaTexto + 14, y);

                doc.fontSize(9).font('Helvetica-Bold').fillColor('#ea580c').text(clausula.titulo, MARGEN, y, { width: ANCHO - MARGEN * 2 });
                y += alturaTitulo;
                doc.fontSize(9).font('Helvetica').fillColor('#334155').text(clausula.texto, MARGEN, y, { width: ANCHO - MARGEN * 2, align: 'justify' });
                y += alturaTexto + 14;
            });

            y = asegurarEspacio(90, y) + 10;
            const fechaFirmaLarga = formatearFechaLarga(new Date().toISOString().slice(0, 10));
            doc.fontSize(9).font('Helvetica').fillColor('#334155')
                .text(`Para constancia de lo anterior y en señal de aceptación, las partes firman el presente documento el día ${fechaFirmaLarga}.`, MARGEN, y, { width: ANCHO - MARGEN * 2 });
            y += 60;

            doc.moveTo(MARGEN, y).lineTo(MARGEN + 180, y).strokeColor('#94a3b8').lineWidth(0.8).stroke();
            doc.moveTo(ANCHO - MARGEN - 180, y).lineTo(ANCHO - MARGEN, y).strokeColor('#94a3b8').lineWidth(0.8).stroke();
            y += 6;
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('MARITZA GALEANO MUÑOZ', MARGEN, y, { width: 180 });
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('CC. 24.335.738 — Contratista', MARGEN, y + 12, { width: 180 });

            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(contrato.clienteNombre, ANCHO - MARGEN - 180, y, { width: 180 });
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(`CC. ${contrato.clienteDocumento} — Contratante`, ANCHO - MARGEN - 180, y + 12, { width: 180 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
