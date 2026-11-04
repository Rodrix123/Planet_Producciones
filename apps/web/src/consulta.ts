import './style.css';
import './shared/panelRail.css';
import './consulta.css';
import { apiFetch, apiUrl, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';
import { abrirDrawer, avisar, esc, initPanelShellGlobal } from './shared/panelShell';
import {
    excelDisponible,
    formatearItemsParaMostrar,
    generarExcelEjecutivo,
    type ItemParaMostrar
} from './shared/cotizacionExcel';
import type { ItemSeleccionado } from './shared/catalogoCotizacion';
import {
    ESTADO_LABEL,
    contarResultados,
    filtrarClientes,
    formatearCOP,
    formatearFechaCorta,
    formatearFechaLarga,
    formatearHora,
    formatearMomento,
    hayFiltros,
    hayFiltrosDeRegistro,
    hoyEnColombia,
    iniciales,
    lugarTexto,
    nombreEvento,
    obtenerFormatterCOP,
    partesDeFecha,
    proximoEvento,
    revisarTotal,
    separarRegistros,
    type ClienteConsulta,
    type EstadoCotizacion,
    type FiltrosConsulta,
    type RegistroConsulta
} from './shared/consultaDatos';

interface DetalleCotizacion {
    items: (ItemSeleccionado & { nota?: string | null })[];
}

/** Una versión del historial: items_despues guarda lo que llegó al editar, sin garantía de forma. */
interface ItemVersion {
    variantId?: number;
    cantidad?: number;
    nombre?: string;
    precioUnit?: number;
}

interface EntradaHistorial {
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

interface ContratoInfo {
    enviadoEn: string | null;
    firmadoSubidoEn: string | null;
    tieneFirmado: boolean;
    archivoFirmadoDisponible: boolean;
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const estadoEl = $('estado');
const listaEl = $('listaClientes');
const filtrosEl = $('filtros');
const conteoEl = $('conteo');
const fNombre = $<HTMLInputElement>('fNombre');
const fEstado = $<HTMLSelectElement>('fEstado');
const fDesde = $<HTMLInputElement>('fDesde');
const fHasta = $<HTMLInputElement>('fHasta');
const fLimpiar = $('fLimpiar');
const drawerEl = $('drawer');
const drawerContenido = $('drawerContenido');

let clientes: ClienteConsulta[] = [];
/** Cada cotización con su cliente, para abrir el detalle desde una fila. */
let registrosPorId = new Map<number, { cliente: ClienteConsulta; registro: RegistroConsulta }>();
/** Clientes que la persona desplegó a mano: se conservan al volver a filtrar. */
const desplegados = new Set<string>();
/** Si se abre otra fila antes de que llegue la anterior, la respuesta vieja se descarta. */
let cargaDetalle = 0;
let filaOrigen: HTMLElement | null = null;

const claveCliente = (c: ClienteConsulta): string => (c.id === null ? 'sin-cliente' : String(c.id));
const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

// ---------- Filtros ----------
function leerFiltros(): FiltrosConsulta {
    return { nombre: fNombre.value, estado: fEstado.value, desde: fDesde.value, hasta: fHasta.value };
}

function limpiarFiltros(): void {
    fNombre.value = '';
    fEstado.value = '';
    fDesde.value = '';
    fHasta.value = '';
    fHasta.min = '';
    renderLista();
    fNombre.focus();
}

function textoConteo(visibles: ClienteConsulta[], filtros: FiltrosConsulta): string {
    const { clientes: nClientes, eventos, cotizaciones } = contarResultados(visibles);
    const quienes = hayFiltros(filtros)
        ? `${nClientes} de ${plural(clientes.length, 'cliente', 'clientes')}`
        : plural(nClientes, 'cliente', 'clientes');
    return `${quienes} · ${plural(eventos, 'evento', 'eventos')} · ${plural(cotizaciones, 'cotización', 'cotizaciones')} sin evento`;
}

// ---------- Lista de clientes ----------
function filaRegistro(r: RegistroConsulta, hoy: string): string {
    const { dia, resto } = partesDeFecha(r.fecha);
    const pasado = r.fecha !== null && r.fecha < hoy;
    const detalle = r.evento
        ? [formatearHora(r.hora), lugarTexto(r), r.numeroReferencia]
        : [r.fecha ? formatearHora(r.hora) : null, lugarTexto(r), r.numeroReferencia];

    return `
        <button type="button" class="consulta-fila${pasado ? ' consulta-fila-pasada' : ''}" data-cotizacion="${r.cotizacionId}">
            <span class="consulta-fecha"><strong>${esc(dia)}</strong><span>${esc(resto)}</span></span>
            <span class="consulta-fila-info">
                <span class="consulta-fila-titulo">${esc(nombreEvento(r))}</span>
                <span class="consulta-fila-sub">${detalle.filter(Boolean).map((t) => esc(t as string)).join(' · ')}</span>
            </span>
            <span class="badge">${esc(ESTADO_LABEL[r.estado] ?? r.estado)}</span>
            <span class="consulta-fila-total">${esc(formatearCOP(r.total))}</span>
            <i class="fa-solid fa-chevron-right consulta-fila-flecha" aria-hidden="true"></i>
        </button>`;
}

function grupoRegistros(titulo: string, registros: RegistroConsulta[], hoy: string): string {
    if (registros.length === 0) return '';
    return `<h3 class="consulta-grupo">${esc(titulo)}</h3>${registros.map((r) => filaRegistro(r, hoy)).join('')}`;
}

function tarjetaCliente(c: ClienteConsulta, desplegado: boolean, hoy: string): string {
    const { eventos, cotizaciones } = separarRegistros(c);
    const contacto = [c.correo, c.telefono].filter(Boolean).map((t) => esc(t as string)).join(' · ');
    const proximo = proximoEvento(c, hoy);
    const cifras = c.registros.length === 0 ? 'Sin cotizaciones' : [
        plural(eventos.length, 'evento', 'eventos'),
        cotizaciones.length > 0 ? `${plural(cotizaciones.length, 'cotización', 'cotizaciones')} sin evento` : null
    ].filter(Boolean).join(' · ');

    const cuerpo = c.registros.length === 0
        ? '<p class="consulta-vacio">Este cliente todavía no tiene cotizaciones ni eventos.</p>'
        : grupoRegistros('Eventos agendados', eventos, hoy) + grupoRegistros('Cotizaciones sin evento', cotizaciones, hoy);

    return `
        <details class="consulta-cliente" data-cliente="${claveCliente(c)}"${desplegado ? ' open' : ''}>
            <summary>
                <span class="avatar consulta-avatar" aria-hidden="true">${esc(iniciales(c.nombre))}</span>
                <span class="consulta-cliente-info">
                    <span class="empleado-nombre">${esc(c.nombre)}</span>
                    ${contacto ? `<span class="empleado-sub">${contacto}</span>` : ''}
                </span>
                <span class="consulta-cliente-cifras">
                    <span>${esc(cifras)}</span>
                    ${proximo?.fecha ? `<span class="consulta-proximo">Próximo: ${esc(formatearFechaCorta(proximo.fecha))}</span>` : ''}
                </span>
                <i class="fa-solid fa-chevron-down consulta-cliente-flecha" aria-hidden="true"></i>
            </summary>
            <div class="consulta-cliente-cuerpo">${cuerpo}</div>
        </details>`;
}

function renderLista(): void {
    const filtros = leerFiltros();
    const visibles = filtrarClientes(clientes, filtros);
    fLimpiar.hidden = !hayFiltros(filtros);
    conteoEl.textContent = textoConteo(visibles, filtros);

    if (visibles.length === 0) {
        listaEl.innerHTML = clientes.length === 0
            ? `<div class="empty-state"><i class="fa-solid fa-address-book" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>Todavía no hay clientes registrados. Aparecerán aquí cuando llegue la primera cotización.</div>`
            : `<div class="empty-state"><i class="fa-solid fa-filter-circle-xmark" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>Ningún cliente coincide con los filtros. Prueba con otra fecha u otro estado, o limpia la búsqueda.</div>`;
        return;
    }

    // Filtrar por estado o fecha busca eventos, no clientes: se muestran desplegados.
    const desplegarTodos = hayFiltrosDeRegistro(filtros) || visibles.length === 1;
    const hoy = hoyEnColombia();
    listaEl.innerHTML = visibles
        .map((c) => tarjetaCliente(c, desplegarTodos || desplegados.has(claveCliente(c)), hoy))
        .join('');
}

async function cargarClientes(): Promise<void> {
    estadoEl.hidden = false;
    estadoEl.classList.remove('error');
    estadoEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando clientes...';
    listaEl.hidden = true;
    filtrosEl.hidden = true;

    try {
        const res = await apiFetch('/api/consulta/clientes');
        if (!res.ok) throw new Error(`Respuesta ${res.status}`);
        const datos = (await res.json()) as { clientes: ClienteConsulta[] };
        clientes = datos.clientes;
    } catch (err) {
        console.error(err);
        estadoEl.classList.add('error');
        estadoEl.innerHTML = `
            <p>No se pudieron cargar los clientes. Verifica tu conexión e intenta de nuevo.</p>
            <button type="button" class="btn btn-secondary btn-sm consulta-reintentar" id="btnReintentar">
                <i class="fa-solid fa-rotate-right"></i> Reintentar
            </button>`;
        $('btnReintentar').addEventListener('click', () => void cargarClientes());
        return;
    }

    registrosPorId = new Map(clientes.flatMap((cliente) =>
        cliente.registros.map((registro) => [registro.cotizacionId, { cliente, registro }] as const)));

    estadoEl.hidden = true;
    filtrosEl.hidden = false;
    listaEl.hidden = false;
    renderLista();
}

// ---------- Detalle de una cotización ----------
function dato(etiqueta: string, valor: string): string {
    return `<div class="dato-fila"><span>${esc(etiqueta)}</span><span>${esc(valor)}</span></div>`;
}

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
        <section class="drawer-seccion">
            <h3>${r.evento ? 'Evento' : 'Datos para el evento (aún sin agendar)'}</h3>
            ${filas.join('')}
        </section>`;
}

function seccionCliente(c: ClienteConsulta): string {
    return `
        <section class="drawer-seccion">
            <h3>Cliente</h3>
            ${dato('Nombre', c.nombre)}
            ${dato('Correo', c.correo || 'Sin registrar')}
            ${dato('Teléfono', c.telefono || 'Sin registrar')}
            ${dato('Documento', c.documento || 'Sin registrar')}
        </section>`;
}

function avisoTotal(items: DetalleCotizacion['items'], r: RegistroConsulta): string {
    const transporte = r.transporte?.precio ?? 0;
    const cuadre = revisarTotal(items, transporte, r.total);
    if (cuadre === 'cuadra') return '';

    if (cuadre === 'sin_servicios') {
        return `<p class="consulta-aviso"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <span>Esta cotización no tiene servicios guardados. Solo se conserva el total registrado.</span></p>`;
    }
    const suma = items.reduce((acc, i) => acc + i.precioUnit * i.cantidad, 0) + transporte;
    const quienes = r.transporte ? 'Los servicios y el transporte suman' : 'Los servicios suman';
    return `<p class="consulta-aviso"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span>${quienes} ${esc(formatearCOP(suma))}. El valor de cada servicio se lee del catálogo vigente; el total es el que quedó registrado en la cotización.</span></p>`;
}

function seccionServicios(items: DetalleCotizacion['items'], r: RegistroConsulta): string {
    const filas = items.map((item) => `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>${esc(item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre)}</strong></div>
                <div class="detail-row-sub">${esc(item.tag)}${item.descripcion ? ` · Incluye: ${esc(item.descripcion)}` : ''}</div>
                ${item.nota ? `<div class="detail-row-sub consulta-nota"><i class="fa-solid fa-note-sticky" aria-hidden="true"></i> ${esc(item.nota)}</div>` : ''}
            </div>
            <div class="detail-row-price">${esc(formatearCOP(item.precioUnit * item.cantidad))}</div>
        </div>`).join('');

    const transporte = r.transporte ? `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>Transporte (${esc(r.transporte.ciudad)})</strong></div>
                <div class="detail-row-sub">TRANSPORTE Y LOGÍSTICA</div>
            </div>
            <div class="detail-row-price">${esc(formatearCOP(r.transporte.precio))}</div>
        </div>` : '';

    return `
        <section class="drawer-seccion">
            <h3>Servicios cotizados</h3>
            ${avisoTotal(items, r)}
            ${filas}${transporte}
            <div class="consulta-total">
                <span>Total registrado</span>
                <strong class="item-card-total">${esc(formatearCOP(r.total))}</strong>
            </div>
            <p class="consulta-pie">Cotización creada el ${esc(formatearMomento(r.creadaEn))}.</p>
        </section>`;
}

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
        <section class="drawer-seccion">
            <h3>Documentos</h3>
            ${filaDocumento('fa-solid fa-file-pdf', 'Cotización en PDF', 'Se genera de nuevo con los datos actuales.',
                enlaceDocumento(`/api/cotizaciones/${r.cotizacionId}/pdf`, 'Ver PDF'))}
            ${filaDocumento('fa-solid fa-file-excel', 'Cotización en Excel', 'Se genera de nuevo con los datos actuales.',
                '<button type="button" class="btn btn-secondary btn-sm" id="btnExcel">Descargar Excel</button>')}
            ${r.evento ? documentosDeContrato(c, r, contrato) : ''}
            <p class="consulta-pie">El PDF y el Excel que se descargaron al cotizar no se guardan en el sistema. Generarlos otra vez no cambia ningún dato ni archivo.</p>
        </section>`;
}

function listaVersion(titulo: string, items: ItemVersion[] | null): string {
    if (!items || items.length === 0) return '';
    const filas = items.map((i) => {
        const cantidad = i.cantidad ?? 1;
        const nombre = i.nombre || `Servicio #${i.variantId ?? '?'}`;
        const valor = typeof i.precioUnit === 'number' ? formatearCOP(i.precioUnit * cantidad) : '—';
        return `<li><span>${esc(cantidad > 1 ? `${cantidad} x ${nombre}` : nombre)}</span><span>${esc(valor)}</span></li>`;
    }).join('');
    return `<h4>${esc(titulo)}</h4><ul>${filas}</ul>`;
}

function entradaHistorial(h: EntradaHistorial): string {
    const etiqueta = (estado: string | null) => (estado && ESTADO_LABEL[estado as EstadoCotizacion]) || estado || '—';
    let texto = h.comentario || '';
    if (h.tipo === 'edicion') texto = 'Se editaron los servicios de la cotización.';
    if (h.tipo === 'cambio_estado') texto = `Cambio de estado: ${etiqueta(h.estadoAntes)} → ${etiqueta(h.estadoDespues)}`;

    const version = h.tipo === 'edicion'
        ? listaVersion('Antes de este cambio', h.itemsAntes) + listaVersion('Después de este cambio', h.itemsDespues)
        : '';

    return `
        <div class="comment-item">
            <div class="comment-meta">${esc(h.usuarioNombre || 'Sistema')} · ${esc(new Date(h.creadoEn).toLocaleString('es-CO'))}</div>
            <div>${esc(texto)}</div>
            ${version ? `<details class="consulta-version"><summary>Ver esta versión de los servicios</summary>${version}</details>` : ''}
        </div>`;
}

function seccionHistorial(historial: EntradaHistorial[]): string {
    const cuerpo = historial.length === 0
        ? '<p class="consulta-vacio">Todavía no hay comentarios ni cambios registrados.</p>'
        : historial.map(entradaHistorial).join('');
    return `<section class="drawer-seccion"><h3>Historial y versiones</h3>${cuerpo}</section>`;
}

function descargarExcel(c: ClienteConsulta, r: RegistroConsulta, items: DetalleCotizacion['items']): void {
    if (!excelDisponible()) {
        avisar('No se pudo cargar el generador de Excel. Revisa tu conexión y recarga la página.', true);
        return;
    }

    const itemsParaMostrar: ItemParaMostrar[] = formatearItemsParaMostrar(obtenerFormatterCOP(), items);
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

async function leerJson<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`Respuesta ${res.status}`);
    return (await res.json()) as T;
}

async function abrirDetalle(id: number): Promise<void> {
    const entrada = registrosPorId.get(id);
    if (!entrada) return;
    const { cliente, registro } = entrada;

    const carga = ++cargaDetalle;
    abrirDrawer('<div class="panel-estado"><i class="fa-solid fa-spinner fa-spin"></i> Cargando detalle...</div>');

    try {
        const [resDetalle, resHistorial, resContrato] = await Promise.all([
            apiFetch(`/api/cotizaciones/${id}`),
            apiFetch(`/api/cotizaciones/${id}/historial`),
            apiFetch(`/api/contratos/${id}`)
        ]);
        const [detalle, historial, contrato] = await Promise.all([
            leerJson<DetalleCotizacion>(resDetalle),
            leerJson<EntradaHistorial[]>(resHistorial),
            leerJson<ContratoInfo>(resContrato)
        ]);
        if (carga !== cargaDetalle) return;

        drawerContenido.innerHTML = `
            <div class="consulta-detalle-cabecera">
                <span class="badge">${esc(ESTADO_LABEL[registro.estado] ?? registro.estado)}</span>
                <h2>${esc(nombreEvento(registro))}</h2>
                <p>${esc(cliente.nombre)} · ${esc(registro.numeroReferencia)}</p>
            </div>
            ${seccionEvento(registro)}
            ${seccionServicios(detalle.items, registro)}
            ${seccionDocumentos(cliente, registro, contrato)}
            ${seccionCliente(cliente)}
            ${seccionHistorial(historial)}`;
        drawerEl.scrollTop = 0;
        $('btnExcel').addEventListener('click', () => descargarExcel(cliente, registro, detalle.items));
    } catch (err) {
        console.error(err);
        if (carga !== cargaDetalle) return;
        drawerContenido.innerHTML = `
            <div class="panel-estado error">
                <p>No se pudo cargar el detalle de esta cotización. Verifica tu conexión e intenta de nuevo.</p>
                <button type="button" class="btn btn-secondary btn-sm consulta-reintentar" id="btnReintentarDetalle">
                    <i class="fa-solid fa-rotate-right"></i> Reintentar
                </button>
            </div>`;
        $('btnReintentarDetalle').addEventListener('click', () => void abrirDetalle(id));
    }
}

// ---------- Inicio ----------
/** Al abrir el drawer, el foco entra en él; al cerrarlo, vuelve a la fila desde la que se abrió. */
function conectarFocoDelDrawer(): void {
    const cerrar = drawerEl.querySelector<HTMLElement>('.drawer-close');
    new MutationObserver(() => {
        const abierto = drawerEl.classList.contains('open');
        if (abierto === !drawerEl.inert) return;
        drawerEl.inert = !abierto;
        if (abierto) cerrar?.focus();
        else if (filaOrigen?.isConnected) filaOrigen.focus();
    }).observe(drawerEl, { attributes: true, attributeFilter: ['class'] });
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);
    initPanelShellGlobal();
    conectarFocoDelDrawer();

    (Object.keys(ESTADO_LABEL) as EstadoCotizacion[]).forEach((estado) => {
        fEstado.add(new Option(ESTADO_LABEL[estado], estado));
    });

    fNombre.addEventListener('input', renderLista);
    fEstado.addEventListener('change', renderLista);
    fDesde.addEventListener('change', () => {
        fHasta.min = fDesde.value;
        renderLista();
    });
    fHasta.addEventListener('change', renderLista);
    fLimpiar.addEventListener('click', limpiarFiltros);

    listaEl.addEventListener('click', (evento) => {
        const objetivo = evento.target as HTMLElement;

        const fila = objetivo.closest<HTMLElement>('[data-cotizacion]');
        if (fila) {
            filaOrigen = fila;
            void abrirDetalle(Number(fila.dataset.cotizacion));
            return;
        }

        // Al pulsar el resumen, <details> todavía no cambió: `open` es el estado anterior.
        const tarjeta = objetivo.closest('summary')?.parentElement as HTMLDetailsElement | undefined;
        const clave = tarjeta?.dataset.cliente;
        if (!tarjeta || !clave) return;
        if (tarjeta.open) desplegados.delete(clave);
        else desplegados.add(clave);
    });

    await cargarClientes();
});
