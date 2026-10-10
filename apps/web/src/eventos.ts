import './style.css';
import './panel.css';
import './eventos.css';
import { api } from './api';
import { borrarBorrador, guardarBorrador, leerBorrador, type BorradorEvento } from './borrador-evento';

interface Evento {
    id: number;
    fecha: string; // YYYY-MM-DD
    hora: string; // HH:MM:SS
    tipo: string | null;
    lugar: string | null;
    ciudad: string | null;
    direccion: string | null;
    cliente: { nombre: string; email: string | null; telefono: string | null } | null;
    total: number | null;
    totalPagado: number;
    confirmado: boolean;
    pagoInicial: boolean;
    firmado: boolean;
    contratoEnviadoEn: string | null;
    personal: string[];
    transporte: string | null;
}

interface Sede {
    id: number;
    nombre: string;
    ciudad: string | null;
}

interface Transporte {
    id: number;
    ciudad: string;
    precio: number;
}

interface OpcionesEvento {
    sedes: Sede[];
    transportes: Transporte[];
}

type ClaveToggle = 'confirmado' | 'pagoInicial' | 'firmado';

const MAX_VISIBLES = 4;
const FADE_MS = 180;
const SEDE_OTRA = 'otro';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Parámetros que deja la página de cotizaciones al volver: ?nuevo reabre el
// formulario del evento en creación y ?creado=<id> marca el evento recién creado.
const parametros = new URLSearchParams(window.location.search);
if (window.location.search) window.history.replaceState(null, '', window.location.pathname);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const modal = $('modal');
const modalContenido = $('modalContenido');
const toast = $('toast');
const estadoCarga = $('estado');
const deck = $('deck');
const detalle = $('detalle');
const detalleContenido = $('detalleContenido');
const listaEventos = $('listaEventos');
const listaConteo = $('listaConteo');
const calTitulo = $('calTitulo');
const calGrid = $('calGrid');
const fDesde = $<HTMLInputElement>('fDesde');
const fHasta = $<HTMLInputElement>('fHasta');
const fLimpiar = $('fLimpiar');
const fConteo = $('fConteo');
const toggles = document.querySelectorAll<HTMLButtonElement>('.toggle-chip');

let eventos: Evento[] = [];
let opciones: OpcionesEvento | null = null;
let seleccionadoId: number | null = null;
let popoverFecha: string | null = null;
let fadeTimer: number | undefined;
let toastTimer: number | undefined;
const filtrosActivos = new Set<ClaveToggle>();

// Mes que muestra el calendario (siempre día 1).
const hoy = new Date();
let mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

// ---------- Utilidades ----------
function avisar(mensaje: string): void {
    toast.textContent = mensaje;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3500);
}

function esc(texto: string): string {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML;
}

function aISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function deISO(iso: string): Date {
    return new Date(`${iso}T00:00:00`);
}

const HOY_ISO = aISO(hoy);

function capitalizar(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatearHora(hora: string): string {
    const [h = '0', m = '0'] = hora.split(':');
    const d = new Date(2000, 0, 1, Number(h), Number(m));
    return d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
}

function formatearFechaLarga(iso: string): string {
    return capitalizar(deISO(iso).toLocaleDateString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }));
}

