// Lista de fotos de la galería pública (el orden de esta lista es el orden en "Todos").
// Para agregar una foto nueva:
// 1. Pon el archivo en apps/web/public/galeria/web/ (mejor en .webp, de unos 1200 px
//    de ancho, para que la página cargue rápido).
// 2. Agrega una línea aquí con su nombre, su categoría (con o sin pantalla LED),
//    su ancho y alto en píxeles, y una descripción corta de lo que se ve.
// No hace falta tocar ningún otro archivo.

export type CategoriaGaleria = 'con_pantalla' | 'sin_pantalla';

export interface FotoGaleria {
    archivo: string;
    categoria: CategoriaGaleria;
    ancho: number;
    alto: number;
    alt: string;
}

export const FOTOS_GALERIA: FotoGaleria[] = [
    { archivo: 'evento-con-pantalla-6.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1481, alt: 'Primer baile de novios con chispas frías y niebla baja frente a una pantalla LED' },
    { archivo: 'evento-sin-pantalla-5.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1340, alt: 'Candelabros de cristal sobre techo de bambú con follaje, mesas y pista de piso LED' },
    { archivo: 'evento-con-pantalla-8.webp', categoria: 'con_pantalla', ancho: 1200, alto: 927, alt: 'Pista de baile llena de invitados frente a pantallas LED y luces violeta' },
    { archivo: 'evento-sin-pantalla-7.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1350, alt: 'Carpa blanca con telas, mesa de novios y cabina de DJ con luces hexagonales' },
    { archivo: 'evento-con-pantalla-5.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1359, alt: 'Pista de baile con luz perimetral y pantalla LED con mensaje personalizado' },
    { archivo: 'evento-sin-pantalla-8.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1062, alt: 'Carpa transparente con bolas de espejos, flores de luz y pista negra con borde LED' },
    { archivo: 'evento-con-pantalla-12.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1063, alt: 'Cabina de DJ rodeada de pantallas LED flotantes y luces cálidas' },
    { archivo: 'evento-sin-pantalla-9.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1353, alt: 'Flores de tela y telas marfil sobre la cabina de DJ con cabezas móviles' },
    { archivo: 'evento-con-pantalla-9.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1062, alt: 'Escenario con pantalla LED, cabezas móviles y pista con diseño de hojas' },
    { archivo: 'evento-sin-pantalla-6.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 1312, alt: 'Carpa con lámparas de ratán, pista geométrica y cabina de DJ' },
    { archivo: 'evento-con-pantalla-7.webp', categoria: 'con_pantalla', ancho: 1200, alto: 962, alt: 'DJ frente a pantallas LED con gráficos blancos y luz azul' },
    { archivo: 'evento-sin-pantalla-10.webp', categoria: 'sin_pantalla', ancho: 1200, alto: 725, alt: 'Equipo de Planet Producciones en pleno evento, con luces y banda en vivo' },
    { archivo: 'evento-con-pantalla-13.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1072, alt: 'Piso de cristal iluminado frente a pantallas LED en un salón elegante' },
    { archivo: 'evento-con-pantalla-10.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1068, alt: 'Pista con diseño de hojas, pantallas LED y haces de luz azul' },
    { archivo: 'evento-con-pantalla-14.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1069, alt: 'Pista con patrón en blanco y negro, pantalla LED y follaje colgante' },
    { archivo: 'evento-con-pantalla-11.webp', categoria: 'con_pantalla', ancho: 1200, alto: 1084, alt: 'Mesa de cena con centro de flores y haces de luz azul sobre el escenario' },
    { archivo: 'evento-con-pantalla-2.webp', categoria: 'con_pantalla', ancho: 961, alto: 1280, alt: 'Cabina de DJ con pantallas LED y pista de baile, techo decorado con flores y bombillas' },
    { archivo: 'evento-con-pantalla-4.webp', categoria: 'con_pantalla', ancho: 959, alto: 1280, alt: 'Pantalla LED con monograma de novios y pista de baile personalizada' },
    { archivo: 'evento-con-pantalla-3.webp', categoria: 'con_pantalla', ancho: 960, alto: 1280, alt: 'Escenario con pantalla LED dorada y montaje de mesas para evento elegante' },
    { archivo: 'evento-con-pantalla-1.webp', categoria: 'con_pantalla', ancho: 960, alto: 1280, alt: 'Montaje con pantallas LED, pista de baile e iluminación ambiental en jardín' },
    { archivo: 'evento-sin-pantalla-1.webp', categoria: 'sin_pantalla', ancho: 960, alto: 1280, alt: 'Decoración tropical con mesa de postres y estructura iluminada' },
    { archivo: 'evento-sin-pantalla-2.webp', categoria: 'sin_pantalla', ancho: 961, alto: 1280, alt: 'Pista de baile reflectante con esferas de espejo y candelabros' }
];
