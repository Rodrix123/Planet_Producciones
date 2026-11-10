// Panel de empleados de la administradora (Maritza). Tiene dos partes independientes:
//   1. Nómina: el personal operativo por tipo de contrato (salario, documento, cuenta bancaria).
//   2. Cuentas de acceso: quién puede entrar al sistema y con qué rol, y sus días no disponibles.

import './style.css';
import './shared/panelRail.css';
import { apiFetch, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';
import { avisar, abrirDrawer, cerrarDrawer, abrirModal, cerrarModal, initPanelShellGlobal, esc } from './shared/panelShell';

declare const Swal: any;

// ---------- Nómina (empleados.id es uuid, tipo_contrato en 3 categorías) ----------
// Los tres tipos de contrato; deben coincidir con los del servidor (empleados.routes.ts).
type TipoContrato = 'con_contrato' | 'freelance_fijo' | 'freelance_no_fijo';

// Un empleado de la nómina tal como lo devuelve /api/empleados.
interface Empleado {
    id: string;
    nombre: string;
    documento: string | null;
    telefono: string | null;
    salario: number | null;
    numeroCuenta: string | null;
    banco: string | null;
    tipoContrato: TipoContrato;
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

// Trae la nómina y la reparte en sus tres grupos según el tipo de contrato.
async function cargarEmpleados() {
    const res = await apiFetch('/api/empleados');
    const empleados = (await res.json()) as Empleado[];

    renderGrupo('listaConContrato', empleados.filter((e) => e.tipoContrato === 'con_contrato'));
    renderGrupo('listaFreelanceFijo', empleados.filter((e) => e.tipoContrato === 'freelance_fijo'));
    renderGrupo('listaFreelanceNoFijo', empleados.filter((e) => e.tipoContrato === 'freelance_no_fijo'));
}

// Dibuja un grupo de la nómina; tocar una tarjeta abre su formulario y la papelera la elimina.
function renderGrupo(contenedorId: string, empleados: Empleado[]) {
    const cont = document.getElementById(contenedorId) as HTMLElement;
    cont.innerHTML = '';

    if (empleados.length === 0) {
        cont.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Sin empleados registrados en esta categoría.</p>';
        return;
    }

    empleados.forEach((emp) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-card-main">
                <h3>${esc(emp.nombre)}</h3>
                <p>${esc((emp.documento ? 'CC ' + emp.documento + ' · ' : '') + (emp.telefono || 'Sin teléfono') + (emp.numeroCuenta ? ' · Cuenta ' + emp.numeroCuenta + (emp.banco ? ' (' + emp.banco + ')' : '') : ''))}</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${emp.salario ? formatterCOP.format(emp.salario) : 'Sin salario definido'}</div>
                <button class="btn btn-danger btn-sm" data-id="${emp.id}" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(() => abrirFormularioEmpleado(emp)));
        card.querySelector('button')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void conManejoDeErrores(() => eliminarEmpleado(emp.id))();
        });
        cont.appendChild(card);
    });
}

