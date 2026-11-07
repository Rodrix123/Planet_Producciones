// Página de inicio: monta el menú y el pie de página compartidos (ver shared/sitio.ts) y hace pasar
// las fotos de eventos que van de fondo en la portada.

import { montarSitio } from './shared/sitio';

montarSitio();

const SEGUNDOS_POR_FOTO = 6.5;

const slides = Array.from(document.querySelectorAll<HTMLElement>('.hero-slide'));
const puntos = Array.from(document.querySelectorAll<HTMLButtonElement>('#heroPuntos button'));
const botonPausa = document.getElementById('heroPausa') as HTMLButtonElement | null;

if (slides.length > 1) {
    const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let actual = 0;
    let temporizador: number | undefined;
    // La persona puede pausar; con "reducir movimiento" activado las fotos no pasan solas.
    let pausado = sinMovimiento;

    // Solo la primera foto viene en el HTML; las demás se crean y descargan cuando la página ya terminó de cargar.
    const cargarFotos = () => {
        slides.forEach((slide) => {
            if (!slide.dataset.src) return;
            const picture = document.createElement('picture');
            const source = document.createElement('source');
            source.media = '(max-width: 700px)';
            source.srcset = slide.dataset.movil!;
            const img = document.createElement('img');
            img.alt = '';
            img.sizes = '100vw';
            img.decoding = 'async';
            img.srcset = slide.dataset.srcset!;
            img.src = slide.dataset.src;
            picture.append(source, img);
            slide.appendChild(picture);
            slide.removeAttribute('data-src');
        });
    };
    if (document.readyState === 'complete') window.setTimeout(cargarFotos, 600);
    else window.addEventListener('load', () => window.setTimeout(cargarFotos, 600), { once: true });

    const mostrar = (indice: number) => {
        slides[actual].classList.remove('activa');
        puntos[actual]?.removeAttribute('aria-current');
        actual = (indice + slides.length) % slides.length;
        slides[actual].classList.add('activa');
        puntos[actual]?.setAttribute('aria-current', 'true');
    };

    const programar = () => {
        window.clearTimeout(temporizador);
        if (pausado || document.hidden) return;
        temporizador = window.setTimeout(() => {
            // Si la siguiente foto todavía no terminó de bajar (conexión lenta), se espera un poco más.
            const siguiente = slides[(actual + 1) % slides.length].querySelector<HTMLImageElement>('img');
            if (!siguiente || !siguiente.complete) {
                programar();
                return;
            }
            mostrar(actual + 1);
            programar();
        }, SEGUNDOS_POR_FOTO * 1000);
    };

    puntos.forEach((punto, i) => {
        punto.addEventListener('click', () => {
            mostrar(i);
            programar();
        });
    });

    const actualizarBotonPausa = () => {
        if (!botonPausa) return;
        botonPausa.setAttribute('aria-pressed', String(pausado));
        botonPausa.setAttribute('aria-label', pausado ? 'Reanudar las fotos' : 'Pausar las fotos');
        botonPausa.innerHTML = `<i class="fa-solid ${pausado ? 'fa-play' : 'fa-pause'}"></i>`;
    };
    botonPausa?.addEventListener('click', () => {
        pausado = !pausado;
        actualizarBotonPausa();
        programar();
    });

    // Si la pestaña no se está viendo, las fotos no avanzan.
    document.addEventListener('visibilitychange', programar);

    actualizarBotonPausa();
    programar();
}
