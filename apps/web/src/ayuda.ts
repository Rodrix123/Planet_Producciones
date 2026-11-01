import { montarSitio } from './shared/sitio';
import { apiUrl } from './shared/api';

declare const Swal: any;

const COLOR_CONFIRMAR = '#e5601a';

montarSitio();

document.addEventListener('DOMContentLoaded', () => {
    // Acordeón de Preguntas Frecuentes
    document.querySelectorAll<HTMLElement>('.faq-item').forEach(item => {
        const boton = item.querySelector<HTMLButtonElement>('.faq-pregunta');
        boton?.addEventListener('click', () => {
            const abierto = item.classList.toggle('open');
            boton.setAttribute('aria-expanded', String(abierto));
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
                Swal.fire({ icon: 'error', title: 'No se pudo enviar', text: 'Intenta de nuevo en unos minutos.', confirmButtonColor: COLOR_CONFIRMAR });
                return;
            }

            pqrsForm.reset();
            Swal.fire({
                icon: 'success',
                title: '¡Mensaje enviado!',
                text: 'Gracias por escribirnos. Te responderemos al correo que dejaste.',
                confirmButtonColor: COLOR_CONFIRMAR
            });
        } catch {
            Swal.fire({ icon: 'error', title: 'Sin conexión', text: 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.', confirmButtonColor: COLOR_CONFIRMAR });
        } finally {
            btn.disabled = false;
        }
    });
});
