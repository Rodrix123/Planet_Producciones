import './style.css';
import './landing.css';
import { apiFetch, rutaPanelPorRol, type SesionActual } from './shared/api';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;
    const correoInput = document.getElementById('loginCorreo') as HTMLInputElement;
    const passwordInput = document.getElementById('loginPassword') as HTMLInputElement;
    const btnLogin = document.getElementById('btnLogin') as HTMLButtonElement;
    const statusMsg = document.getElementById('loginStatusMsg') as HTMLElement;
    const statusText = document.getElementById('loginStatusText') as HTMLElement;
    const forgotLink = document.getElementById('loginForgotLink') as HTMLAnchorElement;

    function mostrarMensaje(texto: string, esError: boolean) {
        statusText.textContent = texto;
        statusMsg.classList.toggle('error', esError);
        statusMsg.classList.add('visible');
    }

    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        mostrarMensaje('Contacta al desarrollador para restablecer tu acceso.', false);
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const correo = correoInput.value.trim();
        const password = passwordInput.value;

        if (!correo || !password) {
            mostrarMensaje('Completa tu correo y contraseña.', true);
            return;
        }

        btnLogin.disabled = true;
        btnLogin.style.opacity = '0.7';

        try {
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ correo, password })
            });
            const datos = await res.json();

            if (!res.ok) {
                mostrarMensaje(datos.message || 'No se pudo iniciar sesión.', true);
                return;
            }

            const sesion = datos as Pick<SesionActual, 'rol' | 'debeCambiarPassword'>;
            window.location.href = sesion.debeCambiarPassword
                ? 'cambiar-password.html'
                : rutaPanelPorRol(sesion.rol);
        } catch {
            mostrarMensaje('No se pudo conectar con el servidor. Intenta nuevamente.', true);
        } finally {
            btnLogin.disabled = false;
            btnLogin.style.opacity = '1';
        }
    });
});
