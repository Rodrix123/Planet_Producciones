import './style.css';
import './panel.css';
import { api } from './api';

interface Empleado {
    id: string;
    email: string | null;
    telefono: string | null;
    nombre: string | null;
    cedula: string | null;
    avatarUrl: string | null;
    rolId: number | null;
    cuentaBancaria: string | null;
    llave: string | null;
    diasNoDisponibles: string[];
    creadoEn: string;
    ultimoAcceso: string | null;
}

interface Rol {
    id: number;
    nombre: string;
    descripcion: string | null;
}

// Los roles se leen de public.role (los devuelve la API).
let roles: Rol[] = [];

const $ =<T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const contenedorRoles = $('roles');
const estado = $('estado');
const buscador = $<HTMLInputElement>('buscador');
const drawer = $('drawer');
const overlay = $('overlay');
const drawerContenido = $('drawerContenido');
const drawerEliminar = $('drawerEliminar');
const modal = $('modal');
const modalContenido = $('modalContenido');
const toast = $('toast');
const filtros = $('filtros');
const filtroTipoBtn = $('filtroTipoBtn');
const filtroTipoTexto = $('filtroTipoTexto');
const filtroTipoMenu = $('filtroTipoMenu');
const filtroChips = $('filtroChips');
const filtroDisp = $<HTMLSelectElement>('filtroDisp');
const filtroDesde = $<HTMLInputElement>('filtroDesde');
const filtroHasta = $<HTMLInputElement>('filtroHasta');
const filtroFechaBox = $('filtroFechaBox');
const filtroLimpiar = $('filtroLimpiar');
const filtroConteo = $('filtroConteo');

let empleados: Empleado[] = [];
let seleccionadoId: string | null = null;
// Calendario de disponibilidad del panel lateral: de qué empleado es y qué mes (día 1) muestra.
let calEmpleadoId: string | null = null;
let calMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
// Tipos (role_id, o 'sin') seleccionados en el filtro; vacío = todos.
const tiposSel = new Set<string>();

let toastTimer: number | undefined;
function avisar(mensaje: string): void {
    toast.textContent = mensaje;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3000);
}

function esc(texto: string): string {
    const d = document.createElement('div');
    d.textContent = texto;
    return d.innerHTML;
}

function nombreVisible(e: Empleado): string {
    return e.nombre || e.email?.split('@')[0] || 'Sin nombre';
}

function iniciales(e: Empleado): string {
    return nombreVisible(e).split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

function avatarHtml(e: Empleado, grande = false): string {
    const img = e.avatarUrl ? `<img src="${esc(e.avatarUrl)}" alt="">` : esc(iniciales(e));
    return `<div class="avatar${grande ? ' avatar-lg' : ''}">${img}</div>`;
}

function formatearFecha(iso: string | null, conHora = false): string {
    if (!iso) return '—';
    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = new Date(soloFecha ? `${iso}T00:00:00` : iso);
    if (isNaN(d.getTime())) return esc(iso);
    return d.toLocaleDateString('es-CO', {
        day: 'numeric', month: 'short', year: 'numeric',
        ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {})
    });
}

