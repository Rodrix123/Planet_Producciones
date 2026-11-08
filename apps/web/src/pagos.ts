import './style.css';
import './panel.css';
import './eventos.css';
import './pagos.css';
// Letras de la página principal: Tenor Sans en títulos y Hanken Grotesk en el texto.
import '@fontsource/tenor-sans/latin-400.css';
import '@fontsource/tenor-sans/latin-ext-400.css';
import '@fontsource-variable/hanken-grotesk/wght.css';
import { api } from './api';
import { exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

// Menú "Pagos": eventos confirmados en dos columnas (sin pagar / pagados) y registro
// manual de pagos. Los datos vienen de /api/pagos (packages/db/src/pagos.ts).

interface EventoPago {
    id: number;
    fecha: string | null;
    hora: string | null;
    tipo: string | null;
    lugar: string | null;
    ciudad: string | null;
    cliente: { nombre: string; email: string | null; telefono: string | null } | null;
    total: number | null;
    totalPagado: number;
    saldo: number;
}

type ClaveColumna = 'sinPagar' | 'pagados';
type MetodoPago = 'efectivo' | 'transferencia';

interface BorradorPago {
    monto: string;
    metodo: MetodoPago;
    referencia: string;
}

const NOMBRE_METODO: Record<MetodoPago, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia' };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const estadoCarga = $('estado');
const columnasEl = $('columnas');
const btnAnadirPago = $<HTMLButtonElement>('btnAnadirPago');
const modal = $('modal');
const modalContenido = $('modalContenido');
const toast = $('toast');
let toastTimer: number | undefined;

const datos: Record<ClaveColumna, EventoPago[]> = { sinPagar: [], pagados: [] };

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

function formatearMoneda(valor: number | null): string {
    if (valor === null) return '—';
    return valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
}

function formatearFecha(iso: string | null): string {
    if (!iso) return 'Fecha por definir';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

const nombreTipo = (e: EventoPago): string => e.tipo?.trim() || 'Evento';
const lugarTexto = (e: EventoPago): string => [e.lugar, e.ciudad].filter(Boolean).join(' · ') || 'Lugar por definir';
const clienteTexto = (e: EventoPago): string => e.cliente?.nombre || 'Sin cliente';

/** Texto sin mayúsculas ni tildes, para buscar sin importar cómo se escribió. */
const normalizar = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Columnas y filtros ----------
function columna(clave: ClaveColumna): HTMLElement {
    return columnasEl.querySelector<HTMLElement>(`[data-columna="${clave}"]`)!;
}

function filtro(col: HTMLElement, nombre: string): HTMLInputElement {
    return col.querySelector<HTMLInputElement>(`[data-filtro="${nombre}"]`)!;
}

/** Hay algo distinto de lo que deja "Limpiar" (sin búsqueda, desde hoy y sin fecha final). */
function hayFiltros(col: HTMLElement): boolean {
    return filtro(col, 'texto').value.trim() !== ''
        || filtro(col, 'desde').value !== aISO(new Date())
        || filtro(col, 'hasta').value !== '';
}

/** `texto` ya normalizado; vacío coincide con todo. */
function coincideTexto(e: EventoPago, texto: string): boolean {
    if (!texto) return true;
    const campos = [nombreTipo(e), clienteTexto(e), lugarTexto(e), e.cliente?.email ?? '', e.cliente?.telefono ?? ''];
    return campos.some(c => normalizar(c).includes(texto));
}

function filtrar(clave: ClaveColumna): EventoPago[] {
    const col = columna(clave);
    const texto = normalizar(filtro(col, 'texto').value.trim());
    const desde = filtro(col, 'desde').value;
    const hasta = filtro(col, 'hasta').value;

    return datos[clave].filter(e => {
        if (!coincideTexto(e, texto)) return false;
        if ((desde || hasta) && !e.fecha) return false;
        if (desde && e.fecha! < desde) return false;
        if (hasta && e.fecha! > hasta) return false;
        return true;
    });
}

const DIAS_ANTES_PARA_PAGAR = 6;

/** El último día de pago es 6 días antes de la fecha; los eventos sin fecha no tienen plazo. */
function plazoVencido(e: EventoPago): boolean {
    if (!e.fecha) return false;
    const limite = new Date(`${e.fecha}T00:00:00`);
    limite.setDate(limite.getDate() - DIAS_ANTES_PARA_PAGAR);
    return aISO(new Date()) > aISO(limite);
}

/** Vencido el plazo, la tarjeta no lleva botón. */
function botonPago(e: EventoPago): string {
    if (plazoVencido(e)) return '';
    return `<button type="button" class="pago-agregar" data-pagar="${e.id}" title="Agregar pago" aria-label="Agregar pago a ${esc(nombreTipo(e))}">
               <i class="fa-solid fa-plus"></i>
           </button>`;
}

/** Fecha, evento y montos: lo que comparten las tarjetas de las columnas y las filas del menú "Añadir pago". */
function datosTarjeta(e: EventoPago, montos: string): string {
    let dia = '—';
    let mesCorto = 'sin fecha';
    if (e.fecha) {
        const d = new Date(`${e.fecha}T00:00:00`);
        dia = String(d.getDate());
        mesCorto = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
    }
    return `
        <div class="lista-fecha"><strong>${dia}</strong><span>${esc(mesCorto)}</span></div>
        <div class="lista-info">
            <div class="lista-tipo">${esc(nombreTipo(e))}</div>
            <div class="lista-sub">${esc(clienteTexto(e))} · ${esc(lugarTexto(e))}</div>
            <div class="lista-sub pago-montos">${montos}</div>
        </div>`;
}

const montosPendientes = (e: EventoPago): string =>
    `<span>Pagado ${formatearMoneda(e.totalPagado)} de ${formatearMoneda(e.total)}</span><strong class="pago-saldo">Saldo ${formatearMoneda(e.saldo)}</strong>`;

function tarjeta(e: EventoPago, clave: ClaveColumna): string {
    const accion = clave === 'sinPagar'
        ? botonPago(e)
        : `<span class="pago-sello" title="Pagado"><i class="fa-solid fa-circle-check"></i> Pagado</span>`;
    const montos = clave === 'sinPagar'
        ? montosPendientes(e)
        : `<span>Total ${formatearMoneda(e.total)}</span><span>Pagado ${formatearMoneda(e.totalPagado)}</span>`;

    return `
    <div class="lista-item pago-item">
        ${datosTarjeta(e, montos)}
        ${accion}
    </div>`;
}

function renderColumna(clave: ClaveColumna): void {
    const col = columna(clave);
    const visibles = filtrar(clave);
    const conFiltros = hayFiltros(col);
    col.querySelector<HTMLElement>('[data-limpiar]')!.hidden = !conFiltros;

    const lista = col.querySelector<HTMLElement>('[data-lista]')!;
    if (visibles.length === 0) {
        lista.innerHTML = `<p class="lista-vacia">${visibles.length < datos[clave].length
            ? 'Ningún evento coincide con los filtros.'
            : clave === 'sinPagar' ? 'No hay eventos pendientes de pago.' : 'Todavía no hay eventos pagados.'}</p>`;
        return;
    }
    lista.innerHTML = visibles.map(e => tarjeta(e, clave)).join('');
}

function render(): void {
    renderColumna('sinPagar');
    renderColumna('pagados');
}

async function cargar(): Promise<void> {
    try {
        const json = await api<{ sinPagar: EventoPago[]; pagados: EventoPago[] }>('GET', '/api/pagos');
        datos.sinPagar = json.sinPagar;
        datos.pagados = json.pagados;
        estadoCarga.hidden = true;
        columnasEl.hidden = false;
        btnAnadirPago.disabled = false;
        render();
    } catch (err) {
        btnAnadirPago.disabled = true;
        columnasEl.hidden = true;
        estadoCarga.hidden = false;
        estadoCarga.classList.add('error');
        estadoCarga.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar los eventos: ${esc((err as Error).message)}`;
    }
}

// ---------- Ventana de pago ----------
function abrirModal(html: string, lista = false): void {
    modalContenido.classList.toggle('pagos-modal-lista', lista);
    modalContenido.innerHTML = html;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function cerrarModal(): void {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalContenido.innerHTML = '';
}

function resumenEvento(e: EventoPago): string {
    return `
    <dl class="pago-resumen">
        <div><dt>Evento</dt><dd>${esc(nombreTipo(e))}</dd></div>
        <div><dt>Cliente</dt><dd>${esc(clienteTexto(e))}</dd></div>
        <div><dt>Fecha</dt><dd>${esc(formatearFecha(e.fecha))}</dd></div>
        <div><dt>Lugar</dt><dd>${esc(lugarTexto(e))}</dd></div>
        <div><dt>Total</dt><dd>${formatearMoneda(e.total)}</dd></div>
        <div><dt>Pagado</dt><dd>${formatearMoneda(e.totalPagado)}</dd></div>
        <div><dt>Saldo pendiente</dt><dd class="pago-saldo">${formatearMoneda(e.saldo)}</dd></div>
    </dl>`;
}

/** Monto escrito a número (admite puntos de miles: "1.500.000"). */
/**
 * Monto escrito con puntos de miles mientras se digita: "1500000" -> "1.500.000". Una coma
 * separa hasta dos decimales ("1.500,5"). leerMonto lo vuelve a número quitando los puntos.
 */
function formatearMontoEscrito(texto: string): string {
    const [entero, ...resto] = texto.split(',');
    const digitos = entero.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const miles = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    if (resto.length === 0) return miles;
    return `${miles || '0'},${resto.join('').replace(/\D/g, '').slice(0, 2)}`;
}

/** Reformatea el campo y deja el cursor detrás del mismo dígito en el que estaba. */
function formatearCampoMonto(input: HTMLInputElement): void {
    const antes = input.value;
    const cursor = input.selectionStart ?? antes.length;
    const significativos = antes.slice(0, cursor).replace(/[^\d,]/g, '').length;
    const nuevo = formatearMontoEscrito(antes);
    if (nuevo === antes) return;
    input.value = nuevo;
    let pos = 0;
    for (let vistos = 0; pos < nuevo.length && vistos < significativos; pos++) {
        if (/[\d,]/.test(nuevo[pos])) vistos++;
    }
    input.setSelectionRange(pos, pos);
}

function leerMonto(texto: string): number {
    const limpio = texto.replace(/[^\d,]/g, '').replace(',', '.');
    return limpio ? Number(limpio) : NaN;
}

/** Paso previo del botón "Añadir pago": se elige el evento entre los que aún se pueden pagar. */
function pasoSeleccion(): void {
    const pagables = datos.sinPagar.filter(e => !plazoVencido(e));

    abrirModal(`
        <header class="deck-head">
            <h2>Eventos sin pagar</h2>
            <button type="button" class="modal-cerrar" id="pagoCerrar" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="pagos-filtros">
            <label class="panel-search">
                <i class="fa-solid fa-magnifying-glass"></i>
                <input type="search" id="pagoBuscar" placeholder="Buscar por cliente, tipo o lugar">
            </label>
        </div>
        <div class="lista-eventos" id="pagoLista"></div>
    `, true);

    const buscarEl = $<HTMLInputElement>('pagoBuscar');
    const listaEl = $('pagoLista');

    const pintar = (): void => {
        const texto = normalizar(buscarEl.value.trim());
        const visibles = pagables.filter(e => coincideTexto(e, texto));
        listaEl.innerHTML = visibles.length === 0
            ? `<p class="lista-vacia">${pagables.length === 0 ? 'No hay eventos pendientes de pago.' : 'Ningún evento coincide con los filtros.'}</p>`
            : visibles.map(e => `
                <button type="button" class="lista-item pago-opcion" data-elegir="${e.id}">
                    ${datosTarjeta(e, montosPendientes(e))}
                </button>`).join('');
    };

    pintar();
    buscarEl.focus();
    buscarEl.addEventListener('input', pintar);
    $('pagoCerrar').addEventListener('click', cerrarModal);
    listaEl.addEventListener('click', ev => {
        const fila = (ev.target as HTMLElement).closest<HTMLElement>('[data-elegir]');
        const evento = fila && pagables.find(e => e.id === Number(fila.dataset.elegir));
        if (evento) pasoIngreso(evento, { monto: '', metodo: 'efectivo', referencia: '' });
    });
}

/** Paso 1: se ingresan monto, método y referencia. */
function pasoIngreso(e: EventoPago, borrador: BorradorPago): void {
    abrirModal(`
        <button type="button" class="modal-cerrar pago-cerrar" id="pagoCerrar" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
        <h2>Registrar pago</h2>
        ${resumenEvento(e)}
        <label class="campo"><span>Monto a pagar (máximo ${formatearMoneda(e.saldo)}, múltiplos de 50)</span>
            <input type="text" inputmode="decimal" id="pagoMonto" placeholder="Ej. 500000" value="${esc(borrador.monto)}">
        </label>
        <label class="campo"><span>Método de pago</span>
            <select id="pagoMetodo">
                <option value="efectivo" ${borrador.metodo === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                <option value="transferencia" ${borrador.metodo === 'transferencia' ? 'selected' : ''}>Transferencia</option>
            </select>
        </label>
        <label class="campo"><span>Referencia (opcional)</span>
            <input type="text" id="pagoReferencia" maxlength="150" placeholder="Ej. número de transferencia" value="${esc(borrador.referencia)}">
        </label>
        <p class="form-error" id="pagoError" hidden></p>
        <div class="modal-acciones">
            <button type="button" class="btn-secundario" id="pagoCancelar">Cancelar</button>
            <button type="button" class="btn-guardar" id="pagoContinuar" style="width:auto;">Continuar</button>
        </div>
    `);

    const montoEl = $<HTMLInputElement>('pagoMonto');
    const metodoEl = $<HTMLSelectElement>('pagoMetodo');
    const referenciaEl = $<HTMLInputElement>('pagoReferencia');
    const errorEl = $('pagoError');
    montoEl.focus();
    montoEl.addEventListener('input', () => formatearCampoMonto(montoEl));

    $('pagoCerrar').addEventListener('click', cerrarModal);
    $('pagoCancelar').addEventListener('click', cerrarModal);
    $('pagoContinuar').addEventListener('click', () => {
        const nuevo: BorradorPago = {
            monto: montoEl.value.trim(),
            metodo: metodoEl.value as MetodoPago,
            referencia: referenciaEl.value.trim()
        };
        const monto = leerMonto(nuevo.monto);
        let error = '';
        if (!Number.isFinite(monto) || monto <= 0) error = 'Ingresa un monto mayor que cero.';
        else if (Math.round(monto * 100) > Math.round(e.saldo * 100)) error = `El monto supera el saldo pendiente (${formatearMoneda(e.saldo)}).`;
        // Múltiplo de 50, salvo el pago que cierra exactamente el saldo.
        else if (Math.round(monto * 100) !== Math.round(e.saldo * 100) && Math.round(monto * 100) % 5000 !== 0) {
            error = `El monto debe ser múltiplo de 50 (o igual al saldo pendiente, ${formatearMoneda(e.saldo)}).`;
        }
        if (error) {
            errorEl.textContent = error;
            errorEl.hidden = false;
            montoEl.focus();
            return;
        }
        pasoConfirmacion(e, nuevo, monto);
    });
}

/** Paso 2: todo en solo lectura; solo se puede volver atrás o confirmar. */
function pasoConfirmacion(e: EventoPago, borrador: BorradorPago, monto: number): void {
    abrirModal(`
        <h2>Confirmar pago</h2>
        <p class="modal-texto">Revisa los datos antes de registrar el pago. Si algo no es correcto, vuelve atrás para cambiarlo.</p>
        ${resumenEvento(e)}
        <dl class="pago-resumen pago-resumen-monto">
            <div><dt>Monto a registrar</dt><dd><strong>${formatearMoneda(monto)}</strong></dd></div>
            <div><dt>Método de pago</dt><dd>${NOMBRE_METODO[borrador.metodo]}</dd></div>
            <div><dt>Referencia</dt><dd>${borrador.referencia ? esc(borrador.referencia) : '—'}</dd></div>
            <div><dt>Saldo después del pago</dt><dd>${formatearMoneda(Math.max(0, e.saldo - monto))}</dd></div>
        </dl>
        <p class="form-error" id="pagoError" hidden></p>
        <div class="modal-acciones">
            <button type="button" class="btn-secundario" id="pagoVolver"><i class="fa-solid fa-arrow-left"></i> Volver</button>
            <button type="button" class="btn-guardar" id="pagoConfirmar" style="width:auto;">Confirmar pago</button>
        </div>
    `);

    const errorEl = $('pagoError');
    const btnConfirmar = $<HTMLButtonElement>('pagoConfirmar');
    const btnVolver = $<HTMLButtonElement>('pagoVolver');

    btnVolver.addEventListener('click', () => pasoIngreso(e, borrador));
    btnConfirmar.addEventListener('click', async () => {
        btnConfirmar.disabled = true;
        btnVolver.disabled = true;
        btnConfirmar.textContent = 'Registrando...';
        try {
            const json = await api<{ evento: EventoPago }>('POST', '/api/pagos', {
                eventId: e.id,
                monto,
                metodo: borrador.metodo,
                referencia: borrador.referencia || undefined
            });
            cerrarModal();
            avisar(json.evento.saldo <= 0 ? 'Pago registrado: el evento quedó pagado' : 'Pago registrado');
            await cargar();
        } catch (err) {
            errorEl.textContent = (err as Error).message;
            errorEl.hidden = false;
            btnConfirmar.disabled = false;
            btnVolver.disabled = false;
            btnConfirmar.textContent = 'Confirmar pago';
        }
    });
}

// ---------- Eventos de la página ----------
btnAnadirPago.addEventListener('click', pasoSeleccion);

columnasEl.addEventListener('input', ev => {
    const col = (ev.target as HTMLElement).closest<HTMLElement>('[data-columna]');
    actualizarTextosFecha();
    if (col) renderColumna(col.dataset.columna as ClaveColumna);
});

columnasEl.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    const limpiar = t.closest<HTMLElement>('[data-limpiar]');
    if (limpiar) {
        const col = limpiar.closest<HTMLElement>('[data-columna]')!;
        // Limpiar quita la búsqueda y la fecha final; la fecha de inicio vuelve a hoy.
        filtro(col, 'texto').value = '';
        filtro(col, 'desde').value = aISO(new Date());
        filtro(col, 'hasta').value = '';
        actualizarTextosFecha();
        renderColumna(col.dataset.columna as ClaveColumna);
        return;
    }
    const pagar = t.closest<HTMLElement>('[data-pagar]');
    if (pagar) {
        const evento = datos.sinPagar.find(e => e.id === Number(pagar.dataset.pagar));
        if (evento) pasoIngreso(evento, { monto: '', metodo: 'efectivo', referencia: '' });
    }
});

// La ventana solo se cierra con sus botones: así un clic fuera no descarta un pago a medio confirmar.
document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && modal.classList.contains('open') && document.getElementById('pagoCerrar')) cerrarModal();
});

function aISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Rango por defecto de ambas columnas: de hoy al último día del mes actual. */
function filtrosPorDefecto(): void {
    const hoy = new Date();
    const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    columnasEl.querySelectorAll<HTMLElement>('[data-columna]').forEach(col => {
        filtro(col, 'desde').value = aISO(hoy);
        filtro(col, 'hasta').value = aISO(finDeMes);
    });
    actualizarTextosFecha();
}

/**
 * El navegador muestra los <input type="date"> en el formato del sistema (a veces mes/día/año).
 * Encima de cada uno se pinta la fecha como día/mes/año; el calendario nativo sigue funcionando.
 */
function prepararCamposFecha(): void {
    columnasEl.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach(input => {
        const envoltura = document.createElement('span');
        envoltura.className = 'fecha-campo';
        input.replaceWith(envoltura);
        const texto = document.createElement('span');
        texto.className = 'fecha-texto';
        texto.setAttribute('aria-hidden', 'true');
        envoltura.append(input, texto);
        // Como el texto nativo está oculto, un clic en cualquier parte del campo abre el calendario.
        input.addEventListener('click', () => {
            try { input.showPicker(); } catch { /* navegador sin showPicker: abre con el ícono */ }
        });
    });
}

function actualizarTextosFecha(): void {
    columnasEl.querySelectorAll<HTMLInputElement>('.fecha-campo input').forEach(input => {
        const [anio, mes, dia] = input.value.split('-');
        input.nextElementSibling!.textContent = input.value ? `${dia}/${mes}/${anio}` : 'dd/mm/aaaa';
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);
    prepararCamposFecha();
    filtrosPorDefecto();
    await cargar();
});
