import './style.css';
import './panel.css';
import './eventos.css';
import { api } from './api';

interface Evento {
    id: number;
    fecha: string | null; // YYYY-MM-DD; nulo si el evento aún no tiene fecha
    hora: string | null; // HH:MM:SS; nulo si el evento aún no tiene hora
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

type ClaveToggle = 'confirmado' | 'pagoInicial' | 'firmado';
/** Cada filtro de estado busca los que sí cumplen, los que no, o todos (sin filtrar). */
type ValorFiltro = 'todos' | 'si' | 'no';

const MAX_VISIBLES = 4;
const FADE_MS = 180;

// Parámetro que deja la página de cotizaciones al volver: ?creado=<id> marca el evento recién creado.
const parametros = new URLSearchParams(window.location.search);
if (window.location.search) window.history.replaceState(null, '', window.location.pathname);

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
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
const segmentos = document.querySelectorAll<HTMLButtonElement>('.segmento');

let eventos: Evento[] = [];
let seleccionadoId: number | null = null;
let popoverFecha: string | null = null;
let fadeTimer: number | undefined;
let toastTimer: number | undefined;
const filtrosEstado: Record<ClaveToggle, ValorFiltro> = { confirmado: 'todos', pagoInicial: 'todos', firmado: 'todos' };
const CLAVES_ESTADO = Object.keys(filtrosEstado) as ClaveToggle[];

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

function horaTexto(e: Evento): string {
    return e.hora ? formatearHora(e.hora) : 'Hora por definir';
}

/** Del más antiguo al más reciente; los eventos sin fecha al final y, en un mismo día, los sin hora. */
function porFechaYHora(a: Evento, b: Evento): number {
    const clave = (e: Evento) => `${e.fecha ?? '9999-99-99'} ${e.hora ?? '99:99:99'}`;
    return clave(a).localeCompare(clave(b));
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
    return CLAVES_ESTADO.some(c => filtrosEstado[c] !== 'todos') || fDesde.value !== '' || fHasta.value !== '';
}

function filtrar(): Evento[] {
    const desde = fDesde.value;
    const hasta = fHasta.value;
    return eventos.filter(e => {
        // 'si' deja solo los que cumplen; 'no', solo los que no; 'todos' no filtra.
        for (const clave of CLAVES_ESTADO) {
            const valor = filtrosEstado[clave];
            if (valor !== 'todos' && e[clave] !== (valor === 'si')) return false;
        }
        // Sin fecha no se puede saber si cae dentro de un rango: con un rango activo se oculta.
        if ((desde || hasta) && !e.fecha) return false;
        if (desde && e.fecha! < desde) return false;
        if (hasta && e.fecha! > hasta) return false;
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
    const items = [...visibles].sort(porFechaYHora);
    // Único contador de eventos: los que coinciden con los filtros ("N de M" cuando hay filtros activos).
    listaConteo.textContent = hayFiltros() ? `${items.length} de ${eventos.length}` : String(items.length);
    listaConteo.title = `${listaConteo.textContent} eventos`;


    if (items.length === 0) {
        listaEventos.innerHTML = `<p class="lista-vacia">${hayFiltros()
            ? 'Ningún evento coincide con los filtros.'
            : 'No hay eventos registrados.'}</p>`;
        return;
    }

    listaEventos.innerHTML = items.map(e => {

        let dia = '—';
        let mesCorto = 'sin fecha';
        if (e.fecha) {
            const d = deISO(e.fecha);
            dia = String(d.getDate());
            mesCorto = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
        }
        return `
        <button type="button" class="lista-item" data-evento="${e.id}">
            <div class="lista-fecha"><strong>${dia}</strong><span>${esc(mesCorto)}</span></div>

            <div class="lista-info">
                <div class="lista-tipo">${esc(nombreTipo(e))}</div>
                <div class="lista-sub">${esc(horaTexto(e))} · ${esc(lugarTexto(e))}</div>
            </div>
            ${iconosEstado(e)}
        </button>`;
    }).join('');


    // El API solo trae eventos vigentes: el primero de la lista es el próximo.


    listaEventos.scrollTop = 0;
}

// ---------- Calendario ----------
function pildora(e: Evento, conHora = false): string {
    const hora = conHora ? `<span class="pop-hora">${esc(e.hora ? formatearHora(e.hora) : '—')}</span>` : '';
    return `<button type="button" class="cal-evt" data-evento="${e.id}" data-confirmado="${e.confirmado}"
        title="${esc(nombreTipo(e))} · ${esc(lugarTexto(e))}">${hora}${esc(nombreTipo(e))}</button>`;
}

function renderCalendario(visibles: Evento[]): void {
    cerrarPopover();
    calTitulo.textContent = capitalizar(mes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }));

    const porDia = new Map<string, Evento[]>();
    for (const e of visibles) {
        if (!e.fecha) continue; // sin fecha no tiene casilla: solo aparece en la lista
        const lista = porDia.get(e.fecha) ?? [];
        lista.push(e);
        porDia.set(e.fecha, lista);
    }
    for (const lista of porDia.values()) lista.sort(porFechaYHora);

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
    const delDia = filtrar().filter(e => e.fecha === fecha).sort(porFechaYHora);
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
            ${bloque('Fecha y hora', `<p>${esc(e.fecha ? formatearFechaLarga(e.fecha) : 'Fecha por definir')}</p><p><small>${esc(horaTexto(e))}</small></p>`)}
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
    if (evento?.fecha) {
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
    segmentos.forEach(s => s.setAttribute(
        'aria-pressed', String(filtrosEstado[s.dataset.filtro as ClaveToggle] === s.dataset.valor)));

    renderLista(visibles);
    renderCalendario(visibles);
    marcarSeleccion();
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
        // Si el fallo ocurrió al pintar, los paneles ya estaban visibles y quedaban en blanco sin explicación.
        deck.hidden = true;
        detalle.hidden = true;
        estadoCarga.hidden = false;
        estadoCarga.classList.add('error');
        estadoCarga.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar los eventos: ${esc((err as Error).message)}`;
    }
}

// ---------- Eventos de la interfaz ----------
segmentos.forEach(s => s.addEventListener('click', () => {
    filtrosEstado[s.dataset.filtro as ClaveToggle] = s.dataset.valor as ValorFiltro;
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
    CLAVES_ESTADO.forEach(c => { filtrosEstado[c] = 'todos'; });
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
    if (ev.key === 'Escape') cerrarPopover();
});

// El calendario cambia de ancho al hacer hover (se extiende y la lista se retrae) y al redimensionar la
// ventana: reubicar el cuadro abierto.
new ResizeObserver(() => posicionarPopover()).observe(calGrid);

void cargar();
