// Cotizaciones de la administradora (Maritza): lista de las que llegan del cotizador, y para cada una
// su revisión: corregir datos del cliente y del evento, editar los servicios (desde el catálogo o con
// ítems manuales), comentar y, al final, finalizarla (se convierte en evento en proceso).

import { esc } from './shared/panelShell';
import './style.css';
import './shared/panelRail.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';
import {
    calcularDesdeCatalogo,
    obtenerCatalogo,
    preseleccionarCatalogo,
    renderCatalogoEnContenedor,
    type Catalogo,
    type ItemSeleccionado
} from './shared/catalogoCotizacion';

declare const Swal: any;

// Un elemento adicional: no sale de la bodega, se alquila o se consigue aparte. El proveedor y su costo
// (por unidad) solo los recibe la administradora.
interface ExtraCotizacion {
    tag: string;
    nombre: string;
    descripcion: string;
    cantidad: number;
    precioUnit: number;
    proveedor?: string | null;
    costoProveedor?: number | null;
    nota?: string | null;
}

// Una cotización tal como la devuelve /api/cotizaciones.
interface Cotizacion {
    id: string;
    numeroReferencia: string;
    clienteNombre: string;
    clienteCorreo: string;
    clienteTelefono: string;
    clienteDocumento: string | null;
    tipoEvento: string | null;
    lugar: string | null;
    venueId: number | null;
    venueNombreManual: string | null;
    venueDireccionManual: string | null;
    transportationId: number | null;
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    extras?: ExtraCotizacion[];
    total: number;
    estado: string;
    creadaEn: string;
}

