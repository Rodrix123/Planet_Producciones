import './style.css';
import './panel.css';

interface Empleado {
    id: string;
    email: string | null;
    telefono: string | null;
    nombre: string | null;
    avatarUrl: string | null;
    rolId: number | null;
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

const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
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
// Tipos (role_id, o 'sin') seleccionados en el filtro; vacío = todos.
const tiposSel = new Set<string>();

async function api<T = Record<string, unknown>>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    let resp: Response;
    try {
        resp = await fetch(`${API_URL}${ruta}`, {
            method: metodo,
            headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
            body: cuerpo ? JSON.stringify(cuerpo) : undefined
        });
    } catch {
        throw new Error('No se pudo conectar con el servidor.');
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.message || `Error ${resp.status}`);
    return json as T;
}

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
            ${fila('Registrado', formatearFecha(e.creadoEn))}
            ${fila('Último acceso', formatearFecha(e.ultimoAcceso, true))}
            <p id="formEditarError" class="form-error" hidden></p>
            <button type="submit" class="submit-btn btn-guardar" disabled>
                <i class="fa-solid fa-floppy-disk"></i> Guardar cambios
            </button>
        </form>
        <div class="drawer-seccion">
            <h3>Días que no podrá asistir</h3>
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
        void guardarCambios(e, emailIn, telIn, guardar);
    });

    drawerEliminar.hidden = false;
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
}

async function guardarCambios(e: Empleado, emailIn: HTMLInputElement, telIn: HTMLInputElement, boton: HTMLButtonElement): Promise<void> {
    const error = $('formEditarError');
    error.hidden = true;
    const cambios: { email?: string; telefono?: string } = {};
    if (emailIn.value.trim() !== (e.email ?? '')) cambios.email = emailIn.value.trim();
    if (telIn.value.trim() !== (e.telefono ?? '')) cambios.telefono = telIn.value.trim();

    boton.disabled = true;
    try {
        const { empleado } = await api<{ empleado: Empleado }>('PATCH', `/api/empleados/${e.id}`, cambios);
        empleados = empleados.map(x => x.id === e.id ? empleado : x);
        render();
        abrirDrawer(e.id);
        avisar('Empleado actualizado');
    } catch (err) {
        error.textContent = (err as Error).message;
        error.hidden = false;
        boton.disabled = false;
    }
}

function cerrarDrawer(): void {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawerEliminar.hidden = true;
    seleccionadoId = null;
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
            <label class="campo"><span>Correo</span>
                <input type="email" name="email" autocomplete="off" required></label>
            <label class="campo"><span>Teléfono (opcional)</span>
                <input type="tel" name="telefono" placeholder="Ej: 3001234567" autocomplete="off"></label>
            <label class="campo"><span>Contraseña inicial</span>
                <input type="password" name="password" autocomplete="new-password" minlength="6" required></label>
            <p id="formCrearError" class="form-error" hidden></p>
            <div class="modal-acciones">
                <button type="button" class="btn-secundario" data-cerrar-modal>Cancelar</button>
                <button type="submit" class="submit-btn btn-modal"><i class="fa-solid fa-user-plus"></i> Crear empleado</button>
            </div>
        </form>`);

    const form = $<HTMLFormElement>('formCrear');
    form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const f = new FormData(form);
        const error = $('formCrearError');
        const boton = form.querySelector<HTMLButtonElement>('.btn-modal')!;
        error.hidden = true;
        boton.disabled = true;
        try {
            const { empleado } = await api<{ empleado: Empleado }>('POST', '/api/empleados', {
                nombre: String(f.get('nombre') ?? ''),
                email: String(f.get('email') ?? ''),
                telefono: String(f.get('telefono') ?? ''),
                password: String(f.get('password') ?? ''),
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
