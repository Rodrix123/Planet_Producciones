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
    // Ejemplo (borrar cuando se agreguen fotos reales):
    // { archivo: 'boda-centro-eventos-vip.jpg', categoria: 'con_pantalla', alt: 'Boda VIP con pantalla LED en Centro de Eventos VIP' },
];