function tituloRol(nombre: string): string {
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

function rolDe(e: Empleado): Rol | undefined {
    return roles.find(r => r.id === e.rolId);
}

function aISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hoyISO(): string {
    return aISO(new Date());
}

/** Fecha final por defecto: 8 días después de hoy. */
function finDefectoISO(): string {
    const d = new Date();
    d.setDate(d.getDate() + 8);
    return aISO(d);
}

function restablecerFechas(): void {
    filtroDesde.value = hoyISO();
    filtroHasta.value = finDefectoISO();
}

function hayFiltros(): boolean {
    return buscador.value.trim() !== '' || tiposSel.size > 0 || filtroDisp.value !== '';
}

function nombreTipo(clave: string): string {
    const rol = roles.find(r => String(r.id) === clave);
    return rol ? tituloRol(rol.nombre) : 'Sin rol';
}

function renderMenuTipo(): void {
    const opciones = roles.map(r => ({ clave: String(r.id), titulo: tituloRol(r.nombre) }));
    if (empleados.some(e => !rolDe(e))) opciones.push({ clave: 'sin', titulo: 'Sin rol' });
    filtroTipoMenu.innerHTML = opciones.map(o => `
        <label class="multi-opcion">
            <input type="checkbox" value="${o.clave}" ${tiposSel.has(o.clave) ? 'checked' : ''}>
            <span>${esc(o.titulo)}</span>
        </label>`).join('');
}

function renderChips(): void {
    const chips: string[] = [];
    for (const clave of tiposSel) {
        chips.push(`<span class="chip"><i class="fa-solid fa-user-tag"></i> ${esc(nombreTipo(clave))}
            <button type="button" data-quitar-tipo="${clave}" aria-label="Quitar ${esc(nombreTipo(clave))}"><i class="fa-solid fa-xmark"></i></button></span>`);
    }
    if (filtroDisp.value !== '') {
        const etiqueta = filtroDisp.value === 'disponibles' ? 'Disponibles' : 'No disponibles';
        chips.push(`<span class="chip"><i class="fa-solid fa-calendar-check"></i> ${etiqueta} · ${formatearFecha(filtroDesde.value)} – ${formatearFecha(filtroHasta.value)}
            <button type="button" data-quitar-disp aria-label="Quitar disponibilidad"><i class="fa-solid fa-xmark"></i></button></span>`);
    }
    filtroChips.innerHTML = chips.join('');
    filtroChips.hidden = chips.length === 0;
    filtroTipoTexto.textContent = tiposSel.size === 0 ? 'Todos'
        : tiposSel.size === 1 ? nombreTipo([...tiposSel][0]!) : `${tiposSel.size} seleccionados`;
}

function render(): void {
    const q = buscador.value.trim().toLowerCase();
    const disp = filtroDisp.value;

    // La fecha final nunca puede ser anterior a la inicial.
    if (!filtroDesde.value) filtroDesde.value = hoyISO();
    if (!filtroHasta.value || filtroHasta.value < filtroDesde.value) filtroHasta.value = filtroDesde.value;
    filtroHasta.min = filtroDesde.value;
    const desde = filtroDesde.value;
    const hasta = filtroHasta.value;

    filtroFechaBox.hidden = disp === '';
    filtroLimpiar.hidden = !hayFiltros();
    renderChips();

    const filtrados = empleados.filter(e => {
        if (!`${nombreVisible(e)} ${e.email ?? ''}`.toLowerCase().includes(q)) return false;
        if (tiposSel.size > 0 && !tiposSel.has(String(e.rolId ?? 'sin'))) return false;
        if (disp !== '') {
            // No disponible = tiene alguna ausencia dentro del rango [inicio, final].
            const ocupado = e.diasNoDisponibles.some(d => d >= desde && d <= hasta);
            if (disp === 'disponibles' && ocupado) return false;
            if (disp === 'no-disponibles' && !ocupado) return false;
        }
        return true;
    });
    filtroConteo.textContent = hayFiltros()
        ? `${filtrados.length} de ${empleados.length} empleados`
        : `${empleados.length} empleados`;

    const secciones = roles.map(r => ({
        rolId: r.id as number | null,
        titulo: tituloRol(r.nombre),
        grupo: filtrados.filter(e => e.rolId === r.id)
    }));
    const sinRol = filtrados.filter(e => !rolDe(e));
    if (sinRol.length || tiposSel.has('sin')) secciones.push({ rolId: null, titulo: 'Sin rol', grupo: sinRol });

    const visibles = secciones.filter(sec =>
        tiposSel.size === 0 || tiposSel.has(String(sec.rolId ?? 'sin')));

    contenedorRoles.innerHTML = visibles.map(({ rolId, titulo, grupo }) => {
        const cards = grupo.map(e => `
            <button class="empleado-card" data-id="${esc(e.id)}">
                ${avatarHtml(e)}
                <div class="empleado-info">
                    <div class="empleado-nombre">${esc(nombreVisible(e))}</div>
                    <div class="empleado-sub">${esc(e.email ?? 'Sin correo')}</div>
                </div>
            </button>`).join('');
        const botonCrear = rolId !== null
            ? `<button class="btn-mini" data-crear="${rolId}" title="Agregar a ${esc(titulo)}" aria-label="Agregar a ${esc(titulo)}"><i class="fa-solid fa-plus"></i></button>`
            : '';
        return `
            <section class="rol-seccion">
                <div class="rol-header">
                    <h2>${titulo}</h2><span class="rol-count">${grupo.length}</span>
                    ${botonCrear}
                </div>
                ${grupo.length
                    ? `<div class="empleados-grid">${cards}</div>`
                    : `<p class="rol-vacio">${hayFiltros() ? 'Ningún empleado coincide con los filtros.' : 'No hay empleados en este rol.'}</p>`}
            </section>`;
    }).join('');
}

function fila(etiqueta: string, valor: string): string {
    return `<div class="dato-fila"><span>${etiqueta}</span><span>${valor}</span></div>`;
}

// ---------- Panel lateral derecho: información y edición ----------
function abrirDrawer(id: string): void {
    const e = empleados.find(x => x.id === id);
    if (!e) return;
    seleccionadoId = id;
    if (calEmpleadoId !== id) {
        // Otro empleado: el calendario vuelve al mes actual (al editar el mismo se conserva el mes).
        calEmpleadoId = id;
        calMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }
    const rol = rolDe(e);
    const rolTitulo = rol ? tituloRol(rol.nombre) : 'Sin rol';
    const dias = [...e.diasNoDisponibles].sort();

    drawerContenido.innerHTML = `
        <div class="drawer-perfil">
            ${avatarHtml(e, true)}
            <h2>${esc(nombreVisible(e))}</h2>
            <span class="rol-count">${rolTitulo}</span>
        </div>
        <form id="formEditar" class="drawer-seccion" novalidate>
            <h3>Información</h3>
            <label class="campo">
                <span>Correo</span>
                <input type="email" name="email" value="${esc(e.email ?? '')}" autocomplete="off" required>
            </label>
            <label class="campo">
                <span>Teléfono</span>
                <input type="tel" name="telefono" value="${esc(e.telefono ?? '')}" placeholder="Ej: 3001234567" autocomplete="off">
            </label>
            ${fila('Cédula', esc(e.cedula ?? '—'))}
            ${fila('Registrado', formatearFecha(e.creadoEn))}
            ${fila('Último acceso', formatearFecha(e.ultimoAcceso, true))}
            <p id="formEditarError" class="form-error" hidden></p>
            <button type="submit" class="submit-btn btn-guardar" disabled>
                <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
            </button>
        </form>
        <form id="formBanco" class="drawer-seccion" novalidate>
            <h3>Cuenta bancaria y llave</h3>
            <label class="campo">
                <span>Cuenta bancaria</span>
                <input type="text" name="cuentaBancaria" value="${esc(e.cuentaBancaria ?? '')}" placeholder="Sin registrar" maxlength="100" autocomplete="off">
            </label>
            <label class="campo">
                <span>Llave</span>
                <input type="text" name="llave" value="${esc(e.llave ?? '')}" placeholder="Sin registrar" maxlength="100" autocomplete="off">
            </label>
            <p id="formBancoError" class="form-error" hidden></p>
            <button type="submit" class="submit-btn btn-guardar" disabled>
                <i class="fa-solid fa-floppy-disk"></i> Guardar cuenta y llave
            </button>
        </form>
        <div class="drawer-seccion">
            <div class="seccion-cabecera">
                <h3>Días que no podrá asistir</h3>
                <button type="button" class="btn-incapacidad" id="btnIncapacidad">
                    <i class="fa-solid fa-plus"></i> Agregar incapacidad
                </button>
            </div>
            <div class="mini-cal" id="miniCal">${htmlMiniCal(e)}</div>
            <p class="mini-cal-leyenda"><span class="leyenda-punto"></span> No disponible</p>
            ${dias.length
                ? `<div class="dias-lista">${dias.map(d => `<span class="dia-chip">${formatearFecha(d)}</span>`).join('')}</div>`
                : '<p class="dias-vacio"><i class="fa-solid fa-circle-check"></i> Sin restricciones registradas</p>'}
        </div>`;

    const form = $<HTMLFormElement>('formEditar');
    const guardar = form.querySelector<HTMLButtonElement>('.btn-guardar')!;
    const emailIn = form.elements.namedItem('email') as HTMLInputElement;
    const telIn = form.elements.namedItem('telefono') as HTMLInputElement;
    form.addEventListener('input', () => {
        guardar.disabled = emailIn.value.trim() === (e.email ?? '') && telIn.value.trim() === (e.telefono ?? '');
    });
    form.addEventListener('submit', ev => {
        ev.preventDefault();
        const cambios: Record<string, string> = {};
        if (emailIn.value.trim() !== (e.email ?? '')) cambios.email = emailIn.value.trim();
        if (telIn.value.trim() !== (e.telefono ?? '')) cambios.telefono = telIn.value.trim();
        void guardarCambios(e, cambios, 'formEditarError', guardar, 'Empleado actualizado');
    });

    // Cuenta bancaria y llave: se guardan por separado; dejar un campo vacío borra el dato.
    const formBanco = $<HTMLFormElement>('formBanco');
    const guardarBanco = formBanco.querySelector<HTMLButtonElement>('.btn-guardar')!;
    const cuentaIn = formBanco.elements.namedItem('cuentaBancaria') as HTMLInputElement;
    const llaveIn = formBanco.elements.namedItem('llave') as HTMLInputElement;
    formBanco.addEventListener('input', () => {
        guardarBanco.disabled = cuentaIn.value.trim() === (e.cuentaBancaria ?? '') && llaveIn.value.trim() === (e.llave ?? '');
    });
    formBanco.addEventListener('submit', ev => {
        ev.preventDefault();
        const cambios: Record<string, string> = {};
        if (cuentaIn.value.trim() !== (e.cuentaBancaria ?? '')) cambios.cuentaBancaria = cuentaIn.value.trim();
        if (llaveIn.value.trim() !== (e.llave ?? '')) cambios.llave = llaveIn.value.trim();
        void guardarCambios(e, cambios, 'formBancoError', guardarBanco, 'Cuenta bancaria y llave actualizadas');
    });

    $('btnIncapacidad').addEventListener('click', () => abrirIncapacidad(e));

    drawerEliminar.hidden = false;
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
}

/** Guarda los cambios de un empleado; `errorId` es el aviso de error del formulario que los envía. */
async function guardarCambios(
    e: Empleado,
    cambios: Record<string, string>,
    errorId: string,
    boton: HTMLButtonElement,
    mensaje: string
): Promise<void> {
    const error = $(errorId);
    error.hidden = true;

    boton.disabled = true;
    try {
        const { empleado } = await api<{ empleado: Empleado }>('PATCH', `/api/empleados/${e.id}`, cambios);
        empleados = empleados.map(x => x.id === e.id ? empleado : x);
        render();
        abrirDrawer(e.id);
        avisar(mensaje);
    } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
        boton.disabled = false;
    }
}

