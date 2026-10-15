import '../../src/style.css';
import '../../src/landing.css';
import './institucional.css';

// Menú desplegable en pantallas pequeñas
const botonMenu = document.querySelector<HTMLButtonElement>('.menu-toggle');
const menu = document.getElementById('menu-principal');

function alternarMenu(abrir: boolean) {
    if (!botonMenu || !menu) return;
    menu.classList.toggle('abierto', abrir);
    botonMenu.setAttribute('aria-expanded', String(abrir));
    botonMenu.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
    const icono = botonMenu.querySelector('i');
    icono?.classList.toggle('fa-bars', !abrir);
    icono?.classList.toggle('fa-xmark', abrir);
}

botonMenu?.addEventListener('click', () => alternarMenu(!menu?.classList.contains('abierto')));
menu?.querySelectorAll('a').forEach((enlace) => enlace.addEventListener('click', () => alternarMenu(false)));
document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') alternarMenu(false);
});

// Visor de fotos de la galería (la galería solo existe si hay fotos que mostrar)
const items = Array.from(document.querySelectorAll<HTMLButtonElement>('.galeria-item'));
const visor = document.getElementById('lightbox');

if (visor && items.length > 0) {
    const imagen = document.createElement('img');
    visor.querySelector('.lightbox-prev')?.after(imagen);
    const botonCerrar = visor.querySelector<HTMLButtonElement>('.lightbox-cerrar');
    let indice = 0;

    const mostrar = (nuevo: number) => {
        indice = (nuevo + items.length) % items.length;
        const foto = items[indice]?.querySelector('img');
        if (!foto) return;
        imagen.src = foto.currentSrc || foto.src;
        imagen.alt = foto.alt;
    };

    const abrir = (posicion: number) => {
        mostrar(posicion);
        visor.classList.add('open');
        visor.setAttribute('aria-hidden', 'false');
        botonCerrar?.focus();
    };

    const cerrar = () => {
        visor.classList.remove('open');
        visor.setAttribute('aria-hidden', 'true');
        items[indice]?.focus();
    };

    items.forEach((item, posicion) => item.addEventListener('click', () => abrir(posicion)));
    botonCerrar?.addEventListener('click', cerrar);
    visor.querySelector('.lightbox-next')?.addEventListener('click', () => mostrar(indice + 1));
    visor.querySelector('.lightbox-prev')?.addEventListener('click', () => mostrar(indice - 1));
    visor.addEventListener('click', (evento) => {
        if (evento.target === visor) cerrar();
    });
    document.addEventListener('keydown', (evento) => {
        if (!visor.classList.contains('open')) return;
        if (evento.key === 'Escape') cerrar();
        if (evento.key === 'ArrowRight') mostrar(indice + 1);
        if (evento.key === 'ArrowLeft') mostrar(indice - 1);
    });
}
