// Eventos en proceso de la administradora (Maritza): cotizaciones ya finalizadas que esperan el
// contrato firmado. Desde aquí completa el documento y la fecha, comenta, sube el contrato firmado y,
// cuando está listo, oficializa el evento (pasa a "Eventos programados" y a logística).
// El contrato lo genera y envía Mariana desde su propio panel; aquí solo se ve su estado.

import { esc } from './shared/panelShell';
import './style.css';
import './shared/panelRail.css';
import { apiFetch, apiUrl, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

declare const Swal: any;

// Un servicio de la cotización.
interface ItemSeleccionado {
    variantId: number;
    cantidad: number;
    tag: string;
    nombre: string;
    descripcion: string;
    precioUnit: number;
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
    fechaEvento: string | null;
    items: ItemSeleccionado[];
    total: number;
    estado: string;
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

// Estado del contrato que devuelve /api/contratos/:id.
interface ContratoInfo {
    enviadoEn: string | null;
    firmadoSubidoEn: string | null;
    tieneFirmado: boolean;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// La cotización abierta en el detalle (null cuando se ve la lista).
let cotizacionActual: Cotizacion | null = null;

const listaEl = document.getElementById('listaEventos') as HTMLElement;
const detalleEl = document.getElementById('detalleEvento') as HTMLElement;

// Trae las cotizaciones finalizadas o con contrato enviado (las que aún no son definitivas).
async function cargarLista() {
    const res = await apiFetch('/api/cotizaciones?estado=finalizada,contrato_enviado');
    const cotizaciones = (await res.json()) as Cotizacion[];
    renderLista(cotizaciones);
}

// Dibuja la lista; cada tarjeta indica si falta enviar el contrato o si ya se envió.
function renderLista(cotizaciones: Cotizacion[]) {
    listaEl.innerHTML = '';
    if (cotizaciones.length === 0) {
        listaEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-truck-ramp-box" style="font-size:1.5rem; margin-bottom:0.75rem; display:block;"></i>No hay eventos en proceso por ahora.</div>`;
        return;
    }

    cotizaciones.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${esc(c.clienteNombre)} <span class="badge">${c.estado === 'finalizada' ? 'Sin contrato enviado' : 'Contrato enviado'}</span></h3>
                <p>Ref: ${esc(c.numeroReferencia)} · ${esc(c.tipoEvento || 'Tipo de evento sin definir')} · ${c.fechaEvento ? new Date(c.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin fecha'}</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${formatterCOP.format(c.total)}</div>
                <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);"></i>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(() => abrirDetalle(c.id)));
        listaEl.appendChild(card);
    });
}

// Abre una cotización: datos, servicios, estado del contrato e historial.
async function abrirDetalle(id: string) {
    const [resCot, resHist, resContrato] = await Promise.all([
        apiFetch(`/api/cotizaciones/${id}`),
        apiFetch(`/api/cotizaciones/${id}/historial`),
        apiFetch(`/api/contratos/${id}`)
    ]);
    const cotizacion = (await resCot.json()) as Cotizacion;
    const historial = (await resHist.json()) as HistorialEntry[];
    const contrato = (await resContrato.json()) as ContratoInfo;

    cotizacionActual = cotizacion;

    document.getElementById('resumenCliente')!.innerHTML = `
        <div class="detail-row"><div class="detail-row-main"><strong>Cliente:</strong> ${esc(cotizacion.clienteNombre)} ${cotizacion.clienteDocumento ? esc('(CC ' + cotizacion.clienteDocumento + ')') : ''}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Correo:</strong> ${esc(cotizacion.clienteCorreo)} &nbsp;·&nbsp; <strong>Teléfono:</strong> ${esc(cotizacion.clienteTelefono)}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Evento:</strong> ${esc(cotizacion.tipoEvento || 'N/A')} · ${esc(cotizacion.lugar || 'N/A')}</div></div>
        <div class="detail-row"><div class="detail-row-main"><strong>Fecha del evento:</strong> ${cotizacion.fechaEvento ? new Date(cotizacion.fechaEvento + 'T00:00:00').toLocaleDateString('es-CO') : 'Sin definir'}</div></div>
    `;
    (document.getElementById('inpClienteDocumento') as HTMLInputElement).value = cotizacion.clienteDocumento || '';
    (document.getElementById('inpFechaEvento') as HTMLInputElement).value = cotizacion.fechaEvento || '';

    const itemsCont = document.getElementById('listaItemsDetalle')!;
    itemsCont.innerHTML = cotizacion.items.map((item) => `
        <div class="detail-row">
            <div>
                <div class="detail-row-main"><strong>${esc(item.cantidad > 1 ? `${item.cantidad} x ${item.nombre}` : item.nombre)}</strong></div>
                <div class="detail-row-sub">${esc(item.tag + (item.descripcion ? ' · Incluye: ' + item.descripcion : ''))}</div>
                ${item.nota ? `<div class="detail-row-sub" style="color:var(--orange-main); margin-top:0.3rem;"><i class="fa-solid fa-note-sticky"></i> ${esc(item.nota)}</div>` : ''}
            </div>
            <div class="detail-row-price">${formatterCOP.format(item.precioUnit * item.cantidad)}</div>
        </div>
    `).join('');
    document.getElementById('totalDetalle')!.textContent = formatterCOP.format(cotizacion.total);
    (document.getElementById('linkVerPdfCotizacion') as HTMLAnchorElement).href = apiUrl(`/api/cotizaciones/${id}/pdf`);

    renderHistorial(historial);
    renderContrato(cotizacion, contrato);

    listaEl.classList.add('hidden');
    detalleEl.classList.remove('hidden');
}

// Pinta el estado del contrato y muestra solo lo que corresponde: aviso si falta enviarlo, subir el
// firmado si ya se envió, y el botón de oficializar cuando el firmado ya está subido.
function renderContrato(cotizacion: Cotizacion, contrato: ContratoInfo) {
    const estadoEl = document.getElementById('estadoContrato')!;
    const bloqueSubir = document.getElementById('bloqueSubirFirmado')!;
    const btnMarcarDefinitivo = document.getElementById('btnMarcarDefinitivo') as HTMLButtonElement;
    const linkContratoGenerado = document.getElementById('linkVerContratoGenerado') as HTMLAnchorElement;

    bloqueSubir.classList.add('hidden');
    btnMarcarDefinitivo.classList.add('hidden');

    // Generar y enviar el contrato es responsabilidad exclusiva de Mariana (secretaria) —
    // Maritza solo ve aquí el estado y, una vez enviado, sube el firmado y oficializa.
    if (!contrato.enviadoEn) {
        estadoEl.innerHTML = '<i class="fa-solid fa-circle-exclamation" style="color:var(--orange-main);"></i> El contrato todavía no se ha generado ni enviado al cliente.';
        if (!cotizacion.clienteDocumento || !cotizacion.fechaEvento) {
            estadoEl.innerHTML += `<br><span style="color:#b42318; font-size:0.85rem;">Falta ${!cotizacion.clienteDocumento ? 'el documento del cliente' : ''}${!cotizacion.clienteDocumento && !cotizacion.fechaEvento ? ' y ' : ''}${!cotizacion.fechaEvento ? 'la fecha del evento' : ''} — completalo arriba, en "Datos del cliente y el evento", y guarda los cambios.</span>`;
        } else {
            estadoEl.innerHTML += '<br><span style="font-size:0.85rem;">Ya puede enviarse: pídele a Mariana que lo genere y lo envíe desde su panel de "Cotizaciones definitivas".</span>';
        }
        return;
    }

    const fechaEnviado = new Date(contrato.enviadoEn).toLocaleString('es-CO');
    linkContratoGenerado.href = apiUrl(`/api/contratos/${cotizacion.id}/pdf`);
    bloqueSubir.classList.remove('hidden');

    if (contrato.tieneFirmado) {
        const fechaFirmado = contrato.firmadoSubidoEn ? new Date(contrato.firmadoSubidoEn).toLocaleString('es-CO') : '';
        estadoEl.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--emerald-green);"></i> Contrato enviado el ${fechaEnviado}. Firmado subido el ${fechaFirmado}.`;
        btnMarcarDefinitivo.classList.remove('hidden');
    } else {
        estadoEl.innerHTML = `<i class="fa-solid fa-paper-plane" style="color:var(--orange-main);"></i> Contrato enviado al cliente el ${fechaEnviado}. Sube el contrato firmado cuando lo recibas.`;
    }
}

// Dibuja el historial de la cotización (del más antiguo al más nuevo).
function renderHistorial(historial: HistorialEntry[]) {
    const ESTADO_LABEL: Record<string, string> = {
        recibida: 'Recibida', en_revision: 'En revisión', finalizada: 'Finalizada',
        contrato_enviado: 'Contrato enviado', programada: 'Programada', cancelada: 'Cancelada'
    };
    const cont = document.getElementById('listaHistorial')!;
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
        div.innerHTML = `<div class="comment-meta">${esc(h.usuarioNombre || 'Sistema')} · ${fecha}</div><div>${esc(texto)}</div>`;
        cont.appendChild(div);
    });
}

