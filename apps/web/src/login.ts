import './style.css';
import './landing.css';

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm') as HTMLFormElement;

    // Login DUMMY: todavía no hay backend de autenticación, así que cualquier
    // intento de inicio de sesión entra directo al panel de administrador.
    // Reemplazar por Supabase Auth cuando exista.
    form.addEventListener('submit', () => {
        window.location.href = 'empleados.html';
    });
});