// Formulario para crear (sin empleado) o editar un empleado. `tipoPorDefecto` preselecciona el tipo de
// contrato cuando se crea desde el botón de un grupo.
async function abrirFormularioEmpleado(empleado?: Empleado, tipoPorDefecto?: TipoContrato) {
    const { value: datos } = await Swal.fire({
        title: `<i class="fa-solid ${empleado ? 'fa-user-pen' : 'fa-user-plus'}" style="color:var(--orange-main); margin-right:0.5rem;"></i>${empleado ? 'Editar empleado' : 'Nuevo empleado'}`,
        confirmButtonColor: '#f97316',
        cancelButtonColor: '#374151',
        showCancelButton: true,
        confirmButtonText: empleado ? 'Guardar cambios' : 'Crear empleado',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        width: 'min(560px, 92vw)',
        customClass: { popup: 'swal-tema-oscuro' },
        html: `
            <div class="form-grid-campos">
                <div class="campo-full">
                    <label for="swalNombre">Nombre completo</label>
                    <input id="swalNombre" placeholder="Ej. Juan Pérez" value="${esc(empleado?.nombre || '')}">
                </div>
                <div>
                    <label for="swalDocumento">Documento / Cédula</label>
                    <input id="swalDocumento" placeholder="Ej. 1012345678" value="${esc(empleado?.documento || '')}">
                </div>
                <div>
                    <label for="swalTelefono">Teléfono</label>
                    <input id="swalTelefono" placeholder="Ej. 300 123 4567" value="${esc(empleado?.telefono || '')}">
                </div>
                <div>
                    <label for="swalSalario">Salario</label>
                    <input id="swalSalario" type="number" placeholder="Ej. 1500000" value="${empleado?.salario ?? ''}">
                </div>
                <div>
                    <label for="swalTipo">Tipo de vínculo</label>
                    <select id="swalTipo">
                        <option value="con_contrato" ${(empleado?.tipoContrato || tipoPorDefecto) === 'con_contrato' ? 'selected' : ''}>Con contrato</option>
                        <option value="freelance_fijo" ${(empleado?.tipoContrato || tipoPorDefecto) === 'freelance_fijo' ? 'selected' : ''}>Freelance fijo</option>
                        <option value="freelance_no_fijo" ${(empleado?.tipoContrato || tipoPorDefecto) === 'freelance_no_fijo' ? 'selected' : ''}>Freelance no fijo</option>
                    </select>
                </div>
                <div>
                    <label for="swalCuenta">Número de cuenta bancaria</label>
                    <input id="swalCuenta" placeholder="Ej. 1234567890" value="${esc(empleado?.numeroCuenta || '')}">
                </div>
                <div>
                    <label for="swalBanco">Banco</label>
                    <input id="swalBanco" placeholder="Ej. Bancolombia" value="${esc(empleado?.banco || '')}">
                </div>
            </div>
        `,
        preConfirm: () => {
            const nombre = (document.getElementById('swalNombre') as HTMLInputElement).value.trim();
            if (!nombre) {
                Swal.showValidationMessage('El nombre es obligatorio');
                return false;
            }
            const salarioRaw = (document.getElementById('swalSalario') as HTMLInputElement).value;
            return {
                nombre,
                documento: (document.getElementById('swalDocumento') as HTMLInputElement).value.trim(),
                telefono: (document.getElementById('swalTelefono') as HTMLInputElement).value.trim(),
                salario: salarioRaw ? Number(salarioRaw) : null,
                numeroCuenta: (document.getElementById('swalCuenta') as HTMLInputElement).value.trim(),
                banco: (document.getElementById('swalBanco') as HTMLInputElement).value.trim(),
                tipoContrato: (document.getElementById('swalTipo') as HTMLSelectElement).value
            };
        }
    });

    if (!datos) return;

    const res = empleado
        ? await apiFetch(`/api/empleados/${empleado.id}`, { method: 'PUT', body: JSON.stringify(datos) })
        : await apiFetch('/api/empleados', { method: 'POST', body: JSON.stringify(datos) });

    if (!res.ok) {
        const error = await res.json();
        Swal.fire({ icon: 'error', title: 'No se pudo guardar', text: error.message, confirmButtonColor: '#f97316' });
        return;
    }

    await cargarEmpleados();
}

// Pide confirmación y desactiva al empleado (deja de aparecer en la lista).
async function eliminarEmpleado(id: string) {
    const confirmacion = await Swal.fire({
        icon: 'warning',
        title: '¿Eliminar empleado?',
        text: 'Dejará de aparecer en la lista de empleados activos.',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#f87171'
    });
    if (!confirmacion.isConfirmed) return;

    await apiFetch(`/api/empleados/${id}`, { method: 'DELETE' });
    await cargarEmpleados();
}

// ---------- Cuentas de acceso (administrador/secretaria/jefe_logistica) ----------
// Un rol del sistema, tal como lo devuelve /api/cuentas-acceso.
interface Rol {
    id: number;
    nombre: string;
    descripcion: string | null;
}

// Una cuenta de acceso con su rol y sus días no disponibles.
interface Cuenta {
    id: string;
    nombre: string;
    correo: string;
    telefono: string | null;
    rolId: number | null;
    debeCambiarPassword: boolean;
    diasNoDisponibles: string[];
    creadoEn: string | null;
    ultimoAcceso: string | null;
}

// Cómo se muestra cada rol.
const NOMBRE_ROL: Record<string, string> = {
    administrador: 'Administradora',
    secretaria: 'Secretaria',
    jefe_logistica: 'Jefe de Logística'
};