// Vuelve del detalle a la lista y la recarga.
function volverALista() {
    cotizacionActual = null;
    detalleEl.classList.add('hidden');
    listaEl.classList.remove('hidden');
    cargarLista();
}

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);

    document.getElementById('btnVolverLista')?.addEventListener('click', conManejoDeErrores(async () => volverALista()));

    // Guarda el documento del cliente y la fecha del evento, que se necesitan para generar el contrato.
    document.getElementById('btnGuardarDatos')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActual) return;
        const res = await apiFetch(`/api/cotizaciones/${cotizacionActual.id}/datos`, {
            method: 'PUT',
            body: JSON.stringify({
                clienteDocumento: (document.getElementById('inpClienteDocumento') as HTMLInputElement).value.trim(),
                fechaEvento: (document.getElementById('inpFechaEvento') as HTMLInputElement).value || undefined
            })
        });
        if (!res.ok) {
            const datos = await res.json();
            Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: datos.message, confirmButtonColor: '#f97316' });
            return;
        }
        Swal.fire({ icon: 'success', title: 'Datos guardados', confirmButtonColor: '#f97316', timer: 1400, showConfirmButton: false });
        await abrirDetalle(cotizacionActual.id);
    }));

    // Sube el contrato firmado (PDF); el servidor verifica que sea un PDF y de hasta 10 MB.
    document.getElementById('btnSubirFirmado')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActual) return;
        const input = document.getElementById('inputArchivoFirmado') as HTMLInputElement;
        const archivo = input.files?.[0];
        if (!archivo) {
            Swal.fire({ icon: 'warning', title: 'Selecciona un archivo PDF', confirmButtonColor: '#f97316' });
            return;
        }

        const formData = new FormData();
        formData.append('archivo', archivo);

        const res = await apiFetch(`/api/contratos/${cotizacionActual.id}/firmado`, { method: 'POST', body: formData });
        const datos = await res.json();
        if (!res.ok) {
            Swal.fire({ icon: 'error', title: 'No se pudo subir', text: datos.message, confirmButtonColor: '#f97316' });
            return;
        }
        input.value = '';
        await Swal.fire({ icon: 'success', title: 'Contrato firmado guardado', confirmButtonColor: '#f97316' });
        await abrirDetalle(cotizacionActual.id);
    }));

    // Agrega un comentario interno al historial.
    document.getElementById('btnAgregarComentario')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActual) return;
        const input = document.getElementById('inpComentario') as HTMLInputElement;
        const comentario = input.value.trim();
        if (!comentario) return;

        const res = await apiFetch(`/api/cotizaciones/${cotizacionActual.id}/comentarios`, {
            method: 'POST',
            body: JSON.stringify({ comentario })
        });
        if (res.ok) {
            input.value = '';
            const resHistorial = await apiFetch(`/api/cotizaciones/${cotizacionActual.id}/historial`);
            renderHistorial(await resHistorial.json());
        }
    }));

    // Oficializa el evento tras pedir confirmación. Solo se ofrece cuando el contrato firmado ya está subido.
    document.getElementById('btnMarcarDefinitivo')?.addEventListener('click', conManejoDeErrores(async () => {
        if (!cotizacionActual) return;
        const confirmacion = await Swal.fire({
            icon: 'question',
            title: '¿Oficializar este evento?',
            text: 'Pasará a "Eventos programados", al calendario y al panel de logística de Andrés.',
            showCancelButton: true,
            confirmButtonText: 'Sí, oficializar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#f97316'
        });
        if (!confirmacion.isConfirmed) return;

        const res = await apiFetch(`/api/cotizaciones/${cotizacionActual.id}/marcar-definitivo`, { method: 'POST' });
        const datos = await res.json();
        if (!res.ok) {
            Swal.fire({ icon: 'error', title: 'No se pudo oficializar', text: datos.message, confirmButtonColor: '#f97316' });
            return;
        }
        await Swal.fire({ icon: 'success', title: 'Evento oficializado', text: 'Ya está disponible en "Eventos programados" y en logística.', confirmButtonColor: '#f97316' });
        volverALista();
    }));

    await cargarLista();
});
