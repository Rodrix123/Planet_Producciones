import './style.css';

// Librerías cargadas vía CDN en index.html (sin tipos propios en este proyecto)
declare const Swal: any;
declare const html2pdf: any;
declare const XLSX: any;

interface ItemSeleccionado {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
}

interface DatosCotizacion {
    total: number;
    itemsSeleccionados: ItemSeleccionado[];
}

interface DatosCliente {
    nombre: string;
    correo: string;
    telefono: string;
    tipoEvento: string;
    ciudad: string;
    lugar: string;
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('quoteForm') as HTMLFormElement;
    const precioTotalEl = document.getElementById('precioTotal') as HTMLElement;
    const listaResumenEl = document.getElementById('listaResumen') as HTMLElement;
    const btnSubmit = document.getElementById('btnSubmit') as HTMLButtonElement;

    const formatterCOP = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    });

    // Convierte logo.png local a Base64 para garantizar que html2canvas lo dibuje sin errores
    function obtenerLogoBase64(): Promise<string> {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                } catch (e) {
                    resolve('logo.png');
                }
            };
            img.onerror = () => {
                resolve('logo.png');
            };
            img.src = 'logo.png';
        });
    }

    // Cálculo dinámico de cotización
    function calcularCotizacion(): DatosCotizacion {
        let total = 0;
        const itemsSeleccionados: ItemSeleccionado[] = [];

        // 1. Ubicación
        const ciudadSelect = document.getElementById('ciudad') as HTMLSelectElement | null;
        if (ciudadSelect && ciudadSelect.selectedIndex > 0) {
            const opt = ciudadSelect.options[ciudadSelect.selectedIndex];
            const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
            if (precio > 0) {
                total += precio;
                itemsSeleccionados.push({
                    tag: 'UBICACIÓN & LOGÍSTICA',
                    nombre: opt.value.split('(')[0].trim(),
                    descripcion: 'Cobertura técnica y traslado de personal especializado.',
                    precio: precio
                });
            }
        }

        // 2. Montaje
        const espacioSelect = document.getElementById('tipoEspacio') as HTMLSelectElement | null;
        if (espacioSelect && espacioSelect.selectedIndex > 0) {
            const opt = espacioSelect.options[espacioSelect.selectedIndex];
            const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
            if (precio > 0) {
                total += precio;
                itemsSeleccionados.push({
                    tag: 'MONTAJE & ESTRUCTURA',
                    nombre: opt.value.split('(')[0].trim(),
                    descripcion: 'Estructura modular de alta resistencia con acabados de lujo.',
                    precio: precio
                });
            }
        }

        // 3. Audio
        const sonidoSelect = document.getElementById('tipoSonido') as HTMLSelectElement | null;
        if (sonidoSelect && sonidoSelect.selectedIndex > 0) {
            const opt = sonidoSelect.options[sonidoSelect.selectedIndex];
            const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
            if (precio > 0) {
                total += precio;
                itemsSeleccionados.push({
                    tag: 'SISTEMA DE AUDIO',
                    nombre: opt.value.split('-')[0].trim(),
                    descripcion: 'Sistema de sonido profesional de alta fidelidad para gran cobertura.',
                    precio: precio
                });
            }
        }

        // 4. Iluminación
        const ilumSelect = document.getElementById('iluminacion') as HTMLSelectElement | null;
        if (ilumSelect && ilumSelect.selectedIndex > 0) {
            const opt = ilumSelect.options[ilumSelect.selectedIndex];
            const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
            if (precio > 0) {
                total += precio;
                itemsSeleccionados.push({
                    tag: 'ILUMINACIÓN',
                    nombre: opt.value.split('-')[0].trim(),
                    descripcion: 'Luces móviles DMX, cabezas robóticas y diseño atmosférico.',
                    precio: precio
                });
            }
        }

        // 5. Efectos Especiales FX
        const chkSparkulas = document.getElementById('chkSparkulas') as HTMLInputElement | null;
        if (chkSparkulas && chkSparkulas.checked) {
            const precio = parseFloat(chkSparkulas.getAttribute('data-precio') || '') || 0;
            total += precio;
            itemsSeleccionados.push({
                tag: 'EFECTO ESPECIAL FX',
                nombre: '2 Sparkulas (Chispas Frías)',
                descripcion: 'Chispas para entrada triunfal y momentos cumbre del evento.',
                precio: precio
            });
        }

        const chkNiebla = document.getElementById('chkNiebla') as HTMLInputElement | null;
        if (chkNiebla && chkNiebla.checked) {
            const precio = parseFloat(chkNiebla.getAttribute('data-precio') || '') || 0;
            total += precio;
            itemsSeleccionados.push({
                tag: 'EFECTO ESPECIAL FX',
                nombre: 'Niebla Baja (Efecto Nube)',
                descripcion: 'Nube densa a ras de piso ideal para baile principal.',
                precio: precio
            });
        }

        // Actualizar UI en vivo
        precioTotalEl.textContent = formatterCOP.format(total);
        listaResumenEl.innerHTML = '';

        if (itemsSeleccionados.length === 0) {
            listaResumenEl.innerHTML = '<li><em>Selecciona tus opciones en el formulario para calcular el costo.</em></li>';
        } else {
            itemsSeleccionados.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `<strong>${item.nombre}</strong>: ${formatterCOP.format(item.precio)}`;
                listaResumenEl.appendChild(li);
            });
        }

        return { total, itemsSeleccionados };
    }

    form.addEventListener('input', calcularCotizacion);
    form.addEventListener('change', calcularCotizacion);

    // Plantilla HTML de Alta Resolución para PDF con Marca de Agua
    function construirHTMLCotizacion(
        datosCliente: DatosCliente,
        datosCotizacion: DatosCotizacion,
        logoBase64: string,
        refNum: string,
        fechaHoy: string
    ): HTMLDivElement {
        let filasTabla = '';
        datosCotizacion.itemsSeleccionados.forEach((item, index) => {
            filasTabla += `
                <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${index % 2 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(248,250,252,0.85)'};">
                    <td style="padding: 10px; text-align: center; font-weight: bold; color: #64748b; font-size: 11px;">${index + 1}</td>
                    <td style="padding: 10px;">
                        <span style="background-color: #ffedd5; color: #c2410c; font-size: 8px; font-weight: 800; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-bottom: 4px; text-transform: uppercase;">${item.tag}</span>
                        <div style="font-weight: 700; color: #0f172a; font-size: 11px;">
                            ${item.nombre} <span style="font-weight: 400; color: #64748b;">— ${item.descripcion}</span>
                        </div>
                    </td>
                    <td style="padding: 10px; text-align: right; font-weight: 800; color: #0f172a; font-size: 11px;">$ ${item.precio.toLocaleString('es-CO')}</td>
                </tr>
            `;
        });

        const container = document.createElement('div');
        container.style.width = '790px';
        container.style.padding = '24px';
        container.style.backgroundColor = '#ffffff';
        container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
        container.style.position = 'relative';
        container.style.overflow = 'hidden';

        container.innerHTML = `
            <!-- Marca de Agua con logo.png (Capasuperpuesta z-index:10 con opacidad suave) -->
            <div style="position: absolute; top: 52%; left: 50%; transform: translate(-50%, -50%); opacity: 0.12; pointer-events: none; z-index: 10; text-align: center; width: 100%;">
                <img src="${logoBase64}" style="width: 380px; max-width: 80%; height: auto; display: block; margin: 0 auto;">
            </div>

            <!-- Contenido principal -->
            <div style="position: relative; z-index: 1;">

                <!-- Header VIP con Logo Real -->
                <div style="background-color: #0a0a0c; border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #f97316;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <img src="${logoBase64}" style="height: 50px; width: auto; max-width: 70px; object-fit: contain;">
                        <div>
                            <div style="font-size: 20px; font-weight: 900; color: #ffffff; letter-spacing: 1px;">PLANET PRODUCCIONES</div>
                            <div style="font-size: 9.5px; font-weight: 700; color: #f97316; letter-spacing: 0.5px; margin-top: 2px;">PRODUCCIÓN TÉCNICA & EVENTOS VIP 2026</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="background: linear-gradient(135deg, #f97316, #ea580c); color: #ffffff; font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 12px; display: inline-block; margin-bottom: 4px;">COTIZACIÓN VIP</div>
                        <div style="font-size: 9px; color: #9ca3af;">Ref: ${refNum}</div>
                        <div style="font-size: 9px; color: #9ca3af;">Emisión: ${fechaHoy}</div>
                    </div>
                </div>

                <!-- Datos del Cliente -->
                <div style="margin-top: 15px; background-color: rgba(248, 250, 252, 0.88); border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px;">
                    <div style="font-size: 10px; font-weight: 800; color: #ea580c; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">1. INFORMACIÓN DEL CLIENTE Y DETALLES DEL EVENTO</div>
                    <table style="width: 100%; font-size: 10.5px; border-collapse: collapse; color: #334155;">
                        <tr>
                            <td style="padding: 2px 0;"><strong>Cliente:</strong> ${datosCliente.nombre}</td>
                            <td style="padding: 2px 0;"><strong>Fecha del Evento:</strong> <span style="color: #ea580c; font-weight: 700;">A convenir 2026</span></td>
                        </tr>
                        <tr>
                            <td style="padding: 2px 0;"><strong>Email:</strong> ${datosCliente.correo}</td>
                            <td style="padding: 2px 0;"><strong>Tipo de Evento:</strong> ${datosCliente.tipoEvento || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 2px 0;"><strong>WhatsApp:</strong> ${datosCliente.telefono}</td>
                            <td style="padding: 2px 0;"><strong>Ubicación / Sede:</strong> ${datosCliente.ciudad} (${datosCliente.lugar || 'Sede a confirmar'})</td>
                        </tr>
                    </table>
                </div>

                <!-- Tabla de Servicios -->
                <div style="margin-top: 15px;">
                    <div style="font-size: 10px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">2. DESGLOSE DE EQUIPAMIENTO Y SERVICIOS</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #1e293b; color: #ffffff; text-align: left; font-size: 10px;">
                                <th style="padding: 8px; width: 25px; text-align: center;">#</th>
                                <th style="padding: 8px;">DESCRIPCIÓN DEL SERVICIO</th>
                                <th style="padding: 8px; text-align: right; width: 120px;">VALOR COP</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasTabla}
                        </tbody>
                    </table>
                </div>

                <!-- Bloque Inferior: Garantía y Total Verde -->
                <div style="margin-top: 18px; display: flex; gap: 12px; align-items: center;">
                    <div style="flex: 1.2; border: 1px dashed #cbd5e1; border-radius: 10px; padding: 10px; background-color: rgba(255,255,255,0.9);">
                        <div style="font-size: 9px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 3px;">GARANTÍA & COMPROMISO PLANET PRODUCCIONES</div>
                        <div style="font-size: 8.5px; color: #64748b; line-height: 1.3;">
                            Incluye montaje previo, pruebas de sonido, técnico DMX dedicado durante todo el evento y desmonte. Todos los equipos cuentan con respaldo técnico inmediato.
                        </div>
                    </div>
                    <div style="flex: 0.8; background-color: rgba(236, 253, 245, 0.95); border: 1.5px solid #6ee7b7; border-radius: 10px; padding: 10px; text-align: center;">
                        <div style="font-size: 9px; font-weight: 800; color: #047857; text-transform: uppercase; letter-spacing: 0.5px;">PRESUPUESTO TOTAL ESTIMADO</div>
                        <div style="font-size: 20px; font-weight: 900; color: #059669; margin-top: 2px;">$ ${datosCotizacion.total.toLocaleString('es-CO')} COP</div>
                    </div>
                </div>

                <!-- Términos y Condiciones -->
                <div style="margin-top: 15px; background-color: rgba(248, 250, 252, 0.9); border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px;">
                    <div style="font-size: 9px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 4px;">TÉRMINOS Y CONDICIONES DE RESERVA</div>
                    <ol style="font-size: 8px; color: #64748b; margin: 0; padding-left: 12px; line-height: 1.35;">
                        <li>Esta cotización tiene una validez de 15 días calendario a partir de la fecha de emisión.</li>
                        <li>Para congelar la fecha se requiere un anticipo del 50% y firma del contrato de servicio.</li>
                        <li>El saldo restante (50%) debe cancelarse máximo 3 días antes de la realización del evento.</li>
                        <li>Precios sujetos a verificación en caso de modificaciones en el requerimiento técnico o cambio de locación.</li>
                    </ol>
                </div>
            </div>
        `;

        return container;
    }

    // Exportación a Excel Profesional Estructurado
    function generarExcelEjecutivo(
        datosCliente: DatosCliente,
        datosCotizacion: DatosCotizacion,
        refNum: string,
        fechaHoy: string
    ): void {
        const aoaData: any[][] = [
            ["PLANET PRODUCCIONES - PRODUCCIÓN TÉCNICA & EVENTOS VIP"],
            [`COTIZACIÓN OFICIAL: ${refNum}`, "", "", `FECHA: ${fechaHoy}`],
            [""],
            ["1. DATOS DEL CLIENTE"],
            ["Cliente:", datosCliente.nombre, "Tipo Evento:", datosCliente.tipoEvento || 'N/A'],
            ["Correo:", datosCliente.correo, "Ubicación:", datosCliente.ciudad],
            ["WhatsApp:", datosCliente.telefono, "Sede:", datosCliente.lugar || 'Por definir'],
            [""],
            ["2. DESGLOSE PREVENTIVO DE SERVICIOS"],
            ["Item", "Categoría", "Servicio / Descripción", "Valor COP"]
        ];

        datosCotizacion.itemsSeleccionados.forEach((item, index) => {
            aoaData.push([
                index + 1,
                item.tag,
                `${item.nombre} - ${item.descripcion}`,
                item.precio
            ]);
        });

        aoaData.push([""]);
        aoaData.push(["", "", "TOTAL PRESUPUESTO ESTIMADO:", datosCotizacion.total]);

        const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

        worksheet['!cols'] = [
            { wch: 8 },  // Ítem
            { wch: 26 }, // Categoría
            { wch: 65 }, // Descripción
            { wch: 18 }  // Precio COP
        ];

        const numRows = aoaData.length;
        for (let i = 11; i < numRows; i++) {
            const cellAddress = `D${i}`;
            if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === 'number') {
                worksheet[cellAddress].z = '"$"#,##0';
            }
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cotización VIP');
        XLSX.writeFile(workbook, `Cotizacion_Planet_${datosCliente.nombre.replace(/\s+/g, '_')}.xlsx`);
    }

    // Evento Principal al Clic
    btnSubmit.addEventListener('click', async () => {
        const nombre = (document.getElementById('nombre') as HTMLInputElement).value.trim();
        const correo = (document.getElementById('correo') as HTMLInputElement).value.trim();
        const telefono = (document.getElementById('telefono') as HTMLInputElement).value.trim();
        const tipoEvento = (document.getElementById('tipoEvento') as HTMLSelectElement).value;
        const ciudad = (document.getElementById('ciudad') as HTMLSelectElement).value.split('(')[0].trim();
        const lugar = (document.getElementById('lugar') as HTMLSelectElement).value;

        if (!nombre || !correo || !telefono) {
            Swal.fire({
                icon: 'warning',
                title: 'Campos Incompletos',
                text: 'Por favor ingresa Nombre, Correo y WhatsApp del cliente.',
                confirmButtonColor: '#f97316'
            });
            return;
        }

        const datosCotizacion = calcularCotizacion();

        if (datosCotizacion.itemsSeleccionados.length === 0) {
            Swal.fire({
                icon: 'info',
                title: 'Selección Vacía',
                text: 'Selecciona al menos un servicio o montaje para cotizar.',
                confirmButtonColor: '#f97316'
            });
            return;
        }

        Swal.fire({
            title: 'Procesando Cotización...',
            text: 'Generando PDF HD con marca de agua y Excel',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const datosCliente: DatosCliente = { nombre, correo, telefono, tipoEvento, ciudad, lugar };
            const refNum = `PL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
            const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

            // Carga de Logo
            const logoBase64 = await obtenerLogoBase64();

            // Renderizado PDF HD
            const elementoHTML = construirHTMLCotizacion(datosCliente, datosCotizacion, logoBase64, refNum, fechaHoy);
            document.body.appendChild(elementoHTML);

            const opt = {
                margin:       [0.2, 0.2, 0.2, 0.2],
                filename:     `Cotizacion_Planet_${nombre.replace(/\s+/g, '_')}.pdf`,
                image:        { type: 'jpeg', quality: 1.0 },
                html2canvas:  { scale: 3, useCORS: true, allowTaint: true, logging: false },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };

            await html2pdf().set(opt).from(elementoHTML).save();
            document.body.removeChild(elementoHTML);

            // Exportación Excel Profesional
            generarExcelEjecutivo(datosCliente, datosCotizacion, refNum, fechaHoy);

            Swal.fire({
                icon: 'success',
                title: '¡Cotización Generada!',
                text: 'PDF HD con Marca de Agua y Reporte de Excel descargados exitosamente.',
                confirmButtonColor: '#f97316'
            });

        } catch (error) {
            console.error(error);
            Swal.fire({
                icon: 'error',
                title: 'Error de Procesamiento',
                text: 'Ocurrió un error generando los archivos. Revisa la consola.',
                confirmButtonColor: '#f97316'
            });
        }
    });

    calcularCotizacion();
});