/** Calendario del mes `calMes` con los días no disponibles del empleado marcados. */
function htmlMiniCal(e: Empleado): string {
    const marcados = new Set(e.diasNoDisponibles);
    const hoy = hoyISO();
    const titulo = calMes.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const desfase = (calMes.getDay() + 6) % 7; // la semana empieza en lunes
    const diasMes = new Date(calMes.getFullYear(), calMes.getMonth() + 1, 0).getDate();
    const semanas = Math.ceil((desfase + diasMes) / 7);
    const inicio = new Date(calMes.getFullYear(), calMes.getMonth(), 1 - desfase);

    const celdas: string[] = [];
    for (let i = 0; i < semanas * 7; i++) {
        const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
        const iso = aISO(d);
        const clases = ['mini-dia'];
        if (d.getMonth() !== calMes.getMonth()) clases.push('otro-mes');
        if (iso === hoy) clases.push('hoy');
        const noDisponible = marcados.has(iso);
        if (noDisponible) clases.push('no-disponible');
        const etiqueta = noDisponible
            ? ` title="No disponible" aria-label="${esc(d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }))}: no disponible"`
            : '';
        celdas.push(`<span class="${clases.join(' ')}"${etiqueta}>${d.getDate()}</span>`);
    }

    return `
        <div class="mini-cal-cabecera">
            <button type="button" class="mini-cal-flecha" data-cal="-1" aria-label="Mes anterior"><i class="fa-solid fa-chevron-left"></i></button>
            <strong class="mini-cal-titulo">${esc(tituloRol(titulo))}</strong>
            <button type="button" class="mini-cal-flecha" data-cal="1" aria-label="Mes siguiente"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        <div class="mini-cal-semana"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div>
        <div class="mini-cal-grid">${celdas.join('')}</div>`;
}