// Una entrada del historial: comentario, edición de servicios o cambio de estado.
interface HistorialEntry {
    id: string;
    tipo: 'comentario' | 'edicion' | 'cambio_estado';
    comentario: string | null;
    estadoAntes: string | null;
    estadoDespues: string | null;
    usuarioNombre: string | null;
    creadoEn: string;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// Cómo se nombra cada estado en pantalla.
const ESTADO_LABEL: Record<string, string> = {
    recibida: 'Recibida',
    en_revision: 'En revisión',
    finalizada: 'Finalizada',
    contrato_enviado: 'Contrato enviado',
    programada: 'Programada',
    cancelada: 'Cancelada'
};

// Estado de la edición: servicios y elementos adicionales que se están editando (todavía sin guardar), la
// cotización abierta, los servicios del editor del catálogo que no calzan con ningún control y el catálogo ya descargado.
let itemsEnEdicion: ItemSeleccionado[] = [];
let extrasEnEdicion: ExtraCotizacion[] = [];
let cotizacionActualId: string | null = null;
let itemsManualesPendientes: ItemSeleccionado[] = [];
let catalogo: Catalogo | null = null;

const listaCotizacionesEl = document.getElementById('listaCotizaciones') as HTMLElement;
const detalleEl = document.getElementById('detalleCotizacion') as HTMLElement;
const editorCatalogoEl = document.getElementById('editorCatalogo') as HTMLElement;
const catalogoContenedorEl = document.getElementById('catalogoContenedor') as HTMLElement;
const ciudadSelect = document.getElementById('inpCiudad') as HTMLSelectElement;
const lugarSelect = document.getElementById('inpLugar') as HTMLSelectElement;
const transporteHintEl = document.getElementById('inpTransporteHint') as HTMLElement;
const lugarOtroWrap = document.getElementById('inpLugarOtroWrap') as HTMLElement;
const lugarOtroNombreInput = document.getElementById('inpLugarOtroNombre') as HTMLInputElement;
const lugarOtroDireccionInput = document.getElementById('inpLugarOtroDireccion') as HTMLInputElement;
// Valor de la opción "Otro (no está en la lista)" del selector de sede.
const OTRO_VALUE = 'otro';

/** Rellena el select de Lugar con las sedes de `ciudad` + la opción "Otro". Si
 *  `ciudad` es null (sede manual sin ciudad conocida, guardada antes de este cambio,
 *  o cotización nueva sin ciudad aún elegida), solo deja disponible "Otro". */
function poblarLugarParaCiudad(ciudad: string | null) {
    lugarSelect.innerHTML = '';

    if (!ciudad) {
        lugarSelect.disabled = false;
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- Sin definir --';
        opt.selected = true;
        lugarSelect.appendChild(opt);
        const optOtro = document.createElement('option');
        optOtro.value = OTRO_VALUE;
        optOtro.textContent = 'Otro (no está en la lista)';
        lugarSelect.appendChild(optOtro);
        return;
    }

    lugarSelect.disabled = false;
    const optVacio = document.createElement('option');
    optVacio.value = '';
    optVacio.textContent = '-- Selecciona Sede --';
    optVacio.selected = true;
    lugarSelect.appendChild(optVacio);

    (catalogo?.venues || []).filter((v) => v.city === ciudad).forEach((v) => {
        const opt = document.createElement('option');
        opt.value = String(v.id);
        opt.textContent = v.name;
        lugarSelect.appendChild(opt);
    });

    const optOtro = document.createElement('option');
    optOtro.value = OTRO_VALUE;
    optOtro.textContent = 'Otro (no está en la lista)';
    lugarSelect.appendChild(optOtro);
}

// El transporte ya no se elige a mano: se resuelve a partir de la ciudad (una fila de
// `transportation` por ciudad en el catálogo), igual que en el cotizador público.
function transportePorCiudad(): { id: number; city: string; price: number } | undefined {
    return catalogo?.transportation.find((t) => t.city === ciudadSelect.value);
}

// Muestra el costo de transporte de la ciudad elegida (o avisa que no tiene).
function actualizarTransporteHint() {
    const transporte = transportePorCiudad();
    transporteHintEl.textContent = !ciudadSelect.value
        ? ''
        : transporte
            ? `Transporte incluido (${transporte.city}): ${formatterCOP.format(transporte.price)}`
            : 'Esta ciudad no tiene costo de transporte registrado.';
}

// Nombre con la cantidad por delante cuando es más de una unidad: "4 x Parlante".
function nombreItem(item: ItemSeleccionado): string {
    return item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre;
}

// Trae las cotizaciones por revisar (recibidas y en revisión).
async function cargarLista() {
    const res = await apiFetch('/api/cotizaciones?estado=recibida,en_revision');
    const cotizaciones = (await res.json()) as Cotizacion[];
    renderLista(cotizaciones);
}

// Dibuja la lista; cada tarjeta abre el detalle de su cotización.
function renderLista(cotizaciones: Cotizacion[]) {
    listaCotizacionesEl.innerHTML = '';

    if (cotizaciones.length === 0) {
        listaCotizacionesEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>No hay cotizaciones pendientes de revisión.</div>`;
        return;
    }

    cotizaciones.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${esc(c.clienteNombre)} <span class="badge">${ESTADO_LABEL[c.estado] || c.estado}</span></h3>
                <p>Ref: ${esc(c.numeroReferencia)} · ${esc(c.tipoEvento || 'Tipo de evento sin definir')} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha definida'}</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${formatterCOP.format(c.total)}</div>
                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(() => abrirDetalle(c.id)));
        listaCotizacionesEl.appendChild(card);
    });
}

// Abre una cotización: datos, servicios editables e historial. Los servicios se copian a
// `itemsEnEdicion` y solo se guardan al pulsar "Guardar cambios".
async function abrirDetalle(id: string) {
    const [resCotizacion, resHistorial] = await Promise.all([
        apiFetch(`/api/cotizaciones/${id}`),
        apiFetch(`/api/cotizaciones/${id}/historial`)
    ]);
    const cotizacion = (await resCotizacion.json()) as Cotizacion;
    const historial = (await resHistorial.json()) as HistorialEntry[];

    cotizacionActualId = cotizacion.id;
    itemsEnEdicion = cotizacion.items.map((i) => ({ ...i }));
    extrasEnEdicion = (cotizacion.extras || []).map((e) => ({ ...e }));

    (document.getElementById('inpClienteNombre') as HTMLInputElement).value = cotizacion.clienteNombre;
    (document.getElementById('inpClienteDocumento') as HTMLInputElement).value = cotizacion.clienteDocumento || '';
    (document.getElementById('inpClienteCorreo') as HTMLInputElement).value = cotizacion.clienteCorreo;
    (document.getElementById('inpClienteTelefono') as HTMLInputElement).value = cotizacion.clienteTelefono;
    (document.getElementById('inpFechaEvento') as HTMLInputElement).value = cotizacion.fechaEvento || '';
    (document.getElementById('inpTipoEvento') as HTMLSelectElement).value = cotizacion.tipoEvento || '';

    lugarOtroNombreInput.value = '';
    lugarOtroDireccionInput.value = '';
    lugarOtroWrap.style.display = 'none';

    if (cotizacion.venueId) {
        const venue = catalogo?.venues.find((v) => v.id === cotizacion.venueId);
        ciudadSelect.value = venue?.city || '';
        poblarLugarParaCiudad(venue?.city || null);
        lugarSelect.value = String(cotizacion.venueId);
    } else if (cotizacion.venueNombreManual) {
        ciudadSelect.value = '';
        poblarLugarParaCiudad(null);
        lugarSelect.value = OTRO_VALUE;
        lugarOtroNombreInput.value = cotizacion.venueNombreManual;
        lugarOtroDireccionInput.value = cotizacion.venueDireccionManual || '';
        lugarOtroWrap.style.display = 'grid';
    } else {
        ciudadSelect.value = '';
        poblarLugarParaCiudad(null);
        lugarSelect.value = '';
    }
    actualizarTransporteHint();

    (document.getElementById('linkVerPdf') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${id}/pdf`);

    renderItemsDetalle();
    renderExtrasDetalle();
    renderHistorial(historial);

    editorCatalogoEl.classList.add('hidden');
    listaCotizacionesEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

// Dibuja los servicios en edición, cada uno con su cantidad y su botón para quitarlo.
function renderItemsDetalle() {
    const cont = document.getElementById('listaItemsDetalle') as HTMLElement;
    cont.innerHTML = '';

    if (itemsEnEdicion.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Sin servicios (se eliminaron todos).</p>';
    }

    itemsEnEdicion.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'detail-row';
        row.innerHTML = `
            <div>
                <div class="detail-row-main"><strong>${esc(nombreItem(item))}</strong></div>
                <div class="detail-row-sub">${esc(item.tag + (item.descripcion ? ' · Incluye: ' + item.descripcion : ''))}</div>
                ${item.nota ? `<div class="detail-row-sub" style="color:var(--orange-main); margin-top:0.3rem;"><i class="fa-solid fa-note-sticky"></i> ${esc(item.nota)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:0.6rem;">
                <div class="detail-row-price">${formatterCOP.format(item.precioUnit * item.cantidad)}</div>
                <button class="btn btn-secondary btn-sm" data-accion="nota" title="${item.nota ? 'Editar nota' : 'Agregar nota'}">
                    <i class="fa-solid fa-note-sticky"></i>
                </button>
                <button class="btn btn-danger btn-sm" data-accion="quitar" title="Quitar servicio">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        row.querySelector('[data-accion="quitar"]')?.addEventListener('click', () => {
            itemsEnEdicion.splice(index, 1);
            renderItemsDetalle();
        });
        row.querySelector('[data-accion="nota"]')?.addEventListener('click', conManejoDeErrores(async () => {
            const { value: nota, isConfirmed } = await Swal.fire({
                title: 'Nota para este servicio',
                input: 'textarea',
                inputValue: item.nota || '',
                inputPlaceholder: 'Ej. El cliente pidió este color/modelo en específico...',
                showCancelButton: true,
                confirmButtonText: 'Guardar nota',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#f97316'
            });
            if (!isConfirmed) return;
            itemsEnEdicion[index] = { ...item, nota: (nota || '').trim() || undefined };
            renderItemsDetalle();
        }));
        cont.appendChild(row);
    });

    actualizarTotalDetalle();
}

// Total que se muestra junto a los botones: servicios del catálogo más elementos adicionales.
function actualizarTotalDetalle() {
    const total = itemsEnEdicion.reduce((acc, i) => acc + i.precioUnit * i.cantidad, 0)
        + extrasEnEdicion.reduce((acc, e) => acc + e.precioUnit * e.cantidad, 0);
    (document.getElementById('totalDetalle') as HTMLElement).textContent = formatterCOP.format(total);
}

// Dibuja los elementos adicionales (los que se consiguen aparte), con su proveedor y su costo, y el resumen
// de lo que cuestan frente a lo que se le cobra al cliente.
function renderExtrasDetalle() {
    const cont = document.getElementById('listaExtrasDetalle') as HTMLElement;
    cont.innerHTML = '';

    if (extrasEnEdicion.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Sin elementos adicionales.</p>';
    }

    extrasEnEdicion.forEach((extra, index) => {
        const row = document.createElement('div');
        row.className = 'detail-row';
        const conCosto = typeof extra.costoProveedor === 'number';
        const partesProveedor = [
            extra.proveedor ? 'Proveedor: ' + extra.proveedor : '',
            conCosto ? 'Costo: ' + formatterCOP.format(extra.costoProveedor as number) + ' c/u' : ''
        ].filter(Boolean).join(' · ');
        row.innerHTML = `
            <div>
                <div class="detail-row-main"><strong>${esc(extra.cantidad > 1 ? extra.cantidad + ' x ' + extra.nombre : extra.nombre)}</strong>
                    <span class="badge">Se consigue aparte</span></div>
                <div class="detail-row-sub">${esc(extra.tag + (extra.descripcion ? ' · Incluye: ' + extra.descripcion : ''))}</div>
                ${partesProveedor ? `<div class="detail-row-sub">${esc(partesProveedor)}</div>` : ''}
                ${extra.nota ? `<div class="detail-row-sub" style="color:var(--orange-main); margin-top:0.3rem;"><i class="fa-solid fa-note-sticky"></i> ${esc(extra.nota)}</div>` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:0.6rem;">
                <div class="detail-row-price">${formatterCOP.format(extra.precioUnit * extra.cantidad)}</div>
                <button class="btn btn-secondary btn-sm" data-accion="editar" title="Editar elemento">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-danger btn-sm" data-accion="quitar" title="Quitar elemento">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        row.querySelector('[data-accion="quitar"]')?.addEventListener('click', () => {
            extrasEnEdicion.splice(index, 1);
            renderExtrasDetalle();
        });
        row.querySelector('[data-accion="editar"]')?.addEventListener('click', conManejoDeErrores(async () => {
            const editado = await pedirExtra(extra);
            if (!editado) return;
            extrasEnEdicion[index] = editado;
            renderExtrasDetalle();
        }));
        cont.appendChild(row);
    });

    // Resumen para la administradora: cuánto cuesta conseguirlo y cuánto queda sobre lo cobrado.
    const resumenEl = document.getElementById('resumenExtras') as HTMLElement;
    const conCosto = extrasEnEdicion.filter((e) => typeof e.costoProveedor === 'number');
    if (conCosto.length === 0) {
        resumenEl.textContent = '';
    } else {
        const cobrado = conCosto.reduce((acc, e) => acc + e.precioUnit * e.cantidad, 0);
        const costo = conCosto.reduce((acc, e) => acc + (e.costoProveedor as number) * e.cantidad, 0);
        const sufijo = conCosto.length < extrasEnEdicion.length ? ' (solo los que tienen costo)' : '';
        resumenEl.textContent = `Cobrado: ${formatterCOP.format(cobrado)} · Costo de proveedores: ${formatterCOP.format(costo)} · Queda: ${formatterCOP.format(cobrado - costo)}${sufijo}`;
    }

    actualizarTotalDetalle();
}

// Ventana para crear (sin elemento) o editar un elemento adicional. Devuelve null si se cancela.
async function pedirExtra(actual?: ExtraCotizacion): Promise<ExtraCotizacion | null> {
    const { value } = await Swal.fire({
        title: actual ? 'Editar elemento adicional' : 'Agregar elemento adicional',
        confirmButtonColor: '#f97316',
        showCancelButton: true,
        confirmButtonText: actual ? 'Guardar' : 'Agregar',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        width: '42rem',
        html: `
            <style>
                .extra-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem 1rem; text-align: left; }
                .extra-form .completo { grid-column: 1 / -1; }
                .extra-form label { display: block; margin-bottom: 0.3rem; font-size: 0.8rem; font-weight: 600; color: #475569; }
                .extra-form input { width: 100%; box-sizing: border-box; margin: 0; padding: 0.6rem 0.75rem; font: inherit; font-size: 0.95rem; border: 1px solid #cbd5e1; border-radius: 10px; background: #fff; color: #0f172a; }
                .extra-form input:focus { outline: 2px solid #f97316; outline-offset: 0; border-color: #f97316; }
                .extra-form small { display: block; margin-top: 0.25rem; font-size: 0.75rem; color: #64748b; }
                @media (max-width: 560px) { .extra-form { grid-template-columns: 1fr; } }
            </style>
            <div class="extra-form">
                <div class="completo">
                    <label for="swalExtraNombre">Nombre del elemento</label>
                    <input id="swalExtraNombre" placeholder="Ej. Planta eléctrica 20 kVA" maxlength="150" value="${esc(actual?.nombre || '')}">
                </div>
                <div>
                    <label for="swalExtraTag">Categoría (opcional)</label>
                    <input id="swalExtraTag" placeholder="Ej. ENERGÍA" maxlength="100" value="${esc(actual && actual.tag !== 'ELEMENTO ADICIONAL' ? actual.tag : '')}">
                </div>
                <div>
                    <label for="swalExtraCantidad">Cantidad</label>
                    <input id="swalExtraCantidad" type="number" min="1" step="1" value="${actual ? actual.cantidad : 1}">
                </div>
                <div class="completo">
                    <label for="swalExtraDescripcion">Incluye / descripción (opcional)</label>
                    <input id="swalExtraDescripcion" placeholder="Ej. Con operario y combustible" maxlength="1000" value="${esc(actual?.descripcion || '')}">
                </div>
                <div class="completo">
                    <label for="swalExtraPrecio">Precio por unidad al cliente (COP)</label>
                    <input id="swalExtraPrecio" type="number" min="0" step="any" placeholder="Ej. 800000" value="${actual ? actual.precioUnit : ''}">
                    <small>Es lo que se le cobra al cliente: suma al total y sale en el PDF.</small>
                </div>
                <div>
                    <label for="swalExtraProveedor">Proveedor (opcional)</label>
                    <input id="swalExtraProveedor" placeholder="Quién lo alquila o vende" maxlength="150" value="${esc(actual?.proveedor || '')}">
                </div>
                <div>
                    <label for="swalExtraCosto">Costo por unidad del proveedor (opcional)</label>
                    <input id="swalExtraCosto" type="number" min="0" step="any" placeholder="Ej. 500000" value="${typeof actual?.costoProveedor === 'number' ? actual.costoProveedor : ''}">
                </div>
                <small class="completo" style="margin-top: -0.4rem;">El proveedor y su costo son internos: solo los ves tú, no salen en el PDF ni los ve el cliente.</small>
                <div class="completo">
                    <label for="swalExtraNota">Nota (opcional)</label>
                    <input id="swalExtraNota" placeholder="Ej. Llega el día anterior al evento" maxlength="1000" value="${esc(actual?.nota || '')}">
                </div>
            </div>
        `,
        preConfirm: () => {
            const campo = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim();
            const nombre = campo('swalExtraNombre');
            const cantidad = Number(campo('swalExtraCantidad'));
            const precio = Number(campo('swalExtraPrecio'));
            const costoTexto = campo('swalExtraCosto');
            const costo = costoTexto === '' ? null : Number(costoTexto);
            if (!nombre) { Swal.showValidationMessage('Indica el nombre del elemento'); return false; }
            if (!Number.isInteger(cantidad) || cantidad <= 0) { Swal.showValidationMessage('La cantidad debe ser un número entero mayor a 0'); return false; }
            if (!Number.isFinite(precio) || precio <= 0) { Swal.showValidationMessage('Indica un precio por unidad mayor a 0'); return false; }
            if (costo !== null && (!Number.isFinite(costo) || costo < 0)) { Swal.showValidationMessage('El costo del proveedor no es válido'); return false; }
            return {
                tag: campo('swalExtraTag') || 'ELEMENTO ADICIONAL',
                nombre,
                descripcion: campo('swalExtraDescripcion'),
                cantidad,
                precioUnit: precio,
                proveedor: campo('swalExtraProveedor') || null,
                costoProveedor: costo,
                nota: campo('swalExtraNota') || null
            } as ExtraCotizacion;
        }
    });
    return value || null;
}

// Dibuja el historial de la cotización (del más antiguo al más nuevo).
function renderHistorial(historial: HistorialEntry[]) {
    const cont = document.getElementById('listaHistorial') as HTMLElement;
    cont.innerHTML = '';

    if (historial.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Todavía no hay comentarios ni cambios registrados.</p>';
        return;
    }

    historial.forEach((h) => {
        const fecha = new Date(h.creadoEn).toLocaleString('es-CO');
        let texto = '';
        if (h.tipo === 'comentario') texto = h.comentario || '';
        else if (h.tipo === 'edicion') texto = 'Se editaron los servicios de la cotización.';
        else texto = `Cambio de estado: ${ESTADO_LABEL[h.estadoAntes || ''] || h.estadoAntes} → ${ESTADO_LABEL[h.estadoDespues || ''] || h.estadoDespues}`;

        const div = document.createElement('div');
        div.className = 'comment-item';
        div.innerHTML = `
            <div class="comment-meta">${esc(h.usuarioNombre || 'Sistema')} · ${fecha}</div>
            <div>${esc(texto)}</div>
        `;
        cont.appendChild(div);
    });
}

// Vuelve del detalle a la lista y la recarga.
function volverALista() {
    cotizacionActualId = null;
    detalleEl.classList.add('hidden');
    listaCotizacionesEl.classList.remove('hidden');
    cargarLista();
}

// Recalcula el total mientras se eligen servicios en el editor del catálogo.
function actualizarTotalCatalogo() {
    const { total } = calcularDesdeCatalogo(catalogoContenedorEl);
    (document.getElementById('catalogoTotal') as HTMLElement).textContent = formatterCOP.format(total);
}

// Abre el editor del catálogo (el mismo formulario del cotizador) con lo ya elegido premarcado.
async function abrirEditorCatalogo() {
    if (!catalogo) catalogo = await obtenerCatalogo();
    renderCatalogoEnContenedor(catalogoContenedorEl, catalogo);

    // Pre-marca el catálogo con lo ya seleccionado; lo que no calce con ningún control
    // (ítems manuales añadidos aparte) se conserva para no perderlo al aplicar.
    itemsManualesPendientes = preseleccionarCatalogo(catalogoContenedorEl, itemsEnEdicion);

    actualizarTotalCatalogo();
    catalogoContenedorEl.addEventListener('input', actualizarTotalCatalogo);
    catalogoContenedorEl.addEventListener('change', actualizarTotalCatalogo);

    otrasSeccionesDetalle().forEach((el) => el.classList.add('hidden'));
    editorCatalogoEl.classList.remove('hidden');
}

// Cierra el editor del catálogo y vuelve a mostrar el resto del detalle.
function cerrarEditorCatalogo() {
    editorCatalogoEl.classList.add('hidden');
    otrasSeccionesDetalle().forEach((el) => el.classList.remove('hidden'));
}

// Secciones del detalle que se ocultan mientras el editor del catálogo está abierto.
function otrasSeccionesDetalle(): HTMLElement[] {
    return Array.from(detalleEl.querySelectorAll<HTMLElement>(':scope > .detail-section'))
        .filter((el) => el !== editorCatalogoEl);
}

// Arranque: exige sesión de administradora, carga el catálogo (para las sedes y el transporte) y conecta
// cada botón del detalle.
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);

    catalogo = await obtenerCatalogo();

    const ciudades = Array.from(new Set([
        ...catalogo.venues.map((v) => v.city).filter((c): c is string => !!c),
        ...catalogo.transportation.map((t) => t.city)
    ]));
    ciudades.forEach((ciudad) => {
        const opt = document.createElement('option');
        opt.value = ciudad;
        opt.textContent = ciudad;
        ciudadSelect.appendChild(opt);
    });

    ciudadSelect.addEventListener('change', () => {
        poblarLugarParaCiudad(ciudadSelect.value || null);
        lugarOtroWrap.style.display = 'none';
        actualizarTransporteHint();
    });
    lugarSelect.addEventListener('change', () => {
        lugarOtroWrap.style.display = lugarSelect.value === OTRO_VALUE ? 'grid' : 'none';
    });

    document.getElementById('btnVolverLista')?.addEventListener('click', conManejoDeErrores(async () => volverALista()));

    // Guarda los datos del cliente y del evento: nombre, contacto, tipo, sede, ciudad y fecha.
    document.getElementById('btnGuardarDatos')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActualId) return;
        const esLugarManual = lugarSelect.value === OTRO_VALUE;
        const res = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/datos`, {
            method: 'PUT',
            body: JSON.stringify({
                clienteNombre: (document.getElementById('inpClienteNombre') as HTMLInputElement).value.trim(),
                clienteDocumento: (document.getElementById('inpClienteDocumento') as HTMLInputElement).value.trim(),
                clienteCorreo: (document.getElementById('inpClienteCorreo') as HTMLInputElement).value.trim(),
                clienteTelefono: (document.getElementById('inpClienteTelefono') as HTMLInputElement).value.trim(),
                tipoEvento: (document.getElementById('inpTipoEvento') as HTMLSelectElement).value || undefined,
                venueId: (lugarSelect.value && !esLugarManual) ? Number(lugarSelect.value) : undefined,
                venueNombreManual: esLugarManual ? lugarOtroNombreInput.value.trim() : undefined,
                venueDireccionManual: esLugarManual ? lugarOtroDireccionInput.value.trim() : undefined,
                transportationId: transportePorCiudad()?.id ?? null,
                fechaEvento: (document.getElementById('inpFechaEvento') as HTMLInputElement).value || undefined
            })
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Datos guardados', confirmButtonColor: '#f97316', timer: 1400, showConfirmButton: false });
        } else {
            const datos = await res.json();
            Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: datos.message, confirmButtonColor: '#f97316' });
        }
    }));

    // Guarda los servicios y los elementos adicionales editados; el total lo recalcula el servidor.
    document.getElementById('btnGuardarItems')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActualId) return;
        const res = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/items`, {
            method: 'PUT',
            body: JSON.stringify({ items: itemsEnEdicion, extras: extrasEnEdicion })
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Servicios actualizados', confirmButtonColor: '#f97316', timer: 1400, showConfirmButton: false });
        } else {
            const datos = await res.json();
            Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: datos.message, confirmButtonColor: '#f97316' });
        }
    }));

    // Agrega un elemento adicional (se consigue aparte): queda en la lista y se guarda con "Guardar cambios".
    document.getElementById('btnAgregarExtra')?.addEventListener('click', conManejoDeErrores(async () => {
        const nuevo = await pedirExtra();
        if (!nuevo) return;
        extrasEnEdicion.push(nuevo);
        renderExtrasDetalle();
    }));

    document.getElementById('btnAbrirCatalogo')?.addEventListener('click', conManejoDeErrores(abrirEditorCatalogo));

    document.getElementById('btnCancelarCatalogo')?.addEventListener('click', cerrarEditorCatalogo);

    // Pasa lo elegido en el editor del catálogo a la lista de servicios en edición (sin guardar todavía).
    document.getElementById('btnAplicarCatalogo')?.addEventListener('click', conManejoDeErrores(async () => {
        const { itemsSeleccionados } = calcularDesdeCatalogo(catalogoContenedorEl);
        itemsEnEdicion = [...itemsSeleccionados, ...itemsManualesPendientes];
        renderItemsDetalle();
        cerrarEditorCatalogo();
        Swal.fire({ icon: 'info', title: 'Cambios aplicados', text: 'Recuerda hacer clic en "Guardar cambios" para confirmarlos.', confirmButtonColor: '#f97316', timer: 2200, showConfirmButton: false });
    }));

    // Agrega un comentario interno al historial.
    document.getElementById('btnAgregarComentario')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActualId) return;
        const input = document.getElementById('inpComentario') as HTMLInputElement;
        const comentario = input.value.trim();
        if (!comentario) return;

        const res = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/comentarios`, {
            method: 'POST',
            body: JSON.stringify({ comentario })
        });
        if (res.ok) {
            input.value = '';
            const resHistorial = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/historial`);
            renderHistorial(await resHistorial.json());
        } else {
            const datos = await res.json();
            Swal.fire({ icon: 'error', title: 'No se pudo comentar', text: datos.message, confirmButtonColor: '#f97316' });
        }
    }));

    // Finaliza la cotización tras pedir confirmación: se crea el evento y deja de poder editarse desde aquí.
    document.getElementById('btnFinalizar')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActualId) return;

        const confirmacion = await Swal.fire({
            icon: 'question',
            title: '¿Exportar cotización final?',
            text: 'Pasará a "Eventos en proceso" y ya no podrás editar los servicios desde aquí.',
            showCancelButton: true,
            confirmButtonText: 'Sí, exportar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#f97316'
        });
        if (!confirmacion.isConfirmed) return;

        const res = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/finalizar`, { method: 'POST' });
        const datos = await res.json();

        if (!res.ok) {
            Swal.fire({ icon: 'error', title: 'No se pudo finalizar', text: datos.message, confirmButtonColor: '#f97316' });
            return;
        }

        await Swal.fire({ icon: 'success', title: 'Cotización finalizada', text: 'Ahora está disponible en "Eventos en proceso".', confirmButtonColor: '#f97316' });
        volverALista();
    }));

    await cargarLista();
});
