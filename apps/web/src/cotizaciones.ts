import './style.css';
import './landing.css';
import './shared/panel.css';
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
    transportationId: number | null;
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    total: number;
    estado: string;
    creadaEn: string;
}

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

const ESTADO_LABEL: Record<string, string> = {
    recibida: 'Recibida',
    en_revision: 'En revisión',
    finalizada: 'Finalizada',
    contrato_enviado: 'Contrato enviado',
    programada: 'Programada',
    cancelada: 'Cancelada'
};

let itemsEnEdicion: ItemSeleccionado[] = [];
let cotizacionActualId: string | null = null;
let itemsManualesPendientes: ItemSeleccionado[] = [];
let catalogo: Catalogo | null = null;

const listaCotizacionesEl = document.getElementById('listaCotizaciones') as HTMLElement;
const detalleEl = document.getElementById('detalleCotizacion') as HTMLElement;
const editorCatalogoEl = document.getElementById('editorCatalogo') as HTMLElement;
const catalogoContenedorEl = document.getElementById('catalogoContenedor') as HTMLElement;
const lugarSelect = document.getElementById('inpLugar') as HTMLSelectElement;
const transporteSelect = document.getElementById('inpTransporte') as HTMLSelectElement;

function nombreItem(item: ItemSeleccionado): string {
    return item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre;
}

async function cargarLista() {
    const res = await apiFetch('/api/cotizaciones?estado=recibida,en_revision');
    const cotizaciones = (await res.json()) as Cotizacion[];
    renderLista(cotizaciones);
}

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
                <h3>${c.clienteNombre} <span class="badge">${ESTADO_LABEL[c.estado] || c.estado}</span></h3>
                <p>Ref: ${c.numeroReferencia} · ${c.tipoEvento || 'Tipo de evento sin definir'} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha definida'}</p>
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

async function abrirDetalle(id: string) {
    const [resCotizacion, resHistorial] = await Promise.all([
        apiFetch(`/api/cotizaciones/${id}`),
        apiFetch(`/api/cotizaciones/${id}/historial`)
    ]);
    const cotizacion = (await resCotizacion.json()) as Cotizacion;
    const historial = (await resHistorial.json()) as HistorialEntry[];

    cotizacionActualId = cotizacion.id;
    itemsEnEdicion = cotizacion.items.map((i) => ({ ...i }));

    (document.getElementById('inpClienteNombre') as HTMLInputElement).value = cotizacion.clienteNombre;
    (document.getElementById('inpClienteDocumento') as HTMLInputElement).value = cotizacion.clienteDocumento || '';
    (document.getElementById('inpClienteCorreo') as HTMLInputElement).value = cotizacion.clienteCorreo;
    (document.getElementById('inpClienteTelefono') as HTMLInputElement).value = cotizacion.clienteTelefono;
    (document.getElementById('inpFechaEvento') as HTMLInputElement).value = cotizacion.fechaEvento || '';
    (document.getElementById('inpTipoEvento') as HTMLSelectElement).value = cotizacion.tipoEvento || '';
    lugarSelect.value = cotizacion.venueId ? String(cotizacion.venueId) : '';
    transporteSelect.value = cotizacion.transportationId ? String(cotizacion.transportationId) : '';

    (document.getElementById('linkVerPdf') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${id}/pdf`);

    renderItemsDetalle();
    renderHistorial(historial);

    editorCatalogoEl.classList.add('hidden');
    listaCotizacionesEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

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
                <div class="detail-row-main"><strong>${nombreItem(item)}</strong></div>
                <div class="detail-row-sub">${item.tag}${item.descripcion ? ' · Incluye: ' + item.descripcion : ''}</div>
                ${item.nota ? `<div class="detail-row-sub" style="color:var(--orange-main); margin-top:0.3rem;"><i class="fa-solid fa-note-sticky"></i> ${item.nota}</div>` : ''}
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

    const total = itemsEnEdicion.reduce((acc, i) => acc + i.precioUnit * i.cantidad, 0);
    (document.getElementById('totalDetalle') as HTMLElement).textContent = formatterCOP.format(total);
}

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
            <div class="comment-meta">${h.usuarioNombre || 'Sistema'} · ${fecha}</div>
            <div>${texto}</div>
        `;
        cont.appendChild(div);
    });
}

function volverALista() {
    cotizacionActualId = null;
    detalleEl.classList.add('hidden');
    listaCotizacionesEl.classList.remove('hidden');
    cargarLista();
}

function actualizarTotalCatalogo() {
    const { total } = calcularDesdeCatalogo(catalogoContenedorEl);
    (document.getElementById('catalogoTotal') as HTMLElement).textContent = formatterCOP.format(total);
}

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

function cerrarEditorCatalogo() {
    editorCatalogoEl.classList.add('hidden');
    otrasSeccionesDetalle().forEach((el) => el.classList.remove('hidden'));
}