/** Ventana para registrar una incapacidad: un día o varios seguidos (con "Hasta"). */
function abrirIncapacidad(e: Empleado): void {
    abrirModal(`
        <h2>Nueva incapacidad · ${esc(nombreVisible(e))}</h2>
        <form id="formIncapacidad" novalidate>
            <p class="modal-texto">El empleado quedará como no disponible en esas fechas.</p>
            <label class="campo"><span>Fecha</span>
                <input type="date" name="desde" required></label>
            <label class="campo"><span>Hasta (opcional, para varios días seguidos)</span>
                <input type="date" name="hasta"></label>
            <p id="formIncapacidadError" class="form-error" hidden></p>
            <div class="modal-acciones">
                <button type="button" class="btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="submit-btn btn-modal"><i class="fa-solid fa-plus"></i> Agregar incapacidad</button>
            </div>
        </form>`);

    const form = $<HTMLFormElement>('formIncapacidad');
    const desde = form.elements.namedItem('desde') as HTMLInputElement;
    const hasta = form.elements.namedItem('hasta') as HTMLInputElement;
    // La fecha final nunca puede ser anterior a la inicial.
    desde.addEventListener('change', () => {
        hasta.min = desde.value;
        if (hasta.value && hasta.value < desde.value) hasta.value = desde.value;
    });

    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const error = $('formIncapacidadError');
        const boton = form.querySelector<HTMLButtonElement>('.btn-modal')!;
        error.hidden = true;
        if (!desde.value) {
            error.textContent = 'Elige la fecha de la incapacidad.';
            error.hidden = false;
            return;
        }
        if (hasta.value && hasta.value < desde.value) {
            error.textContent = 'La fecha final no puede ser anterior a la inicial.';
            error.hidden = false;
            return;
        }
        boton.disabled = true;
        try {
            const { empleado } = await api<{ empleado: Empleado }>('POST', `/api/empleados/${e.id}/no-disponible`, {
                desde: desde.value,
                ...(hasta.value ? { hasta: hasta.value } : {})
            });
            empleados = empleados.map(x => x.id === e.id ? empleado : x);
            // Llevar el calendario al mes de la incapacidad para que se vea.
            const d = new Date(`${desde.value}T00:00:00`);
            calMes = new Date(d.getFullYear(), d.getMonth(), 1);
            render();
            cerrarModal();
            abrirDrawer(e.id);
            avisar('Incapacidad agregada');
        } catch (err) {
            error.textContent = (err as Error).message;
            error.hidden = false;
            boton.disabled = false;
        }
    });
}

