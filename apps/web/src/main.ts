import './style.css';
import {
    calcularCotizacion,
    HTML_CATALOGO,
    renderResumen,
    type DatosCotizacion,
    type ItemSeleccionado
} from './catalogo';
import { api } from './api';
import { borrarBorrador, leerBorrador } from './borrador-evento';

// Librerías cargadas vía CDN en index.html (sin tipos propios en este proyecto)
declare const Swal: any;
declare const html2pdf: any;
declare const XLSX: any;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('quoteForm') as HTMLFormElement;
    const precioTotalEl = document.getElementById('precioTotal') as HTMLElement;
    const listaResumenEl = document.getElementById('listaResumen') as HTMLElement;
    const btnSubmit = document.getElementById('btnSubmit') as HTMLButtonElement;

    // El catálogo (selects, checkboxes y cantidades) vive en src/catalogo.html.
    (document.getElementById('catalogo') as HTMLElement).innerHTML = HTML_CATALOGO;

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

    // Recalcula el total y actualiza el resumen lateral en vivo.
    function actualizarCotizacion(): DatosCotizacion {
        const datos = calcularCotizacion(form);
        renderResumen(precioTotalEl, listaResumenEl, datos);
        return datos;
    }

    form.addEventListener('input', actualizarCotizacion);
    form.addEventListener('change', actualizarCotizacion);

    function avisarSeleccionVacia(): void {
        Swal.fire({
            icon: 'info',
            title: 'Selección Vacía',
            text: 'Selecciona al menos un servicio o montaje para cotizar.',
            confirmButtonColor: '#f97316'
        });
    }

    // Evento en creación (viene de eventos.html): esta cotización se guarda junto con el
    // evento, que se crea al guardarla. Si se entra al cotizador directamente, no hay borrador
    // y la página solo genera el PDF y el Excel.
    const borrador = leerBorrador();
    const btnCrearEvento = document.getElementById('btnCrearEvento') as HTMLButtonElement;
    if (borrador) {
        (document.getElementById('avisoEvento') as HTMLElement).hidden = false;
        btnCrearEvento.hidden = false;
        btnSubmit.classList.add('submit-btn-secundario');
    }

    btnCrearEvento.addEventListener('click', async () => {
        if (!borrador) return;
        const datosCotizacion = actualizarCotizacion();
        if (datosCotizacion.itemsSeleccionados.length === 0) {
            avisarSeleccionVacia();
            return;
        }

        Swal.fire({
            title: 'Creando evento...',
            text: 'Guardando el evento y su cotización',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        try {
            const { evento } = await api<{ evento: { id: number } }>('POST', '/api/eventos', {
                ...borrador,
                items: datosCotizacion.itemsSeleccionados.map(i => ({
                    tag: i.tag,
                    nombre: i.catalogoNombre,
                    cantidad: i.cantidad
                }))
            });
            borrarBorrador();
            window.location.href = `eventos.html?creado=${evento.id}`;
        } catch (error) {
            // Los datos del evento siguen en el borrador: se pueden corregir y volver a intentar.
            const respuesta = await Swal.fire({
                icon: 'error',
                title: 'No se pudo crear el evento',
                text: (error as Error).message,
                showCancelButton: true,
                confirmButtonText: 'Volver al evento',
                cancelButtonText: 'Cerrar',
                confirmButtonColor: '#f97316'
            });
            if (respuesta.isConfirmed) window.location.href = 'eventos.html?nuevo=1';
        }
    });

    // Plantilla HTML de Alta Resolución para PDF con Marca de Agua
    // Los ítems se agrupan por categoría (tag) para que el desglose quede organizado,
    // y cada fila muestra debajo del nombre lo que incluye el paquete (si aplica).
    function construirHTMLCotizacion(
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

                <!-- Tabla de Servicios -->
                <div style="margin-top: 15px;">
                    <div style="font-size: 10px; font-weight: 800; color: #1e293b; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">1. DESGLOSE DE EQUIPAMIENTO Y SERVICIOS</div>
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
        datosCotizacion: DatosCotizacion,
        refNum: string,
        fechaHoy: string
    ): void {
        const aoaData: any[][] = [
            ["PLANET PRODUCCIONES - PRODUCCIÓN TÉCNICA & EVENTOS VIP"],
            [`COTIZACIÓN OFICIAL: ${refNum}`, "", "", `FECHA: ${fechaHoy}`],
            [""],
            ["1. DESGLOSE PREVENTIVO DE SERVICIOS"],
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

        // Los ítems empiezan en la fila 6 (tras el encabezado y la cabecera de la tabla).
        const numRows = aoaData.length;
        for (let i = 6; i < numRows; i++) {
            const cellAddress = `D${i}`;
            if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === 'number') {
                worksheet[cellAddress].z = '"$"#,##0';
            }
        }

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cotización VIP');
        XLSX.writeFile(workbook, `Cotizacion_Planet_${refNum}.xlsx`);
    }

    // Evento Principal al Clic
    btnSubmit.addEventListener('click', async () => {
        const datosCotizacion = actualizarCotizacion();

        if (datosCotizacion.itemsSeleccionados.length === 0) {
            avisarSeleccionVacia();
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
            const refNum = `PL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
            const fechaHoy = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });

            // Carga de Logo
            const logoBase64 = await obtenerLogoBase64();

            // Renderizado PDF HD
            elementoHTML = construirHTMLCotizacion(datosCotizacion, logoBase64, refNum, fechaHoy);
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
                filename:     `Cotizacion_Planet_${refNum}.pdf`,
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
            generarExcelEjecutivo(datosCotizacion, refNum, fechaHoy);

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

    actualizarCotizacion();
});