function otrasSeccionesDetalle(): HTMLElement[] {
    return Array.from(detalleEl.querySelectorAll<HTMLElement>(':scope > .detail-section'))
        .filter((el) => el !== editorCatalogoEl);
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);

    catalogo = await obtenerCatalogo();
    catalogo.venues.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = String(v.id);
        opt.textContent = v.name;
        lugarSelect.appendChild(opt);
    });
    catalogo.transportation.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = String(t.id);
        opt.textContent = `${t.city} — ${formatterCOP.format(t.price)}`;
        transporteSelect.appendChild(opt);
    });

    document.getElementById('btnVolverLista')?.addEventListener('click', conManejoDeErrores(async () => volverALista()));

    document.getElementById('btnGuardarDatos')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActualId) return;
        const res = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/datos`, {
            method: 'PUT',
            body: JSON.stringify({
                clienteNombre: (document.getElementById('inpClienteNombre') as HTMLInputElement).value.trim(),
                clienteDocumento: (document.getElementById('inpClienteDocumento') as HTMLInputElement).value.trim(),
                clienteCorreo: (document.getElementById('inpClienteCorreo') as HTMLInputElement).value.trim(),
                clienteTelefono: (document.getElementById('inpClienteTelefono') as HTMLInputElement).value.trim(),
                tipoEvento: (document.getElementById('inpTipoEvento') as HTMLSelectElement).value || undefined,
                venueId: lugarSelect.value ? Number(lugarSelect.value) : undefined,
                transportationId: transporteSelect.value ? Number(transporteSelect.value) : undefined,
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

    document.getElementById('btnGuardarItems')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActualId) return;
        const res = await apiFetch(`/api/cotizaciones/${cotizacionActualId}/items`, {
            method: 'PUT',
            body: JSON.stringify({ items: itemsEnEdicion })
        });
        if (res.ok) {
            Swal.fire({ icon: 'success', title: 'Servicios actualizados', confirmButtonColor: '#f97316', timer: 1400, showConfirmButton: false });
        } else {
            const datos = await res.json();
            Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: datos.message, confirmButtonColor: '#f97316' });
        }
    }));

    document.getElementById('btnAgregarManual')?.addEventListener('click', conManejoDeErrores(async () => {
        const { value: datos } = await Swal.fire({
            title: 'Agregar servicio manual',
            confirmButtonColor: '#f97316',
            showCancelButton: true,
            confirmButtonText: 'Agregar',
            cancelButtonText: 'Cancelar',
            focusConfirm: false,
            html: `
                <input id="swalTag" class="swal2-input" placeholder="Categoría (ej. EFECTO ESPECIAL FX)">
                <input id="swalNombre" class="swal2-input" placeholder="Nombre del servicio">
                <input id="swalDescripcion" class="swal2-input" placeholder="Incluye / descripción (opcional)">
                <input id="swalPrecio" type="number" class="swal2-input" placeholder="Precio en COP">
            `,
            preConfirm: () => {
                const tag = (document.getElementById('swalTag') as HTMLInputElement).value.trim();
                const nombre = (document.getElementById('swalNombre') as HTMLInputElement).value.trim();
                const precio = Number((document.getElementById('swalPrecio') as HTMLInputElement).value) || 0;
                if (!nombre || precio <= 0) {
                    Swal.showValidationMessage('Indica un nombre y un precio mayor a 0');
                    return false;
                }
                return {
                    tag,
                    nombre,
                    descripcion: (document.getElementById('swalDescripcion') as HTMLInputElement).value.trim(),
                    precio
                };
            }
        });
        if (!datos) return;

        const res = await apiFetch('/api/catalogo/manual', { method: 'POST', body: JSON.stringify(datos) });
        if (!res.ok) {
            const error = await res.json();
            Swal.fire({ icon: 'error', title: 'No se pudo crear el ítem', text: error.message, confirmButtonColor: '#f97316' });
            return;
        }
        const creado = await res.json() as { variantId: number; tag: string; nombre: string; descripcion: string; precioUnit: number };
        itemsEnEdicion.push({ variantId: creado.variantId, cantidad: 1, tag: creado.tag, nombre: creado.nombre, descripcion: creado.descripcion, precioUnit: creado.precioUnit });
        renderItemsDetalle();
    }));

    document.getElementById('btnAbrirCatalogo')?.addEventListener('click', conManejoDeErrores(abrirEditorCatalogo));

    document.getElementById('btnCancelarCatalogo')?.addEventListener('click', cerrarEditorCatalogo);

    document.getElementById('btnAplicarCatalogo')?.addEventListener('click', conManejoDeErrores(async () => {
        const { itemsSeleccionados } = calcularDesdeCatalogo(catalogoContenedorEl);
        itemsEnEdicion = [...itemsSeleccionados, ...itemsManualesPendientes];
        renderItemsDetalle();
        cerrarEditorCatalogo();
        Swal.fire({ icon: 'info', title: 'Cambios aplicados', text: 'Recuerda hacer clic en "Guardar cambios" para confirmarlos.', confirmButtonColor: '#f97316', timer: 2200, showConfirmButton: false });
    }));

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
