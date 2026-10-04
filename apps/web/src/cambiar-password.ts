import './style.css';
import './landing.css';
import { apiFetch, exigirSesion, rutaPanelPorRol } from './shared/api';

document.addEventListener('DOMContentLoaded', async () => {
    const sesion = await exigirSesion();

    const subtitulo = document.getElementById('cambiarPasswordSubtitulo') as HTMLElement;
    if (!sesion.debeCambiarPassword) {
        subtitulo.textContent = `Hola ${sesion.nombre}, puedes actualizar tu contraseña cuando quieras.`;
    }

    const form = document.getElementById('cambiarPasswordForm') as HTMLFormElement;
    const actualInput = document.getElementById('passwordActual') as HTMLInputElement;
    const nuevaInput = document.getElementById('passwordNueva') as HTMLInputElement;
    const confirmarInput = document.getElementById('passwordNuevaConfirmar') as HTMLInputElement;
    const btn = document.getElementById('btnCambiarPassword') as HTMLButtonElement;
    const statusMsg = document.getElementById('cambiarPasswordStatusMsg') as HTMLElement;
    const statusText = document.getElementById('cambiarPasswordStatusText') as HTMLElement;
    const linkCerrarSesion = document.getElementById('linkCerrarSesion') as HTMLAnchorElement;

    function mostrarMensaje(texto: string, esError: boolean) {
        statusText.textContent = texto;
        statusMsg.classList.toggle('error', esError);
        statusMsg.classList.add('visible');
    }

    linkCerrarSesion.addEventListener('click', async (e) => {
        e.preventDefault();
        await apiFetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (nuevaInput.value !== confirmarInput.value) {
            mostrarMensaje('La confirmación no coincide con la nueva contraseña.', true);
            return;
        }
        if (nuevaInput.value.length < 8) {
            mostrarMensaje('La nueva contraseña debe tener al menos 8 caracteres.', true);
            return;
        }

        btn.disabled = true;
        btn.style.opacity = '0.7';

        try {
            const res = await apiFetch('/api/auth/cambiar-password', {
                method: 'PUT',
                body: JSON.stringify({
                    passwordActual: actualInput.value,
                    passwordNueva: nuevaInput.value
                })
            });
            const datos = await res.json();

            if (!res.ok) {
                mostrarMensaje(datos.message || 'No se pudo actualizar la contraseña.', true);
                return;
            }

            window.location.href = rutaPanelPorRol(sesion.rol);
        } catch {
            mostrarMensaje('No se pudo conectar con el servidor. Intenta nuevamente.', true);
        } finally {
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    });
});