function formatearMoneda(valor: number | null): string {
    if (valor === null) return '—';
    return valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function formatearFechaHora(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nombreTipo(e: Evento): string {
    return e.tipo?.trim() || 'Evento';
}

function lugarTexto(e: Evento): string {
    return [e.lugar, e.ciudad].filter(Boolean).join(' · ') || 'Lugar por definir';
}

// ---------- Filtros ----------
function hayFiltros(): boolean {
    return filtrosActivos.size > 0 || fDesde.value !== '' || fHasta.value !== '';
}

function filtrar(): Evento[] {
    const desde = fDesde.value;
    const hasta = fHasta.value;
    return eventos.filter(e => {
        for (const clave of filtrosActivos) if (!e[clave]) return false;
        if (desde && e.fecha < desde) return false;
        if (hasta && e.fecha > hasta) return false;
        return true;
    });
}

// ---------- Lista de eventos vigentes ----------
function iconosEstado(e: Evento): string {
    return `<span class="estados">
        <i class="fa-solid fa-circle-check ${e.confirmado ? 'on' : ''}" title="Confirmado"></i>
        <i class="fa-solid fa-money-bill-wave ${e.pagoInicial ? 'on' : ''}" title="Pago inicial"></i>
        <i class="fa-solid fa-file-signature ${e.firmado ? 'on' : ''}" title="Firmado"></i>
    </span>`;
}

function renderLista(visibles: Evento[]): void {
    // Todos los eventos que pasan los filtros, del más antiguo al más reciente.
    const items = [...visibles].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    listaConteo.textContent = String(items.length);

    if (items.length === 0) {
        listaEventos.innerHTML = `<p class="lista-vacia">${hayFiltros()
            ? 'Ningún evento coincide con los filtros.'
            : 'No hay eventos registrados.'}</p>`;
        return;
    }

    let proximoMarcado = false;
    listaEventos.innerHTML = items.map(e => {
        const d = deISO(e.fecha);
        const mesCorto = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
        const pasado = e.fecha < HOY_ISO;
        // El primer evento de hoy en adelante es el punto de partida del deslizador.
        const esProximo = !pasado && !proximoMarcado;
        if (esProximo) proximoMarcado = true;
        return `
        <button type="button" class="lista-item${pasado ? ' pasado' : ''}"${esProximo ? ' data-proximo' : ''} data-evento="${e.id}">
            <div class="lista-fecha"><strong>${d.getDate()}</strong><span>${esc(mesCorto)}</span></div>
            <div class="lista-info">
                <div class="lista-tipo">${esc(nombreTipo(e))}</div>
                <div class="lista-sub">${esc(formatearHora(e.hora))} · ${esc(lugarTexto(e))}</div>
            </div>
            ${iconosEstado(e)}
        </button>`;
    }).join('');

    // Abrir la lista ya posicionada en los eventos vigentes (los pasados quedan arriba).
    const proximo = listaEventos.querySelector<HTMLElement>('[data-proximo]');
    listaEventos.scrollTop = proximo
        ? proximo.getBoundingClientRect().top - listaEventos.getBoundingClientRect().top + listaEventos.scrollTop
        : listaEventos.scrollHeight;
}

// ---------- Calendario ----------
function pildora(e: Evento, conHora = false): string {
    const hora = conHora ? `<span class="pop-hora">${esc(formatearHora(e.hora))}</span>` : '';
    return `<button type="button" class="cal-evt" data-evento="${e.id}" data-confirmado="${e.confirmado}"
        title="${esc(nombreTipo(e))} · ${esc(lugarTexto(e))}">${hora}${esc(nombreTipo(e))}</button>`;
}

function renderCalendario(visibles: Evento[]): void {
    cerrarPopover();
    calTitulo.textContent = capitalizar(mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }));

    const porDia = new Map<string, Evento[]>();
    for (const e of visibles) {
        const lista = porDia.get(e.fecha) ?? [];
        lista.push(e);
        porDia.set(e.fecha, lista);
    }
    for (const lista of porDia.values()) lista.sort((a, b) => a.hora.localeCompare(b.hora));

    // Semana que empieza en lunes.
    const desfase = (mes.getDay() + 6) % 7;
    const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const semanas = Math.ceil((desfase + diasMes) / 7);
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1 - desfase);

    const celdas: string[] = [];
    for (let i = 0; i < semanas * 7; i++) {
        const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
        const iso = aISO(d);
        const delDia = porDia.get(iso) ?? [];
        const visiblesDia = delDia.slice(0, MAX_VISIBLES);
        const clases = ['cal-dia'];
        if (d.getMonth() !== mes.getMonth()) clases.push('otro-mes');
        if (iso === HOY_ISO) clases.push('hoy');
        celdas.push(`
            <div class="${clases.join(' ')}" data-fecha="${iso}">
                <span class="cal-num">${d.getDate()}</span>
                ${visiblesDia.map(e => pildora(e)).join('')}
                ${delDia.length > MAX_VISIBLES
                    ? `<button type="button" class="cal-mas" data-mas="${iso}">ver más</button>` : ''}
            </div>`);
    }
    calGrid.innerHTML = celdas.join('');
    marcarSeleccion();
}

function abrirPopover(fecha: string): void {
    cerrarPopover();
    const delDia = filtrar().filter(e => e.fecha === fecha).sort((a, b) => a.hora.localeCompare(b.hora));
    if (delDia.length === 0) return;
    popoverFecha = fecha;

    const pop = document.createElement('div');
    pop.className = 'cal-popover';
    pop.innerHTML = `
        <div class="pop-head">
            <span>${esc(capitalizar(deISO(fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })))} · ${delDia.length} eventos</span>
            <button type="button" data-cerrar-pop aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        ${delDia.map(e => pildora(e, true)).join('')}`;
    calGrid.appendChild(pop);
    posicionarPopover();
    marcarSeleccion();
}