function cerrarDrawer(): void {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerEliminar.hidden = true;
    seleccionadoId = null;
    calEmpleadoId = null;
}

// ---------- Ventana emergente (crear / eliminar) ----------
function abrirModal(html: string): void {
    modalContenido.innerHTML = html;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modalContenido.querySelector<HTMLInputElement>('input')?.focus();
}

function cerrarModal(): void {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
}

function abrirCrear(rolId: number): void {
    const rol = roles.find(r => r.id === rolId);
    if (!rol) return;
    abrirModal(`
        <h2>Nuevo empleado · ${esc(tituloRol(rol.nombre))}</h2>
        <form id="formCrear" novalidate>
            <label class="campo"><span>Nombre completo</span>
                <input type="text" name="nombre" autocomplete="off" required></label>
            <label class="campo"><span>Cédula (CC), solo números y sin puntos</span>
                <input type="text" name="cedula" inputmode="numeric" maxlength="10" placeholder="Ej: 1053123456" autocomplete="off" required></label>
            <label class="campo"><span>Correo</span>
                <input type="email" name="email" autocomplete="off" required></label>
            <label class="campo"><span>Teléfono (opcional)</span>
                <input type="tel" name="telefono" placeholder="Ej: 3001234567" autocomplete="off"></label>
            <label class="campo"><span>Cuenta bancaria (opcional)</span>
                <input type="text" name="cuentaBancaria" maxlength="100" autocomplete="off"></label>
            <label class="campo"><span>Llave (opcional)</span>
                <input type="text" name="llave" maxlength="100" autocomplete="off"></label>
            <p class="modal-texto">El empleado se crea con la contraseña inicial por defecto.</p>
            <p id="formCrearError" class="form-error" hidden></p>
            <div class="modal-acciones">
                <button type="button" class="btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="submit-btn btn-modal"><i class="fa-solid fa-user-plus"></i> Crear empleado</button>
            </div>
        </form>`);

    const form = $<HTMLFormElement>('formCrear');
    // La cédula solo admite números: lo que no lo sea (puntos, espacios, letras) se descarta al escribir.
    const cedulaIn = form.elements.namedItem('cedula') as HTMLInputElement;
    cedulaIn.addEventListener('input', () => {
        cedulaIn.value = cedulaIn.value.replace(/\D/g, '');
    });
    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = new FormData(form);
        const error = $('formCrearError');
        const boton = form.querySelector<HTMLButtonElement>('.btn-modal')!;
        error.hidden = true;
        if (!/^\d{6,10}$/.test(cedulaIn.value)) {
            error.textContent = 'La cédula debe tener entre 6 y 10 números, sin puntos ni espacios.';
            error.hidden = false;
            cedulaIn.focus();
            return;
        }
        boton.disabled = true;
        try {
            const { empleado } = await api<{ empleado: Empleado }>('POST', '/api/empleados', {
                nombre: String(f.get('nombre') ?? ''),
                cedula: cedulaIn.value,
                email: String(f.get('email') ?? ''),
                telefono: String(f.get('telefono') ?? ''),
                cuentaBancaria: String(f.get('cuentaBancaria') ?? ''),
                llave: String(f.get('llave') ?? ''),
                rolId
            });
            empleados = [...empleados, empleado];
            render();
            cerrarModal();
            avisar('Empleado creado');
        } catch (err) {
            error.textContent = (err as Error).message;
            error.hidden = false;
            boton.disabled = false;
        }
    });
}

