import './style.css';
import './shared/panelRail.css';
import './consulta.css';
import { apiFetch, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';
import { esc } from './shared/panelShell';
import {
    PESTANAS,
    pintarDetalle,
    type ContratoInfo,
    type DetalleCotizacion,
    type EntradaHistorial,
    type Pestana
} from './consultaDetalle';
import {
    ESTADO_LABEL,
    contarResultados,
    filtrarClientes,
    formatearCOP,
    formatearFechaCorta,
    formatearHora,
    hayFiltros,
    hayFiltrosDeRegistro,
    hoyEnColombia,
    iniciales,
    lugarTexto,
    nombreEvento,
    partesDeFecha,
    plural,
    proximoEvento,
    separarRegistros,
    type ClienteConsulta,
    type EstadoCotizacion,
    type FiltrosConsulta,
    type RegistroConsulta
} from './shared/consultaDatos';

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
const detalleEl = $('detalleConsulta');
const detalleContenido = $('detalleContenido');
const detalleEstado = $('detalleEstado');
const detalleTitulo = $('detalleTitulo');
const detalleSubtitulo = $('detalleSubtitulo');
const detalleTotal = $('detalleTotal');
const pestanas = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"][data-pestana]')];

let clientes: ClienteConsulta[] = [];
/** Cada cotización con su cliente, para abrir el detalle desde una fila. */
let registrosPorId = new Map<number, { cliente: ClienteConsulta; registro: RegistroConsulta }>();
/** Clientes que la persona desplegó a mano: se conservan al volver a filtrar. */
const desplegados = new Set<string>();
/** Si se abre otra fila antes de que llegue la anterior, la respuesta vieja se descarta. */
let cargaDetalle = 0;
let filaOrigen: HTMLElement | null = null;
/** Dónde estaba la lista al abrir un detalle, para volver al mismo punto. */
let scrollDeLista = 0;
let pestanaActual: Pestana = 'resumen';

const claveCliente = (c: ClienteConsulta): string => (c.id === null ? 'sin-cliente' : String(c.id));

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

// ---------- Pestañas del detalle ----------
/**
 * Muestra una pestaña (patrón ARIA de pestañas). Si el detalle estaba desplazado, vuelve a su
 * inicio para que el contenido nuevo empiece justo bajo el encabezado fijo.
 */
function activarPestana(pestana: Pestana, enfocar = false): void {
    pestanaActual = pestana;
    for (const boton of pestanas) {
        const activa = boton.dataset.pestana === pestana;
        boton.classList.toggle('active', activa);
        boton.setAttribute('aria-selected', String(activa));
        boton.tabIndex = activa ? 0 : -1;
        if (activa) {
            boton.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            if (enfocar) boton.focus({ preventScroll: true });
        }
    }
    detalleContenido.querySelectorAll<HTMLElement>('[role="tabpanel"]').forEach((panel) => {
        panel.hidden = panel.dataset.pestana !== pestana;
    });

    const inicioDetalle = detalleEl.getBoundingClientRect().top + window.scrollY;
    if (window.scrollY > inicioDetalle) window.scrollTo(0, inicioDetalle);
}

/** Flechas, Inicio y Fin recorren las pestañas, como en cualquier lista de pestañas. */
function moverEntrePestanas(evento: KeyboardEvent): void {
    const actual = PESTANAS.indexOf(pestanaActual);
    const destino: Record<string, number> = {
        ArrowRight: (actual + 1) % PESTANAS.length,
        ArrowLeft: (actual - 1 + PESTANAS.length) % PESTANAS.length,
        Home: 0,
        End: PESTANAS.length - 1
    };
    if (!(evento.key in destino)) return;
    evento.preventDefault();
    activarPestana(PESTANAS[destino[evento.key]!]!, true);
}

function ponerCuenta(pestana: Pestana, cantidad: number | null): void {
    const cuenta = document.querySelector<HTMLElement>(`[data-cuenta="${pestana}"]`);
    if (cuenta) cuenta.textContent = cantidad === null ? '' : String(cantidad);
}

async function leerJson<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`Respuesta ${res.status}`);
    return (await res.json()) as T;
}

