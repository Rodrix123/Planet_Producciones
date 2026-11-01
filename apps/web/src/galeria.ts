import { montarSitio } from './shared/sitio';
import { FOTOS_GALERIA, type CategoriaGaleria } from './galeriaFotos';

montarSitio();

const grid = document.getElementById('galeriaGrid') as HTMLElement;
const vacio = document.getElementById('galeriaVacio') as HTMLElement;
const tabs = document.querySelectorAll<HTMLButtonElement>('.galeria-filtro');

const lightbox = document.getElementById('lightbox') as HTMLElement;
const lightboxImg = document.getElementById('lightboxImg') as HTMLImageElement;

let categoriaActual: CategoriaGaleria | 'todas' = 'todas';
let fotosVisibles: typeof FOTOS_GALERIA = [];
let indiceLightbox = 0;

function render() {
    fotosVisibles = FOTOS_GALERIA.filter((f) => categoriaActual === 'todas' || f.categoria === categoriaActual);
    grid.innerHTML = '';

    if (fotosVisibles.length === 0) {
        vacio.classList.remove('hidden');
        return;
    }
    vacio.classList.add('hidden');

    fotosVisibles.forEach((foto, i) => {
        const fig = document.createElement('button');
        fig.type = 'button';
        fig.className = 'galeria-foto';
        fig.innerHTML = `<img src="galeria/web/${foto.archivo}" width="${foto.ancho}" height="${foto.alto}" alt="${foto.alt}" loading="lazy">`;
        fig.addEventListener('click', () => abrirLightbox(i));
        grid.appendChild(fig);
    });
}

function abrirLightbox(indice: number) {
    indiceLightbox = indice;
    mostrarEnLightbox();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
}

function cerrarLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
}

function mostrarEnLightbox() {
    const foto = fotosVisibles[indiceLightbox];
    if (!foto) return;
    lightboxImg.src = `galeria/web/${foto.archivo}`;
    lightboxImg.alt = foto.alt;
}

function siguiente() {
    indiceLightbox = (indiceLightbox + 1) % fotosVisibles.length;
    mostrarEnLightbox();
}

function anterior() {
    indiceLightbox = (indiceLightbox - 1 + fotosVisibles.length) % fotosVisibles.length;
    mostrarEnLightbox();
}

tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        tabs.forEach((t) => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        categoriaActual = tab.dataset.categoria as CategoriaGaleria | 'todas';
        render();
    });
});

document.querySelector('.lightbox-cerrar')?.addEventListener('click', cerrarLightbox);
document.querySelector('.lightbox-next')?.addEventListener('click', siguiente);
document.querySelector('.lightbox-prev')?.addEventListener('click', anterior);
lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) cerrarLightbox();
});
document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') cerrarLightbox();
    if (e.key === 'ArrowRight') siguiente();
    if (e.key === 'ArrowLeft') anterior();
});

render();
