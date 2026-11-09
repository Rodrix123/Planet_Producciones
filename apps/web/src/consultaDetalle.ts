// Contenido del detalle de una cotización en el panel de consulta, repartido en pestañas.
// Solo pinta: la navegación (abrir, volver, cambiar de pestaña) vive en consulta.ts.

import { apiUrl } from './shared/api';
import { avisar, esc } from './shared/panelShell';
import { excelDisponible, formatearItemsParaMostrar, generarExcelEjecutivo } from './shared/cotizacionExcel';
import { montarTablaServicios } from './consultaServicios';
import {
    ESTADO_LABEL,
    categoriasDeServicios,
    formatearCOP,
    formatearFechaLarga,
    formatearHora,
    formatearMomento,
    historialReciente,
    lugarTexto,
    obtenerFormatterCOP,
    plural,
    revisarTotal,
    type ClienteConsulta,
    type EstadoCotizacion,
    type RegistroConsulta,
    type ServicioCotizado
} from './shared/consultaDatos';

export const PESTANAS = ['resumen', 'servicios', 'documentos', 'historial'] as const;
export type Pestana = (typeof PESTANAS)[number];

export interface DetalleCotizacion {
    items: ServicioCotizado[];
}

/** Una versión del historial: items_despues guarda lo que llegó al editar, sin garantía de forma. */
interface ItemVersion {
    variantId?: number;
    cantidad?: number;
    nombre?: string;
    precioUnit?: number;
}

export interface EntradaHistorial {
    id: string;
    tipo: 'comentario' | 'edicion' | 'cambio_estado';
    comentario: string | null;
    estadoAntes: string | null;
    estadoDespues: string | null;
    itemsAntes: ItemVersion[] | null;
    itemsDespues: ItemVersion[] | null;
    usuarioNombre: string | null;
    creadoEn: string;
}

export interface ContratoInfo {
    enviadoEn: string | null;
    firmadoSubidoEn: string | null;
    tieneFirmado: boolean;
    archivoFirmadoDisponible: boolean;
}

export interface DatosDetalle {
    cliente: ClienteConsulta;
    registro: RegistroConsulta;
    detalle: DetalleCotizacion;
    historial: EntradaHistorial[];
    contrato: ContratoInfo;
}

// ---------- Piezas comunes ----------
function dato(etiqueta: string, valor: string): string {
    return `<div class="dato-fila"><span>${esc(etiqueta)}</span><span>${esc(valor)}</span></div>`;
}

function filaTotal(total: number): string {
    return `
        <div class="consulta-total">
            <span>Total cotizado</span>
            <strong class="item-card-total">${esc(formatearCOP(total))}</strong>
        </div>`;
}

const sumaServicios = (items: ServicioCotizado[]): number => items.reduce((acc, i) => acc + i.precioUnit * i.cantidad, 0);

function avisoTotal(items: ServicioCotizado[], r: RegistroConsulta): string {
    const transporte = r.transporte?.precio ?? 0;
    const cuadre = revisarTotal(items, transporte, r.total);
    if (cuadre === 'cuadra') return '';

    if (cuadre === 'sin_servicios') {
        return `<p class="consulta-aviso"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <span>Esta cotización no tiene servicios guardados. Solo se conserva el total registrado.</span></p>`;
    }
    const suma = sumaServicios(items) + transporte;
    const quienes = r.transporte ? 'Los servicios y el transporte suman' : 'Los servicios suman';
    return `<p class="consulta-aviso"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span>${quienes} ${esc(formatearCOP(suma))}. El valor de cada servicio se lee del catálogo vigente; el total es el que quedó registrado en la cotización.</span></p>`;
}

// ---------- Resumen ----------
function textoContrato(r: RegistroConsulta): string {
    const e = r.evento!;
    if (e.tieneContratoFirmado) {
        return e.contratoFirmadoSubidoEn ? `Firmado, subido el ${formatearMomento(e.contratoFirmadoSubidoEn)}` : 'Firmado';
    }
    return e.contratoEnviadoEn ? `Enviado el ${formatearMomento(e.contratoEnviadoEn)}, sin firmar` : 'Sin enviar';
}

function seccionEvento(r: RegistroConsulta): string {
    const filas = [
        dato('Fecha', formatearFechaLarga(r.fecha)),
        dato('Hora', formatearHora(r.hora)),
        dato('Lugar', lugarTexto(r)),
        ...(r.direccion ? [dato('Dirección', r.direccion)] : [])
    ];

    if (r.evento) {
        const saldo = Math.max(r.total - r.evento.totalPagado, 0);
        filas.push(
            dato('Contrato', textoContrato(r)),
            dato('Pago inicial', r.evento.pagoInicial ? 'Hecho' : 'Pendiente'),
            dato('Pagado', formatearCOP(r.evento.totalPagado)),
            dato('Saldo', formatearCOP(saldo))
        );
    }

    return `
        <section class="detail-section">
            <h3>${r.evento ? 'Evento' : 'Datos para el evento (aún sin agendar)'}</h3>
            ${filas.join('')}
        </section>`;
}