/** Cambia la lista por el detalle en el mismo espacio, como en "Eventos en proceso". */
function mostrarDetalle(cliente: ClienteConsulta, registro: RegistroConsulta): void {
    if (detalleEl.hidden) scrollDeLista = window.scrollY;

    detalleEstado.textContent = ESTADO_LABEL[registro.estado] ?? registro.estado;
    detalleTitulo.textContent = nombreEvento(registro);
    detalleSubtitulo.textContent = `${cliente.nombre} · ${registro.numeroReferencia}`;
    detalleTotal.textContent = formatearCOP(registro.total);
    ponerCuenta('servicios', null);
    ponerCuenta('historial', null);

    filtrosEl.hidden = true;
    listaEl.hidden = true;
    detalleEl.hidden = false;
    window.scrollTo(0, 0);
    activarPestana('resumen');
    detalleTitulo.focus({ preventScroll: true });
}

/** Vuelve a la lista tal como estaba: mismos filtros, clientes desplegados y posición. */
function cerrarDetalle(): void {
    cargaDetalle++; // descarta una respuesta que todavía no llegó
    detalleEl.hidden = true;
    filtrosEl.hidden = false;
    listaEl.hidden = false;
    window.scrollTo(0, scrollDeLista);
    if (filaOrigen?.isConnected) filaOrigen.focus({ preventScroll: true });
}

/** Si el detalle se abrió con una entrada en el historial, "Volver" equivale al botón atrás. */
function volverALista(): void {
    if (typeof history.state?.cotizacion === 'number') history.back();
    else cerrarDetalle();
}

/** `apilar` crea una entrada en el historial para que el botón atrás del navegador vuelva a la lista. */
async function abrirDetalle(id: number, apilar = true): Promise<void> {
    const entrada = registrosPorId.get(id);
    if (!entrada) return;
    const { cliente, registro } = entrada;

    if (apilar) {
        // Una sola entrada por detalle: así "Volver" y el botón atrás llevan siempre a la lista.
        const yaEnDetalle = typeof history.state?.cotizacion === 'number';
        if (yaEnDetalle) history.replaceState({ cotizacion: id }, '');
        else history.pushState({ cotizacion: id }, '');
    }
    const carga = ++cargaDetalle;
    mostrarDetalle(cliente, registro);
    detalleContenido.innerHTML = '<div class="panel-estado"><i class="fa-solid fa-spinner fa-spin"></i> Cargando detalle...</div>';

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

        pintarDetalle(detalleContenido, { cliente, registro, detalle, historial, contrato }, (p) => activarPestana(p, true));
        ponerCuenta('servicios', detalle.items.length);
        ponerCuenta('historial', historial.length);
        activarPestana(pestanaActual);
    } catch (err) {
        console.error(err);
        if (carga !== cargaDetalle) return;
        detalleContenido.innerHTML = `
            <div class="panel-estado error">
                <p>No se pudo cargar el detalle de esta cotización. Verifica tu conexión e intenta de nuevo.</p>
                <button type="button" class="btn btn-secondary btn-sm consulta-reintentar" id="btnReintentarDetalle">
                    <i class="fa-solid fa-rotate-right"></i> Reintentar
                </button>
            </div>`;
        $('btnReintentarDetalle').addEventListener('click', () => void abrirDetalle(id, false));
    }
}

// ---------- Inicio ----------
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);

    $('btnVolverLista').addEventListener('click', volverALista);
    for (const boton of pestanas) {
        boton.addEventListener('click', () => activarPestana(boton.dataset.pestana as Pestana));
        boton.addEventListener('keydown', moverEntrePestanas);
    }
    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape' && !detalleEl.hidden) volverALista();
    });
    // Botón atrás/adelante del navegador: abre o cierra el detalle sin salir de la página.
    window.addEventListener('popstate', (evento) => {
        const id = (evento.state as { cotizacion?: unknown } | null)?.cotizacion;
        if (typeof id === 'number' && registrosPorId.has(id)) void abrirDetalle(id, false);
        else if (!detalleEl.hidden) cerrarDetalle();
    });

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

    // Al recargar estando en un detalle, el navegador conserva esa entrada del historial.
    const pendiente = (history.state as { cotizacion?: unknown } | null)?.cotizacion;
    if (typeof pendiente === 'number') {
        if (registrosPorId.has(pendiente)) void abrirDetalle(pendiente, false);
        else history.replaceState(null, '');
    }
});
