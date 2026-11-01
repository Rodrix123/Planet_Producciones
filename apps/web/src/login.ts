// Pantalla de inicio de sesión del equipo. Envía correo y contraseña a /api/auth/login y lleva a la
// persona a su panel según el rol (o a cambiar la contraseña si es obligatorio).

import { montarSitio } from './shared/sitio';
import './landing.css';
import { apiFetch, rutaPanelPorRol, type SesionActual } from './shared/api';

montarSitio();

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;
    const correoInput = document.getElementById('loginCorreo') as HTMLInputElement;
    const passwordInput = document.getElementById('loginPassword') as HTMLInputElement;
    const btnLogin = document.getElementById('btnLogin') as HTMLButtonElement;
    const statusMsg = document.getElementById('loginStatusMsg') as HTMLElement;
    const statusText = document.getElementById('loginStatusText') as HTMLElement;
    const forgotLink = document.getElementById('loginForgotLink') as HTMLAnchorElement;

    // Muestra un aviso bajo el formulario (en rojo si es un error).
    function mostrarMensaje(texto: string, esError: boolean) {
        statusText.textContent = texto;
        statusMsg.classList.toggle('error', esError);
        statusMsg.classList.add('visible');
    }

    // No hay recuperación automática de contraseña: se indica a quién acudir.
    forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        mostrarMensaje('Para restablecer tu acceso, comunícate con la administración de Planet Producciones.', false);
    });

    // Envía el formulario. Mientras espera la respuesta el botón queda deshabilitado para evitar un doble envío.
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

            // Si la cuenta debe cambiar su contraseña (primer ingreso o reseteo) va primero a esa pantalla.
            const sesion = datos as Pick<SesionActual, 'rol' | 'debeCambiarPassword'>;
            window.location.href = sesion.debeCambiarPassword
                ? 'cambiar-password.html'
                : rutaPanelPorRol(sesion.rol);
        } catch {
            mostrarMensaje('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.', true);
        } finally {
            btnLogin.disabled = false;
            btnLogin.style.opacity = '1';
        }
    });
});
