import './style.css';
import './landing.css';
import { apiUrl } from './shared/api';

declare const Swal: any;

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

    // Acordeón de Preguntas Frecuentes
    document.querySelectorAll<HTMLElement>('.faq-item').forEach(item => {
        item.querySelector('.faq-question')?.addEventListener('click', () => {
            item.classList.toggle('open');
        });
    });

    // Formulario de PQRS
    const pqrsForm = document.getElementById('pqrsForm') as HTMLFormElement | null;
    pqrsForm?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const nombre = (document.getElementById('pqrsNombre') as HTMLInputElement).value.trim();
        const correo = (document.getElementById('pqrsCorreo') as HTMLInputElement).value.trim();
        const telefono = (document.getElementById('pqrsTelefono') as HTMLInputElement).value.trim();
        const mensaje = (document.getElementById('pqrsMensaje') as HTMLTextAreaElement).value.trim();

        if (!nombre || !correo || !mensaje) return;

        const btn = document.getElementById('btnEnviarPqrs') as HTMLButtonElement;
        btn.disabled = true;

        try {
            const res = await fetch(apiUrl('/api/pqrs'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre, correo, telefono: telefono || undefined, mensaje })
            });

            if (!res.ok) {
                Swal.fire({ icon: 'error', title: 'No se pudo enviar', text: 'Intenta de nuevo en unos minutos.', confirmButtonColor: '#f97316' });
                return;
            }

            pqrsForm.reset();
            Swal.fire({
                icon: 'success',
                title: '¡Mensaje enviado!',
                text: 'Gracias por escribirnos. Te responderemos al correo que dejaste.',
                confirmButtonColor: '#f97316'
            });
        } catch {
            Swal.fire({ icon: 'error', title: 'Sin conexión', text: 'No se pudo conectar con el servidor. Intenta de nuevo.', confirmButtonColor: '#f97316' });
        } finally {
            btn.disabled = false;
        }
    });
});
