import type { ItemSeleccionado } from './catalogoCotizacion';

// Librería cargada vía CDN en cada página que exporta (sin tipos propios en este proyecto)
declare const XLSX: any;

/** Ítem listo para mostrarse en el PDF/Excel (precio ya multiplicado por la cantidad,
 *  nombre con el prefijo "N x" cuando aplica). */
export interface ItemParaMostrar {
    tag: string;
    nombre: string;
    descripcion: string;
    precio: number;
}

export interface DatosClienteExcel {
    nombre: string;
    correo: string;
    telefono: string;
    tipoEvento: string;
    lugar: string;
}

/** Solo lo que el PDF/Excel necesita de cada ítem: sirve igual para el cotizador y para el panel. */
export type ItemParaFormatear = Pick<ItemSeleccionado, 'tag' | 'nombre' | 'descripcion' | 'cantidad' | 'precioUnit'>;

export function formatearItemsParaMostrar(formatterCOP: Intl.NumberFormat, items: ItemParaFormatear[]): ItemParaMostrar[] {
    return items.map((item) => ({
        tag: item.tag,
        nombre: item.cantidad > 1 ? `${item.cantidad} x ${item.nombre} (${formatterCOP.format(item.precioUnit)} c/u)` : item.nombre,
        descripcion: item.descripcion,
        precio: item.precioUnit * item.cantidad
    }));
}

/** Filas de la hoja, sin depender de la librería de Excel. */
export function construirFilasExcel(
    datosCliente: DatosClienteExcel,
    itemsParaMostrar: ItemParaMostrar[],
    total: number,
    refNum: string,
    fechaHoy: string
): any[][] {
    const aoaData: any[][] = [
        ["PLANET PRODUCCIONES - PRODUCCIÓN TÉCNICA & EVENTOS VIP"],
        [`COTIZACIÓN OFICIAL: ${refNum}`, "", "", `FECHA: ${fechaHoy}`],
        [""],
        ["1. DATOS DEL CLIENTE"],
        ["Cliente:", datosCliente.nombre, "Tipo Evento:", datosCliente.tipoEvento || 'N/A'],
        ["Correo:", datosCliente.correo, "Sede:", datosCliente.lugar || 'Por definir'],
        ["WhatsApp:", datosCliente.telefono, "", ""],
        [""],
        ["2. DESGLOSE PREVENTIVO DE SERVICIOS"],
        ["Item", "Categoría", "Servicio / Descripción", "Valor COP"]
    ];

    itemsParaMostrar.forEach((item, index) => {
        aoaData.push([
            index + 1,
            item.tag,
            item.descripcion ? `${item.nombre} — Incluye: ${item.descripcion}` : item.nombre,
            item.precio
        ]);
    });

    aoaData.push([""]);
    aoaData.push(["", "", "TOTAL PRESUPUESTO ESTIMADO:", total]);

    return aoaData;
}

/** Indica si la página logró cargar la librería de Excel desde el CDN. */
export function excelDisponible(): boolean {
    return typeof XLSX !== 'undefined';
}

// Exportación a Excel Profesional Estructurado
export function generarExcelEjecutivo(
    datosCliente: DatosClienteExcel,
    itemsParaMostrar: ItemParaMostrar[],
    total: number,
    refNum: string,
    fechaHoy: string
): void {
    const aoaData = construirFilasExcel(datosCliente, itemsParaMostrar, total, refNum, fechaHoy);

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