function abrirEliminar(id: string): void {
    const e = empleados.find(x => x.id === id);
    if (!e) return;
    abrirModal(`
        <h2>Eliminar empleado</h2>
        <p class="modal-texto">Vas a eliminar a <strong>${esc(nombreVisible(e))}</strong> junto con su acceso.
            Esta acción no se puede deshacer. Escribe <strong>eliminar</strong> para confirmar.</p>
        <form id="formEliminar" novalidate>
            <label class="campo"><input type="text" name="confirmacion" autocomplete="off" placeholder="eliminar"></label>
            <p id="formEliminarError" class="form-error" hidden></p>
            <div class="modal-acciones">
                <button type="button" class="btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="submit-btn btn-peligro" disabled><i class="fa-solid fa-trash-can"></i> Eliminar</button>
            </div>
        </form>`);

    const form = $<HTMLFormElement>('formEliminar');
    const input = form.elements.namedItem('confirmacion') as HTMLInputElement;
    const boton = form.querySelector<HTMLButtonElement>('.btn-peligro')!;
    input.addEventListener('input', () => {
        boton.disabled = input.value.trim().toLowerCase() !== 'eliminar';
    });
    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        if (boton.disabled) return;
        const error = $('formEliminarError');
        error.hidden = true;
        boton.disabled = true;
        try {
            await api('DELETE', `/api/empleados/${id}`);
            empleados = empleados.filter(x => x.id !== id);
            render();
            cerrarModal();
            cerrarDrawer();
            avisar('Empleado eliminado');
        } catch (err) {
            error.textContent = (err as Error).message;
            error.hidden = false;
            boton.disabled = false;
        }
    });
}

