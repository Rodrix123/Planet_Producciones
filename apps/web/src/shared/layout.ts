// Encabezado común de los paneles: nombre y rol de quien está conectado, salir y las señales del menú.

import { esc } from './panelShell';
import { apiFetch, type SesionActual } from './api';

// Cómo se muestra cada rol.
const NOMBRE_ROL: Record<SesionActual['rol'], string> = {
    administrador: 'Administradora',
    secretaria: 'Secretaria',
    jefe_logistica: 'Jefe de Logística'
};

/** Pinta el nombre/rol en el topbar del panel, conecta el botón de cerrar sesión y
 *  rellena las señales de "algo nuevo" en los enlaces que traigan data-contador. */
export function initPanelLayout(sesion: SesionActual): void {
    const nombreEl = document.getElementById('panelUserName');
    if (nombreEl) {
        nombreEl.innerHTML = `<strong>${esc(sesion.nombre)}</strong> · ${NOMBRE_ROL[sesion.rol]}`;
    }

    const btnLogout = document.getElementById('btnLogout');
    btnLogout?.addEventListener('click', async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
    });

    void cargarContadores();
}

/** Busca /api/panel/contadores y le agrega un <span class="nav-badge"> a cada
 *  elemento con data-contador="clave" que coincida con una clave de la respuesta
 *  (ej. data-contador="cotizaciones"). Si el contador es 0, no agrega nada. */
async function cargarContadores(): Promise<void> {
    const elementos = document.querySelectorAll<HTMLElement>('[data-contador]');
    if (elementos.length === 0) return;

    try {
        const res = await apiFetch('/api/panel/contadores');
        if (!res.ok) return;
        const contadores = (await res.json()) as Record<string, number>;

        elementos.forEach((el) => {
            const clave = el.dataset.contador!;
            const valor = contadores[clave];
            if (!valor) return;
            const span = document.createElement('span');
            span.className = 'nav-badge';
            span.textContent = valor > 99 ? '99+' : String(valor);
            el.appendChild(span);
        });
    } catch {
        // Si falla, simplemente no se muestran señales; no es crítico para el resto de la página.
    }
}