/** Coloca el cuadro sobre la casilla del día elegido, sin salirse del calendario. */
function posicionarPopover(): void {
    const pop = calGrid.querySelector<HTMLElement>('.cal-popover');
    const celda = popoverFecha ? calGrid.querySelector<HTMLElement>(`.cal-dia[data-fecha="${popoverFecha}"]`) : null;
    if (!pop || !celda) return;

    const ancho = Math.min(Math.max(celda.offsetWidth * 1.4, 210), calGrid.clientWidth);
    const izquierda = Math.min(celda.offsetLeft, calGrid.clientWidth - ancho);
    let arriba = celda.offsetTop;
    if (calGrid.clientHeight - arriba < 200) arriba = Math.max(0, calGrid.clientHeight - 200);

    pop.style.width = `${ancho}px`;
    pop.style.left = `${Math.max(0, izquierda)}px`;
    pop.style.top = `${arriba}px`;
    pop.style.maxHeight = `${calGrid.clientHeight - arriba}px`;
}

function cerrarPopover(): void {
    calGrid.querySelector('.cal-popover')?.remove();
    popoverFecha = null;
}

// ---------- Selección y detalle ----------
function marcarSeleccion(): void {
    document.querySelectorAll<HTMLElement>('[data-evento]').forEach(el => {
        el.classList.toggle('seleccionado', Number(el.dataset.evento) === seleccionadoId);
    });
}

function bloque(titulo: string, contenido: string): string {
    return `<div class="detalle-bloque"><h3>${titulo}</h3>${contenido}</div>`;
}

function badge(activo: boolean, icono: string, texto: string): string {
    return `<span class="badge ${activo ? 'on' : ''}"><i class="fa-solid ${icono}"></i> ${texto}</span>`;
}

function htmlDetalle(e: Evento): string {
    const saldo = e.total === null ? null : Math.max(0, e.total - e.totalPagado);
    const cliente = e.cliente
        ? `<p>${esc(e.cliente.nombre)}</p>
           <p><small>${esc(e.cliente.email ?? 'Sin correo')}</small></p>
           <p><small>${esc(e.cliente.telefono ?? 'Sin teléfono')}</small></p>`
        : '<p>—</p>';
    const personal = e.personal.length
        ? `<div class="personal-lista">${e.personal.map(n => `<span>${esc(n)}</span>`).join('')}</div>`
        : '<p>Sin personal asignado</p>';

    return `
        <div class="detalle-head">
            <h2>${esc(nombreTipo(e))}</h2>
            <div class="detalle-badges">
                ${badge(e.confirmado, 'fa-circle-check', 'Confirmado')}
                ${badge(e.pagoInicial, 'fa-money-bill-wave', 'Pago inicial')}
                ${badge(e.firmado, 'fa-file-signature', 'Firmado')}
            </div>
        </div>
        <div class="detalle-grid">
            ${bloque('Fecha y hora', `<p>${esc(formatearFechaLarga(e.fecha))}</p><p><small>${esc(formatearHora(e.hora))}</small></p>`)}
            ${bloque('Lugar', `<p>${esc(lugarTexto(e))}</p><p><small>${esc(e.direccion ?? 'Sin dirección')}</small></p>`)}
            ${bloque('Cliente', cliente)}
            ${bloque('Cotización', `
                <p>Total: ${esc(formatearMoneda(e.total))}</p>
                <p>Pagado: ${esc(formatearMoneda(e.totalPagado))}</p>
                <p>Saldo: ${esc(formatearMoneda(saldo))}</p>`)}
            ${bloque('Personal', personal)}
            ${bloque('Logística y contrato', `
                <p>Transporte: ${esc(e.transporte ?? '—')}</p>
                <p>Contrato enviado: ${esc(formatearFechaHora(e.contratoEnviadoEn))}</p>`)}
        </div>`;
}

const HTML_VACIO = `<div class="detalle-vacio"><i class="fa-regular fa-hand-pointer"></i>
    Selecciona un evento en la lista o en el calendario para ver su información.</div>`;