function seccionCotizacion(items: ServicioCotizado[], r: RegistroConsulta): string {
    const categorias = categoriasDeServicios(items).length;
    const servicios = items.length === 0
        ? 'Sin servicios guardados'
        : `${plural(items.length, 'servicio', 'servicios')} en ${plural(categorias, 'categoría', 'categorías')}`;

    return `
        <section class="detail-section">
            <h3>Cotización</h3>
            ${avisoTotal(items, r)}
            ${dato('Referencia', r.numeroReferencia)}
            ${dato('Creada el', formatearMomento(r.creadaEn))}
            ${dato('Servicios', servicios)}
            ${r.transporte ? dato('Transporte', `${r.transporte.ciudad} · ${formatearCOP(r.transporte.precio)}`) : ''}
            ${filaTotal(r.total)}
            ${items.length > 0 ? `
                <button type="button" class="btn btn-secondary btn-sm consulta-ir" data-ir="servicios">
                    Ver los servicios <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </button>` : ''}
        </section>`;
}

function seccionCliente(c: ClienteConsulta): string {
    return `
        <section class="detail-section">
            <h3>Cliente</h3>
            ${dato('Nombre', c.nombre)}
            ${dato('Correo', c.correo || 'Sin registrar')}
            ${dato('Teléfono', c.telefono || 'Sin registrar')}
            ${dato('Documento', c.documento || 'Sin registrar')}
        </section>`;
}

// ---------- Servicios ----------
function seccionServicios(items: ServicioCotizado[], r: RegistroConsulta): string {
    const aviso = avisoTotal(items, r);
    const tabla = items.length > 0
        ? '<div data-rol="tablaServicios"></div>'
        : aviso ? '' : '<p class="consulta-vacio">Esta cotización no tiene servicios.</p>';

    return `
        <section class="detail-section">
            <h3>Servicios cotizados</h3>
            ${aviso}
            ${tabla}
            <div class="servicios-totales">
                ${items.length > 0 ? dato('Suma de los servicios (precio vigente)', formatearCOP(sumaServicios(items))) : ''}
                ${r.transporte ? dato(`Transporte (${r.transporte.ciudad})`, formatearCOP(r.transporte.precio)) : ''}
                ${filaTotal(r.total)}
            </div>
            <p class="consulta-pie">Cotización creada el ${esc(formatearMomento(r.creadaEn))}.</p>
        </section>`;
}

// ---------- Documentos ----------
function filaDocumento(icono: string, titulo: string, nota: string, accion: string): string {
    return `
        <div class="consulta-documento">
            <i class="${icono}" aria-hidden="true"></i>
            <div class="consulta-documento-info">
                <strong>${esc(titulo)}</strong>
                <span>${esc(nota)}</span>
            </div>
            ${accion}
        </div>`;
}

const enlaceDocumento = (ruta: string, texto: string): string =>
    `<a class="btn btn-secondary btn-sm" href="${apiUrl(ruta)}" target="_blank" rel="noopener">${esc(texto)}</a>`;

function documentosDeContrato(c: ClienteConsulta, r: RegistroConsulta, contrato: ContratoInfo): string {
    const faltan = [!c.documento && 'el documento del cliente', !r.fecha && 'la fecha del evento'].filter(Boolean);
    const generado = faltan.length > 0
        ? filaDocumento('fa-solid fa-file-contract', 'Contrato', `No se puede generar: falta ${faltan.join(' y ')}.`, '')
        : filaDocumento('fa-solid fa-file-contract', 'Contrato', 'Se genera de nuevo con los datos actuales.',
            enlaceDocumento(`/api/contratos/${r.cotizacionId}/pdf`, 'Ver PDF'));

    let firmado: string;
    if (contrato.archivoFirmadoDisponible) {
        const nota = contrato.firmadoSubidoEn ? `Archivo original, subido el ${formatearMomento(contrato.firmadoSubidoEn)}.` : 'Archivo original.';
        firmado = filaDocumento('fa-solid fa-file-signature', 'Contrato firmado', nota,
            enlaceDocumento(`/api/contratos/${r.cotizacionId}/firmado`, 'Ver original'));
    } else if (contrato.tieneFirmado) {
        firmado = filaDocumento('fa-solid fa-file-circle-exclamation', 'Contrato firmado',
            'Consta como firmado, pero el archivo no está en este servidor.', '');
    } else {
        firmado = filaDocumento('fa-solid fa-file-signature', 'Contrato firmado', 'Todavía no se ha subido.', '');
    }
    return generado + firmado;
}

