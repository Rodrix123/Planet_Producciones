import { apiFetch, type SesionActual } from './api';

const NOMBRE_ROL: Record<SesionActual['rol'], string> = {
    administrador: 'Administradora',
    secretaria: 'Secretaria',
    jefe_logistica: 'Jefe de Logística'
};

/** Pinta el nombre/rol en el topbar del panel y conecta el botón de cerrar sesión. */
export function initPanelLayout(sesion: SesionActual): void {
    const nombreEl = document.getElementById('panelUserName');
    if (nombreEl) {
        nombreEl.innerHTML = `<strong>${sesion.nombre}</strong> · ${NOMBRE_ROL[sesion.rol]}`;
    }

    const btnLogout = document.getElementById('btnLogout');
    btnLogout?.addEventListener('click', async () => {
        await apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
    });
}
