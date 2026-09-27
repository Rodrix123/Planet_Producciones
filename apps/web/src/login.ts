import './style.css';
import './landing.css';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;
    const statusMsg = document.getElementById('loginStatusMsg') as HTMLElement;

    // Todavía no hay backend de autenticación: solo mostramos la interfaz
    // y un aviso informativo al intentar iniciar sesión.
    form.addEventListener('submit', () => {
        statusMsg.classList.add('visible');
    });
});