function seccionDocumentos(c: ClienteConsulta, r: RegistroConsulta, contrato: ContratoInfo): string {
    return `
        <section class="detail-section">
            <h3>Documentos</h3>
            ${filaDocumento('fa-solid fa-file-pdf', 'Cotización en PDF', 'Se genera de nuevo con los datos actuales.',
                enlaceDocumento(`/api/cotizaciones/${r.cotizacionId}/pdf`, 'Ver PDF'))}
            ${filaDocumento('fa-solid fa-file-excel', 'Cotización en Excel', 'Se genera de nuevo con los datos actuales.',
                '<button type="button" class="btn btn-secondary btn-sm" id="btnExcel">Descargar Excel</button>')}
            ${r.evento ? documentosDeContrato(c, r, contrato) : ''}
            <p class="consulta-pie">El PDF y el Excel que se descargaron al cotizar no se guardan en el sistema. Generarlos otra vez no cambia ningún dato ni archivo.</p>
        </section>`;
}

function descargarExcel(c: ClienteConsulta, r: RegistroConsulta, items: ServicioCotizado[]): void {
    if (!excelDisponible()) {
        avisar('No se pudo cargar el generador de Excel. Revisa tu conexión y recarga la página.', true);
        return;
    }

    const itemsParaMostrar = formatearItemsParaMostrar(obtenerFormatterCOP(), items);
    if (r.transporte && r.transporte.precio > 0) {
        itemsParaMostrar.unshift({ tag: 'TRANSPORTE Y LOGÍSTICA', nombre: r.transporte.ciudad, descripcion: '', precio: r.transporte.precio });
    }

    const fecha = new Date(r.creadaEn).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    generarExcelEjecutivo(
        { nombre: c.nombre, correo: c.correo || '', telefono: c.telefono || '', tipoEvento: r.tipoEvento || '', lugar: r.lugar || '' },
        itemsParaMostrar,
        r.total,
        r.numeroReferencia,
        fecha
    );
    avisar('Excel generado con los datos actuales.');
}

// ---------- Historial ----------
const TIPOS_HISTORIAL: Record<EntradaHistorial['tipo'], { icono: string; nombre: string }> = {
    comentario: { icono: 'fa-comment', nombre: 'Comentario' },
    edicion: { icono: 'fa-pen-to-square', nombre: 'Edición de servicios' },
    cambio_estado: { icono: 'fa-arrow-right-arrow-left', nombre: 'Cambio de estado' }
};

function listaVersion(titulo: string, items: ItemVersion[] | null): string {
    if (!items || items.length === 0) return '';
    const filas = items.map((i) => {
        const cantidad = i.cantidad ?? 1;
        const nombre = i.nombre || `Servicio #${i.variantId ?? '?'}`;
        const valor = typeof i.precioUnit === 'number' ? formatearCOP(i.precioUnit * cantidad) : '—';
        return `<li><span>${esc(cantidad > 1 ? `${cantidad} x ${nombre}` : nombre)}</span><span>${esc(valor)}</span></li>`;
    }).join('');
    // El total de la versión solo se muestra si todos sus servicios guardaron su precio de entonces.
    const conPrecio = items.every((i) => typeof i.precioUnit === 'number');
    const total = conPrecio
        ? `<li class="consulta-version-total"><span>Total</span><span>${esc(formatearCOP(items.reduce((acc, i) => acc + i.precioUnit! * (i.cantidad ?? 1), 0)))}</span></li>`
        : '';
    return `<div><p class="consulta-version-titulo">${esc(titulo)}</p><ul>${filas}${total}</ul></div>`;
}

function entradaHistorial(h: EntradaHistorial): string {
    const etiqueta = (estado: string | null) => (estado && ESTADO_LABEL[estado as EstadoCotizacion]) || estado || '—';
    let texto = h.comentario || '';
    if (h.tipo === 'edicion') texto = 'Se editaron los servicios de la cotización.';
    if (h.tipo === 'cambio_estado') texto = `Cambio de estado: ${etiqueta(h.estadoAntes)} → ${etiqueta(h.estadoDespues)}`;

    const tipo = TIPOS_HISTORIAL[h.tipo] ?? { icono: 'fa-circle-info', nombre: 'Movimiento' };
    const autor = h.usuarioNombre || 'Sistema';
    const versiones = h.tipo === 'edicion'
        ? listaVersion('Antes de este cambio', h.itemsAntes) + listaVersion('Después de este cambio', h.itemsDespues)
        : '';

    return `
        <details class="consulta-hist">
            <summary>
                <span class="consulta-hist-icono" aria-hidden="true"><i class="fa-solid ${tipo.icono}"></i></span>
                <span class="consulta-hist-resumen">
                    <span class="consulta-hist-tipo">${esc(tipo.nombre)}</span>
                    <span class="consulta-hist-texto">${esc(texto)}</span>
                </span>
                <span class="consulta-hist-meta">${esc(autor)} · ${esc(formatearMomento(h.creadoEn))}</span>
                <i class="fa-solid fa-chevron-down consulta-hist-flecha" aria-hidden="true"></i>
            </summary>
            <div class="consulta-hist-cuerpo">
                ${versiones ? `<div class="consulta-versiones">${versiones}</div>` : ''}
                <p class="consulta-pie">Registrado por ${esc(autor)} el ${esc(new Date(h.creadoEn).toLocaleString('es-CO'))}</p>
            </div>
        </details>`;
}