/** Cambia el contenido del detalle con un fade out / fade in. */
function mostrarDetalle(id: number | null, inmediato = false): void {
    const evento = id === null ? undefined : eventos.find(e => e.id === id);
    const html = evento ? htmlDetalle(evento) : HTML_VACIO;
    window.clearTimeout(fadeTimer);
    if (inmediato) {
        detalleContenido.innerHTML = html;
        return;
    }
    detalleContenido.classList.add('oculto');
    fadeTimer = window.setTimeout(() => {
        detalleContenido.innerHTML = html;
        detalleContenido.classList.remove('oculto');
    }, FADE_MS);
}

function seleccionar(id: number): void {
    seleccionadoId = seleccionadoId === id ? null : id;
    marcarSeleccion();
    mostrarDetalle(seleccionadoId);

    // Si el evento está en otro mes, llevar el calendario hasta él.
    const evento = eventos.find(e => e.id === seleccionadoId);
    if (evento) {
        const d = deISO(evento.fecha);
        if (d.getFullYear() !== mes.getFullYear() || d.getMonth() !== mes.getMonth()) {
            mes = new Date(d.getFullYear(), d.getMonth(), 1);
            renderCalendario(filtrar());
        }
    }
}

// ---------- Render general ----------
function render(): void {
    const visibles = filtrar();

    // El detalle seguirá mostrándose solo si el evento sigue pasando los filtros.
    if (seleccionadoId !== null && !visibles.some(e => e.id === seleccionadoId)) {
        seleccionadoId = null;
        mostrarDetalle(null);
    }

    fLimpiar.hidden = !hayFiltros();
    fConteo.textContent = hayFiltros()
        ? `${visibles.length} de ${eventos.length} eventos`
        : `${eventos.length} eventos`;
    toggles.forEach(t => t.setAttribute('aria-pressed', String(filtrosActivos.has(t.dataset.filtro as ClaveToggle))));

    renderLista(visibles);
    renderCalendario(visibles);
    marcarSeleccion();
}

