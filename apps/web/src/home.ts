import './style.css';
import './landing.css';

document.addEventListener('DOMContentLoaded', () => {
    // Scroll suave para los anclajes internos del menú (Inicio, Servicios, etc.)
    document.querySelectorAll<HTMLAnchorElement>('.promo-nav a[href^="#"]').forEach(link => {
        link.addEventListener('click', event => {
            const targetId = link.getAttribute('href');
            if (!targetId || targetId === '#') return;
            const targetEl = document.querySelector(targetId);
            if (!targetEl) return;
            event.preventDefault();
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
});