function seccionHistorial(historial: EntradaHistorial[]): string {
    if (historial.length === 0) {
        return `<section class="detail-section"><h3>Historial y versiones</h3>
            <p class="consulta-vacio">Todavía no hay comentarios ni cambios registrados.</p></section>`;
    }
    return `
        <section class="detail-section">
            <div class="consulta-hist-cabecera">
                <h3>Historial y versiones</h3>
                <button type="button" class="btn btn-secondary btn-sm" data-rol="desplegarTodo" aria-expanded="false">
                    <i class="fa-solid fa-angles-down" aria-hidden="true"></i> <span>Desplegar todo</span>
                </button>
            </div>
            <p class="consulta-pie consulta-hist-orden">${plural(historial.length, 'movimiento', 'movimientos')} · los más recientes primero</p>
            ${historialReciente(historial).map(entradaHistorial).join('')}
        </section>`;
}

/** El botón dice lo que hará: desplegar si queda alguno cerrado, contraer si están todos abiertos. */
function conectarDesplegarTodo(panel: HTMLElement): void {
    const boton = panel.querySelector<HTMLButtonElement>('[data-rol="desplegarTodo"]');
    if (!boton) return;
    const entradas = () => [...panel.querySelectorAll<HTMLDetailsElement>('details.consulta-hist')];
    const actualizar = () => {
        const todos = entradas().every((d) => d.open);
        boton.setAttribute('aria-expanded', String(todos));
        boton.querySelector('span')!.textContent = todos ? 'Contraer todo' : 'Desplegar todo';
        boton.querySelector('i')!.className = `fa-solid ${todos ? 'fa-angles-up' : 'fa-angles-down'}`;
    };
    boton.addEventListener('click', () => {
        const abrir = !entradas().every((d) => d.open);
        entradas().forEach((d) => { d.open = abrir; });
        actualizar();
    });
    // `toggle` no burbujea: se escucha en captura para enterarse de cada entrada abierta a mano.
    panel.addEventListener('toggle', actualizar, true);
}

// ---------- Panel completo ----------
function panel(pestana: Pestana, contenido: string, angosto = false): string {
    return `
        <div class="consulta-panel${angosto ? ' consulta-panel-angosto' : ''}" role="tabpanel" id="panel-${pestana}"
             aria-labelledby="tab-${pestana}" data-pestana="${pestana}" tabindex="0" hidden>${contenido}</div>`;
}

/**
 * Pinta las cuatro pestañas de una vez (cambiar de pestaña solo muestra u oculta) y conecta sus
 * acciones. `irA` cambia de pestaña desde dentro del contenido (p. ej. "Ver los servicios").
 */
export function pintarDetalle(contenedor: HTMLElement, datos: DatosDetalle, irA: (pestana: Pestana) => void): void {
    const { cliente, registro, detalle, historial, contrato } = datos;
    const items = detalle.items;

    contenedor.innerHTML =
        panel('resumen', `
            <div class="consulta-resumen-grid">
                <div>${seccionEvento(registro)}</div>
                <div>${seccionCotizacion(items, registro)}${seccionCliente(cliente)}</div>
            </div>`) +
        panel('servicios', seccionServicios(items, registro)) +
        panel('documentos', seccionDocumentos(cliente, registro, contrato), true) +
        panel('historial', seccionHistorial(historial), true);

    const tabla = contenedor.querySelector<HTMLElement>('[data-rol="tablaServicios"]');
    if (tabla) montarTablaServicios(tabla, items);

    contenedor.querySelector('#btnExcel')?.addEventListener('click', () => descargarExcel(cliente, registro, items));
    contenedor.querySelectorAll<HTMLElement>('[data-ir]').forEach((boton) => {
        boton.addEventListener('click', () => irA(boton.dataset.ir as Pestana));
    });
    conectarDesplegarTodo(contenedor.querySelector<HTMLElement>('#panel-historial')!);
}
