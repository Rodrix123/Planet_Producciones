// Galería de eventos: mosaico de fotos con filtro (todos / con pantalla / sin pantalla) y vista
// ampliada con flechas y teclado. Las fotos se definen en galeriaFotos.ts.

import { montarSitio } from './shared/sitio';
import { FOTOS_GALERIA, type CategoriaGaleria } from './galeriaFotos';

montarSitio();

// Elementos de la página.
const grid = document.getElementById('galeriaGrid') as HTMLElement;
const vacio = document.getElementById('galeriaVacio') as HTMLElement;
const tabs = document.querySelectorAll<HTMLButtonElement>('.galeria-filtro');

const lightbox = document.getElementById('lightbox') as HTMLElement;
const lightboxImg = document.getElementById('lightboxImg') as HTMLImageElement;

// Estado: filtro elegido, fotos que se están mostrando y foto abierta en la vista ampliada.
let categoriaActual: CategoriaGaleria | 'todas' = 'todas';
let fotosVisibles: typeof FOTOS_GALERIA = [];
let indiceLightbox = 0;

// Dibuja el mosaico según el filtro.
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
        // Tres tamaños de cada foto: el celular no descarga la versión grande para una miniatura.
        const base = foto.archivo.replace('.webp', '');
        const srcset = `galeria/web/${base}-480.webp 480w, galeria/web/${base}-800.webp 800w, galeria/web/${foto.archivo} 1200w`;
        fig.innerHTML = `<img src="galeria/web/${foto.archivo}" srcset="${srcset}" sizes="(max-width: 899px) 50vw, 400px" width="${foto.ancho}" height="${foto.alto}" alt="${foto.alt}" loading="lazy" decoding="async">`;
        fig.addEventListener('click', () => abrirLightbox(i));
        grid.appendChild(fig);
    });
}

// Abre la vista ampliada en la foto indicada.
function abrirLightbox(indice: number) {
    indiceLightbox = indice;
    mostrarEnLightbox();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
}

// Cierra la vista ampliada.
function cerrarLightbox() {
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
}

// Pone la foto actual (en su tamaño grande) en la vista ampliada.
function mostrarEnLightbox() {
    const foto = fotosVisibles[indiceLightbox];
    if (!foto) return;
    lightboxImg.src = `galeria/web/${foto.archivo}`;
    lightboxImg.alt = foto.alt;
}

// Foto siguiente; después de la última vuelve a la primera.
function siguiente() {
    indiceLightbox = (indiceLightbox + 1) % fotosVisibles.length;
    mostrarEnLightbox();
}

// Foto anterior; antes de la primera pasa a la última.
function anterior() {
    indiceLightbox = (indiceLightbox - 1 + fotosVisibles.length) % fotosVisibles.length;
    mostrarEnLightbox();
}

// Cambiar de filtro vuelve a dibujar el mosaico.
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
// Teclado en la vista ampliada: Esc cierra y las flechas cambian de foto.
document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') cerrarLightbox();
    if (e.key === 'ArrowRight') siguiente();
    if (e.key === 'ArrowLeft') anterior();
});

render();
