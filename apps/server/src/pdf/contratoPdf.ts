import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';

export interface ItemContratoPdf {
    cantidad: number;
    nombre: string;
}

export interface ContratoParaPdf {
    numeroReferencia: string;
    clienteNombre: string;
    clienteDocumento: string;
    tipoEvento: string | null;
    ciudad: string | null;
    lugar: string | null;
    fechaEvento: string; // 'YYYY-MM-DD'
    total: number;
    items: ItemContratoPdf[];
}

const formatearFechaLarga = (fecha: string) => {
    const [anio, mes, dia] = fecha.split('-');
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${parseInt(dia, 10)} de ${meses[parseInt(mes, 10) - 1]} de ${anio}`;
};

export function generarContratoPdfBuffer(contrato: ContratoParaPdf): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
            const buffers: Buffer[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const logoPath = path.join(__dirname, '..', '..', 'assets', 'logo.png');
            const firmaPath = path.join(__dirname, '..', '..', 'assets', 'firma-maritza.png');
            const tieneLogo = fs.existsSync(logoPath);
            const tieneFirma = fs.existsSync(firmaPath);
            const ANCHO = doc.page.width;
            const MARGEN = 50;
            const ANCHO_UTIL = ANCHO - MARGEN * 2;

            // Encabezado con logo + franja naranja; se repite solo (vía 'pageAdded') en cada
            // página nueva que el flujo de texto de pdfkit cree automáticamente.
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
                doc.x = MARGEN;
                doc.y = 75;
            }

            doc.on('pageAdded', encabezado);
            encabezado();

            // Párrafo con negrillas en línea: los tramos entre "**" se escriben en Helvetica-Bold,
            // el resto en Helvetica normal, como un solo flujo continuo (pdfkit pagina solo si
            // hace falta, sin que tengamos que calcular alturas a mano).
            function p(texto: string) {
                const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter((s) => s.length > 0);
                doc.fontSize(9);
                partes.forEach((parte, i) => {
                    const esNegrilla = parte.startsWith('**') && parte.endsWith('**');
                    doc.font(esNegrilla ? 'Helvetica-Bold' : 'Helvetica').fillColor('#334155');
                    doc.text(esNegrilla ? parte.slice(2, -2) : parte, { continued: i < partes.length - 1, width: ANCHO_UTIL });
                });
                doc.moveDown(0.7);
            }

            function tituloClausula(texto: string) {
                doc.fontSize(9).font('Helvetica-Bold').fillColor('#ea580c').text(texto, { width: ANCHO_UTIL });
                doc.moveDown(0.35);
            }

            function vinetas(items: string[]) {
                if (items.length === 0) return;
                doc.fontSize(9).font('Helvetica').fillColor('#334155');
                doc.list(items, { bulletRadius: 1.4, textIndent: 10, width: ANCHO_UTIL });
                doc.moveDown(0.7);
            }

            function numerada(items: string[]) {
                doc.fontSize(9).font('Helvetica').fillColor('#334155');
                doc.list(items, { listType: 'numbered', textIndent: 10, width: ANCHO_UTIL });
                doc.moveDown(0.7);
            }

            doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a')
                .text('CONTRATO DE PRESTACIÓN DE SERVICIOS DE PRODUCCIÓN DE SONIDO E ILUMINACIÓN', { align: 'center', width: ANCHO_UTIL });
            doc.moveDown(1.3);

            const totalFormateado = `$ ${Math.round(contrato.total).toLocaleString('es-CO')} MCTE`;
            const fechaEventoLarga = formatearFechaLarga(contrato.fechaEvento);

            p(`Entre los suscritos a saber, **${contrato.clienteNombre}**, identificado(a) con cédula de ciudadanía No. **${contrato.clienteDocumento}**, quien para efectos del presente documento se denominará el **CONTRATANTE**, por una parte; y por la otra, **PLANETT PRODUCCIONES S.A.S**, sociedad identificada con Nit. **901.668.571-1**, representada legalmente por la señora **MARITZA GALEANO MUÑOZ**, identificada con cédula de ciudadanía No. **24.335.738** de Manizales, quien en adelante se denominará el **CONTRATISTA**, hemos acordado celebrar el presente **CONTRATO DE PRESTACIÓN DE SERVICIOS**, el cual se regirá por las siguientes cláusulas:`);

            tituloClausula('PRIMERA - DATOS PARA EJECUTAR EL SERVICIO');
            vinetas([
                `Tipo de evento: ${contrato.tipoEvento || 'Por definir'}.`,
                `Lugar de la Recepción: ${contrato.lugar || 'Por definir'}${contrato.ciudad ? ' (' + contrato.ciudad + ')' : ''}.`,
                `Fecha del evento: ${fechaEventoLarga}.`
            ]);

            tituloClausula('SEGUNDA - PRECIO');
            p(`El valor total del presente contrato será la suma de **${totalFormateado}**, valor que se establece antes del Impuesto al Valor Agregado (IVA), según la cotización oficial de referencia ${contrato.numeroReferencia}.`);

            tituloClausula('TERCERA - FORMA DE PAGO');
            p('El **CONTRATANTE** se obliga a pagar el 100% del valor total del contrato a más tardar un (1) día antes del evento. Queda expresamente pactado que el **CONTRATISTA** no dará inicio al montaje de los equipos si no se ha verificado el pago total del servicio.');

            tituloClausula('CUARTA - ENTREGA Y LOGÍSTICA');
            p('El **CONTRATISTA** se compromete a transportar, instalar, desinstalar y monitorear técnicamente de inicio a fin del evento los equipos que se describen a continuación:');
            vinetas(contrato.items.map((i) => (i.cantidad > 1 ? `${i.cantidad} x ${i.nombre}` : i.nombre)));
            p('**Parágrafo único:** Todos los equipos serán entregados debidamente instalados por el **CONTRATISTA**. Se garantiza la permanencia de mínimo un (1) técnico de sonido y un (1) técnico de iluminación durante todo el evento para asegurar su correcto funcionamiento. Los equipos se entregan en perfectas condiciones estéticas y operativas, por lo cual el **CONTRATANTE** (o el personal delegado por este) efectuará una inspección visual y solicitará las pruebas de sonido previas necesarias para dejar constancia de su óptimo estado.');

            tituloClausula('QUINTA - RESPONSABILIDAD POR DAÑOS');
            p('El **CONTRATANTE** se hará responsable por los daños estéticos o de funcionamiento que sufran los equipos arrendados durante el evento, siempre que estos sean ocasionados por negligencia o acción directa del contratante o de los asistentes al evento. En dicho caso, el **CONTRATANTE** asumirá los costos de reparación o la reposición del equipo afectado.');

            tituloClausula('SEXTA - SUSPENSIÓN DEL SERVICIO');
            p('El **CONTRATISTA** se compromete a cumplir estrictamente con el horario convenido, salvo que se presenten las siguientes situaciones ajenas a su control:');
            numerada([
                'Riñas o altercados graves entre los asistentes al evento.',
                'Agresiones físicas o verbales hacia el personal técnico del CONTRATISTA.',
                'Avería voluntaria o manipulación indebida de los equipos por parte de los asistentes.'
            ]);
            p('En cualquiera de estos casos, se suspenderá el servicio de manera inmediata sin derecho a reintegro económico para el **CONTRATANTE**, y se procederá al retiro técnico de los equipos.');

            tituloClausula('SÉPTIMA - EXCLUSIÓN DE REEMBOLSOS');
            p('No habrá lugar a devolución de tiempo ni de dinero en los siguientes escenarios:');
            numerada([
                'Alternación o interferencia con conjuntos musicales (mariachis, grupos de vallenato, bailarines u otras agrupaciones ajenas a la empresa contratada) que involucren el uso de sonido e iluminación sin haber sido notificados y coordinados previamente con el CONTRATISTA (salvo acuerdo previo entre las partes).',
                'Cortes, fallas o suspensiones del suministro eléctrico externo; o presencia de lluvia en caso de que el evento se realice en espacios abiertos que no cuenten con una infraestructura debidamente techada y protegida que resguarde los equipos de la humedad.',
                'Traslado o manipulación de los equipos hacia otra área del lugar sin la autorización expresa del CONTRATISTA.',
                'Suspensión del evento por parte de las autoridades competentes debido a la falta de licencias, permisos requeridos, o por quejas de orden público (vecinos o asociación) ajenas al CONTRATISTA.',
                'Cancelación unilateral del servicio por parte del CONTRATANTE con menos de ocho (8) días de anticipación a la fecha del evento.'
            ]);

            tituloClausula('OCTAVA - CAMBIOS DE HORARIO O UBICACIÓN');
            p('En caso de que el horario de inicio o la ubicación geográfica del evento cambien, el **CONTRATISTA** se reserva el derecho de evaluar la viabilidad técnica y renovar el contrato. De aceptarse el cambio, se liquidará un valor adicional por concepto de transportes y logística extra.');

            tituloClausula('NOVENA - UBICACIÓN DE EQUIPOS Y SEGURIDAD');
            p('Por motivos de seguridad técnica, bajo ninguna circunstancia se instalarán equipos ni instrumentos en la vía pública; el evento deberá desarrollarse en las instalaciones interiores o áreas comunes autorizadas de la sede pactada. Asimismo, el **CONTRATANTE** velará por la seguridad general de los equipos y del personal técnico del **CONTRATISTA** dentro del recinto del evento.');

            tituloClausula('DÉCIMA - INCUMPLIMIENTO DEL CONTRATISTA');
            p('Si por razones imputables al **CONTRATISTA**, este no se presentara a cubrir el evento, estará obligado a realizar la devolución total de los dineros recibidos más el 20% del total del servicio, o bien, a suplir el servicio con un proveedor colega de igual categoría, garantizando estrictamente la misma ficha técnica, calidad y cantidad de los equipos e iluminación aquí contratados, sin que esto genere ningún costo adicional para el **CONTRATANTE**.');

            tituloClausula('DÉCIMA PRIMERA - CANCELACIÓN DEL EVENTO');
            p('En caso de cancelación definitiva del servicio por parte del **CONTRATANTE** sin que medie una causa de fuerza mayor o caso fortuito legalmente demostrable, el **CONTRATISTA** no estará obligado a realizar la devolución de los anticipos recibidos. Si el anticipo aportado hubiese sido superior al porcentaje requerido como reserva, el **CONTRATISTA** devolverá el saldo a favor del **CONTRATANTE**.');
            p('Toda cancelación formal deberá notificarse por escrito con un mínimo de treinta (30) días de anticipación a la fecha pactada para el evento.');

            tituloClausula('DÉCIMA SEGUNDA - MODIFICACIÓN DE LA FECHA');
            p('Cualquier solicitud de cambio de fecha del evento por parte del **CONTRATANTE** estará sujeta estrictamente a la disponibilidad de agenda y nuevos costos del **CONTRATISTA**.');

            tituloClausula('DÉCIMA TERCERA - HORAS EXTRAS');
            p('El valor pactado en la cláusula segunda cubre la totalidad de las horas de servicio fijadas en la cláusula primera. Si durante el evento las partes acuerdan prolongar el servicio, se cobrará una tarifa adicional por hora extra, la cual deberá ser liquidada y pagada en ese mismo instante en efectivo o transferencia verificada; de lo contrario, el servicio finalizará puntualmente en el horario estipulado.');

            tituloClausula('DÉCIMA CUARTA - RESPONSABILIDAD LOGÍSTICA Y TÉCNICA ANTE PROVEEDORES EXTERNOS');
            p('**1. Rider Técnico y Conexiones:** El **CONTRATISTA** no asume ningún tipo de responsabilidad por el suministro, funcionamiento, deficiencias o requerimientos del rider técnico de la orquesta contratada directamente por el **CONTRATANTE**. En caso de que el proveedor externo se conecte o manipule la infraestructura técnica del **CONTRATISTA**, el **CONTRATANTE** asumirá la total responsabilidad económica y legal por cualquier daño o avería en los sistemas del **CONTRATISTA** ocasionada por dicha manipulación o por fallas eléctricas de los equipos externos.');
            p('**2. Pruebas de Sonido:** El **CONTRATISTA** queda completamente exonerado de cualquier responsabilidad si la orquesta contratada por el cliente no cumple con realizar sus pruebas de sonido en las horas previas al inicio del evento. Se recomienda expresamente en este documento que dichas pruebas se programen con suficiente antelación en el cronograma logístico para evitar ruidos innecesarios durante la llegada de los invitados y para no interrumpir el set del DJ.');
            p('**3. Desmontaje durante el evento:** El **CONTRATISTA** no se hará responsable bajo ninguna circunstancia del desmontaje, ruidos molestos o afectaciones estéticas causadas por el retiro del rider técnico o los instrumentos de la orquesta mientras los invitados se encuentren presentes en la fiesta presenciando dicho acto. Toda coordinación de desmontaje técnico externo será responsabilidad exclusiva del **CONTRATANTE** y su equipo de coordinación logística.');

            doc.moveDown(0.5);
            const fechaFirmaLarga = formatearFechaLarga(new Date().toISOString().slice(0, 10));
            p(`Para constancia de lo anterior y en señal de aceptación, las partes firman el presente documento el día ${fechaFirmaLarga}.`);

            // Bloque de firmas: se reserva espacio para que las dos no queden partidas entre
            // páginas, y la firma de Maritza se incrusta siempre (no depende de que ella la
            // suba — es la representante legal, su firma va de una vez en todo contrato).
            const ALTO_BLOQUE_FIRMAS = 90;
            if (doc.y + ALTO_BLOQUE_FIRMAS > doc.page.height - 70) {
                doc.addPage();
            }
            doc.moveDown(1.5);

            const yFirmas = doc.y;
            if (tieneFirma) {
                doc.image(firmaPath, MARGEN, yFirmas - 30, { width: 110 });
            }
            doc.moveTo(MARGEN, yFirmas + 16).lineTo(MARGEN + 180, yFirmas + 16).strokeColor('#94a3b8').lineWidth(0.8).stroke();
            doc.moveTo(ANCHO - MARGEN - 180, yFirmas + 16).lineTo(ANCHO - MARGEN, yFirmas + 16).strokeColor('#94a3b8').lineWidth(0.8).stroke();

            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text('MARITZA GALEANO MUÑOZ', MARGEN, yFirmas + 22, { width: 180 });
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text('CC. 24.335.738 — Contratista', MARGEN, yFirmas + 34, { width: 180 });

            doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#0f172a').text(contrato.clienteNombre, ANCHO - MARGEN - 180, yFirmas + 22, { width: 180 });
            doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(`CC. ${contrato.clienteDocumento} — Contratante`, ANCHO - MARGEN - 180, yFirmas + 34, { width: 180 });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}
