import './style.css';
import './landing.css';
import './shared/panel.css';
import { apiFetch, conManejoDeErrores, exigirSesion } from './shared/api';
import { initPanelLayout } from './shared/layout';

declare const Swal: any;

interface Empleado {
    id: string;
    nombre: string;
    documento: string | null;
    telefono: string | null;
    salario: number | null;
    numeroCuenta: string | null;
    banco: string | null;
    tipoContrato: 'con_contrato' | 'sin_contrato';
}

const formatterCOP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

async function cargarEmpleados() {
    const res = await apiFetch('/api/empleados');
    const empleados = (await res.json()) as Empleado[];

    renderGrupo('listaConContrato', empleados.filter((e) => e.tipoContrato === 'con_contrato'));
    renderGrupo('listaSinContrato', empleados.filter((e) => e.tipoContrato === 'sin_contrato'));
}

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
                <h3>${emp.nombre}</h3>
                <p>${emp.documento ? 'CC ' + emp.documento + ' · ' : ''}${emp.telefono || 'Sin teléfono'}${emp.numeroCuenta ? ' · Cuenta ' + emp.numeroCuenta + (emp.banco ? ' (' + emp.banco + ')' : '') : ''}</p>
            </div>
            <div class="item-card-side">
                <div class="item-card-total">${emp.salario ? formatterCOP.format(emp.salario) : 'Sin salario definido'}</div>
                <button class="btn btn-danger btn-sm" data-id="${emp.id}" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        card.addEventListener('click', conManejoDeErrores(() => abrirFormulario(emp)));
        card.querySelector('button')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void conManejoDeErrores(() => eliminarEmpleado(emp.id))();
        });
        cont.appendChild(card);
    });
}

async function abrirFormulario(empleado?: Empleado) {
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
                    <input id="swalNombre" placeholder="Ej. Juan Pérez" value="${empleado?.nombre || ''}">
                </div>
                <div>
                    <label for="swalDocumento">Documento / Cédula</label>
                    <input id="swalDocumento" placeholder="Ej. 1012345678" value="${empleado?.documento || ''}">
                </div>
                <div>
                    <label for="swalTelefono">Teléfono</label>
                    <input id="swalTelefono" placeholder="Ej. 300 123 4567" value="${empleado?.telefono || ''}">
                </div>
                <div>
                    <label for="swalSalario">Salario</label>
                    <input id="swalSalario" type="number" placeholder="Ej. 1500000" value="${empleado?.salario ?? ''}">
                </div>
                <div>
                    <label for="swalTipo">Tipo de vínculo</label>
                    <select id="swalTipo">
                        <option value="con_contrato" ${empleado?.tipoContrato === 'con_contrato' ? 'selected' : ''}>Con contrato</option>
                        <option value="sin_contrato" ${empleado?.tipoContrato === 'sin_contrato' ? 'selected' : ''}>Sin contrato</option>
                    </select>
                </div>
                <div>
                    <label for="swalCuenta">Número de cuenta bancaria</label>
                    <input id="swalCuenta" placeholder="Ej. 1234567890" value="${empleado?.numeroCuenta || ''}">
                </div>
                <div>
                    <label for="swalBanco">Banco</label>
                    <input id="swalBanco" placeholder="Ej. Bancolombia" value="${empleado?.banco || ''}">
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

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion('administrador');
    initPanelLayout(sesion);

    document.getElementById('btnNuevoEmpleado')?.addEventListener('click', conManejoDeErrores(() => abrirFormulario()));

    await cargarEmpleados();
});
