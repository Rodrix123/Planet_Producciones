// Lista de fotos de la galería pública. Para agregar una foto nueva:
// 1. Pon el archivo de imagen en apps/web/public/galeria/
// 2. Agrega una línea aquí con su nombre de archivo y la categoría correcta.
// No hace falta tocar ningún otro archivo.

export type CategoriaGaleria = 'con_pantalla' | 'sin_pantalla';

export interface FotoGaleria {
    archivo: string;
    categoria: CategoriaGaleria;
    alt: string;
}

export const FOTOS_GALERIA: FotoGaleria[] = [
    { archivo: 'evento-con-pantalla-1.png', categoria: 'con_pantalla', alt: 'Montaje con pantallas LED, pista de baile e iluminación ambiental en jardín' },
    { archivo: 'evento-con-pantalla-2.png', categoria: 'con_pantalla', alt: 'Cabina de DJ con pantallas LED y pista de baile, techo decorado con flores y bombillas' },
    { archivo: 'evento-con-pantalla-3.png', categoria: 'con_pantalla', alt: 'Escenario con pantalla LED dorada y montaje de mesas para evento elegante' },
    { archivo: 'evento-con-pantalla-4.png', categoria: 'con_pantalla', alt: 'Pantalla LED con monograma de novios y pista de baile personalizada' },
    { archivo: 'evento-sin-pantalla-1.png', categoria: 'sin_pantalla', alt: 'Decoración tropical con mesa de postres y estructura iluminada' },
    { archivo: 'evento-sin-pantalla-2.png', categoria: 'sin_pantalla', alt: 'Pista de baile reflectante con esferas de espejo y candelabros' },
    { archivo: 'evento-sin-pantalla-3.png', categoria: 'sin_pantalla', alt: 'Decoración tropical con mesa de postres y estructura iluminada' },
    { archivo: 'evento-sin-pantalla-4.png', categoria: 'sin_pantalla', alt: 'Pista de baile reflectante con esferas de espejo y candelabros' }
];
