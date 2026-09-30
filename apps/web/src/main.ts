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

    // Lee el atributo data-incluye (lista separada por "|") y la devuelve como texto legible
    function obtenerIncluye(el: Element): string {
        const raw = el.getAttribute('data-incluye');
        if (!raw) return '';
        const partes = raw.split('|').map(p => p.trim()).filter(Boolean);
        return partes.join(' • ');
    }

    // Cálculo dinámico de cotización: lee genéricamente cualquier <select>, checkbox o
    // input de cantidad marcado con las clases .precio-select / .precio-check / .precio-qty
    // y sus atributos data-precio / data-tag / data-nombre / data-incluye. Esto permite
    // ampliar el catálogo de precios (apps/web/index.html) sin tocar esta lógica.
    function calcularCotizacion(): DatosCotizacion {
        let total = 0;
        const itemsSeleccionados: ItemSeleccionado[] = [];

        // 1. Selects de catálogo (una sola opción por categoría)
        const selects = form.querySelectorAll<HTMLSelectElement>('select.precio-select');
        selects.forEach(select => {
            const hint = document.getElementById(`${select.id}-hint`);
            const opt = select.options[select.selectedIndex];
            const incluye = opt ? obtenerIncluye(opt) : '';

            if (hint) {
                hint.innerHTML = (select.selectedIndex > 0 && incluye) ? `<strong>Incluye:</strong> ${incluye}` : '';
            }

            if (select.selectedIndex <= 0 || !opt) return;
            const precio = parseFloat(opt.getAttribute('data-precio') || '') || 0;
            if (precio <= 0) return;

            total += precio;
            itemsSeleccionados.push({
                tag: select.dataset.tag || 'SERVICIO',
                nombre: opt.value,
                descripcion: incluye,
                precio
            });
        });

        // 2. Checkboxes de efectos / add-ons
        const checks = form.querySelectorAll<HTMLInputElement>('input.precio-check');
        checks.forEach(chk => {
            if (!chk.checked) return;
            const precio = parseFloat(chk.getAttribute('data-precio') || '') || 0;
            if (precio <= 0) return;

            total += precio;
            itemsSeleccionados.push({
                tag: chk.dataset.tag || 'SERVICIO',
                nombre: chk.dataset.nombre || chk.id,
                descripcion: obtenerIncluye(chk),
                precio
            });
        });

        // 3. Ítems por cantidad (mobiliario y extras cobrados "c/u")
        const qtys = form.querySelectorAll<HTMLInputElement>('input.precio-qty');
        qtys.forEach(input => {
            const cantidad = parseInt(input.value, 10) || 0;
            if (cantidad <= 0) return;
            const precioUnit = parseFloat(input.getAttribute('data-precio-unit') || '') || 0;
            const precio = cantidad * precioUnit;
            if (precio <= 0) return;

            total += precio;
            itemsSeleccionados.push({
                tag: input.dataset.tag || 'SERVICIO',
                nombre: `${cantidad} x ${input.dataset.nombre || input.id} (${formatterCOP.format(precioUnit)} c/u)`,
                descripcion: obtenerIncluye(input),
                precio
            });
        });

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
    // Los ítems se agrupan por categoría (tag) para que el desglose quede organizado,
    // y cada fila muestra debajo del nombre lo que incluye el paquete (si aplica).
    function construirHTMLCotizacion(
        datosCliente: DatosCliente,
        datosCotizacion: DatosCotizacion,
        logoBase64: string,
        refNum: string,
        fechaHoy: string
    ): HTMLDivElement {
        const grupos = new Map<string, ItemSeleccionado[]>();
        datosCotizacion.itemsSeleccionados.forEach(item => {
            if (!grupos.has(item.tag)) grupos.set(item.tag, []);
            grupos.get(item.tag)!.push(item);
        });

        let filasTabla = '';
        let contador = 0;
        grupos.forEach((items, tag) => {
            filasTabla += `
                <tr style="page-break-inside: avoid;">
                    <td colspan="3" style="padding: 7px 10px; background-color: #ffedd5; color: #c2410c; font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px;">${tag}</td>
                </tr>
            `;
            items.forEach(item => {
                contador++;
                filasTabla += `
                    <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${contador % 2 === 0 ? 'rgba(255,255,255,0.92)' : 'rgba(248,250,252,0.92)'}; page-break-inside: avoid;">
                        <td style="padding: 8px 10px; text-align: center; font-weight: bold; color: #94a3b8; font-size: 10px; vertical-align: top;">${contador}</td>
                        <td style="padding: 8px 10px;">
                            <div style="font-weight: 700; color: #0f172a; font-size: 10.5px;">${item.nombre}</div>
                            ${item.descripcion ? `<div style="font-size: 8.5px; color: #64748b; margin-top: 2px; line-height: 1.35;">Incluye: ${item.descripcion}</div>` : ''}
                        </td>
                        <td style="padding: 8px 10px; text-align: right; font-weight: 800; color: #0f172a; font-size: 10.5px; white-space: nowrap; vertical-align: top;">$ ${item.precio.toLocaleString('es-CO')}</td>
                    </tr>
                `;
            });
        });

        const container = document.createElement('div');
        container.style.width = '790px';
        container.style.padding = '24px';
        container.style.backgroundColor = '#ffffff';
        container.style.fontFamily = "'Segoe UI', Arial, sans-serif";
        container.style.position = 'relative';

        container.innerHTML = `
            <!-- Marca de Agua con logo.png (Capa superpuesta z-index:10 con opacidad suave) -->
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
                <div style="margin-top: 15px; background-color: rgba(248, 250, 252, 0.88); border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; page-break-inside: avoid;">
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
                            <td style="padding: 2px 0;"><strong>Ubicación / Sede:</strong> ${datosCliente.ciudad || 'Por confirmar'} (${datosCliente.lugar || 'Sede a confirmar'})</td>
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
                            ${filasTabla || `
                                <tr>
                                    <td colspan="3" style="padding: 14px; text-align: center; color: #94a3b8; font-size: 10px;">No se seleccionaron servicios adicionales.</td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>

                <!-- Bloque Inferior: Garantía y Total Verde -->
                <div style="margin-top: 18px; display: flex; gap: 12px; align-items: center; page-break-inside: avoid;">
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
                <div style="margin-top: 15px; background-color: rgba(248, 250, 252, 0.9); border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 14px; page-break-inside: avoid;">
                    <div style="font-size: 9px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 4px;">TÉRMINOS Y CONDICIONES DE RESERVA</div>
                    <ol style="font-size: 8px; color: #64748b; margin: 0; padding-left: 12px; line-height: 1.35;">
                        <li>El tiempo máximo para reservar la fecha del evento será de 30 días a partir de la fecha de esta cotización.</li>
                        <li>La fecha se separa con el 30% del valor total del evento.</li>
                        <li>El evento debe estar cancelado en su totalidad máximo 8 días antes de su realización.</li>
                        <li>La planta eléctrica de backup, si se usa, tiene un costo adicional de $100.000 por hora después de agotarse el combustible inicial con el que viene la planta.</li>
                        <li>Precios sujetos a verificación en caso de modificaciones en el requerimiento técnico, Rider/Backline de artistas o cambio de locación.</li>
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
                item.descripcion ? `${item.nombre} — Incluye: ${item.descripcion}` : item.nombre,
                item.precio
            ]);
        });

        aoaData.push([""]);
        aoaData.push(["", "", "TOTAL PRESUPUESTO ESTIMADO:", datosCotizacion.total]);

        const worksheet = XLSX.utils.aoa_to_sheet(aoaData);

        worksheet['!cols'] = [
            { wch: 8 },  // Ítem
            { wch: 26 }, // Categoría
            { wch: 75 }, // Descripción
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
        const ciudad = (document.getElementById('transporte') as HTMLSelectElement).value;
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

        let elementoHTML: HTMLDivElement | null = null;

        try {
            const datosCliente: DatosCliente = { nombre, correo, telefono, tipoEvento, ciudad, lugar };
            const refNum = `PL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
            const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

            // Carga de Logo
            const logoBase64 = await obtenerLogoBase64();

            // Renderizado PDF HD
            elementoHTML = construirHTMLCotizacion(datosCliente, datosCotizacion, logoBase64, refNum, fechaHoy);
            document.body.appendChild(elementoHTML);

            // Vuelve el scroll al origen: si la página quedó desplazada (formulario largo)
            // html2canvas calcula mal el recorte del elemento y el PDF sale en blanco.
            window.scrollTo(0, 0);

            // Espera a que el navegador termine de pintar el layout completo (incluida
            // la imagen del logo) antes de capturarlo.
            await new Promise<void>(resolve => {
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });

            const opt = {
                margin:       [0.2, 0.2, 0.2, 0.2],
                filename:     `Cotizacion_Planet_${nombre.replace(/\s+/g, '_')}.pdf`,
                image:        { type: 'jpeg', quality: 1.0 },
                html2canvas:  {
                    scale: 2,
                    useCORS: true,
                    allowTaint: true,
                    logging: false
                },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
                // Evita que una fila de la tabla quede cortada entre dos páginas del PDF
                // (usa el "page-break-inside: avoid" de cada <tr>, ver construirHTMLCotizacion).
                pagebreak:    { mode: ['css', 'legacy'] }
            };

            await html2pdf().set(opt).from(elementoHTML).save();
            document.body.removeChild(elementoHTML);
            elementoHTML = null;

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
            if (elementoHTML && elementoHTML.parentNode) {
                document.body.removeChild(elementoHTML);
            }
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