// Estado de la pantalla: roles, cuentas cargadas y la cuenta abierta en el panel lateral.
let roles: Rol[] = [];
let cuentas: Cuenta[] = [];
let cuentaSeleccionadaId: string | null = null;

const rolesGrid = document.getElementById('rolesGrid') as HTMLElement;
const drawerDelete = document.getElementById('drawerDelete') as HTMLButtonElement;

// Nombre legible de un rol.
function tituloRol(nombre: string): string {
    return NOMBRE_ROL[nombre] || nombre;
}

// Iniciales (hasta dos) para el círculo de la cuenta.
function iniciales(nombre: string): string {
    return nombre.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
}

// Fecha corta en español, o "—" si no hay.
function formatearFecha(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Trae roles y cuentas y las dibuja agrupadas por rol.
async function cargarCuentas(): Promise<void> {
    const res = await apiFetch('/api/cuentas-acceso');
    if (!res.ok) return;
    const json = (await res.json()) as { roles: Rol[]; cuentas: Cuenta[] };
    roles = json.roles;
    cuentas = json.cuentas;
    renderCuentas();
}

// Dibuja las tarjetas de las cuentas agrupadas por rol.
function renderCuentas(): void {
    rolesGrid.innerHTML = roles.map((rol) => {
        const deEsteRol = cuentas.filter(c => c.rolId === rol.id);
        return `
            <section class="rol-seccion">
                <div class="rol-header">
                    <h2>${esc(tituloRol(rol.nombre))}</h2>
                    <span class="rol-count">${deEsteRol.length}</span>
                </div>
                ${deEsteRol.length === 0
                    ? '<p class="rol-vacio">Sin cuentas en este rol.</p>'
                    : `<div class="empleados-grid">${deEsteRol.map(cuentaCardHtml).join('')}</div>`}
            </section>
        `;
    }).join('');

    rolesGrid.querySelectorAll<HTMLElement>('[data-cuenta-id]').forEach((card) => {
        card.addEventListener('click', conManejoDeErrores(async () => abrirDetalleCuenta(card.dataset.cuentaId!)));
    });
}

// HTML de la tarjeta de una cuenta.
function cuentaCardHtml(c: Cuenta): string {
    return `
        <button type="button" class="empleado-card" data-cuenta-id="${c.id}">
            <div class="avatar">${esc(iniciales(c.nombre))}</div>
            <div class="empleado-info">
                <div class="empleado-nombre">${esc(c.nombre)}</div>
                <div class="empleado-sub">${esc(c.correo)}</div>
            </div>
        </button>
    `;
}

// HTML de la lista de días no disponibles de una cuenta, con su botón para quitar cada día.
function diasHtml(c: Cuenta): string {
    if (c.diasNoDisponibles.length === 0) return '<p class="dias-vacio">Sin días marcados como no disponible.</p>';
    return `<div class="dias-lista">${c.diasNoDisponibles.map(d => `
        <span class="dia-chip" data-fecha="${d}">${formatearFecha(d)} <i class="fa-solid fa-xmark" data-quitar-dia="${d}" style="cursor:pointer; margin-left:0.3rem;"></i></span>
    `).join('')}</div>`;
}

// Abre el panel lateral de una cuenta: datos editables, rol y días no disponibles.
async function abrirDetalleCuenta(id: string): Promise<void> {
    const c = cuentas.find(x => x.id === id);
    if (!c) return;
    cuentaSeleccionadaId = id;

    abrirDrawer(`
        <div class="drawer-perfil">
            <div class="avatar avatar-lg">${esc(iniciales(c.nombre))}</div>
            <h2>${esc(c.nombre)}</h2>
            <span class="rol-count">${esc(tituloRol(roles.find(r => r.id === c.rolId)?.nombre || ''))}</span>
        </div>

        <div class="drawer-seccion">
            <h3>Datos</h3>
            <label class="campo"><span>Nombre</span><input type="text" id="inpNombre" value="${esc(c.nombre)}"></label>
            <label class="campo"><span>Correo</span><input type="email" id="inpCorreo" value="${esc(c.correo)}"></label>
            <label class="campo"><span>Teléfono</span><input type="text" id="inpTelefono" value="${esc(c.telefono || '')}" placeholder="+57 300 123 4567"></label>
            <label class="campo"><span>Rol</span>
                <select id="inpRol">
                    ${roles.map(r => `<option value="${r.id}" ${r.id === c.rolId ? 'selected' : ''}>${esc(tituloRol(r.nombre))}</option>`).join('')}
                </select>
            </label>
            <p class="form-error" id="errorGuardar" hidden></p>
            <button type="button" class="btn-guardar" id="btnGuardarCuenta">Guardar cambios</button>
        </div>

        <div class="drawer-seccion">
            <h3>Cuenta</h3>
            <div class="dato-fila"><span>Creada</span><span>${formatearFecha(c.creadoEn)}</span></div>
        </div>

        <div class="drawer-seccion">
            <h3>Días no disponible</h3>
            <div id="diasContenedor">${diasHtml(c)}</div>
            <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                <input type="date" id="inpNuevoDia" style="flex:1; padding:0.6rem 0.8rem; background:var(--bg-input); border:1px solid var(--border-color); border-radius:12px; color:var(--text-light);">
                <button type="button" class="btn-secundario" id="btnAgregarDia">Agregar</button>
            </div>
        </div>
    `);

    drawerDelete.hidden = false;

    document.getElementById('btnGuardarCuenta')?.addEventListener('click', conManejoDeErrores(async () => guardarCambiosCuenta(id)));
    document.getElementById('btnAgregarDia')?.addEventListener('click', conManejoDeErrores(async () => agregarDia(id)));
    document.getElementById('diasContenedor')?.querySelectorAll('[data-quitar-dia]').forEach((el) => {
        el.addEventListener('click', conManejoDeErrores(async () => quitarDia(id, (el as HTMLElement).dataset.quitarDia!)));
    });
}

// Guarda los cambios de la cuenta abierta; si el servidor los rechaza, muestra el motivo en el panel.
async function guardarCambiosCuenta(id: string): Promise<void> {
    const nombre = (document.getElementById('inpNombre') as HTMLInputElement).value.trim();
    const correo = (document.getElementById('inpCorreo') as HTMLInputElement).value.trim();
    const telefono = (document.getElementById('inpTelefono') as HTMLInputElement).value.trim();
    const rolId = Number((document.getElementById('inpRol') as HTMLSelectElement).value);
    const errorEl = document.getElementById('errorGuardar') as HTMLElement;

    const res = await apiFetch(`/api/cuentas-acceso/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre, correo, telefono, rolId })
    });

    if (!res.ok) {
        const datos = await res.json();
        errorEl.textContent = datos.message || 'No se pudo guardar';
        errorEl.hidden = false;
        return;
    }

    errorEl.hidden = true;
    avisar('Cuenta actualizada');
    cerrarDrawer();
    await cargarCuentas();
}

// Marca un día como no disponible para la cuenta y refresca el panel.
async function agregarDia(id: string): Promise<void> {
    const fecha = (document.getElementById('inpNuevoDia') as HTMLInputElement).value;
    if (!fecha) return;
    await apiFetch(`/api/cuentas-acceso/${id}/no-disponible`, { method: 'POST', body: JSON.stringify({ fecha }) });
    await cargarCuentas();
    await abrirDetalleCuenta(id);
}

// Quita un día no disponible y refresca el panel.
async function quitarDia(id: string, fecha: string): Promise<void> {
    await apiFetch(`/api/cuentas-acceso/${id}/no-disponible/${fecha}`, { method: 'DELETE' });
    await cargarCuentas();
    await abrirDetalleCuenta(id);
}

// Ventana para crear una cuenta nueva. La persona entra con una contraseña temporal y debe cambiarla.
function abrirModalCrearCuenta(): void {
    abrirModal(`
        <button type="button" class="modal-cerrar" id="btnCerrarModalCrear"><i class="fa-solid fa-xmark"></i></button>
        <h2>Nueva cuenta de acceso</h2>
        <label class="campo"><span>Nombre completo</span><input type="text" id="cNombre" placeholder="Ej. Juan Pérez"></label>
        <label class="campo"><span>Correo</span><input type="email" id="cCorreo" placeholder="correo@planetproducciones.com"></label>
        <label class="campo"><span>Teléfono (opcional)</span><input type="text" id="cTelefono" placeholder="+57 300 123 4567"></label>
        <label class="campo"><span>Contraseña temporal</span><input type="text" id="cPassword" placeholder="Mínimo 8 caracteres"></label>
        <label class="campo"><span>Rol</span>
            <select id="cRol">
                ${roles.map(r => `<option value="${r.id}">${esc(tituloRol(r.nombre))}</option>`).join('')}
            </select>
        </label>
        <p class="form-error" id="errorCrear" hidden></p>
        <div class="modal-acciones">
            <button type="button" class="btn-secundario" id="btnCancelarCrear">Cancelar</button>
            <button type="button" class="btn-guardar" id="btnConfirmarCrear" style="width:auto;">Crear cuenta</button>
        </div>
    `);

    const cerrar = () => cerrarModal();
    document.getElementById('btnCerrarModalCrear')?.addEventListener('click', cerrar);
    document.getElementById('btnCancelarCrear')?.addEventListener('click', cerrar);
    document.getElementById('btnConfirmarCrear')?.addEventListener('click', conManejoDeErrores(async () => {
        const nombre = (document.getElementById('cNombre') as HTMLInputElement).value.trim();
        const correo = (document.getElementById('cCorreo') as HTMLInputElement).value.trim();
        const telefono = (document.getElementById('cTelefono') as HTMLInputElement).value.trim();
        const password = (document.getElementById('cPassword') as HTMLInputElement).value;
        const rolId = Number((document.getElementById('cRol') as HTMLSelectElement).value);
        const errorEl = document.getElementById('errorCrear') as HTMLElement;

        const res = await apiFetch('/api/cuentas-acceso', {
            method: 'POST',
            body: JSON.stringify({ nombre, correo, telefono: telefono || undefined, password, rolId })
        });

        if (!res.ok) {
            const datos = await res.json();
            errorEl.textContent = datos.message || 'No se pudo crear la cuenta';
            errorEl.hidden = false;
            return;
        }

        cerrarModal();
        avisar('Cuenta creada');
        await cargarCuentas();
    }));
}

// Pide confirmación antes de eliminar la cuenta abierta (no se puede deshacer).
function abrirModalEliminarCuenta(): void {
    if (!cuentaSeleccionadaId) return;
    const c = cuentas.find(x => x.id === cuentaSeleccionadaId);
    if (!c) return;

    abrirModal(`
        <button type="button" class="modal-cerrar" id="btnCerrarModalEliminar"><i class="fa-solid fa-xmark"></i></button>
        <h2>¿Eliminar esta cuenta?</h2>
        <p class="modal-texto">Se eliminará el acceso de <strong>${esc(c.nombre)}</strong> (${esc(c.correo)}). Esta acción no se puede deshacer.</p>
        <div class="modal-acciones">
            <button type="button" class="btn-secundario" id="btnCancelarEliminar">Cancelar</button>
            <button type="button" class="btn-peligro" id="btnConfirmarEliminar">Eliminar</button>
        </div>
    `);

    const cerrar = () => cerrarModal();
    document.getElementById('btnCerrarModalEliminar')?.addEventListener('click', cerrar);
    document.getElementById('btnCancelarEliminar')?.addEventListener('click', cerrar);
    document.getElementById('btnConfirmarEliminar')?.addEventListener('click', conManejoDeErrores(async () => {
        const res = await apiFetch(`/api/cuentas-acceso/${c.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const datos = await res.json();
            avisar(datos.message || 'No se pudo eliminar', true);
            return;
        }
        cerrarModal();
        cerrarDrawer();
        avisar('Cuenta eliminada');
        await cargarCuentas();
    }));
}

// Arranque: exige sesión de administradora, conecta los botones y carga nómina y cuentas a la vez.
document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);
    initPanelShellGlobal();

    document.getElementById('btnNuevoConContrato')?.addEventListener('click', conManejoDeErrores(() => abrirFormularioEmpleado(undefined, 'con_contrato')));
    document.getElementById('btnNuevoFreelanceFijo')?.addEventListener('click', conManejoDeErrores(() => abrirFormularioEmpleado(undefined, 'freelance_fijo')));
    document.getElementById('btnNuevoFreelanceNoFijo')?.addEventListener('click', conManejoDeErrores(() => abrirFormularioEmpleado(undefined, 'freelance_no_fijo')));
    document.getElementById('btnNuevaCuenta')?.addEventListener('click', conManejoDeErrores(async () => abrirModalCrearCuenta()));
    drawerDelete.addEventListener('click', conManejoDeErrores(async () => abrirModalEliminarCuenta()));

    await Promise.all([cargarEmpleados(), cargarCuentas()]);
});