// ---------- Crear evento ----------
function abrirModal(html: string): void {
    modalContenido.innerHTML = html;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function cerrarModal(): void {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    borrarBorrador(); // cerrar el formulario descarta el evento en creación
}

/** Cabecera fija con la X para cerrar (arriba a la izquierda) y cuerpo desplazable. */
function htmlModal(titulo: string, cuerpo: string): string {
    return `
        <div class="modal-cabecera">
            <button type="button" class="modal-cerrar" data-cerrar-modal aria-label="Cerrar" title="Cerrar">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <h2>${titulo}</h2>
        </div>
        <div class="modal-cuerpo">${cuerpo}</div>`;
}

/** Campo de texto del formulario; `atributosLabel` va en el <label> (p. ej. `hidden`). */
function campoTexto(etiqueta: string, nombre: string, extra = '', clase = '', atributosLabel = ''): string {
    return `<label class="campo ${clase}" ${atributosLabel}><span>${etiqueta}</span>
        <input type="text" name="${nombre}" autocomplete="off" ${extra}></label>`;
}

function htmlFormularioEvento({ sedes, transportes }: OpcionesEvento): string {
    const opcionesSede = sedes.map(s =>
        `<option value="${s.id}">${esc(s.nombre)}${s.ciudad ? ` · ${esc(s.ciudad)}` : ''}</option>`).join('');
    const opcionesTransporte = transportes.map(t =>
        `<option value="${t.id}">${esc(t.ciudad)} — ${esc(formatearMoneda(t.precio))}</option>`).join('');

    return htmlModal('Nuevo evento', `
        <form id="formEvento" novalidate>
            <div class="form-grid">
                <h3 class="form-seccion">Evento</h3>
                ${campoTexto('Tipo de evento', 'tipo', 'maxlength="100" placeholder="Ej: Boda, Quinceañera, Corporativo"', 'span-2')}
                <label class="campo"><span>Fecha</span><input type="date" name="fecha"></label>
                <label class="campo"><span>Hora</span><input type="time" name="hora"></label>
                <p class="form-error span-2" id="avisoFecha" role="alert" hidden></p>
                <label class="checkbox-label span-2"><input type="checkbox" name="confirmado"> Evento confirmado</label>

                <h3 class="form-seccion">Lugar y transporte</h3>
                <label class="campo span-2"><span>Sede</span>
                    <select name="sede">
                        <option value="">Selecciona una sede…</option>
                        ${opcionesSede}
                        <option value="${SEDE_OTRA}">Otro lugar (escribir manualmente)</option>
                    </select></label>
                ${campoTexto('Nombre del lugar', 'lugarManual', 'maxlength="255"', 'span-2', 'data-manual hidden')}
                ${campoTexto('Dirección del lugar (opcional)', 'direccionLugarManual', 'maxlength="255"', 'span-2', 'data-manual hidden')}
                ${campoTexto('Dirección del evento (opcional)', 'direccion', 'maxlength="255"', 'span-2')}
                <label class="campo span-2"><span>Transporte (opcional)</span>
                    <select name="transporte">
                        <option value="">Sin transporte</option>
                        ${opcionesTransporte}
                    </select></label>

                <h3 class="form-seccion">Cliente</h3>
                ${campoTexto('Nombre completo', 'clienteNombre', 'maxlength="100"')}
                <label class="campo"><span>Correo</span>
                    <input type="email" name="clienteEmail" autocomplete="off" maxlength="150"></label>
                <label class="campo"><span>Teléfono (opcional)</span>
                    <input type="tel" name="clienteTelefono" autocomplete="off" maxlength="30" placeholder="Ej: 3001234567"></label>
                ${campoTexto('Documento (opcional)', 'clienteDocumento', 'maxlength="50"')}
                <small class="campo-ayuda span-2">Si ya existe un cliente con ese correo, se usa el registrado.</small>

                <h3 class="form-seccion">Cotización</h3>
                <p class="campo-ayuda span-2">Los elementos que se usarán en el evento se cotizan en la página de cotizaciones.
                    El evento se crea cuando guardes allí la cotización.</p>
            </div>
            <p id="formEventoError" class="form-error" hidden></p>
            <div class="modal-acciones">
                <button type="button" class="btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="submit-btn btn-modal"><i class="fa-solid fa-file-invoice-dollar"></i> Cotizar elementos del evento</button>
            </div>
        </form>`);
}

/** Vuelve a poner en el formulario los datos de un evento en creación. */
function rellenarFormulario(form: HTMLFormElement, b: BorradorEvento): void {
    const poner = (nombre: string, valor: string) => {
        const el = form.elements.namedItem(nombre) as HTMLInputElement | HTMLSelectElement;
        el.value = valor;
        // Una sede o un transporte que ya no existen dejan el desplegable en blanco.
        if (el instanceof HTMLSelectElement && el.selectedIndex === -1) el.selectedIndex = 0;
    };
    poner('tipo', b.tipo);
    poner('fecha', b.fecha);
    poner('hora', b.hora);
    (form.elements.namedItem('confirmado') as HTMLInputElement).checked = b.confirmado;
    poner('sede', b.venueId !== null ? String(b.venueId) : (b.lugarManual ? SEDE_OTRA : ''));
    poner('lugarManual', b.lugarManual);
    poner('direccionLugarManual', b.direccionLugarManual);
    poner('direccion', b.direccion);
    poner('transporte', b.transporteId !== null ? String(b.transporteId) : '');
    poner('clienteNombre', b.cliente.nombre);
    poner('clienteEmail', b.cliente.email);
    poner('clienteTelefono', b.cliente.telefono);
    poner('clienteDocumento', b.cliente.documento);
}

/** Abre el formulario de nuevo evento, cargando antes las sedes y los transportes. */
async function abrirCrear(): Promise<void> {
    abrirModal(htmlModal('Nuevo evento',
        '<p class="modal-texto"><i class="fa-solid fa-spinner fa-spin"></i> Cargando opciones...</p>'));
    try {
        opciones ??= await api<OpcionesEvento>('GET', '/api/eventos/opciones');
    } catch (err) {
        if (!modal.classList.contains('open')) return;
        modalContenido.innerHTML = htmlModal('Nuevo evento', `
            <p class="form-error">No se pudieron cargar las opciones: ${esc((err as Error).message)}</p>
            <div class="modal-acciones"><button type="button" class="btn-secundario" data-cerrar-modal>Cerrar</button></div>`);
        return;
    }
    if (!modal.classList.contains('open')) return; // se cerró mientras cargaba

    modalContenido.innerHTML = htmlFormularioEvento(opciones);
    const form = $<HTMLFormElement>('formEvento');
    const campo = (nombre: string) => form.elements.namedItem(nombre) as HTMLInputElement;
    const valor = (nombre: string) => campo(nombre).value.trim();

    const sede = campo('sede');
    const camposManual = form.querySelectorAll<HTMLElement>('[data-manual]');
    const mostrarCamposManual = () => {
        camposManual.forEach(c => { c.hidden = sede.value !== SEDE_OTRA; });
    };
    sede.addEventListener('change', mostrarCamposManual);

    // Si venimos de la página de cotizaciones (o se dejó el formulario a medias), se recupera.
    const borrador = leerBorrador();
    if (borrador) rellenarFormulario(form, borrador);
    mostrarCamposManual();
    campo('tipo').focus();

    // La advertencia de la fecha se quita en cuanto se cambia la fecha.
    const avisoFecha = $('avisoFecha');
    const limpiarAvisoFecha = () => {
        avisoFecha.hidden = true;
        campo('fecha').closest('.campo')?.classList.remove('invalido');
    };
    campo('fecha').addEventListener('input', limpiarAvisoFecha);
    campo('fecha').addEventListener('change', limpiarAvisoFecha);

    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const error = $('formEventoError');
        limpiarAvisoFecha();

        const faltan: string[] = [];
        if (!valor('tipo')) faltan.push('tipo de evento');
        if (!valor('fecha')) faltan.push('fecha');
        if (!valor('hora')) faltan.push('hora');
        if (!sede.value) faltan.push('sede');
        else if (sede.value === SEDE_OTRA && !valor('lugarManual')) faltan.push('nombre del lugar');
        if (!valor('clienteNombre')) faltan.push('nombre del cliente');
        if (!valor('clienteEmail')) faltan.push('correo del cliente');
        if (faltan.length) {
            error.textContent = `Completa los campos obligatorios: ${faltan.join(', ')}.`;
            error.hidden = false;
            return;
        }
        if (!EMAIL_RE.test(valor('clienteEmail'))) {
            error.textContent = 'El correo del cliente no es válido.';
            error.hidden = false;
            return;
        }

        // Antes de pasar a cotizar se comprueba que la base acepte la fecha del evento.
        const boton = form.querySelector<HTMLButtonElement>('.btn-modal')!;
        const textoBoton = boton.innerHTML;
        boton.disabled = true;
        boton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Comprobando fecha...';
        try {
            const fecha = await api<{ valida: boolean; fechaMaxima: string | null; mensaje: string | null }>(
                'GET', `/api/eventos/fecha?fecha=${encodeURIComponent(valor('fecha'))}`);
            if (!fecha.valida) {
                avisoFecha.textContent = fecha.mensaje ?? 'La fecha del evento no es aceptada. Elige otra.';
                avisoFecha.hidden = false;
                // El selector solo deja elegir fechas aceptadas.
                if (fecha.fechaMaxima) campo('fecha').max = fecha.fechaMaxima;
                campo('fecha').closest('.campo')?.classList.add('invalido');
                campo('fecha').focus();
                return;
            }
        } catch (err) {
            error.textContent = `No se pudo comprobar la fecha: ${(err as Error).message}`;
            error.hidden = false;
            return;
        } finally {
            boton.disabled = false;
            boton.innerHTML = textoBoton;
        }

        // El evento se crea al guardar la cotización: aquí solo se guarda el borrador y se pasa a cotizar.
        const lugarManual = sede.value === SEDE_OTRA;
        const guardado = guardarBorrador({
            tipo: valor('tipo'),
            fecha: valor('fecha'),
            hora: valor('hora'),
            confirmado: campo('confirmado').checked,
            venueId: lugarManual ? null : Number(sede.value),
            lugarManual: lugarManual ? valor('lugarManual') : '',
            direccionLugarManual: lugarManual ? valor('direccionLugarManual') : '',
            direccion: valor('direccion'),
            transporteId: valor('transporte') ? Number(valor('transporte')) : null,
            cliente: {
                nombre: valor('clienteNombre'),
                email: valor('clienteEmail'),
                telefono: valor('clienteTelefono'),
                documento: valor('clienteDocumento')
            }
        });
        if (!guardado) {
            error.textContent = 'No se pudieron guardar los datos del evento en el navegador. Revisa que no tenga el almacenamiento bloqueado.';
            error.hidden = false;
            return;
        }
        error.hidden = true;
        window.location.href = 'cotizador.html';
    });
}