async function cargar(): Promise<void> {
    try {
        const json = await api<{ roles: Rol[]; empleados: Empleado[] }>('GET', '/api/empleados');
        roles = json.roles;
        empleados = json.empleados;
        renderMenuTipo();
        restablecerFechas();
        filtros.hidden = false;
        estado.hidden = true;
        render();
    } catch (err) {
        estado.classList.add('error');
        estado.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> No se pudieron cargar los empleados: ${esc((err as Error).message)}`;
    }
}

contenedorRoles.addEventListener('click', ev => {
    const objetivo = ev.target as HTMLElement;
    const crear = objetivo.closest<HTMLElement>('[data-crear]');
    if (crear) {
        abrirCrear(Number(crear.dataset.crear));
        return;
    }
    const card = objetivo.closest<HTMLElement>('.empleado-card');
    if (card?.dataset.id) abrirDrawer(card.dataset.id);
});
buscador.addEventListener('input', render);
filtroDisp.addEventListener('change', render);
filtroDesde.addEventListener('change', render);
filtroHasta.addEventListener('change', render);

function cerrarMenuTipo(): void {
    filtroTipoMenu.hidden = true;
    filtroTipoBtn.setAttribute('aria-expanded', 'false');
}
filtroTipoBtn.addEventListener('click', () => {
    const abrir = filtroTipoMenu.hidden;
    filtroTipoMenu.hidden = !abrir;
    filtroTipoBtn.setAttribute('aria-expanded', String(abrir));
});
filtroTipoMenu.addEventListener('change', ev => {
    const cb = ev.target as HTMLInputElement;
    if (cb.checked) tiposSel.add(cb.value);
    else tiposSel.delete(cb.value);
    render();
});
filtroChips.addEventListener('click', ev => {
    const objetivo = ev.target as HTMLElement;
    const tipo = objetivo.closest<HTMLElement>('[data-quitar-tipo]');
    if (tipo) {
        tiposSel.delete(tipo.dataset.quitarTipo!);
        renderMenuTipo();
    } else if (objetivo.closest('[data-quitar-disp]')) {
        filtroDisp.value = '';
        restablecerFechas();
    } else {
        return;
    }
    render();
});
document.addEventListener('click', ev => {
    if (!(ev.target as HTMLElement).closest('#filtroTipoBox')) cerrarMenuTipo();
});
filtroLimpiar.addEventListener('click', () => {
    buscador.value = '';
    tiposSel.clear();
    filtroDisp.value = '';
    restablecerFechas();
    renderMenuTipo();
    render();
});
overlay.addEventListener('click', cerrarDrawer);
// Flechas del calendario de disponibilidad: cambian de mes sin volver a pintar el resto del panel.
drawerContenido.addEventListener('click', ev => {
    const flecha = (ev.target as HTMLElement).closest<HTMLElement>('[data-cal]');
    const e = empleados.find(x => x.id === seleccionadoId);
    if (!flecha || !e) return;
    calMes = new Date(calMes.getFullYear(), calMes.getMonth() + Number(flecha.dataset.cal), 1);
    $('miniCal').innerHTML = htmlMiniCal(e);
});
$('drawerCerrar').addEventListener('click', cerrarDrawer);
drawerEliminar.addEventListener('click', () => {
    if (seleccionadoId) abrirEliminar(seleccionadoId);
});
modal.addEventListener('click', ev => {
    const t = ev.target as HTMLElement;
    if (t === modal || t.closest('[data-cerrar-modal]')) cerrarModal();
});
document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape') return;
    if (!filtroTipoMenu.hidden) {
        cerrarMenuTipo();
        return;
    }
    if (modal.classList.contains('open')) cerrarModal();
    else cerrarDrawer();
});

void cargar();