// ---------- Carga ----------
async function cargar(): Promise<void> {
    try {
        const json = await api<{ eventos: Evento[] }>('GET', '/api/eventos');
        eventos = json.eventos;
        estadoCarga.hidden = true;
        deck.hidden = false;
        detalle.hidden = false;
        mostrarDetalle(null, true);
        render();

        // Recién creado desde la página de cotizaciones: llevarlo a la vista.
        const creado = Number(parametros.get('creado'));
        if (creado && eventos.some(e => e.id === creado)) {
            seleccionar(creado);
            avisar('Evento creado');
        }
    } catch (err) {
        estadoCarga.classList.add('error');
        estadoCarga.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar los eventos: ${esc((err as Error).message)}`;
    }
}

// ---------- Eventos de la interfaz ----------
toggles.forEach(t => t.addEventListener('click', () => {
    const clave = t.dataset.filtro as ClaveToggle;
    if (filtrosActivos.has(clave)) filtrosActivos.delete(clave);
    else filtrosActivos.add(clave);
    render();
}));

function alCambiarRango(): void {
    // La fecha final nunca puede ser anterior a la inicial.
    if (fDesde.value && fHasta.value && fHasta.value < fDesde.value) fHasta.value = fDesde.value;
    fHasta.min = fDesde.value;
    if (fDesde.value) {
        const d = deISO(fDesde.value);
        mes = new Date(d.getFullYear(), d.getMonth(), 1);
    }
    render();
}
fDesde.addEventListener('change', alCambiarRango);
fHasta.addEventListener('change', alCambiarRango);

fLimpiar.addEventListener('click', () => {
    filtrosActivos.clear();
    fDesde.value = '';
    fHasta.value = '';
    fHasta.min = '';
    render();
});

function irAMes(delta: number): void {
    mes = new Date(mes.getFullYear(), mes.getMonth() + delta, 1);
    renderCalendario(filtrar());
}
$('calPrev').addEventListener('click', () => irAMes(-1));
$('calNext').addEventListener('click', () => irAMes(1));
$('calHoy').addEventListener('click', () => {
    mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    renderCalendario(filtrar());
});

// Pin: deja el calendario extendido (y la lista retraída) aunque el cursor se vaya; otro clic lo suelta.
const calPin = $('calPin');
calPin.addEventListener('click', () => {
    const fijado = $('panelCal').classList.toggle('fijado');
    const texto = fijado ? 'Soltar calendario (se extiende solo al pasar el cursor)' : 'Fijar calendario extendido';
    calPin.setAttribute('aria-pressed', String(fijado));
    calPin.setAttribute('aria-label', texto);
    calPin.title = texto;
});

listaEventos.addEventListener('click', ev => {
    const item = (ev.target as HTMLElement).closest<HTMLElement>('[data-evento]');
    if (item) seleccionar(Number(item.dataset.evento));
});

calGrid.addEventListener('click', ev => {
    const objetivo = ev.target as HTMLElement;
    if (objetivo.closest('[data-cerrar-pop]')) {
        cerrarPopover();
        return;
    }
    const mas = objetivo.closest<HTMLElement>('[data-mas]');
    if (mas?.dataset.mas) {
        abrirPopover(mas.dataset.mas);
        return;
    }
    const item = objetivo.closest<HTMLElement>('[data-evento]');
    if (item) seleccionar(Number(item.dataset.evento));
});

// Cerrar el cuadro "ver más" al hacer click fuera de él o con Esc.
document.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    if (popoverFecha && !t.closest('.cal-popover') && !t.closest('[data-mas]')) cerrarPopover();
});
document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (modal.classList.contains('open')) cerrarModal();
    else cerrarPopover();
});

// El formulario es largo: solo se cierra con la X, Cancelar o Esc, no al tocar el fondo.
document.querySelectorAll('[data-nuevo-evento]').forEach(b => b.addEventListener('click', () => void abrirCrear()));
modal.addEventListener('click', ev => {
    if ((ev.target as HTMLElement).closest('[data-cerrar-modal]')) cerrarModal();
});

// El calendario cambia de ancho al hacer hover (se extiende y la lista se retrae) y al redimensionar la
// ventana: reubicar el cuadro abierto.
new ResizeObserver(() => posicionarPopover()).observe(calGrid);

void cargar();
// Al volver desde la página de cotizaciones se reabre el formulario con el evento en creación.
if (parametros.has('nuevo')) void abrirCrear();
